from flask_sqlalchemy import SQLAlchemy
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],          # no default limit; apply per-route
    storage_uri="memory://",    # in-memory rate limiting
)

def safe_commit():
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

