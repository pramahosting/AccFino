from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# DB lives in a /data subdirectory so a persistent volume mounted at
# /app/db_app/data does not overlay the Python source files in /app/db_app/
_DB_DIR  = Path(__file__).parent / "data"
_DB_DIR.mkdir(parents=True, exist_ok=True)
_DB_FILE = _DB_DIR / "hsledger.db"

DATABASE_URL = f"sqlite:///{_DB_FILE}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()