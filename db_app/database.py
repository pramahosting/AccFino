import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

_DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not _DATABASE_URL:
    raise RuntimeError(
        "[accfino] DATABASE_URL environment variable is not set.\n"
        "Set it to your PostgreSQL connection string, e.g.:\n"
        "  postgresql+psycopg2://user:password@host:5432/dbname\n"
        "For local development, install PostgreSQL and set DATABASE_URL in app.cmd."
    )

# Normalise postgres:// - postgresql+psycopg2://
if _DATABASE_URL.startswith("postgres://"):
    _DATABASE_URL = _DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif _DATABASE_URL.startswith("postgresql://") and "+psycopg2" not in _DATABASE_URL:
    _DATABASE_URL = _DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

# Strip any trailing whitespace from URL (Windows CMD can add spaces)
_DATABASE_URL = _DATABASE_URL.strip()

# Detect Neon/cloud PostgreSQL and add SSL via connect_args
_connect_args = {}
_neon = "neon.tech" in _DATABASE_URL or "sslmode=require" in _DATABASE_URL

# Remove sslmode from URL if present (pass via connect_args instead)
import re as _re
_DATABASE_URL = _re.sub(r'[?&]sslmode=\S+', '', _DATABASE_URL).rstrip('?').strip()

if _neon:
    _connect_args = {"sslmode": "require"}

engine = create_engine(
    _DATABASE_URL,
    pool_size=2,        # Neon free tier: max 20 connections total
    max_overflow=3,     # Allow 3 extra on burst
    pool_timeout=60,    # Neon can be slow to connect first time
    pool_recycle=300,   # Recycle connections every 5 min (Neon idles fast)
    pool_pre_ping=True, # Check connection before using
    connect_args=_connect_args,
)
print(f"[accfino] database: PostgreSQL")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
