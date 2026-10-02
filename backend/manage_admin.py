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


def create_superuser(app, email, name, password):
    with app.app_context():
        email = email.strip().lower()
        user = User.query.filter_by(email=email).first()
        if user:
            user.is_superuser = True
            if name:
                user.name = name
            if password:
                user.set_password(password)
            safe_commit()
            print(f"[SUCCESS] Existing user {email} promoted to Superuser.")
        else:
            user = User(
                google_id=f"admin_{email}",
                name=name or "Administrator",
                email=email,
                is_superuser=True,
            )
            if password:
                user.set_password(password)
            db.session.add(user)
            safe_commit()
            print(f"[SUCCESS] Superuser created: {email} (ID: {user.id})")


def promote_user(app, email):
    with app.app_context():
        email = email.strip().lower()
        user = User.query.filter_by(email=email).first()
        if not user:
            print(f"[ERROR] No user found with email: {email}")
            sys.exit(1)
        user.is_superuser = True
        safe_commit()
        print(f"[SUCCESS] User {user.name} ({email}) is now a Superuser.")


def set_user_password(app, email, password):
    with app.app_context():
        email = email.strip().lower()
        user = User.query.filter_by(email=email).first()
        if not user:
            print(f"[ERROR] No user found with email: {email}")
            sys.exit(1)
        user.set_password(password)
        safe_commit()
        print(f"[SUCCESS] Password updated for user {user.name} ({email}).")


def list_users(app):
    with app.app_context():
        users = User.query.order_by(User.id.asc()).all()
        print(f"\nTotal users in database: {len(users)}\n" + "=" * 70)
        print(f"{'ID':<6} {'Name':<22} {'Email':<30} {'Superuser'}")
        print("-" * 70)
        for u in users:
            su_tag = "[YES]" if u.is_superuser else "No"
            print(f"{u.id:<6} {u.name[:20]:<22} {u.email[:28]:<30} {su_tag}")
        print("=" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(description="DawaiSathi VPS Database & Admin Tool")
    subparsers = parser.add_subparsers(dest="command")

    # testdb
    subparsers.add_parser("testdb", help="Test database connectivity")

    # createsuperuser
    cs_parser = subparsers.add_parser("createsuperuser", help="Create a new superuser or promote existing")
    cs_parser.add_argument("--email", required=True, help="User email address")
    cs_parser.add_argument("--name", default="Administrator", help="Admin display name")
    cs_parser.add_argument("--password", required=True, help="Admin login password")

    # promote
    pm_parser = subparsers.add_parser("promote", help="Promote an existing user to superuser")
    pm_parser.add_argument("--email", required=True, help="User email address")

    # setpassword
    sp_parser = subparsers.add_parser("setpassword", help="Set or reset password for an existing user")
    sp_parser.add_argument("--email", required=True, help="User email address")
    sp_parser.add_argument("--password", required=True, help="New password")

    # listusers
    subparsers.add_parser("listusers", help="List all users and their superuser status")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    app = create_app()

    if args.command == "testdb":
        test_db_connection(app)
    elif args.command == "createsuperuser":
        create_superuser(app, args.email, args.name, args.password)
    elif args.command == "promote":
        promote_user(app, args.email)
    elif args.command == "setpassword":
        set_user_password(app, args.email, args.password)
    elif args.command == "listusers":
        list_users(app)


if __name__ == "__main__":
    main()
