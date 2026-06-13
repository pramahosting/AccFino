import os as _os
import warnings as _warnings
_os.environ["PYTHONWARNINGS"] = "ignore"
_warnings.filterwarnings("ignore")
# Force UTF-8 output on Windows
import sys as _sys
if hasattr(_sys.stdout, 'reconfigure'):
    try: _sys.stdout.reconfigure(encoding='utf-8')
    except: pass

from fastapi import FastAPI
from db_app.api import auth
from db_app.api import invoice
from db_app.api import transactions

app = FastAPI()


@app.on_event("startup")
def _startup():
    """Ensure DB is initialised and admin password is correct on every startup."""
    try:
        from db_app.init_db import init_db, ensure_demo_licences, migrate_db
        from db_app.database import SessionLocal
        from db_app.init_db import _ensure_admin_exists
        init_db()
        migrate_db()
        ensure_demo_licences()
        # Always reset admin password to match ADMIN_PASSWORD constant
        _db = SessionLocal()
        _ensure_admin_exists(_db)
        _db.close()
    except Exception as e:
        print(f"[startup] warning: {e}")



# AUTH
app.include_router(auth.router, prefix="/auth", tags=["auth"])

app.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
app.include_router(invoice.router, prefix="/invoice", tags=["invoice"])