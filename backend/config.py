import os
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, ".env"))


def _database_uri() -> str:
    """Normalize DATABASE_URL for SQLAlchemy / Supabase pooler / Render."""
    uri = os.environ.get("DATABASE_URL", "sqlite:///dawaisathi.db")
    # Render/Heroku sometimes hand out postgres:// which SQLAlchemy rejects
    if uri.startswith("postgres://"):
        uri = "postgresql://" + uri[len("postgres://") :]
    return uri


def _engine_options(uri: str) -> dict:
    """Pool settings that work on Neon, Supabase direct, and Supabase PgBouncer."""
    opts: dict = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
        "pool_size": 5,
        "max_overflow": 5,
    }
    # Transaction-mode pooler (port 6543) does not support prepared statements
    # or long-lived server-side sessions well; keep connections short-lived.
    if ":6543" in uri or "pooler.supabase.com" in uri:
        opts["pool_size"] = 3
        opts["max_overflow"] = 2
        opts["connect_args"] = {
            "sslmode": "require",
            "connect_timeout": 15,
            # Avoid channel_binding issues on some managed Postgres hosts
            "options": "-c statement_timeout=60000",
        }
    elif uri.startswith("postgresql"):
        opts["connect_args"] = {
            "sslmode": "require",
            "connect_timeout": 15,
        }
    return opts


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-this")
    SQLALCHEMY_DATABASE_URI = _database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = _engine_options(SQLALCHEMY_DATABASE_URI)

    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
    GOOGLE_REDIRECT_URI = os.environ.get(
        "GOOGLE_REDIRECT_URI", "http://localhost:5000/api/auth/callback"
    )

    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max upload
    CLOUDINARY_URL = os.environ.get("CLOUDINARY_URL", "")

    # ── Telegram Bot ────────────────────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    # Full public HTTPS base URL of this backend (used to register the webhook)
    # e.g. https://abc123.devtunnels.ms  (VS Code tunnel URL, no trailing slash)
    TELEGRAM_WEBHOOK_URL = os.environ.get("TELEGRAM_WEBHOOK_URL", "")

    # ── Web Push VAPID ──────────────────────────────────────────────────────────
    # Generate once with: python generate_vapid.py
    VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
    VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
    VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "admin@dawaisathi.com")

    # ── Cron / Scheduler ────────────────────────────────────────────────────────
    # Secret token for external cron services to call trigger-check
    CRON_SECRET = os.environ.get("CRON_SECRET", "")
