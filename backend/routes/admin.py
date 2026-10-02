import time
import json
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app, Response
from werkzeug.security import generate_password_hash
from extensions import db, safe_commit
from models import (
    User,
    Family,
    MedicineEntry,
    MedicineLog,
    PrescriptionScan,
    PushSubscription,
    FamilyJoinRequest,
    NotificationLog,
    TelegramLinkCode,
)
from routes.auth import get_current_user, create_jwt, superuser_required

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# ── 1. Admin Authentication ─────────────────────────────────────────────────────

@admin_bp.route("/login", methods=["POST"])
def admin_login():
    """Admin login using either:
    1) Master admin secret key (always works on VPS)
    2) Superuser email + password
    """
    data = request.get_json() or {}
    secret_key = data.get("secret_key", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    expected_secret = current_app.config.get("ADMIN_SECRET_KEY")

    # 1. Master secret key login
    if secret_key:
        if not expected_secret or secret_key != expected_secret:
            return jsonify({"error": "Invalid admin secret key", "code": "INVALID_SECRET"}), 401

        # Look for or create root admin user
        admin_user = User.query.filter_by(email="admin@dawaisathi.internal").first()
        if not admin_user:
            admin_user = User(
                google_id="superuser_master",
                name="Master Administrator",
                email="admin@dawaisathi.internal",
                is_superuser=True,
            )
            db.session.add(admin_user)
            safe_commit()
        else:
            if not admin_user.is_superuser:
                admin_user.is_superuser = True
                safe_commit()

        token = create_jwt(admin_user.id, expires_in_hours=48, is_superuser=True)
        return jsonify({
            "token": token,
            "user": admin_user.to_dict(),
            "role": "superuser",
            "auth_type": "master_secret",
        })

    # 2. Email + Password login
    if email and password:
        user = User.query.filter_by(email=email).first()
        if not user or not user.check_password(password):
            return jsonify({"error": "Invalid email or password", "code": "INVALID_CREDENTIALS"}), 401

        if not user.is_superuser:
            # Check if email is in ADMIN_EMAILS
            admin_emails = current_app.config.get("ADMIN_EMAILS", [])
            if email in admin_emails:
                user.is_superuser = True
                safe_commit()
            else:
                return jsonify({"error": "User does not have superuser privileges", "code": "FORBIDDEN"}), 403

        token = create_jwt(user.id, expires_in_hours=48, is_superuser=True)
        return jsonify({
            "token": token,
            "user": user.to_dict(),
            "role": "superuser",
            "auth_type": "password",
        })

    return jsonify({"error": "Provide either secret_key or email and password"}), 400


# ── 2. Overview Metrics & Database Health ───────────────────────────────────────

@admin_bp.route("/stats", methods=["GET"])
@superuser_required
def admin_stats():
    """Returns database summary counts and system operational status."""
    now = datetime.utcnow()
    last_24h = now - timedelta(hours=24)

    total_users = User.query.count()
    guest_users = User.query.filter(User.google_id.like("guest_%")).count()
    superusers = User.query.filter_by(is_superuser=True).count()
    total_families = Family.query.count()
    total_medicines = MedicineEntry.query.count()
    total_logs = MedicineLog.query.count()
    logs_today = MedicineLog.query.filter(MedicineLog.logged_at >= last_24h).count()
    total_scans = PrescriptionScan.query.count()
    push_subs = PushSubscription.query.count()
    telegram_users = User.query.filter(User.telegram_chat_id.isnot(None)).count()

    # Active users in last 24h (who took a medicine or logged activity)
    active_user_ids = db.session.query(MedicineLog.logged_by_user_id).filter(
        MedicineLog.logged_at >= last_24h
    ).distinct().count()

    # Determine database engine
    db_uri = current_app.config.get("SQLALCHEMY_DATABASE_URI", "")
    db_engine = "SQLite" if "sqlite" in db_uri else "PostgreSQL"
    db_host = "Localhost" if any(h in db_uri for h in ("localhost", "127.0.0.1", "@db:")) else "Remote Cloud"

    return jsonify({
        "status": "healthy",
        "counts": {
            "users": total_users,
            "guests": guest_users,
            "superusers": superusers,
            "active_24h": active_user_ids,
            "families": total_families,
            "medicines": total_medicines,
            "logs_total": total_logs,
            "logs_today": logs_today,
            "scans": total_scans,
            "push_subscriptions": push_subs,
            "telegram_users": telegram_users,
        },
        "database": {
            "engine": db_engine,
            "location": db_host,
            "connected": True,
        },
        "server_time": now.isoformat(),
    })


# ── 3. Users Management ────────────────────────────────────────────────────────

@admin_bp.route("/users", methods=["GET"])
@superuser_required
def list_users():
    """List all users with search, role filters, and pagination."""
    search = request.args.get("search", "").strip()
    role_filter = request.args.get("role", "")  # superuser | guest | regular
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 25))))

    query = User.query

    if search:
        term = f"%{search}%"
        query = query.filter((User.name.ilike(term)) | (User.email.ilike(term)))

    if role_filter == "superuser":
        query = query.filter_by(is_superuser=True)
    elif role_filter == "guest":
        query = query.filter(User.google_id.like("guest_%"))
    elif role_filter == "regular":
        query = query.filter(User.is_superuser == False, ~User.google_id.like("guest_%"))

    total = query.count()
    users = query.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    user_list = []
    for u in users:
        d = u.to_dict()
        d["created_at"] = u.created_at.isoformat() if u.created_at else None
        d["family_name"] = u.family.name if u.family else None
        d["is_guest"] = u.google_id.startswith("guest_")
        d["medicines_count"] = len(u.medicines)
        d["logs_count"] = len(u.logs)
        d["has_password"] = bool(u.password_hash)
        user_list.append(d)

    return jsonify({
        "users": user_list,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


@admin_bp.route("/users/<int:user_id>/toggle-superuser", methods=["POST"])
@superuser_required
def toggle_superuser(user_id):
    """Promote or demote user superuser status."""
    user = User.query.get_or_404(user_id)
    user.is_superuser = not bool(user.is_superuser)
    safe_commit()
    return jsonify({
        "ok": True,
        "user_id": user.id,
        "is_superuser": user.is_superuser,
        "message": f"User {user.name} superuser status set to {user.is_superuser}",
    })


@admin_bp.route("/users/<int:user_id>/set-password", methods=["POST"])
@superuser_required
def set_user_password(user_id):
    """Set or update password for user (enables email/password login)."""
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}
    new_password = data.get("password", "").strip()
    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    user.set_password(new_password)
    safe_commit()
    return jsonify({"ok": True, "message": f"Password updated for {user.name}"})


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@superuser_required
def delete_user(user_id):
    """Safely delete user and cascading data."""
    user = User.query.get_or_404(user_id)
    name = user.name

    # Cascade delete relations
    PushSubscription.query.filter_by(user_id=user.id).delete()
    MedicineLog.query.filter_by(logged_by_user_id=user.id).delete()
    MedicineEntry.query.filter_by(user_id=user.id).delete()
    PrescriptionScan.query.filter_by(user_id=user.id).delete()
    FamilyJoinRequest.query.filter(
        (FamilyJoinRequest.requester_id == user.id) | (FamilyJoinRequest.responder_id == user.id)
    ).delete()
    NotificationLog.query.filter_by(user_id=user.id).delete()
    TelegramLinkCode.query.filter_by(user_id=user.id).delete()

    db.session.delete(user)
    safe_commit()
    return jsonify({"ok": True, "message": f"User {name} and associated records deleted"})


# ── 4. Medicines & Inventory Management ─────────────────────────────────────────

@admin_bp.route("/medicines", methods=["GET"])
@superuser_required
def list_all_medicines():
    """List medicines across all users and families."""
    search = request.args.get("search", "").strip()
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 25))))

    query = MedicineEntry.query
    if search:
        term = f"%{search}%"
        query = query.filter((MedicineEntry.name.ilike(term)) | (MedicineEntry.instructions.ilike(term)))

    total = query.count()
    entries = query.order_by(MedicineEntry.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    results = []
    for m in entries:
        d = m.to_dict()
        d["user_name"] = m.user.name if m.user else "Unknown"
        d["user_email"] = m.user.email if m.user else ""
        d["family_name"] = m.family.name if m.family else None
        d["logs_count"] = len(m.logs)
        results.append(d)

    return jsonify({
        "medicines": results,
        "total": total,
        "page": page,
        "per_page": per_page,
    })


@admin_bp.route("/medicines/<int:med_id>", methods=["PUT"])
@superuser_required
def update_medicine(med_id):
    """Admin update medicine attributes."""
    med = MedicineEntry.query.get_or_404(med_id)
    data = request.get_json() or {}

    if "name" in data and data["name"].strip():
        med.name = data["name"].strip()
    if "dosage" in data:
        med.dosage = data["dosage"]
    if "quantity" in data:
        med.quantity = int(data["quantity"]) if data["quantity"] is not None else None
    if "days" in data:
        med.days = int(data["days"]) if data["days"] is not None else None
    if "instructions" in data:
        med.instructions = data["instructions"]
    if "schedule" in data and isinstance(data["schedule"], list):
        med.schedule = data["schedule"]

    safe_commit()
    return jsonify({"ok": True, "medicine": med.to_dict()})


@admin_bp.route("/medicines/<int:med_id>", methods=["DELETE"])
@superuser_required
def delete_medicine(med_id):
    """Delete a medicine entry and its adherence logs."""
    med = MedicineEntry.query.get_or_404(med_id)
    name = med.name
    MedicineLog.query.filter_by(entry_id=med.id).delete()
    db.session.delete(med)
    safe_commit()
    return jsonify({"ok": True, "message": f"Medicine '{name}' deleted"})


# ── 5. Families Management ──────────────────────────────────────────────────────

@admin_bp.route("/families", methods=["GET"])
@superuser_required
def list_families():
    """List all families with their members and codes."""
    families = Family.query.order_by(Family.created_at.desc()).all()
    results = []
    for f in families:
        results.append({
            "id": f.id,
            "name": f.name,
            "family_code": f.family_code,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "member_count": len(f.members),
            "members": [{"id": m.id, "name": m.name, "email": m.email} for m in f.members],
            "medicines_count": len(f.medicines),
        })
    return jsonify({"families": results, "total": len(results)})


@admin_bp.route("/families/<int:family_id>", methods=["DELETE"])
@superuser_required
def delete_family(family_id):
    """Delete a family and unbind members."""
    fam = Family.query.get_or_404(family_id)
    name = fam.name

    # Clear family_id from users
    User.query.filter_by(family_id=fam.id).update({"family_id": None})
    FamilyJoinRequest.query.filter_by(family_id=fam.id).delete()
    MedicineEntry.query.filter_by(family_id=fam.id).update({"family_id": None})

    db.session.delete(fam)
    safe_commit()
    return jsonify({"ok": True, "message": f"Family '{name}' deleted"})


# ── 6. Prescription Scans & OCR ────────────────────────────────────────────────

@admin_bp.route("/scans", methods=["GET"])
@superuser_required
def list_scans():
    """List archived prescription scans."""
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(50, max(1, int(request.args.get("per_page", 20))))

    query = PrescriptionScan.query.order_by(PrescriptionScan.created_at.desc())
    total = query.count()
    scans = query.offset((page - 1) * per_page).limit(per_page).all()

    results = []
    for s in scans:
        d = s.to_dict()
        user = User.query.get(s.user_id)
        d["user_name"] = user.name if user else "Unknown"
        d["user_email"] = user.email if user else ""
        results.append(d)

    return jsonify({"scans": results, "total": total, "page": page, "per_page": per_page})


@admin_bp.route("/scans/<int:scan_id>", methods=["DELETE"])
@superuser_required
def delete_scan(scan_id):
    """Delete a prescription scan archive record."""
    scan = PrescriptionScan.query.get_or_404(scan_id)
    db.session.delete(scan)
    safe_commit()
    return jsonify({"ok": True, "message": "Scan record deleted"})


# ── 7. Interactive Database Console & SQL Runner ────────────────────────────────

@admin_bp.route("/db/query", methods=["POST"])
@superuser_required
def run_db_query():
    """Execute raw SQL query directly on the VPS database."""
    data = request.get_json() or {}
    raw_query = data.get("query", "").strip()

    if not raw_query:
        return jsonify({"error": "SQL query cannot be empty"}), 400

    # Basic safety guard: block drop database
    lower_query = raw_query.lower()
    if "drop database" in lower_query or "truncate" in lower_query:
        return jsonify({"error": "DROP DATABASE and TRUNCATE are blocked for safety"}), 400

    start_time = time.time()
    try:
        result = db.session.execute(db.text(raw_query))
        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        # Check if the query returns rows (SELECT, PRAGMA, EXPLAIN, etc.)
        if result.returns_rows:
            columns = list(result.keys())
            rows = []
            for r in result.fetchmany(100):  # limit to 100 rows for display safety
                rows.append([str(val) if val is not None else None for val in r])

            return jsonify({
                "ok": True,
                "returns_rows": True,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "elapsed_ms": elapsed_ms,
            })
        else:
            db.session.commit()
            return jsonify({
                "ok": True,
                "returns_rows": False,
                "rowcount": result.rowcount,
                "elapsed_ms": elapsed_ms,
                "message": f"Query executed successfully ({result.rowcount} rows affected)",
            })

    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "ok": False,
            "error": str(exc),
            "elapsed_ms": round((time.time() - start_time) * 1000, 2),
        }), 400


# ── 8. Database Tools & Cleanup ─────────────────────────────────────────────────

@admin_bp.route("/db/cleanup", methods=["POST"])
@superuser_required
def run_db_cleanup():
    """Clean up expired guests, old idempotency logs, and orphaned subscriptions."""
    cleaned = {"guests": 0, "logs": 0, "subscriptions": 0}
    try:
        # 1. Clean guests older than 4 hours
        threshold = datetime.utcnow() - timedelta(hours=4)
        old_guests = User.query.filter(User.google_id.like("guest_%"), User.created_at < threshold).all()
        guest_ids = [g.id for g in old_guests]
        if guest_ids:
            PushSubscription.query.filter(PushSubscription.user_id.in_(guest_ids)).delete(synchronize_session=False)
            MedicineLog.query.filter(MedicineLog.logged_by_user_id.in_(guest_ids)).delete(synchronize_session=False)
            MedicineEntry.query.filter(MedicineEntry.user_id.in_(guest_ids)).delete(synchronize_session=False)
            FamilyJoinRequest.query.filter(
                (FamilyJoinRequest.requester_id.in_(guest_ids)) | (FamilyJoinRequest.responder_id.in_(guest_ids))
            ).delete(synchronize_session=False)
            cleaned["guests"] = User.query.filter(User.id.in_(guest_ids)).delete(synchronize_session=False)

        # 2. Clean notification idempotency logs older than 30 days
        log_threshold = datetime.utcnow() - timedelta(days=30)
        cleaned["logs"] = NotificationLog.query.filter(NotificationLog.sent_at < log_threshold).delete(synchronize_session=False)

        safe_commit()
        return jsonify({
            "ok": True,
            "cleaned": cleaned,
            "message": f"Cleaned {cleaned['guests']} guest accounts and {cleaned['logs']} old notification logs.",
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"ok": False, "error": str(e)}), 500


@admin_bp.route("/db/export", methods=["GET"])
@superuser_required
def export_database_json():
    """Export complete database content as formatted JSON for backup."""
    backup_data = {
        "timestamp": datetime.utcnow().isoformat(),
        "users": [u.to_dict() for u in User.query.all()],
        "families": [f.to_dict() for f in Family.query.all()],
        "medicines": [m.to_dict() for m in MedicineEntry.query.all()],
        "logs": [l.to_dict() for l in MedicineLog.query.order_by(MedicineLog.logged_at.desc()).limit(1000).all()],
        "scans": [s.to_dict() for s in PrescriptionScan.query.all()],
    }

    response_json = json.dumps(backup_data, indent=2)
    return Response(
        response_json,
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment;filename=dawaisathi_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"}
    )
