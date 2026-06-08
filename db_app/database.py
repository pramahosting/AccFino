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
    # Prefer db_app/hsledger.db (shipped location).
    # Fall back to db_app/data/hsledger.db for legacy installs.
    _DB_ROOT      = Path(__file__).parent
    _DB_FILE_ROOT = _DB_ROOT / "hsledger.db"
    _DB_FILE_DATA = _DB_ROOT / "data" / "hsledger.db"

    if _DB_FILE_ROOT.exists():
        _DB_FILE = _DB_FILE_ROOT          # shipped / primary
    else:
        _DB_FILE_DATA.parent.mkdir(parents=True, exist_ok=True)
        _DB_FILE = _DB_FILE_DATA          # legacy / fresh install

    _DATABASE_URL = f"sqlite:///{_DB_FILE}"
    engine = create_engine(
        _DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
    print(f"[accfino] database: SQLite at {_DB_FILE}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
