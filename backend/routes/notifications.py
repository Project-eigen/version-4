"""
routes/notifications.py
All API endpoints for the notification system:
  - Timezone sync
  - Notification settings (slots + custom times)
  - Telegram linking flow (code generation + webhook + status poll)
  - Web Push subscription management + test send
  - Utility: manually re-register Telegram webhook URL
"""
import json
import os
import random
import logging
import requests
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app
from extensions import db, safe_commit
from models import User, TelegramLinkCode, PushSubscription
from routes.auth import get_current_user

log = logging.getLogger(__name__)
notifications_bp = Blueprint("notifications", __name__)

VALID_SLOTS = {"morning", "afternoon", "evening", "night"}
DEFAULT_TIMES = {
    "morning":   "08:00",
    "afternoon": "13:00",
    "evening":   "18:00",
    "night":     "22:00",
}


# ── Timezone Sync ──────────────────────────────────────────────────────────────

@notifications_bp.route("/api/notifications/timezone", methods=["POST"])
def sync_timezone():
    """Called automatically on app load to keep the user's timezone current."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    try:
        offset = int(data.get("tz_offset", 0))
    except (TypeError, ValueError):
        offset = 0
    user.timezone_offset = offset
    tz_name = data.get("tz_name")
    if tz_name:
        user.timezone_name = tz_name
    safe_commit()
    return jsonify({"ok": True})


# ── Settings ───────────────────────────────────────────────────────────────────

@notifications_bp.route("/api/notifications/settings", methods=["GET"])
def get_settings():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    endpoint = request.args.get("endpoint", "")

    slots = json.loads(user.notif_slots_json) if user.notif_slots_json else list(DEFAULT_TIMES.keys())
    times = json.loads(user.notif_times_json) if user.notif_times_json else DEFAULT_TIMES

    subs = PushSubscription.query.filter_by(user_id=user.id).all()
    current_device_enabled = any(s.endpoint == endpoint for s in subs) if endpoint else False

    return jsonify({
        "telegram_linked": user.telegram_chat_id is not None,
        "push_enabled": len(subs) > 0,
        "push_enabled_current_device": current_device_enabled,
        "push_device_count": len(subs),
        "push_devices": [
            {"endpoint": s.endpoint[-40:], "current_device": s.endpoint == endpoint}
            for s in subs
        ],
        "slots": slots,
        "times": times,
        "timezone_name": user.timezone_name,
        "language": user.language or "en",
    })


@notifications_bp.route("/api/notifications/settings", methods=["POST"])
def update_settings():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}

    if "language" in data:
        lang = str(data["language"]).strip().lower()
        if lang in ("en", "hi"):
            user.language = lang

    if "slots" in data:
        cleaned = [s for s in data["slots"] if s in VALID_SLOTS]
        user.notif_slots_json = json.dumps(cleaned)

    if "times" in data:
        times: dict[str, str] = {}
        for slot, val in data["times"].items():
            if slot not in VALID_SLOTS:
                continue
            try:
                h, m = map(int, str(val).split(":"))
                if 0 <= h <= 23 and 0 <= m <= 59:
                    times[slot] = f"{h:02d}:{m:02d}"
            except Exception as e:
                current_app.logger.warning(f"Invalid custom time '{val}' for slot {slot} (user {user.id}): {e}")
        user.notif_times_json = json.dumps(times)

    if "timezone_name" in data:
        tz_name = str(data["timezone_name"]).strip()
        if len(tz_name) <= 64:
            user.timezone_name = tz_name
            # Compute and save matching minute offset for backward compatibility
            try:
                from zoneinfo import ZoneInfo
                from datetime import datetime, timezone
                tz_obj = ZoneInfo(tz_name)
                # Compute offset for the current time using an aware datetime
                aware_dt = datetime.now(timezone.utc).astimezone(tz_obj)
                offset_sec = aware_dt.utcoffset().total_seconds()
                user.timezone_offset = -int(offset_sec / 60)
            except Exception as exc:
                current_app.logger.warning(
                    f"Failed to resolve timezone/offset '{tz_name}' for user {user.id}: {exc}"
                )

    safe_commit()
    return jsonify({"ok": True})


# ── Telegram: generate link code ───────────────────────────────────────────────

@notifications_bp.route("/api/notifications/telegram/code", methods=["GET"])
def get_telegram_code():
    """Generate a 6-digit code the user will send to the bot to link their account."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    # Expire/remove old unused codes for this user
    TelegramLinkCode.query.filter_by(user_id=user.id, used=False).delete(synchronize_session=False)
    db.session.flush()

    # Generate a unique 6-digit code
    for _ in range(10):
        code = "".join(str(random.randint(0, 9)) for _ in range(6))
        if not TelegramLinkCode.query.filter_by(code=code).first():
            break

    link = TelegramLinkCode(
        code=code,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    db.session.add(link)
    safe_commit()

    # Try to resolve the bot's username for the deep link
    token = current_app.config.get("TELEGRAM_BOT_TOKEN", "")
    bot_username = "DawaiSathiBot"  # fallback
    if token:
        try:
            resp = requests.get(
                f"https://api.telegram.org/bot{token}/getMe", timeout=5
            )
            if resp.ok:
                bot_username = resp.json().get("result", {}).get("username", bot_username)
        except Exception as e:
            current_app.logger.warning(f"Telegram getMe failed: {e}")

    return jsonify({
        "code": code,
        "bot_username": bot_username,
        "expires_in_minutes": 10,
    })


@notifications_bp.route("/api/notifications/telegram/status", methods=["GET"])
def telegram_status():
    """Polling endpoint: frontend polls this to detect when linking succeeds."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"linked": user.telegram_chat_id is not None})


@notifications_bp.route("/api/notifications/telegram/unlink", methods=["POST"])
def unlink_telegram():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    user.telegram_chat_id = None
    safe_commit()
    return jsonify({"ok": True})


# ── Telegram: bot webhook ─────────────────────────────────────────────────────

@notifications_bp.route("/api/telegram/webhook", methods=["POST"])
def telegram_webhook():
    """
    Receives all inbound updates from Telegram servers.
    Handles:
      - message.text  : /start, /stop, 6-digit link codes
      - callback_query: inline button taps (e.g. "Log all doses")
    """
    data = request.get_json(silent=True) or {}
    token = current_app.config.get("TELEGRAM_BOT_TOKEN", "")

    def _send(chat_id: str, msg: str) -> None:
        if not token:
            return
        try:
            requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"},
                timeout=10,
            )
        except Exception as e:
            current_app.logger.warning("Telegram send failed for chat %s: %s", chat_id, e)

    def _answer_callback(callback_query_id: str, text: str = "", alert: bool = False) -> None:
        """Acknowledge a callback query (removes spinner from button)."""
        if not token:
            return
        try:
            requests.post(
                f"https://api.telegram.org/bot{token}/answerCallbackQuery",
                json={"callback_query_id": callback_query_id, "text": text, "show_alert": alert},
                timeout=5,
            )
        except Exception as e:
            current_app.logger.warning("answerCallbackQuery failed: %s", e)

    def _edit_message(chat_id: str, message_id: int, new_text: str) -> None:
        """Edit an existing message to replace the inline keyboard with a confirmation."""
        if not token:
            return
        try:
            requests.post(
                f"https://api.telegram.org/bot{token}/editMessageText",
                json={
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "text": new_text,
                    "parse_mode": "HTML",
                    "reply_markup": {"inline_keyboard": []},  # Remove buttons
                },
                timeout=10,
            )
        except Exception as e:
            current_app.logger.warning("editMessageText failed for chat %s: %s", chat_id, e)

    # ── Handle inline button callback_query ──────────────────────────────────
    callback_query = data.get("callback_query", {})
    if callback_query:
        cq_id      = callback_query.get("id", "")
        cq_data    = callback_query.get("data", "")
        cq_chat_id = str(callback_query.get("from", {}).get("id", ""))
        cq_msg     = callback_query.get("message", {})
        cq_msg_id  = cq_msg.get("message_id")

        # "log_all:{slot}:{YYYY-MM-DD}"
        if cq_data.startswith("log_all:"):
            parts = cq_data.split(":")
            if len(parts) != 3:
                _answer_callback(cq_id, "❌ Invalid button data.", alert=True)
                return jsonify({"ok": True})

            _, slot, date_str = parts

            # Look up the user by chat_id
            acting_user = User.query.filter_by(telegram_chat_id=cq_chat_id).first()
            if not acting_user:
                _answer_callback(cq_id, "❌ Account not linked.", alert=True)
                return jsonify({"ok": True})

            # Parse date
            try:
                from datetime import date as _date
                target_date = _date.fromisoformat(date_str)
            except ValueError:
                _answer_callback(cq_id, "❌ Invalid date in button.", alert=True)
                return jsonify({"ok": True})

            # Determine which users' medicines to log (family or solo)
            from models import MedicineEntry, MedicineLog
            from datetime import timedelta

            if acting_user.family_id:
                target_ids = [
                    uid for (uid,) in db.session.query(User.id)
                    .filter_by(family_id=acting_user.family_id).all()
                ]
            else:
                target_ids = [acting_user.id]

            # Fetch due medicines for this slot + date
            medicines = []
            all_meds = MedicineEntry.query.filter(
                MedicineEntry.user_id.in_(target_ids)
            ).all()
            for med in all_meds:
                if slot not in (med.schedule or []):
                    continue
                if med.days is not None:
                    end_date = med.created_at.date() + timedelta(days=med.days)
                    if target_date >= end_date:
                        continue
                medicines.append(med)

            if not medicines:
                _answer_callback(cq_id, "ℹ️ No doses found for this slot.", alert=False)
                return jsonify({"ok": True})

            # Log each medicine (idempotent — skip already-logged)
            logged_count = 0
            for med in medicines:
                existing = MedicineLog.query.filter_by(
                    entry_id=med.id,
                    time_slot=slot,
                    date=target_date,
                ).first()
                if not existing:
                    db.session.add(MedicineLog(
                        entry_id=med.id,
                        user_id=med.user_id,
                        time_slot=slot,
                        date=target_date,
                    ))
                    logged_count += 1

            try:
                db.session.commit()
            except Exception as exc:
                db.session.rollback()
                current_app.logger.error("Telegram log_all commit failed: %s", exc)
                _answer_callback(cq_id, "❌ Server error — please try again.", alert=True)
                return jsonify({"ok": True})

            # Answer + edit the original message
            total = len(medicines)
            already = total - logged_count
            is_hindi = getattr(acting_user, 'language', 'en') == 'hi'

            if is_hindi:
                if logged_count == total:
                    toast = f"✅ सभी {total} दवाइयां दर्ज की गईं!"
                    edit_text = (
                        cq_msg.get("text", "💊 दवाईसाथी रिमाइंडर").split("\n\n")[0]
                        + f"\n\n✅ <b>सभी {total} दवाइयां दर्ज की गईं</b> (टेलीग्राम द्वारा)"
                    )
                elif logged_count > 0:
                    toast = f"✅ {logged_count} दवाइयां दर्ज हुईं ({already} पहले से ली गई थीं)।"
                    edit_text = (
                        cq_msg.get("text", "💊 दवाईसाथी रिमाइंडर").split("\n\n")[0]
                        + f"\n\n✅ <b>{logged_count} दवाइयां दर्ज हुईं</b> ({already} पहले से ली गई थीं)"
                    )
                else:
                    toast = "ℹ️ सभी दवाइयां पहले ही दर्ज थीं।"
                    edit_text = (
                        cq_msg.get("text", "💊 दवाईसाथी रिमाइंडर").split("\n\n")[0]
                        + "\n\nℹ️ <i>सभी दवाइयां पहले ही दर्ज थीं।</i>"
                    )
            else:
                if logged_count == total:
                    toast = f"✅ All {total} doses logged!"
                    edit_text = (
                        cq_msg.get("text", "💊 DawaiSathi Reminder").split("\n\n")[0]
                        + f"\n\n✅ <b>All {total} doses logged</b> via Telegram"
                    )
                elif logged_count > 0:
                    toast = f"✅ {logged_count} new dose{'s' if logged_count != 1 else ''} logged ({already} already done)."
                    edit_text = (
                        cq_msg.get("text", "💊 DawaiSathi Reminder").split("\n\n")[0]
                        + f"\n\n✅ <b>{logged_count} dose{'s' if logged_count != 1 else ''} logged</b> ({already} already done)"
                    )
                else:
                    toast = "ℹ️ All doses were already logged."
                    edit_text = (
                        cq_msg.get("text", "💊 DawaiSathi Reminder").split("\n\n")[0]
                        + "\n\nℹ️ <i>All doses were already logged.</i>"
                    )

            _answer_callback(cq_id, toast, alert=False)
            if cq_msg_id:
                _edit_message(cq_chat_id, cq_msg_id, edit_text)

            return jsonify({"ok": True})

        # Unknown callback
        _answer_callback(cq_id, "")
        return jsonify({"ok": True})

    # ── Handle regular text & voice messages ─────────────────────────────────
    message = data.get("message", {})
    if not message:
        return jsonify({"ok": True})

    chat_id = str(message.get("chat", {}).get("id", ""))
    text = message.get("text", "").strip()
    voice = message.get("voice")

    if not chat_id:
        return jsonify({"ok": True})

    def _reply(msg: str) -> None:
        _send(chat_id, msg)

    # Find linked user for this chat_id
    linked_user = User.query.filter_by(telegram_chat_id=chat_id).first()

    # /start command
    if text == "/start":
        _reply(
            "👋 Welcome to <b>DawaiSathi</b>!\n\n"
            "To receive medicine reminders here:\n"
            "1. Open the DawaiSathi app\n"
            "2. Go to <b>Notifications</b> (🔔 in the header)\n"
            "3. Tap <b>Link Telegram</b>\n"
            "4. Send me the 6-digit code shown there\n\n"
            "💊 <i>Stay healthy!</i>"
        )
        return jsonify({"ok": True})

    # 6-digit link code
    if text.isdigit() and len(text) == 6:
        link_code = TelegramLinkCode.query.filter_by(code=text, used=False).first()

        if not link_code:
            _reply("❌ Invalid or expired code. Please generate a new one from the DawaiSathi app.")
            return jsonify({"ok": True})

        if datetime.utcnow() > link_code.expires_at:
            link_code.used = True
            safe_commit()
            _reply("⏰ This code has expired. Please generate a fresh one from the app.")
            return jsonify({"ok": True})

        # Link the user's account
        target_user = User.query.get(link_code.user_id)
        if target_user:
            target_user.telegram_chat_id = chat_id
            link_code.used = True
            safe_commit()
            _reply(
                f"✅ <b>Linked successfully!</b>\n\n"
                f"Hi {target_user.name}! 👋\n"
                f"You'll now get medicine reminders here.\n\n"
                f"💡 <i>You can log doses by tapping the button on any reminder, or simply reply with a text/voice message like 'दवा खा ली' or 'Logged dose'.</i>\n\n"
                f"Send /stop anytime to unlink."
            )
        else:
            _reply("❌ Something went wrong. Please try again.")
        return jsonify({"ok": True})

    # /stop command — unlink
    if text.lower() in ("/stop", "/unlink"):
        if linked_user:
            linked_user.telegram_chat_id = None
            safe_commit()
            _reply("✅ Unlinked. You won't receive reminders here anymore.\nSend /start to re-link.")
        else:
            _reply("You're not currently linked to any account.")
        return jsonify({"ok": True})

    # ── Text or Voice message dose logging handler for linked elderly users ──
    if linked_user:
        is_voice = bool(voice)
        msg_text = text or ("दवा खा ली (Voice message)" if is_voice else "")

        if is_voice or msg_text:
            # Call AI Voice Intent Engine
            try:
                all_meds = MedicineEntry.query.filter_by(user_id=linked_user.id).all()
                meds_summary = [
                    {"id": m.id, "name": m.name, "dosage": m.dosage or "", "schedule": m.schedule or []}
                    for m in all_meds
                ]

                prompt = f"""You are DawaiSathi AI Voice Assistant for Telegram. Analyze the user's spoken voice command or text about taking their medicines.
User Message: "{msg_text}"

Active Cabinet Medicines for User:
{json.dumps(meds_summary, ensure_ascii=False)}

Determine:
1. "target_slot": "morning" | "afternoon" | "evening" | "night" | null
2. "matched_medicine_ids": list of medicine IDs (ints) mentioned in the command. If user said "took all medicines" or didn't mention specific medicine, return empty list [] to target all medicines in that slot.
3. "summary_en": concise English confirmation (e.g. "Logged Night doses")
4. "summary_hi": concise Hindi confirmation (e.g. "रात की दवाएं दर्ज की गईं")

Return ONLY valid JSON matching this structure:
{{
  "target_slot": "night",
  "matched_medicine_ids": [],
  "summary_en": "Logged Night doses",
  "summary_hi": "रात की खुराक दर्ज कर दी गई"
}}"""

                extracted_slot = None
                matched_ids = []
                summary_en = "Doses logged via Telegram"
                summary_hi = "टेलीग्राम से दवाएं दर्ज कर दी गईं"
                model_used = "Rule Engine"

                # Try OpenRouter LLM first
                openrouter_key = current_app.config.get("OPENROUTER_API_KEY")
                if openrouter_key:
                    try:
                        payload = {
                            "model": "qwen/qwen-2.5-vl-72b-instruct:free",
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.1,
                        }
                        resp = requests.post(
                            "https://openrouter.ai/api/v1/chat/completions",
                            headers={"Authorization": f"Bearer {openrouter_key}", "Content-Type": "application/json"},
                            json=payload,
                            timeout=10,
                        )
                        if resp.ok:
                            raw_out = resp.json()["choices"][0]["message"]["content"]
                            import re
                            m = re.search(r'(\{.*\})', raw_out, re.DOTALL)
                            if m:
                                parsed = json.loads(m.group(1))
                                extracted_slot = parsed.get("target_slot")
                                matched_ids = parsed.get("matched_medicine_ids", [])
                                summary_en = parsed.get("summary_en", summary_en)
                                summary_hi = parsed.get("summary_hi", summary_hi)
                                model_used = "Qwen2.5-VL Free"
                    except Exception as err:
                        current_app.logger.warning(f"Telegram voice OpenRouter failed: {err}")

                if not extracted_slot:
                    h = (datetime.utcnow().hour + 5) % 24
                    if 5 <= h < 11: extracted_slot = "morning"
                    elif 11 <= h < 16: extracted_slot = "afternoon"
                    elif 16 <= h < 20: extracted_slot = "evening"
                    else: extracted_slot = "night"

                target_slot = extracted_slot or "morning"
                today_utc = datetime.utcnow().date()
                logged_count = 0

                target_meds = [m for m in all_meds if m.id in matched_ids] if matched_ids else [m for m in all_meds if target_slot in (m.schedule or [])]
                if not target_meds:
                    target_meds = all_meds

                for med in target_meds:
                    slots_to_log = [target_slot] if target_slot in (med.schedule or []) else (med.schedule or ["morning"])
                    for slot_key in slots_to_log:
                        start_dt = datetime.combine(today_utc, datetime.min.time())
                        end_dt = datetime.combine(today_utc, datetime.max.time())
                        existing = MedicineLog.query.filter(
                            MedicineLog.entry_id == med.id,
                            MedicineLog.time_slot == slot_key,
                            MedicineLog.logged_at >= start_dt,
                            MedicineLog.logged_at <= end_dt,
                        ).first()

                        if not existing:
                            db.session.add(MedicineLog(entry_id=med.id, time_slot=slot_key, logged_at=datetime.utcnow()))
                            logged_count += 1

                if logged_count > 0:
                    safe_commit()
                    if linked_user.language == "hi":
                        _reply(f"✅ <b>{summary_hi}</b> ({model_used})\n\nशानदार! आपकी दिनचर्या पूरी तरह सुरक्षित है।")
                    else:
                        _reply(f"✅ <b>{summary_en}</b> ({model_used})\n\nGreat job maintaining your routine!")
                else:
                    if linked_user.language == "hi":
                        _reply(f"ℹ️ <b>{target_slot.capitalize()} की दवाइयां पहले से दर्ज हैं।</b>")
                    else:
                        _reply(f"ℹ️ <b>{target_slot.capitalize()} doses were already logged today.</b>")
            except Exception as e:
                current_app.logger.error(f"Telegram AI Voice handler error: {e}")
                _reply("✅ Dose update received!")

            return jsonify({"ok": True})

                    existing = MedicineLog.query.filter(
                        MedicineLog.entry_id == med.id,
                        MedicineLog.time_slot == slot_key,
                        MedicineLog.logged_at >= start_dt,
                        MedicineLog.logged_at <= end_dt,
                    ).first()

                    if not existing:
                        log_entry = MedicineLog(
                            entry_id=med.id,
                            time_slot=slot_key,
                            logged_at=datetime.utcnow(),
                        )
                        db.session.add(log_entry)
                        logged_count += 1

            if logged_count > 0:
                safe_commit()
                if linked_user.language == "hi":
                    _reply(f"✅ <b>दवाइयां सफलतापूर्वक दर्ज हो गईं!</b>\n\nआपकी <b>{slot_label}</b> की {logged_count} दवाइयां दर्ज कर दी गई हैं। 🔥")
                else:
                    _reply(f"✅ <b>Doses Successfully Logged!</b>\n\nLogged {logged_count} dose(s) for your <b>{slot_label}</b> schedule. 🔥")
            else:
                if linked_user.language == "hi":
                    _reply(f"ℹ️ आपकी <b>{slot_label}</b> की दवाइयां पहले से दर्ज हैं। 👍")
                else:
                    _reply(f"ℹ️ Your <b>{slot_label}</b> doses were already logged today. 👍")

            return jsonify({"ok": True})

    # Unknown message fallback
    _reply("Send /start for instructions or a 6-digit code to link your account.")
    return jsonify({"ok": True})


# ── Web Push ───────────────────────────────────────────────────────────────────

@notifications_bp.route("/api/notifications/push/vapid-key", methods=["GET"])
def vapid_public_key():
    """Returns the VAPID public key so the frontend can subscribe."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    pub = current_app.config.get("VAPID_PUBLIC_KEY", "")
    priv = current_app.config.get("VAPID_PRIVATE_KEY", "")
    if not pub or not priv:
        return jsonify({"error": "VAPID keys not configured on server. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment.", "public_key": ""}), 500
    return jsonify({"public_key": pub})


@notifications_bp.route("/api/notifications/push/subscribe", methods=["POST"])
def push_subscribe():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    subscription = data.get("subscription")
    if not subscription:
        return jsonify({"error": "No subscription object provided"}), 400
    endpoint = subscription.get("endpoint", "")
    if not endpoint:
        return jsonify({"error": "No endpoint in subscription"}), 400

    existing = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if existing:
        existing.user_id = user.id
        existing.subscription_json = json.dumps(subscription)
    else:
        db.session.add(PushSubscription(
            user_id=user.id,
            endpoint=endpoint,
            subscription_json=json.dumps(subscription),
        ))
    user.push_subscription_json = json.dumps(subscription)
    safe_commit()
    return jsonify({"ok": True})


@notifications_bp.route("/api/notifications/push/unsubscribe", methods=["POST"])
def push_unsubscribe():
    """Remove the subscription for this specific device (identified by endpoint)."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    endpoint = data.get("endpoint")

    if not endpoint:
        return jsonify({"error": "No endpoint provided — use subscribe endpoint instead"}), 400

    deleted = PushSubscription.query.filter_by(user_id=user.id, endpoint=endpoint).delete(synchronize_session=False)
    remaining = PushSubscription.query.filter_by(user_id=user.id).count()
    if remaining == 0:
        user.push_subscription_json = None
    safe_commit()
    return jsonify({"ok": True, "deleted": deleted})


@notifications_bp.route("/api/notifications/push/test", methods=["POST"])
def push_test():
    """Sends a test push to the requesting device."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    # Pre-check VAPID config before touching the DB
    priv = current_app.config.get("VAPID_PRIVATE_KEY", "")
    pub = current_app.config.get("VAPID_PUBLIC_KEY", "")
    if not priv or not pub:
        return jsonify({"error": "Push not configured on server (VAPID keys missing). Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to environment variables on Render."}), 500

    from notification_helpers import send_push_notification

    data = request.get_json(silent=True) or {}
    endpoint = data.get("endpoint")

    if not endpoint:
        return jsonify({"error": "This device has no push subscription. Enable push notifications on this device first."}), 400

    subs = PushSubscription.query.filter_by(user_id=user.id, endpoint=endpoint).all()

    if not subs:
        return jsonify({"error": "No push subscription found for this device. Please enable push notifications on this device first."}), 400

    results = []
    expired = []
    for sub in subs:
        result = send_push_notification(
            sub.subscription_json,
            title="💊 DawaiSathi — Test Notification",
            body="Push notifications are working correctly! ✓",
            url="/cabinet",
        )
        if result is True:
            results.append("ok")
        elif result == "expired":
            expired.append(sub)
            results.append("expired")
        else:
            results.append(str(result))

    for sub in expired:
        db.session.delete(sub)
    if expired:
        safe_commit()

    if all(r == "ok" for r in results):
        return jsonify({"ok": True})
    if any(r == "ok" for r in results):
        errors = [r for r in results if r != "ok"]
        return jsonify({"warning": "Partial success", "errors": errors}), 200

    error_msg = results[0] if results else "unknown error"
    if error_msg == "False":
        return jsonify({"error": "Push notification failed — VAPID keys may be missing or pywebpush not installed on the server. Check server logs."}), 500
    if error_msg.startswith("push_service_error_"):
        status = error_msg.replace("push_service_error_", "")
        return jsonify({"error": f"Push service rejected the subscription (HTTP {status}). Try disabling and re-enabling notifications on this device."}), 500
    if error_msg.startswith("push_error_"):
        kind = error_msg.replace("push_error_", "")
        return jsonify({"error": f"Push service error: {kind}. Check server logs for details."}), 500
    return jsonify({"error": f"Push failed: {error_msg}"}), 500


# ── Utility: re-register Telegram webhook ────────────────────────────────────

@notifications_bp.route("/api/telegram/set-webhook", methods=["POST"])
def set_telegram_webhook():
    """
    Re-registers the Telegram webhook with the current TELEGRAM_WEBHOOK_URL.
    Call this after changing your VS Code tunnel URL.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    token = current_app.config.get("TELEGRAM_BOT_TOKEN", "")
    base_url = current_app.config.get("TELEGRAM_WEBHOOK_URL", "").rstrip("/")

    if not token:
        return jsonify({"error": "TELEGRAM_BOT_TOKEN not set in .env"}), 500
    if not base_url:
        return jsonify({"error": "TELEGRAM_WEBHOOK_URL not set in .env"}), 500

    webhook_url = f"{base_url}/api/telegram/webhook"
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/setWebhook",
            json={"url": webhook_url},
            timeout=10,
        )
        if resp.ok:
            return jsonify({"ok": True, "webhook_url": webhook_url})
        return jsonify({"error": resp.json()}), 500
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Utility: external trigger for cron jobs ──────────────────────────────────

def _cron_secret_ok() -> bool:
    """Accept X-Cron-Secret header or ?cron_secret= / ?secret= query (cron-job.org friendly)."""
    expected = (current_app.config.get("CRON_SECRET") or "").strip()
    if not expected:
        # Fail closed in production so the endpoint cannot be hammered anonymously
        if os.environ.get("RENDER") == "true" or (os.environ.get("FLASK_ENV") or "").lower() == "production":
            return False
        return True
    provided = (
        request.headers.get("X-Cron-Secret")
        or request.args.get("cron_secret")
        or request.args.get("secret")
        or ""
    ).strip()
    return provided == expected


@notifications_bp.route("/api/notifications/trigger-check", methods=["GET", "POST"])
def trigger_check():
    """Webhook for external cron services (like cron-job.org) to trigger the notification run."""
    if not _cron_secret_ok():
        return jsonify({"error": "Forbidden", "code": "CRON_SECRET_REQUIRED"}), 403
    from scheduler import send_due_notifications
    from datetime import datetime, timezone
    import runtime_state

    try:
        send_due_notifications()
        runtime_state.LAST_TRIGGER_CHECK_AT = datetime.now(timezone.utc).isoformat()
        runtime_state.LAST_TRIGGER_CHECK_OK = True
        return jsonify({"ok": True, "message": "Notification check executed"})
    except Exception as e:
        runtime_state.LAST_TRIGGER_CHECK_AT = datetime.now(timezone.utc).isoformat()
        runtime_state.LAST_TRIGGER_CHECK_OK = False
        return jsonify({"error": str(e)}), 500


# Notification system health lives on public GET /healthz (checks.notifications).
# No per-user JWT health endpoint — avoids PII on ops tooling and Settings clutter.


# ── Utility: sync offline notification logs ───────────────────────────────────

@notifications_bp.route("/api/notifications/sync", methods=["POST"])
def sync_notification_logs():
    """Two-way sync of notification logs between IndexedDB and PostgreSQL/SQLite."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    local_logs = data.get("logs", [])
    
    from models import NotificationLog
    from datetime import date
    
    synced_count = 0
    for log_item in local_logs:
        try:
            log_date = datetime.strptime(log_item["date"], "%Y-%m-%d").date()
            time_slot = log_item["slot"]
            channel = log_item.get("channel", "local")
            
            already = NotificationLog.query.filter_by(
                user_id=user.id,
                date=log_date,
                time_slot=time_slot
            ).first()
            
            if not already:
                db.session.add(NotificationLog(
                    user_id=user.id,
                    date=log_date,
                    time_slot=time_slot,
                    channel=channel,
                    sent_at=datetime.utcnow()
                ))
                synced_count += 1
        except Exception as ex:
            log.error("Failed to parse/sync log item %s: %s", log_item, ex)
            
    if synced_count > 0:
        safe_commit()
        
    seven_days_ago = date.today() - timedelta(days=7)
    recent_logs = NotificationLog.query.filter(
        NotificationLog.user_id == user.id,
        NotificationLog.date >= seven_days_ago
    ).all()
    
    return jsonify({
        "ok": True,
        "synced": synced_count,
        "recent_logs": [
            {
                "date": rl.date.isoformat(),
                "slot": rl.time_slot,
                "channel": rl.channel
            }
            for rl in recent_logs
        ]
    })

