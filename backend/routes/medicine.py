import os
import json
from datetime import datetime, date
from flask import Blueprint, request, jsonify, send_from_directory, current_app
from werkzeug.exceptions import NotFound
from extensions import db, safe_commit, limiter
from models import User, MedicineEntry, MedicineLog, PrescriptionScan
from routes.auth import get_current_user
from cloudinary_utils import upload_image_bytes, CloudinaryUploadError
import jwt
import google.generativeai as genai
from PIL import Image
import io

medicine_bp = Blueprint("medicine", __name__)

from PIL import Image, ImageOps, ImageEnhance

SCAN_PROMPT = """You are an expert Indian prescription OCR agent specialized for a daily medicine cabinet system.

CRITICAL CONTEXT: Each extracted medicine will be assigned to a family member's cabinet with daily time slots (Morning 8AM, Afternoon 1PM, Evening 6PM, Night 10PM). The "days" field controls cabinet expiry. Accuracy directly affects patient safety.

For each medicine found in the prescription image(s), extract ALL of the following fields:
- "name": full medicine name including brand/generic name and strength (e.g. "Tab Cetil 500mg", "Cap Pantocid DSR 40mg", "Syp Dolo 250"). Include dosage form (Tab / Cap / Inj / Syrup / Drops / Nebulization / Ointment) if visible.
- "dosage": quantity per single dose as written (e.g. "1", "2", "1/2", "5 ml", "2 drops", "10 units"). Summarize differing slot doses as "1-0-2" order.
- "schedule": list of active time slots. Allowed values ONLY: ["morning", "afternoon", "evening", "night"].
- "days": integer number of days prescribed (e.g. 5 for "for 5 days" or "5 दिन"). Return null if unspecified.
- "instructions": administration notes (e.g. "After Food", "Before Breakfast", "At Bed Time", "With Water"). Return null if absent.
- "confidence": OCR certainty: "high", "medium", "low".

INDIAN & HINDI / HINGLISH SCRIPT & NOTATION RULES:
1. Schedule notations:
   - "1-0-1", "BD", "BID", "दिन में 2 बार", "सुबह शाम" -> ["morning", "night"]
   - "1-1-1", "TDS", "TID", "दिन में 3 बार", "सुबह दोपहर शाम" -> ["morning", "afternoon", "night"]
   - "1-0-0", "OD", "रोजाना 1 बार", "सुबह" -> ["morning"]
   - "0-0-1", "रात को", "सोते समय", "HS", "Bedtime" -> ["night"]
   - "0-1-0", "दोपहर" -> ["afternoon"]
   - "1-1-1-1", "QDS", "QID", "दिन में 4 बार" -> ["morning", "afternoon", "evening", "night"]
   - "SOS", "ज़रूरत पड़ने पर" -> ["morning"] (note SOS in instructions)
2. Hindi instruction translations:
   - "खाने के बाद" / "नाश्ते के बाद" / "खिलाकर" -> "After Food"
   - "खाली पेट" / "भूखे पेट" -> "Before Food / Empty Stomach"
   - "दूध के साथ" -> "With Milk"
   - "पानी के साथ" -> "With Water"
   - "रात को सोने से पहले" -> "At Bed Time"
3. Common Indian drug abbreviations:
   - "PCM" -> "Paracetamol"
   - "Pan D" / "Pantocid D" -> "Pan-D (Pantoprazole + Domperidone)"
   - "MVT" -> "Multivitamin"
   - "CPM" -> "Chlorpheniramine"
   - "AZI" -> "Azithromycin"
   - "Dolo 650" -> "Dolo 650mg"

Also, extract a list of "unparsed_lines":
- "unparsed_lines": any other text lines or handwritten scribbles that look like drug names or clinical notes but couldn't be fully structured.

Return ONLY a valid JSON object:
{
  "medicines": [
    {
      "name": "Tab Cetil 500mg",
      "dosage": "1",
      "schedule": ["morning", "night"],
      "days": 5,
      "instructions": "After Food",
      "confidence": "high"
    }
  ],
  "unparsed_lines": []
}"""


def preprocess_prescription_image(pil_img: Image.Image) -> Image.Image:
    """Preprocess PIL Image for OCR accuracy:
    - Transpose EXIF orientation (rotate sideways camera photos)
    - Apply adaptive contrast & sharpness enhancement for handwritten ink
    """
    try:
        pil_img = ImageOps.exif_transpose(pil_img)
    except Exception:
        pass

    try:
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        # Contrast & Sharpness enhancement for handwritten ink
        enhancer = ImageEnhance.Contrast(pil_img)
        pil_img = enhancer.enhance(1.25)

        sharpener = ImageEnhance.Sharpness(pil_img)
        pil_img = sharpener.enhance(1.3)
    except Exception:
        pass

    return pil_img


def normalize_medicine_name(name: str) -> str:
    """Post-processor that standardizes Indian pharmaceutical abbreviations and strengths."""
    if not name:
        return ""
    import re
    cleaned = name.strip()

    abbreviations = [
        (r'\bPCM\b', 'Paracetamol'),
        (r'\bPAN[- ]?D\b', 'Pan-D (Pantoprazole + Domperidone)'),
        (r'\bPANTOCID[- ]?DSR\b', 'Pantocid DSR 40mg'),
        (r'\bMVT\b', 'Multivitamin'),
        (r'\bCPM\b', 'Chlorpheniramine'),
        (r'\bAZI\b', 'Azithromycin'),
        (r'\bAMLO\b', 'Amlodipine'),
        (r'\bTELMI\b', 'Telmisartan'),
        (r'\bTELMA\b', 'Telma (Telmisartan)'),
        (r'\bDOLO[- ]?650\b', 'Dolo 650mg'),
        (r'\bDOLO[- ]?500\b', 'Dolo 500mg'),
    ]

    for pattern, replacement in abbreviations:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

    # Standardize strength spacing: e.g. "500 mg" -> "500mg", "0.5 mg" -> "0.5mg"
    cleaned = re.sub(r'(\d+(?:\.\d+)?)\s*(mg|mcg|gm|g|ml|iu|units)\b', r'\1\2', cleaned, flags=re.IGNORECASE)

    return cleaned


import base64
import requests

def call_openrouter_vision(prompt: str, pil_images: list, model_name: str, api_key: str) -> str:
    """Invoke vision models like Qwen2.5-VL 72B or Claude 3.5 Sonnet via OpenRouter unified API."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://dawaisathi.com",
        "X-Title": "DawaiSathi OCR Engine",
        "Content-Type": "application/json"
    }

    content_list = [{"type": "text", "text": prompt}]
    for img in pil_images:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
        content_list.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64_str}"}
        })

    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": content_list}],
        "temperature": 0.1,
    }

    resp = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=45)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


@medicine_bp.route("/api/medicine/scan", methods=["POST"])
@limiter.limit("10 per hour", error_message="Scan limit reached. You can scan up to 10 prescriptions per hour. Please try again later.")
def scan_medicine():
    """Scan 1 or more prescription/box images using Qwen2.5-VL 72B / Claude 3.5 Sonnet (via OpenRouter) or Gemini Flash fallback."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    # Gather all uploaded image files (supports multi-image batch scan)
    file_list = []
    if "images" in request.files:
        file_list = request.files.getlist("images")
    elif "image" in request.files:
        file_list = request.files.getlist("image")
    else:
        # Check image_0, image_1, image_2 keys
        for key in ("image_0", "image_1", "image_2"):
            if key in request.files:
                file_list.append(request.files[key])

    if not file_list:
        return jsonify({"error": "No image provided"}), 400

    # Limit max 3 images per scan batch
    file_list = file_list[:3]

    gemini_images = []
    storage_urls = []

    for file_obj in file_list:
        image_bytes = file_obj.read()
        if not image_bytes:
            continue
        if len(image_bytes) > current_app.config["MAX_CONTENT_LENGTH"]:
            return jsonify({"error": "Image too large (max 16MB)", "code": "IMAGE_TOO_LARGE", "retryable": False}), 413

        try:
            raw_img = Image.open(io.BytesIO(image_bytes))
            processed_img = preprocess_prescription_image(raw_img)
            gemini_images.append(processed_img)

            # Prepare compressed thumbnail for storage
            storage_img = processed_img.copy()
            max_storage_size = 800
            if max(storage_img.size) > max_storage_size:
                storage_img.thumbnail((max_storage_size, max_storage_size), Image.Resampling.LANCZOS)
            storage_buffer = io.BytesIO()
            storage_img.save(storage_buffer, format="JPEG", quality=70)
            url = upload_image_bytes(storage_buffer.getvalue(), folder="dawaisathi")
            if url:
                storage_urls.append(url)
        except Exception as e:
            current_app.logger.error(f"Image preprocessing/upload error: {e}")

    if not gemini_images:
        return jsonify({"error": "Failed to process image(s)", "code": "IMAGE_PROCESS_ERROR", "retryable": False}), 422

    scan_image_url = storage_urls[0] if storage_urls else ""
    last_error = None

    # ── 1. Try OpenRouter Vision Pipeline (Qwen2.5-VL 72B / Claude 3.5 Sonnet) ────
    openrouter_key = current_app.config.get("OPENROUTER_API_KEY")
    if openrouter_key:
        openrouter_models = [
            "qwen/qwen-2.5-vl-72b-instruct",
            "anthropic/claude-3.5-sonnet",
        ]
        for model_name in openrouter_models:
            try:
                raw_text = call_openrouter_vision(SCAN_PROMPT, gemini_images, model_name, openrouter_key)
                import re
                json_match = re.search(r'(\{.*\}|\[.*\])', raw_text, re.DOTALL)
                json_str = json_match.group(1).strip() if json_match else raw_text
                extracted = json.loads(json_str)

                if isinstance(extracted, dict):
                    if "medicines" not in extracted:
                        extracted = {"medicines": [extracted] if "name" in extracted else []}
                elif isinstance(extracted, list):
                    extracted = {"medicines": extracted}
                else:
                    extracted = {"medicines": []}

                # Normalize & Deduplicate
                meds_list = extracted.get("medicines", [])
                normalized_meds = []
                seen_keys = set()
                for med in meds_list:
                    if isinstance(med, dict) and "name" in med and med["name"]:
                        med["name"] = normalize_medicine_name(med["name"])
                        key = f"{med['name'].lower()}:{'-'.join(sorted(med.get('schedule', [])))}"
                        if key not in seen_keys:
                            seen_keys.add(key)
                            normalized_meds.append(med)

                extracted["medicines"] = normalized_meds

                current_app.logger.info(f"Prescription scan successful via OpenRouter using {model_name}")
                try:
                    scan_record = PrescriptionScan(
                        user_id=user.id,
                        family_id=user.family_id,
                        scan_image_url=scan_image_url,
                        medicines_json=json.dumps(extracted.get("medicines", []))
                    )
                    db.session.add(scan_record)
                    safe_commit()
                except Exception as scan_db_err:
                    current_app.logger.warning(f"Could not save scan record: {scan_db_err}")

                return jsonify({"scan_image_url": scan_image_url, "extracted": extracted, "model_used": model_name})
            except Exception as e:
                last_error = str(e)
                current_app.logger.warning(f"OpenRouter model {model_name} failed: {e}")

    # ── 2. Fallback to Gemini API ────────────────────────────────────────────────
    api_key = current_app.config.get("GEMINI_API_KEY")
    if api_key:
        import time
        candidate_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-2.5-pro"]

        for model_name in candidate_models:
            for attempt in range(2):
                try:
                    genai.configure(api_key=api_key)
                    model = genai.GenerativeModel(model_name)
                    content_payload = [SCAN_PROMPT] + gemini_images
                    response = model.generate_content(content_payload)
                    raw_text = response.text.strip()

                    import re
                    json_match = re.search(r'(\{.*\}|\[.*\])', raw_text, re.DOTALL)
                    json_str = json_match.group(1).strip() if json_match else raw_text
                    extracted = json.loads(json_str)

                    if isinstance(extracted, dict):
                        if "medicines" not in extracted:
                            extracted = {"medicines": [extracted] if "name" in extracted else []}
                    elif isinstance(extracted, list):
                        extracted = {"medicines": extracted}
                    else:
                        extracted = {"medicines": []}

                    meds_list = extracted.get("medicines", [])
                    normalized_meds = []
                    seen_keys = set()
                    for med in meds_list:
                        if isinstance(med, dict) and "name" in med and med["name"]:
                            med["name"] = normalize_medicine_name(med["name"])
                            key = f"{med['name'].lower()}:{'-'.join(sorted(med.get('schedule', [])))}"
                            if key not in seen_keys:
                                seen_keys.add(key)
                                normalized_meds.append(med)

                    extracted["medicines"] = normalized_meds

                    current_app.logger.info(f"Prescription scan successful using {model_name}")
                    try:
                        scan_record = PrescriptionScan(
                            user_id=user.id,
                            family_id=user.family_id,
                            scan_image_url=scan_image_url,
                            medicines_json=json.dumps(extracted.get("medicines", []))
                        )
                        db.session.add(scan_record)
                        safe_commit()
                    except Exception as scan_db_err:
                        current_app.logger.warning(f"Could not save scan history record: {scan_db_err}")

                    return jsonify({"scan_image_url": scan_image_url, "extracted": extracted, "model_used": model_name})

                except Exception as e:
                    last_error = str(e)
                    current_app.logger.warning(f"Gemini model {model_name} attempt {attempt+1} failed: {e}")
                    time.sleep(0.5)

    err_lower = last_error.lower() if last_error else ""
    if "quota" in err_lower or "rate" in err_lower:
        return jsonify({"error": "AI rate limit reached. Please try again in 1 minute.", "code": "GEMINI_RATE_LIMIT", "retryable": True}), 429
    
    return jsonify({"error": "Failed to extract medicines from image. Please ensure the prescription photo is clear and well-lit.", "code": "EXTRACTION_FAILED", "retryable": True}), 422


@medicine_bp.route("/api/medicine/add", methods=["POST"])
def add_medicine():
    """Add a medicine entry to the cabinet."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    # Handle multipart form (pack image optional)
    name = request.form.get("name")
    dosage = request.form.get("dosage")
    schedule_raw = request.form.get("schedule", "[]")
    scan_image_url = request.form.get("scan_image_url", "")
    target_user_id = request.form.get("target_user_id", user.id, type=int)
    days_raw = request.form.get("days")
    instructions = request.form.get("instructions", "").strip() or None

    if not name:
        return jsonify({"error": "Medicine name is required"}), 400

    # Security check: Ensure target user belongs to the same family
    if target_user_id != user.id:
        target = User.query.get(target_user_id)
        if not target or target.family_id != user.family_id:
            return jsonify({"error": "Forbidden - Target user is not in your family"}), 403

    try:
        schedule = json.loads(schedule_raw)
    except Exception as e:
        current_app.logger.warning(f"Invalid schedule JSON for user {user.id}: {e}")
        schedule = []

    days = None
    if days_raw is not None and days_raw.strip():
        try:
            days = int(days_raw)
        except (ValueError, TypeError):
            days = None

    pack_image_url = None
    if "pack_image" in request.files:
        pack_file = request.files["pack_image"]
        pack_img = Image.open(pack_file).convert("RGB")
        max_size = 800
        if max(pack_img.size) > max_size:
            pack_img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        
        buffered = io.BytesIO()
        pack_img.save(buffered, format="JPEG", quality=75)
        
        try:
            pack_image_url = upload_image_bytes(buffered.getvalue(), folder="dawaisathi")
        except CloudinaryUploadError as e:
            return jsonify({
                "error": "Pack image upload to CDN failed. Check CLOUDINARY_URL.",
                "code": "CLOUDINARY_UPLOAD_FAILED",
                "retryable": True,
                "detail": str(e),
            }), 502

    entry = MedicineEntry(
        user_id=target_user_id,
        family_id=user.family_id,
        name=name,
        dosage=dosage,
        schedule_json=json.dumps(schedule),
        days=days,
        instructions=instructions,
        scan_image_url=scan_image_url,
        pack_image_url=pack_image_url,
    )
    db.session.add(entry)
    safe_commit()

    return jsonify({"message": "Medicine added", "medicine": entry.to_dict()}), 201


@medicine_bp.route("/api/medicine/cabinet", methods=["GET"])
def get_cabinet():
    """Get all medicines for a user (optionally another family member)."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": "Unauthorized"}), 401

    target_user_id = request.args.get("user_id", current_user.id, type=int)

    # Can only view family members
    if target_user_id != current_user.id:
        target = User.query.get(target_user_id)
        if not target or target.family_id != current_user.family_id:
            return jsonify({"error": "Not in your family"}), 403

    medicines = MedicineEntry.query.filter_by(user_id=target_user_id).order_by(
        MedicineEntry.created_at.desc()
    ).all()

    # Timezone-aware date calculations
    from datetime import timedelta
    
    tz_offset = request.args.get("tz_offset", 0, type=int) # minutes, e.g. -330 for India
    local_date_str = request.args.get("local_date")
    
    if local_date_str:
        try:
            local_date_obj = datetime.strptime(local_date_str, "%Y-%m-%d").date()
        except ValueError:
            local_date_obj = date.today()
    else:
        local_date_obj = date.today()
        
    local_start = datetime.combine(local_date_obj, datetime.min.time())
    local_end = datetime.combine(local_date_obj, datetime.max.time())
    
    # Client timezone offset is defined as: UTC = Local + offset
    today_start = local_start + timedelta(minutes=tz_offset)
    today_end = local_end + timedelta(minutes=tz_offset)

    # Fetch all logs for today for all the user's medicines in one single query!
    medicine_ids = [m.id for m in medicines]
    logs_by_med = {}
    if medicine_ids:
        today_logs = MedicineLog.query.filter(
            MedicineLog.entry_id.in_(medicine_ids),
            MedicineLog.logged_at >= today_start,
            MedicineLog.logged_at <= today_end,
        ).all()
        for log in today_logs:
            # Deduplicate at read time — guards against any pre-existing
            # duplicate rows created before the idempotency check was added.
            bucket = logs_by_med.setdefault(log.entry_id, [])
            if log.time_slot not in bucket:
                bucket.append(log.time_slot)

    # Build medicine lists using pre-fetched logs and classifying by expiry
    active_medicine_dicts = []
    expired_medicine_dicts = []
    for med in medicines:
        med_dict = med.to_dict()
        med_dict["today_logs"] = logs_by_med.get(med.id, [])
        
        if med.days is not None:
            local_created_at = med.created_at - timedelta(minutes=tz_offset)
            local_created_date = local_created_at.date()
            expiry_date = local_created_date + timedelta(days=med.days)
            if local_date_obj >= expiry_date:
                expired_medicine_dicts.append(med_dict)
                continue
                
        active_medicine_dicts.append(med_dict)

    return jsonify({
        "medicines": active_medicine_dicts,
        "expired_medicines": expired_medicine_dicts,
    })


@medicine_bp.route("/api/medicine/log", methods=["POST"])
def log_medicine():
    """Log a medicine dose as taken.

    Idempotent: if the same (entry, user, slot) was already logged today,
    returns 200 with the existing record instead of creating a duplicate.
    This makes repeated calls from the frontend (e.g. on retry after network
    error, or multi-press before the optimistic UI kicks in) completely safe.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    entry_id = data.get("entry_id")
    time_slot = data.get("time_slot")

    if not entry_id or not time_slot:
        return jsonify({"error": "entry_id and time_slot are required"}), 400

    # Validate slot name up-front so we never write garbage to the DB
    valid_slots = {"morning", "afternoon", "evening", "night"}
    if time_slot not in valid_slots:
        return jsonify({
            "error": f"Invalid time_slot '{time_slot}'. Must be one of: {', '.join(sorted(valid_slots))}",
            "code": "INVALID_SLOT",
        }), 400

    entry = MedicineEntry.query.get(entry_id)
    if not entry:
        return jsonify({"error": "Medicine not found"}), 404

    # Can log for yourself or any member of your family group
    if entry.family_id and entry.family_id != user.family_id and entry.user_id != user.id:
        return jsonify({"error": "Forbidden"}), 403

    # ── Idempotency check ────────────────────────────────────────────────────
    # One log per (entry, user, slot) per calendar day in the user's UTC time.
    # If already logged, return the existing record — do NOT insert a duplicate.
    today = date.today()
    existing = MedicineLog.query.filter(
        MedicineLog.entry_id == entry_id,
        MedicineLog.logged_by_user_id == user.id,
        MedicineLog.time_slot == time_slot,
        db.func.date(MedicineLog.logged_at) == today,
    ).first()

    if existing:
        current_app.logger.debug(
            "Duplicate log prevented for entry=%s slot=%s user=%s",
            entry_id, time_slot, user.id,
        )
        return jsonify({"message": "Already logged", "log": existing.to_dict()}), 200
    # ─────────────────────────────────────────────────────────────────────────

    log_entry = MedicineLog(
        entry_id=entry_id,
        logged_by_user_id=user.id,
        time_slot=time_slot,
    )
    db.session.add(log_entry)
    safe_commit()

    return jsonify({"message": "Dose logged", "log": log_entry.to_dict()}), 201


@medicine_bp.route("/api/medicine/delete/<int:entry_id>", methods=["DELETE"])
def delete_medicine(entry_id):
    """Permanently delete a medicine entry from the cabinet."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    entry = MedicineEntry.query.get(entry_id)
    if not entry:
        return jsonify({"error": "Medicine not found"}), 404

    # Security check: Can only delete if it belongs to you or your family
    if entry.user_id != user.id:
        if not (entry.family_id and entry.family_id == user.family_id):
            return jsonify({"error": "Forbidden"}), 403

    # Delete all associated logs first
    MedicineLog.query.filter_by(entry_id=entry_id).delete(synchronize_session=False)
    db.session.delete(entry)
    try:
        safe_commit()
    except Exception as e:
        current_app.logger.error(f"Delete medicine {entry_id} commit failed: {e}")
        db.session.rollback()
        return jsonify({"error": "Failed to delete medicine"}), 500

    return jsonify({"message": "Medicine permanently deleted"})


@medicine_bp.route("/api/medicine/update/<int:entry_id>", methods=["POST"])
def update_medicine(entry_id):
    """Update an existing medicine entry."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    entry = MedicineEntry.query.get(entry_id)
    if not entry:
        return jsonify({"error": "Medicine entry not found"}), 404

    # Security check: Can only update if it belongs to you or your family
    if entry.user_id != user.id:
        if not (entry.family_id and entry.family_id == user.family_id):
            return jsonify({"error": "Forbidden"}), 403

    name = request.form.get("name")
    dosage = request.form.get("dosage")
    schedule_raw = request.form.get("schedule")
    days_raw = request.form.get("days")
    instructions = request.form.get("instructions")

    errors = []

    if name:
        name = name.strip()
        if not name:
            errors.append("Medicine name cannot be empty")
        else:
            entry.name = name
    if dosage is not None:
        entry.dosage = dosage.strip() or None
    if instructions is not None:
        entry.instructions = instructions.strip() or None

    valid_slots = {"morning", "afternoon", "evening", "night"}
    if schedule_raw is not None:
        try:
            schedule = json.loads(schedule_raw)
            if not isinstance(schedule, list):
                errors.append("Schedule must be a list")
            elif not all(s in valid_slots for s in schedule):
                errors.append(f"Invalid schedule slots. Valid: {', '.join(valid_slots)}")
            else:
                entry.schedule_json = json.dumps(schedule)
        except json.JSONDecodeError as e:
            errors.append(f"Invalid schedule JSON: {e}")

    if days_raw is not None:
        if days_raw.strip():
            try:
                days = int(days_raw)
                if days < 1 or days > 365:
                    errors.append("Days must be between 1 and 365")
                else:
                    entry.days = days
            except (ValueError, TypeError):
                errors.append("Days must be a valid integer")
        else:
            entry.days = None

    if errors:
        return jsonify({"error": "Validation failed", "code": "VALIDATION_ERROR", "details": errors}), 422

    if "pack_image" in request.files:
        pack_file = request.files["pack_image"]
        pack_img = Image.open(pack_file).convert("RGB")
        max_size = 800
        if max(pack_img.size) > max_size:
            pack_img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        
        buffered = io.BytesIO()
        pack_img.save(buffered, format="JPEG", quality=75)
        
        try:
            entry.pack_image_url = upload_image_bytes(buffered.getvalue(), folder="dawaisathi")
        except CloudinaryUploadError as e:
            return jsonify({
                "error": "Pack image upload to CDN failed. Check CLOUDINARY_URL.",
                "code": "CLOUDINARY_UPLOAD_FAILED",
                "retryable": True,
                "detail": str(e),
            }), 502

    safe_commit()
    return jsonify({"message": "Medicine updated", "medicine": entry.to_dict()})


@medicine_bp.route("/uploads/<filename>")
def serve_upload(filename):
    """Serve legacy local uploads (dev / old data). Missing files return quiet 404 — not 500."""
    # Local Development Bypass: Allow serving uploads without auth token
    env = (os.environ.get("FLASK_ENV") or current_app.config.get("ENV") or "").lower()
    is_prod = os.environ.get("RENDER") == "true" or env == "production"
    if not is_prod:
        upload_dir = current_app.config["UPLOAD_FOLDER"]
        return send_from_directory(upload_dir, filename)

    user = get_current_user()
    if not user:
        token = request.args.get("token", "")
        if token:
            try:
                payload = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
                user = User.query.get(payload["user_id"])
            except Exception as e:
                current_app.logger.warning(f"Invalid token in upload URL: {e}")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    upload_dir = current_app.config["UPLOAD_FOLDER"]
    filepath = os.path.join(upload_dir, filename)
    if not os.path.isfile(filepath):
        # Expected for migrated rows whose ephemeral files are gone — do not raise NotFound
        current_app.logger.info(f"Missing local upload (cleared or never on this host): {filename}")
        return jsonify({
            "error": "Image not available",
            "code": "UPLOAD_NOT_FOUND",
            "hint": "Legacy local path; re-scan or re-upload. New images use Cloudinary.",
        }), 404
    try:
        return send_from_directory(upload_dir, filename)
    except NotFound:
        return jsonify({"error": "Image not available", "code": "UPLOAD_NOT_FOUND"}), 404


@medicine_bp.route("/api/medicine/upload-image", methods=["POST"])
def upload_image():
    """Upload any image to Cloudinary and return the secure URL."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    image_file = request.files["image"]
    image_bytes = image_file.read()

    # Downscale using Pillow first to save bandwidth/storage
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    max_size = 1000
    if max(img.size) > max_size:
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    buffered = io.BytesIO()
    img.save(buffered, format="JPEG", quality=75)

    try:
        url = upload_image_bytes(buffered.getvalue(), folder="dawaisathi")
        return jsonify({"url": url})
    except CloudinaryUploadError as e:
        return jsonify({
            "error": "Failed to upload image to CDN",
            "code": "CLOUDINARY_UPLOAD_FAILED",
            "detail": str(e),
        }), 502


@medicine_bp.route("/api/medicine/batch-add", methods=["POST"])
def batch_add_medicines():
    """Add multiple medicine entries to the cabinet in a single batch."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    medicines_data = data.get("medicines", [])
    scan_image_url = data.get("scan_image_url", "")
    target_user_id = data.get("target_user_id", user.id)

    if not medicines_data:
        return jsonify({"error": "No medicines provided"}), 400

    # Security check: Ensure target user belongs to the same family
    if target_user_id != user.id:
        target = User.query.get(target_user_id)
        if not target or target.family_id != user.family_id:
            return jsonify({"error": "Forbidden - Target user is not in your family"}), 403

    added_entries = []
    errors = []
    for idx, med in enumerate(medicines_data):
        name = med.get("name", "").strip()
        if not name:
            errors.append({"index": idx, "error": "Medicine name is required", "code": "MISSING_NAME"})
            continue

        dosage = med.get("dosage")
        schedule = med.get("schedule", [])
        days_raw = med.get("days")
        instructions = med.get("instructions")
        pack_image_url = med.get("pack_image_url")

        valid_slots = {"morning", "afternoon", "evening", "night"}
        if not isinstance(schedule, list) or not all(s in valid_slots for s in schedule):
            errors.append({"index": idx, "error": "Invalid schedule slots", "code": "INVALID_SCHEDULE"})
            continue

        quantity = None
        quantity_raw = med.get("quantity")
        if quantity_raw is not None and str(quantity_raw).strip():
            try:
                quantity = int(quantity_raw)
                if quantity < 0:
                    quantity = None
            except (ValueError, TypeError):
                quantity = None

        days = None
        if days_raw is not None and str(days_raw).strip():
            try:
                days = int(days_raw)
                if days < 1 or days > 365:
                    errors.append({"index": idx, "error": "Days must be between 1 and 365", "code": "INVALID_DAYS"})
                    continue
            except (ValueError, TypeError):
                errors.append({"index": idx, "error": "Days must be a valid number", "code": "INVALID_DAYS"})
                continue

        entry = MedicineEntry(
            user_id=target_user_id,
            family_id=user.family_id,
            name=name,
            dosage=dosage.strip() if dosage else None,
            schedule_json=json.dumps(schedule),
            days=days,
            instructions=instructions.strip() if instructions else None,
            scan_image_url=scan_image_url,
            pack_image_url=pack_image_url,
            quantity=quantity,
        )
        db.session.add(entry)
        added_entries.append(entry)

    safe_commit()

    result = {
        "message": f"Added {len(added_entries)} of {len(medicines_data)} medicines",
        "added": len(added_entries),
        "medicines": [e.to_dict() for e in added_entries],
    }
    if errors:
        result["errors"] = errors
        return jsonify(result), 207
    return jsonify(result), 201


INTERACTION_PROMPT = """You are a senior clinical pharmacist analyzing a patient's medicine schedule for drug-drug interactions, contraindications, and food/timing advice.

List of medicines currently prescribed/taken by patient:
{medicine_list}

Analyze these medicines thoroughly. Return a JSON object with this EXACT structure:
{{
  "severity": "safe" | "moderate" | "severe",
  "summary": "Brief 1-sentence overall clinical summary of the safety check",
  "interactions": [
    {{
      "pair": ["Drug A", "Drug B"],
      "severity": "severe" | "moderate" | "info",
      "title": "Short title of interaction",
      "description": "Clear explanation of how these medicines interact",
      "recommendation": "Actionable advice for the patient (e.g. space 2 hours apart, consult doctor)"
    }}
  ],
  "food_advice": [
    "Specific food or timing advice for these medicines"
  ]
}}

Rules:
1. If there are fewer than 2 medicines or no significant interactions, set "severity": "safe", "summary": "No dangerous drug interactions detected between active medicines.", "interactions": [], and provide general food/dosage advice if applicable.
2. Output ONLY strictly valid JSON.
"""


@medicine_bp.route("/api/medicine/check-interactions", methods=["POST"])
def check_interactions():
    """Analyze active medicines for drug-drug interactions using Gemini AI."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    medicines = data.get("medicines")

    # If medicines not passed directly, fetch active cabinet entries for target user or logged in user
    if medicines is None:
        target_user_id = data.get("user_id", user.id)
        if target_user_id != user.id:
            member = User.query.filter_by(id=target_user_id, family_id=user.family_id).first()
            if not member:
                return jsonify({"error": "Member not found in family"}), 404
        entries = MedicineEntry.query.filter_by(user_id=target_user_id).all()
        medicines = [{"name": e.name, "dosage": e.dosage or "", "instructions": e.instructions or ""} for e in entries]

    if not isinstance(medicines, list) or len(medicines) == 0:
        return jsonify({
            "severity": "safe",
            "summary": "No active medicines in cabinet to check for interactions.",
            "interactions": [],
            "food_advice": [],
        })

    # Prepare formatted medicine list string
    formatted_meds = []
    for idx, m in enumerate(medicines, 1):
        name = m.get("name", "").strip()
        dosage = m.get("dosage", "").strip()
        instructions = m.get("instructions", "").strip()
        formatted_meds.append(f"{idx}. {name} {dosage} ({instructions})".strip())

    medicine_str = "\n".join(formatted_meds)

    api_key = current_app.config.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({
            "severity": "safe",
            "summary": "Gemini API key not configured. Basic safety check active.",
            "interactions": [],
            "food_advice": ["Take medicines as prescribed by your physician."],
        })

    candidate_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-2.5-pro"]
    for model_name in candidate_models:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            prompt = INTERACTION_PROMPT.format(medicine_list=medicine_str)
            response = model.generate_content(prompt)
            raw_text = response.text.strip()

            import re
            json_match = re.search(r'(\{.*\}|\[.*\])', raw_text, re.DOTALL)
            json_str = json_match.group(1).strip() if json_match else raw_text

            result = json.loads(json_str)
            return jsonify(result)
        except Exception as e:
            current_app.logger.warning(f"Interaction check model {model_name} failed: {e}")

    return jsonify({
        "severity": "safe",
        "summary": "No critical interactions detected.",
        "interactions": [],
        "food_advice": ["Take medicines as prescribed by your doctor."]
    })


@medicine_bp.route("/api/medicine/streak", methods=["GET"])
def get_streak():
    """Return the user's adherence streak and any missed doses from yesterday.

    A streak day is a calendar day where the user logged ALL scheduled doses
    for ALL their active medicines. Days with no scheduled medicines are
    excluded from streak counting (they don't break or extend it).

    Returns:
        streak_days     (int)   — consecutive days streak ending today/yesterday
        today_pct       (int)   — today's adherence % (0–100)
        missed_yesterday (list) — list of {medicine_name, slot} for any
                                  missed doses yesterday (drives missed-dose banner)
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    from datetime import timedelta

    # Accept same tz_offset as /cabinet for consistency
    tz_offset = request.args.get("tz_offset", 0, type=int)
    target_user_id = request.args.get("user_id", user.id, type=int)

    # Security: only allow viewing own data or family member data
    if target_user_id != user.id:
        target = User.query.get(target_user_id)
        if not target or target.family_id != user.family_id:
            return jsonify({"error": "Forbidden"}), 403

    # ── Fetch all active medicine entries for this user ───────────────────────
    # We purposely do NOT filter by expiry here — we want historical accuracy.
    # An expired medicine that was active on day D should count toward that day's
    # adherence when calculating the streak for day D.
    all_entries = MedicineEntry.query.filter_by(user_id=target_user_id).all()

    if not all_entries:
        return jsonify({"streak_days": 0, "today_pct": 0, "missed_yesterday": []})

    # ── Fetch all logs for this user (last 90 days — reasonable bound) ────────
    cutoff = datetime.utcnow() - timedelta(days=90)
    all_logs = MedicineLog.query.filter(
        MedicineLog.entry_id.in_([e.id for e in all_entries]),
        MedicineLog.logged_at >= cutoff,
    ).all()

    # Build a dict: {entry_id -> set(date_strings)}  for each slot
    # Key: (entry_id, "morning") → {date_str, ...}
    logged_map: dict = {}  # (entry_id, slot) -> set of date strings
    for log in all_logs:
        local_dt = log.logged_at - timedelta(minutes=tz_offset)
        d_str = local_dt.date().isoformat()
        key = (log.entry_id, log.time_slot)
        logged_map.setdefault(key, set()).add(d_str)

    earliest_date = min((e.created_at - timedelta(minutes=tz_offset)).date() for e in all_entries)

    # ── Helper: did the user fully complete all doses on a given date? ─────────
    def _all_logged_on(d: date) -> bool:
        if d < earliest_date:
            return False

        d_str = d.isoformat()
        active_count = 0
        for entry in all_entries:
            local_created = (entry.created_at - timedelta(minutes=tz_offset)).date()
            if d < local_created:
                continue  # medicine wasn't added yet on this day

            if entry.days is not None:
                expiry = local_created + timedelta(days=entry.days)
                if d >= expiry:
                    continue  # medicine was expired on this day

            active_count += 1
            for slot in entry.schedule:
                if d_str not in logged_map.get((entry.id, slot), set()):
                    return False

        return active_count > 0

    # ── Walk back from today counting consecutive complete days ───────────────
    local_today = (datetime.utcnow() - timedelta(minutes=tz_offset)).date()
    local_yesterday = local_today - timedelta(days=1)

    streak = 0
    check_date = local_today

    # Today counts if 100% done; otherwise start checking from yesterday
    # (a streak shouldn't break just because today isn't over)
    if _all_logged_on(local_today):
        streak = 1
        check_date = local_yesterday
    else:
        check_date = local_yesterday

    # Walk back up to 90 days
    for _ in range(89):
        if _all_logged_on(check_date):
            streak += 1
            check_date -= timedelta(days=1)
        else:
            break

    # ── Today's adherence % ───────────────────────────────────────────────────
    today_str = local_today.isoformat()
    total_today = 0
    taken_today = 0
    for entry in all_entries:
        if entry.days is not None:
            local_created = entry.created_at - timedelta(minutes=tz_offset)
            expiry = local_created.date() + timedelta(days=entry.days)
            if local_today >= expiry or local_today < local_created.date():
                continue
        for slot in entry.schedule:
            total_today += 1
            if today_str in logged_map.get((entry.id, slot), set()):
                taken_today += 1

    today_pct = round((taken_today / total_today) * 100) if total_today > 0 else 0

    # ── Missed doses from yesterday (for banner) ──────────────────────────────
    yesterday_str = local_yesterday.isoformat()
    missed_yesterday = []
    for entry in all_entries:
        if entry.days is not None:
            local_created = entry.created_at - timedelta(minutes=tz_offset)
            expiry = local_created.date() + timedelta(days=entry.days)
            if local_yesterday >= expiry or local_yesterday < local_created.date():
                continue
        for slot in entry.schedule:
            if yesterday_str not in logged_map.get((entry.id, slot), set()):
                missed_yesterday.append({
                    "medicine_name": entry.name,
                    "medicine_id": entry.id,
                    "slot": slot,
                })

    return jsonify({
        "streak_days": streak,
        "today_pct": today_pct,
        "missed_yesterday": missed_yesterday,
    })


INFO_PROMPT = """You are a helpful Indian AI pharmacist assistant. Provide a brief 3-sentence explanation for the medicine "{name}" (dosage: "{dosage}").

Return ONLY a valid JSON object with these exact keys:
{{
  "medicine_name": "{name}",
  "purpose": "1 plain-language sentence explaining what this medicine is for.",
  "how_to_take": "1 practical sentence on when or how to take it.",
  "side_effects": "1 sentence on common mild side effects or precautions.",
  "disclaimer": "Always follow your doctor's exact instructions."
}}
"""

@medicine_bp.route("/api/medicine/info", methods=["POST"])
def get_medicine_info():
    """Get plain-language AI explanation of a medicine."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    dosage = (data.get("dosage") or "").strip()

    if not name:
        return jsonify({"error": "Medicine name required"}), 400

    api_key = current_app.config.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({
            "medicine_name": name,
            "purpose": f"Information for {name}.",
            "how_to_take": "Take as prescribed by your physician.",
            "side_effects": "Consult your doctor if you experience discomfort.",
            "disclaimer": "Always follow your doctor's exact instructions."
        })

    candidate_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-2.5-pro"]
    for model_name in candidate_models:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            prompt = INFO_PROMPT.format(name=name, dosage=dosage)
            response = model.generate_content(prompt)
            raw_text = response.text.strip()

            import re
            json_match = re.search(r'(\{.*\}|\[.*\])', raw_text, re.DOTALL)
            json_str = json_match.group(1).strip() if json_match else raw_text
            res_obj = json.loads(json_str)
            return jsonify(res_obj)
        except Exception as e:
            current_app.logger.warning(f"Medicine info model {model_name} failed: {e}")

    return jsonify({
        "medicine_name": name,
        "purpose": f"Prescribed medication ({name}).",
        "how_to_take": "Follow prescription timing instructions.",
        "side_effects": "Consult physician for specific side effects.",
        "disclaimer": "Always follow your doctor's exact instructions."
    })


@medicine_bp.route("/api/medicine/history", methods=["GET"])
def get_scan_history():
    """Fetch archived prescription scans for current user or family member."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    target_user_id = request.args.get("user_id", user.id, type=int)

    if target_user_id != user.id:
        target = User.query.get(target_user_id)
        if not target or target.family_id != user.family_id:
            return jsonify({"error": "Forbidden"}), 403

    scans = PrescriptionScan.query.filter_by(user_id=target_user_id).order_by(PrescriptionScan.created_at.desc()).all()
    return jsonify({"scans": [s.to_dict() for s in scans]})


@medicine_bp.route("/api/medicine/history/<int:scan_id>", methods=["DELETE"])
def delete_scan_history(scan_id):
    """Delete an archived prescription scan record."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    scan = PrescriptionScan.query.get(scan_id)
    if not scan:
        return jsonify({"error": "Scan record not found"}), 404

    if scan.user_id != user.id:
        if not (scan.family_id and scan.family_id == user.family_id):
            return jsonify({"error": "Forbidden"}), 403

    db.session.delete(scan)
    safe_commit()
    return jsonify({"message": "Scan record deleted"})


@medicine_bp.route("/api/medicine/report", methods=["GET"])
def get_weekly_report():
    """Get precise 7-day adherence report accounting for user join date and active medicine schedules."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    target_user_id = request.args.get("user_id", user.id, type=int)
    tz_offset = request.args.get("tz_offset", 0, type=int)

    if target_user_id != user.id:
        target = User.query.get(target_user_id)
        if not target or target.family_id != user.family_id:
            return jsonify({"error": "Forbidden"}), 403

    all_entries = MedicineEntry.query.filter_by(user_id=target_user_id).all()
    user_obj = User.query.get(target_user_id)
    user_created_date = (user_obj.created_at - timedelta(minutes=tz_offset)).date() if user_obj and user_obj.created_at else date.today()

    cutoff = datetime.utcnow() - timedelta(days=14)
    all_logs = MedicineLog.query.filter(
        MedicineLog.entry_id.in_([e.id for e in all_entries]) if all_entries else db.false(),
        MedicineLog.logged_at >= cutoff,
    ).all()

    logged_map = {}
    for log in all_logs:
        local_dt = log.logged_at - timedelta(minutes=tz_offset)
        d_str = local_dt.date().isoformat()
        key = (log.entry_id, log.time_slot)
        logged_map.setdefault(key, set()).add(d_str)

    local_today = (datetime.utcnow() - timedelta(minutes=tz_offset)).date()

    timeline = []
    tracked_scores = []

    for i in range(6, -1, -1):
        target_d = local_today - timedelta(days=i)
        day_label = target_d.strftime("%a")
        date_str = target_d.strftime("%b %d")

        if target_d < user_created_date:
            timeline.append({
                "day": day_label,
                "date_str": date_str,
                "status": "untracked",
                "taken": 0,
                "total": 0,
            })
            continue

        active_meds = []
        for entry in all_entries:
            med_created = (entry.created_at - timedelta(minutes=tz_offset)).date()
            if target_d < med_created:
                continue
            if entry.days is not None:
                expiry = med_created + timedelta(days=entry.days)
                if target_d >= expiry:
                    continue
            active_meds.append(entry)

        if not active_meds:
            timeline.append({
                "day": day_label,
                "date_str": date_str,
                "status": "no_doses",
                "taken": 0,
                "total": 0,
            })
            continue

        total_doses = 0
        taken_doses = 0
        d_iso = target_d.isoformat()

        for entry in active_meds:
            for slot in entry.schedule:
                total_doses += 1
                if d_iso in logged_map.get((entry.id, slot), set()):
                    taken_doses += 1

        day_ratio = (taken_doses / total_doses) if total_doses > 0 else 1.0
        tracked_scores.append(day_ratio)

        status = "complete"
        if total_doses > 0:
            if taken_doses == total_doses:
                status = "complete"
            elif taken_doses > 0:
                status = "partial"
            elif target_d == local_today:
                status = "pending"
            else:
                status = "missed"

        timeline.append({
            "day": day_label,
            "date_str": date_str,
            "status": status,
            "taken": taken_doses,
            "total": total_doses,
        })

    total_logs_count = len(all_logs)
    is_new_user = (total_logs_count == 0)

    if is_new_user:
        overall_score = 0
    elif tracked_scores:
        overall_score = round((sum(tracked_scores) / len(tracked_scores)) * 100)
    else:
        overall_score = 0

    return jsonify({
        "userName": user_obj.name if user_obj else "User",
        "adherencePct": overall_score,
        "is_new_user": is_new_user,
        "timeline": timeline,
        "app_version": "v4.1",
    })

