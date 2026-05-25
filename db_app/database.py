import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

_DATABASE_URL = os.environ.get("DATABASE_URL", "")

if _DATABASE_URL:
    # Production — Neon / any Postgres (Northflank env var)
    # Neon sometimes returns postgres:// — SQLAlchemy needs postgresql+psycopg2://
    if _DATABASE_URL.startswith("postgres://"):
        _DATABASE_URL = _DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
    elif _DATABASE_URL.startswith("postgresql://") and "+psycopg2" not in _DATABASE_URL:
        _DATABASE_URL = _DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

    engine = create_engine(
        _DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_pre_ping=True,   # recycle stale connections gracefully
    )
    print("[accfino] database: PostgreSQL (production)")
else:
    # Local dev fallback — SQLite
    _DB_DIR  = Path(__file__).parent / "data"
    _DB_DIR.mkdir(parents=True, exist_ok=True)
    _DB_FILE = _DB_DIR / "hsledger.db"
    _DATABASE_URL = f"sqlite:///{_DB_FILE}"
    engine = create_engine(
        _DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
    print(f"[accfino] database: SQLite fallback at {_DB_FILE}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
