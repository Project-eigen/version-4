#!/usr/bin/env python3
"""DawaiSathi VPS Database & Admin Management CLI.

Usage:
    python manage_admin.py createsuperuser --email admin@georbit.org --name "Admin" --password "secret123"
    python manage_admin.py promote --email user@example.com
    python manage_admin.py setpassword --email admin@georbit.org --password "newpassword"
    python manage_admin.py listusers
    python manage_admin.py testdb
"""

import sys
import argparse
from app import create_app
from extensions import db, safe_commit
from models import User, Family, MedicineEntry


def test_db_connection(app):
    with app.app_context():
        try:
            db.session.execute(db.text("SELECT 1"))
            uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
            # Obfuscate password in uri
            clean_uri = uri
            if "@" in uri and "://" in uri:
                prefix = uri.split("://")[0]
                host_part = uri.split("@")[-1]
                clean_uri = f"{prefix}://*****@{host_part}"
            print(f"[OK] Database connection successful!")
            print(f"     Target URI: {clean_uri}")
            print(f"     Users count: {User.query.count()}")
            print(f"     Families count: {Family.query.count()}")
            print(f"     Medicines count: {MedicineEntry.query.count()}")
        except Exception as e:
            print(f"[ERROR] Database connection failed: {e}")
            sys.exit(1)


def setup_ultimate_admin(app, password="AyaanLoveBlueBug"):
    with app.app_context():
        user = User.query.filter(
            (User.username == "ayaan") | (User.email == "ayaan@georbit.org")
        ).first()
        if not user:
            user = User(
                google_id="ultimate_admin_ayaan",
                username="ayaan",
                name="Ayaan",
                email="ayaan@georbit.org",
                is_superuser=True,
                is_ultimate_admin=True,
            )
            user.set_password(password)
            db.session.add(user)
            safe_commit()
            print(f"[SUCCESS] Ultimate Admin 'ayaan' created with ID {user.id}")
        else:
            user.username = "ayaan"
            user.is_superuser = True
            user.is_ultimate_admin = True
            user.set_password(password)
            safe_commit()
            print(f"[SUCCESS] Ultimate Admin 'ayaan' credentials updated.")


def create_superuser(app, email, name, password, username=None):
    with app.app_context():
        email = email.strip().lower()
        user = User.query.filter_by(email=email).first()
        if user:
            user.is_superuser = True
            if name:
                user.name = name
            if username:
                user.username = username
            if password:
                user.set_password(password)
            safe_commit()
            print(f"[SUCCESS] Existing user {email} promoted to Administrator.")
        else:
            user = User(
                google_id=f"admin_{email}",
                username=username,
                name=name or "Administrator",
                email=email,
                is_superuser=True,
                is_ultimate_admin=False,
            )
            if password:
                user.set_password(password)
            db.session.add(user)
            safe_commit()
            print(f"[SUCCESS] Administrator created: {email} (ID: {user.id})")


def promote_user(app, email):
    with app.app_context():
        email = email.strip().lower()
        user = User.query.filter_by(email=email).first()
        if not user:
            print(f"[ERROR] No user found with email: {email}")
            sys.exit(1)
        user.is_superuser = True
        safe_commit()
        print(f"[SUCCESS] User {user.name} ({email}) is now an Administrator.")


def set_user_password(app, identifier, password):
    with app.app_context():
        identifier = identifier.strip().lower()
        user = User.query.filter((User.email == identifier) | (User.username == identifier)).first()
        if not user:
            print(f"[ERROR] No user found with username/email: {identifier}")
            sys.exit(1)
        user.set_password(password)
        safe_commit()
        print(f"[SUCCESS] Password updated for user {user.name} ({identifier}).")


def list_users(app):
    with app.app_context():
        users = User.query.order_by(User.id.asc()).all()
        print(f"\nTotal users in database: {len(users)}\n" + "=" * 80)
        print(f"{'ID':<5} {'Username':<14} {'Name':<18} {'Email':<26} {'Role'}")
        print("-" * 80)
        for u in users:
            role = "👑 ULTIMATE" if (u.is_ultimate_admin or u.username == 'ayaan') else ("Admin" if u.is_superuser else "User")
            uname = u.username or "—"
            print(f"{u.id:<5} {uname[:12]:<14} {u.name[:16]:<18} {u.email[:24]:<26} {role}")
        print("=" * 80 + "\n")


def main():
    parser = argparse.ArgumentParser(description="DawaiSathi VPS Database & Admin Tool")
    subparsers = parser.add_subparsers(dest="command")

    # testdb
    subparsers.add_parser("testdb", help="Test database connectivity")

    # setup-ultimate
    su_parser = subparsers.add_parser("setup-ultimate", help="Set up or reset Ultimate Admin 'ayaan'")
    su_parser.add_argument("--password", default="AyaanLoveBlueBug", help="Ultimate Admin password")

    # createsuperuser
    cs_parser = subparsers.add_parser("createsuperuser", help="Create an Administrator")
    cs_parser.add_argument("--email", required=True, help="User email address")
    cs_parser.add_argument("--username", help="User username (optional)")
    cs_parser.add_argument("--name", default="Administrator", help="Admin display name")
    cs_parser.add_argument("--password", required=True, help="Admin login password")

    # promote
    pm_parser = subparsers.add_parser("promote", help="Promote an existing user to Administrator")
    pm_parser.add_argument("--email", required=True, help="User email address")

    # setpassword
    sp_parser = subparsers.add_parser("setpassword", help="Set password for an existing user")
    sp_parser.add_argument("--identifier", required=True, help="Username or email address")
    sp_parser.add_argument("--password", required=True, help="New password")

    # listusers
    subparsers.add_parser("listusers", help="List all users and their admin roles")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    app = create_app()

    if args.command == "testdb":
        test_db_connection(app)
    elif args.command == "setup-ultimate":
        setup_ultimate_admin(app, args.password)
    elif args.command == "createsuperuser":
        create_superuser(app, args.email, args.name, args.password, args.username)
    elif args.command == "promote":
        promote_user(app, args.email)
    elif args.command == "setpassword":
        set_user_password(app, args.identifier, args.password)
    elif args.command == "listusers":
        list_users(app)


if __name__ == "__main__":
    main()
