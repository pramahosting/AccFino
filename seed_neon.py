"""One-time script to seed companies from companies.json into Neon PostgreSQL."""
import os, sys, json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DATABASE_URL",
    "postgresql+psycopg2://neondb_owner:npg_XH2QFas3gYDd@ep-dawn-scene-aqma9lhs.c-8.us-east-1.aws.neon.tech/neondb")

from db_app.database import SessionLocal, engine
from db_app.models.base import Base

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Tables ready.")

db = SessionLocal()
try:
    from db_app.company_seed import seed_companies
    print("Seeding companies...")
    n = seed_companies(db)
    print(f"Done — {n} companies inserted.")
except Exception as e:
    print(f"Error: {e}")
    import traceback; traceback.print_exc()
finally:
    db.close()
