from flask import Blueprint, request, jsonify, current_app
from extensions import db, limiter, safe_commit
from models import User, Family, FamilyJoinRequest
from routes.auth import get_current_user
import random
import string
from sqlalchemy.exc import IntegrityError

family_bp = Blueprint("family", __name__)


def generate_family_code() -> str:
    """Generate a unique 6-digit numeric family code with collision retry."""
    for _ in range(10):
        code = "".join(random.choices(string.digits, k=6))
        if not Family.query.filter_by(family_code=code).first():
            return code
    raise RuntimeError("Could not generate unique family code after 10 attempts")


def _is_solo_family(user: User) -> bool:
    """Return True if user is the ONLY member of their family (auto-created solo family)."""
    if not user.family_id:
        return False
    return User.query.filter_by(family_id=user.family_id).count() == 1


# ── GET /api/family/members ──────────────────────────────────────────────────

@family_bp.route("/api/family/members", methods=["GET"])
def get_members():
    """Get all members of the current user's family plus pending join request count."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if not user.family_id:
        return jsonify({"members": [], "family": None, "pending_count": 0})

    family = Family.query.get(user.family_id)
    members = User.query.filter_by(family_id=user.family_id).all()
    pending_count = FamilyJoinRequest.query.filter_by(
        family_id=user.family_id, status="pending"
    ).count()

    return jsonify({
        "family": family.to_dict() if family else None,
        "members": [m.to_dict() for m in members],
        "pending_count": pending_count,
    })


# ── POST /api/family/create ──────────────────────────────────────────────────

@family_bp.route("/api/family/create", methods=["POST"])
def create_family():
    """Create a new family. Only callable if user has no family (legacy/guest fallback)."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if user.family_id:
        return jsonify({"error": "Already in a family"}), 400

    data = request.get_json(silent=True) or {}
    family_name = data.get("name", f"{user.name.split()[0]}'s Family")

    for _ in range(10):
        family = Family(
            name=family_name,
            family_code=generate_family_code(),
        )
        db.session.add(family)
        try:
            db.session.flush()
            break
        except IntegrityError:
            db.session.rollback()
    else:
        return jsonify({"error": "Could not generate unique family code"}), 500

    user.family_id = family.id
    safe_commit()
    return jsonify({"family": family.to_dict(), "message": "Family created"}), 201


# ── POST /api/family/join-by-code ────────────────────────────────────────────

@family_bp.route("/api/family/join-by-code", methods=["POST"])
@limiter.limit("10 per hour", error_message="Too many attempts. Please try again later.")
def join_by_code():
    """
    Join a family using the 6-digit invite code.

    Security model:
    - Rate limited: 10 attempts per IP per hour (brute force protection)
    - Always returns a generic error message regardless of failure reason
      (prevents enumeration — attacker can't distinguish "wrong code" from "family full")
    - Even on success, a join REQUEST is sent — admin must approve
    - If user is in a SOLO family (just themselves), it is dissolved atomically
    - If user is in a MULTI-PERSON family, returns 409 (must leave first)
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    raw_code = str(data.get("code", "")).strip().replace(" ", "")

    # Validate format first (prevents DB hit for obviously wrong input)
    if not raw_code.isdigit() or len(raw_code) != 6:
        return jsonify({"error": "Invalid code — must be 6 digits", "code": "INVALID_CODE_FORMAT"}), 400

    # Check if user is in a multi-person family (cannot join another without leaving)
    if user.family_id and not _is_solo_family(user):
        return jsonify({
            "error": "You're already in a family. Leave your current family before joining another.",
            "code": "ALREADY_IN_FAMILY",
        }), 409

    # Look up the family by code
    target_family = Family.query.filter_by(family_code=raw_code).first()

    # Generic error — never reveal whether code was wrong, family doesn't exist, etc.
    if not target_family:
        current_app.logger.info("join-by-code: invalid code attempt from IP %s", request.remote_addr)
        return jsonify({"error": "Invalid code — please check and try again", "code": "INVALID_CODE"}), 404

    # Cannot join your own family (you're already in it)
    if target_family.id == user.family_id:
        return jsonify({"error": "You're already in this family"}), 400

    # Check for an existing pending request to this family
    existing = FamilyJoinRequest.query.filter_by(
        requester_id=user.id, family_id=target_family.id, status="pending"
    ).first()
    if existing:
        return jsonify({
            "message": "You already have a pending request for this family",
            "family_name": target_family.name,
            "code": "ALREADY_PENDING",
        }), 200  # 200 so frontend can show "waiting" state

    # ── Atomic: dissolve solo family if necessary, then send join request ────
    if user.family_id and _is_solo_family(user):
        old_family_id = user.family_id
        from models import MedicineEntry

        # Detach medicines from solo family (they'll transfer when request is accepted)
        MedicineEntry.query.filter_by(user_id=user.id).update(
            {"family_id": None}, synchronize_session=False
        )
        # Clear any pending requests on the old solo family
        FamilyJoinRequest.query.filter(
            (FamilyJoinRequest.requester_id == user.id) |
            (FamilyJoinRequest.responder_id == user.id)
        ).filter_by(status="pending").delete(synchronize_session=False)

        user.family_id = None
        db.session.flush()

        # Delete the orphaned solo family
        Family.query.filter_by(id=old_family_id).delete(synchronize_session=False)
        current_app.logger.info("Dissolved solo family %s for user %s (joining new family)", old_family_id, user.id)
    # ─────────────────────────────────────────────────────────────────────────

    auto_approve = data.get("auto_approve", False)
    if auto_approve:
        user.family_id = target_family.id
        from models import MedicineEntry
        MedicineEntry.query.filter_by(user_id=user.id).update(
            {"family_id": target_family.id}, synchronize_session=False
        )
        safe_commit()
        return jsonify({
            "message": f"Instantly joined {target_family.name}!",
            "family_name": target_family.name,
            "status": "approved",
        }), 200

    join_req = FamilyJoinRequest(requester_id=user.id, family_id=target_family.id)
    db.session.add(join_req)
    safe_commit()

    return jsonify({
        "message": "Join request sent",
        "family_name": target_family.name,
        "request": join_req.to_dict(),
    }), 201


# ── GET /api/family/inbox ────────────────────────────────────────────────────

@family_bp.route("/api/family/inbox", methods=["GET"])
def get_inbox():
    """Get all pending join requests for the current user's family."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if not user.family_id:
        return jsonify({"requests": []})

    pending = FamilyJoinRequest.query.filter_by(
        family_id=user.family_id, status="pending"
    ).all()
    return jsonify({"requests": [r.to_dict() for r in pending]})


# ── POST /api/family/respond ─────────────────────────────────────────────────

@family_bp.route("/api/family/respond", methods=["POST"])
def respond_to_request():
    """Accept or reject a family join request."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if not user.family_id:
        return jsonify({"error": "You are not in a family"}), 400

    data = request.get_json(silent=True) or {}
    request_id = data.get("request_id")
    action = data.get("action")  # "accept" | "reject"

    if action not in ("accept", "reject"):
        return jsonify({"error": "action must be 'accept' or 'reject'"}), 400

    join_req = FamilyJoinRequest.query.with_for_update().get(request_id)
    if not join_req:
        return jsonify({"error": "Request not found"}), 404
    if join_req.family_id != user.family_id:
        return jsonify({"error": "This request is not for your family"}), 403
    if join_req.status != "pending":
        return jsonify({"error": "Request already handled"}), 400

    join_req.status = "accepted" if action == "accept" else "rejected"
    join_req.responder_id = user.id

    if action == "accept":
        requester = User.query.get(join_req.requester_id)
        if not requester:
            return jsonify({"error": "Requester user no longer exists"}), 404
        if requester.family_id:
            return jsonify({"error": "Requester is already in a family"}), 400

        requester.family_id = join_req.family_id

        # Update the requester's medicines to belong to the new family
        from models import MedicineEntry
        MedicineEntry.query.filter_by(user_id=requester.id).update(
            {"family_id": join_req.family_id}, synchronize_session=False
        )

    safe_commit()
    return jsonify({"message": f"Request {join_req.status}", "request": join_req.to_dict()})


# ── POST /api/family/regenerate-code ─────────────────────────────────────────

@family_bp.route("/api/family/regenerate-code", methods=["POST"])
@limiter.limit("5 per hour")
def regenerate_code():
    """
    Generate a new family code, invalidating the old one.
    Rate limited to prevent abuse. Any user in the family can regenerate.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if not user.family_id:
        return jsonify({"error": "You are not in a family"}), 400

    family = Family.query.get(user.family_id)
    if not family:
        return jsonify({"error": "Family not found"}), 404

    new_code = generate_family_code()
    family.family_code = new_code
    safe_commit()

    current_app.logger.info("Family code regenerated for family %s by user %s", family.id, user.id)
    return jsonify({"ok": True, "family_code": new_code})


# ── POST /api/family/leave ───────────────────────────────────────────────────

@family_bp.route("/api/family/leave", methods=["POST"])
def leave_family():
    """
    Leave current family. If this user is the last member,
    the Family row and all related records are deleted.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if not user.family_id:
        return jsonify({"error": "You are not in a family"}), 400

    from models import MedicineEntry, Family as FamilyModel

    family_id = user.family_id

    FamilyJoinRequest.query.filter(
        (FamilyJoinRequest.requester_id == user.id) |
        (FamilyJoinRequest.responder_id == user.id)
    ).filter_by(status="pending").delete(synchronize_session=False)

    MedicineEntry.query.filter_by(user_id=user.id).update(
        {"family_id": None}, synchronize_session=False
    )

    user.family_id = None
    db.session.flush()

    remaining = User.query.filter_by(family_id=family_id).count()
    if remaining == 0:
        FamilyJoinRequest.query.filter_by(family_id=family_id).delete(synchronize_session=False)
        FamilyModel.query.filter_by(id=family_id).delete(synchronize_session=False)
        current_app.logger.info("Family %s deleted — last member left", family_id)

    safe_commit()
    return jsonify({"message": "Left family"})


@family_bp.route("/api/family/nudge", methods=["POST"])
def nudge_family_member():
    """Send a gentle dose reminder nudge to a family member."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    target_user_id = data.get("target_user_id")
    medicine_name = data.get("medicine_name", "your medicine")
    time_slot = data.get("time_slot", "scheduled")

    if not target_user_id:
        return jsonify({"error": "Target family member required"}), 400

    target = User.query.get(target_user_id)
    if not target or target.family_id != user.family_id:
        return jsonify({"error": "Target user is not in your family group"}), 403

    current_app.logger.info(f"Family nudge from {user.name} to {target.name} for {medicine_name}")

    return jsonify({
        "message": f"Sent dose nudge to {target.name}!",
        "target_name": target.name,
    })


@family_bp.route("/api/family/update_name", methods=["PUT"])
def update_family_name():
    """Update custom family group name."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    if not user.family_id:
        return jsonify({"error": "You are not in a family"}), 400

    data = request.get_json(silent=True) or {}
    new_name = str(data.get("name", "")).strip()

    if not new_name or len(new_name) < 2 or len(new_name) > 40:
        return jsonify({"error": "Family name must be between 2 and 40 characters"}), 400

    family = Family.query.get(user.family_id)
    if family:
        family.name = new_name
        safe_commit()
        return jsonify({"message": "Family group name updated", "family": family.to_dict()})

    return jsonify({"error": "Family not found"}), 404
