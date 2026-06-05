"""
Accfino React API — Full REST backend replacing ALL Streamlit modules.
Preserves ALL original logic from render_output_ui.py and render_input_ui.py
Run: python -m uvicorn main_app.react_api:app --host 127.0.0.1 --port 8001 --reload
"""
import base64, io, json, logging, os, sys, uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

ROOT         = Path(__file__).parent   # main_app/
PROJECT_ROOT = ROOT.parent             # HSLedger/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

logger = logging.getLogger("accfino")

from db_app.api import auth as db_auth
from db_app.api import transactions as db_transactions
from db_app.api import invoice as db_invoice
from db_app.api import password_reset as db_password_reset
from db_app.api import payments as db_payments
from db_app.models.licence import LicenceRecord
from db_app.models.password_reset_token import PasswordResetToken

from backend.reconciliation.bank_normalizer import normalize_transactions, BANK_PRESETS
from backend.reconciliation import classifier as rec_classifier
from backend.reconciliation.gst_calculator import (
    calculate_gst, calculate_gst_value, GST_CATEGORY_OPTIONS,
)
from backend.reconciliation.exporter import export_excel_bytes
from backend.reconciliation.session_manager import session_manager

from backend.trading.data_parser import parse_trading_file
from backend.trading.report_presentation import generate_report_df
from backend.trading.trading_exporter import export_report_trading

from backend.cash_flow.pipeline import (
    auto_detect_columns, preprocess, validate_date_span,
    monthly_features, train_leaderboard, predict_next_month,
    LEADERBOARD_CSV, NEXT_MONTH_CSV, LEADERBOARD_PLOT, NEXT_MONTH_PLOT,
)

from backend.transaction_classifier.train_model import train_from_df, DEFAULT_MODEL_DIR
from backend.classifier.engine import classify as _engine_classify, warm as _engine_warm, DEFAULT_COA_PATH as _DEFAULT_COA_PATH

# ── COA name/type lookup — built once at startup ──────────────────────────────
def _load_coa_names(path=None) -> tuple:
    """Return (sorted *Name list, {name: type} dict) from ChartOfAccounts.csv."""
    import csv
    from backend.classifier.engine import DEFAULT_COA_PATH
    names, name_to_type = [], {}
    try:
        with open(path or DEFAULT_COA_PATH, newline="", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                name = (row.get("*Name") or "").strip()
                atype = (row.get("*Type") or "").strip()
                if name:
                    names.append(name)
                    name_to_type[name] = atype
    except Exception:
        pass
    return sorted(names), name_to_type

_COA_NAMES, _COA_NAME_TO_TYPE = _load_coa_names()
_ACTIVE_COA_PATH = None   # tracks which COA file is in use; None = DEFAULT

# Import the EXACT enums used in the original output UI
from backend.llm_classifier.classify_category import (
    CATEGORY_ENUM, extract_who_bank
)
from backend.reconciliation.gst_calculator import GST_CATEGORY_OPTIONS

try:
    from backend.invoice_extractor.core import (
        process_files as ie_process_files, get_dependency_status,
    )
    IE_AVAILABLE = True
except Exception:
    IE_AVAILABLE = False

try:
    from backend.open_banking import (
        auth as ob_auth, user as ob_user,
        job_service as ob_job,
    )
    OB_AVAILABLE = True
except Exception:
    OB_AVAILABLE = False

app = FastAPI(title="Accfino API", version="2.0")
# CORS origins — configurable via CORS_ORIGINS env var for custom domains.
# Format: comma-separated list, e.g. "https://myapp.northflank.app,https://mysite.com"
import os as _os
_extra_origins = [o.strip() for o in _os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
_CORS_ORIGINS = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
    "https://www.accfino.com",
    "https://accfino.com",
] + _extra_origins

app.add_middleware(CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.northflank\.app",   # all Northflank preview URLs
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

from fastapi.responses import JSONResponse
from fastapi.requests  import Request as _Request

@app.exception_handler(Exception)
async def global_exception_handler(request: _Request, exc: Exception):
    """Catch any unhandled exception and return JSON instead of crashing."""
    import traceback, logging
    logging.getLogger("accfino").error(f"Unhandled: {exc}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server error: {type(exc).__name__}: {str(exc)[:500]}"}
    )

# ── Health check endpoint (used by Northflank / Docker HEALTHCHECK) ───────────
@app.get("/health", include_in_schema=False)
def health_check():
    """Simple liveness probe — returns 200 if the API process is running."""
    return {"status": "ok", "service": "accfino-api"}



app.include_router(db_auth.router,           prefix="/auth",        tags=["auth"])
app.include_router(db_transactions.router,   prefix="/transactions", tags=["transactions"])
app.include_router(db_invoice.router,        prefix="/invoice",      tags=["invoice"])
app.include_router(db_password_reset.router, prefix="/auth",         tags=["auth"])
app.include_router(db_payments.router,       prefix="/payments",     tags=["payments"])

# Ensure new tables exist and columns migrated (safe on existing DBs)
from db_app.database import engine as _db_engine
try:
    LicenceRecord.__table__.create(bind=_db_engine, checkfirst=True)
    PasswordResetToken.__table__.create(bind=_db_engine, checkfirst=True)
except Exception:
    pass

try:
    from db_app.init_db import migrate_db
    migrate_db()
except Exception:
    pass

_cf_cache: dict = {}


# ── GST normalization ────────────────────────────────────────────────────────
# GST category values come directly from COA *Tax Code column via the engine.
# No alias mapping — values are passed through unchanged if they match COA.
def normalize_gst_category(value) -> str:
    text = "" if pd.isna(value) else str(value).strip()
    if not text: return ""
    for option in GST_CATEGORY_OPTIONS:
        if option.lower() == text.lower(): return option
    return text  # pass through unknown values rather than blanking them

def normalize_gl_account(value) -> str:
    """Validate against COA *Name values — not *Type/CATEGORY_ENUM."""
    text = "" if pd.isna(value) else str(value).strip()
    if not text: return ""
    tl = text.lower()
    for name in _COA_NAMES:
        if name.lower() == tl: return name
    return ""


# ── Helpers ───────────────────────────────────────────────────────────────────
def _clean(df: pd.DataFrame) -> list:
    out = []
    for row in df.to_dict(orient="records"):
        c = {}
        for k, v in row.items():
            if isinstance(v, float) and pd.isna(v):          c[k] = None
            elif hasattr(v, "item"):                          c[k] = v.item()
            elif isinstance(v, (datetime, pd.Timestamp)):     c[k] = str(v)
            else:                                             c[k] = v
        out.append(c)
    return out

def _norm_cols(df: pd.DataFrame) -> pd.DataFrame:
    """Rename classifier output columns to Title Case matching original Streamlit app."""
    return df.rename(columns={
        "date":         "Date",
        "bank":         "Bank",
        "account_name": "Account Name",
        "account":      "Account",
        "description":  "Description",
        "debit":        "Debit",
        "credit":       "Credit",
        "classification": "Classification",
        "pairid":       "PairID",
        "GL Account":   "GL Account",   # already correct
        "GL Type":      "GL Type",
        "GST":          "GST",
        "GST Category": "GST Category",
        "Who":          "Who",
        "Month":        "Month",
        "Year":         "Year",
        # snake_case variants
        "gl_account":   "GL Account",
        "gl_type":      "GL Type",
        "gst":          "GST",
        "gst_category": "GST Category",
        "who":          "Who",
        "month":        "Month",
        "year":         "Year",
    })

def _to_frontend(df: pd.DataFrame) -> list:
    """Convert df to frontend-friendly records using lowercase keys."""
    df2 = df.copy()
    # Rename Title Case back to lowercase for consistent frontend keys
    df2 = df2.rename(columns={
        "Date": "date", "Bank": "bank", "Account Name": "account_name",
        "Account": "account", "Description": "description",
        "Debit": "debit", "Credit": "credit",
        "Classification": "classification", "PairID": "pairid",
        "GL Account": "gl_account", "GL Type": "gl_type", "GST": "gst",
        "GST Category": "gst_category", "Who": "who",
        "Month": "month", "Year": "year",
    })
    return _clean(df2)

def _build_monthly_summary(df: pd.DataFrame) -> list:
    """Replicate EXACT monthly summary from render_output_ui.py."""
    if "Date" not in df.columns or df["Date"].isna().all():
        return []

    df = df.copy()
    df["Date_dt"] = pd.to_datetime(df["Date"], errors="coerce", dayfirst=True)
    df["Month"]   = df["Date_dt"].dt.month
    df["Year"]    = df["Date_dt"].dt.year
    df["Date"]    = df["Date_dt"].dt.strftime("%d/%m/%Y")

    # Ensure GST column exists
    if "GST" not in df.columns:
        df["GST"] = 0.0

    rows = []
    for (year, month), group in df.groupby(["Year", "Month"]):
        internal_count = (group["Classification"] == "🟢Internal").sum()
        incoming_count = (group["Classification"] == "🔵Incoming").sum()
        outgoing_count = (group["Classification"] == "🟡Outgoing").sum()
        total_income   = group.loc[group["Classification"] == "🔵Incoming", "Credit"].sum()
        total_expense  = group.loc[group["Classification"] == "🟡Outgoing", "Debit"].sum()
        gst_in         = group.loc[group["Classification"] == "🔵Incoming", "GST"].sum()
        gst_out        = group.loc[group["Classification"] == "🟡Outgoing", "GST"].sum()
        rows.append({
            "Year/Month":                  f"{int(year)}/{int(month):02d}",
            "🟢Internal Transfers":        int(internal_count),
            "🔵Incoming Count":            int(incoming_count),
            "🟡Outgoing Count":            int(outgoing_count),
            "Total 🔵Incoming Income":     round(float(total_income), 2),
            "Total 🟡Outgoing Expense":    round(float(total_expense), 2),
            "Total 🔵Incoming GST":        round(float(gst_in), 2),
            "Total 🟡Outgoing GST":        round(float(gst_out), 2),
        })

    # Grand total row
    if rows:
        rows.append({
            "Year/Month":                  "Grand Total",
            "🟢Internal Transfers":        sum(r["🟢Internal Transfers"] for r in rows),
            "🔵Incoming Count":            sum(r["🔵Incoming Count"] for r in rows),
            "🟡Outgoing Count":            sum(r["🟡Outgoing Count"] for r in rows),
            "Total 🔵Incoming Income":     round(sum(r["Total 🔵Incoming Income"] for r in rows), 2),
            "Total 🟡Outgoing Expense":    round(sum(r["Total 🟡Outgoing Expense"] for r in rows), 2),
            "Total 🔵Incoming GST":        round(sum(r["Total 🔵Incoming GST"] for r in rows), 2),
            "Total 🟡Outgoing GST":        round(sum(r["Total 🟡Outgoing GST"] for r in rows), 2),
        })

    return rows


# ══════════════════════════════════════════════════════════════════════════════
# BANKS / GST
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/banks")
def get_banks(): return sorted(BANK_PRESETS.keys())

@app.get("/gst/categories")
def get_gst_cats(): return GST_CATEGORY_OPTIONS

@app.get("/gl/accounts")
def get_gl_accounts(): return _COA_NAMES + [""]

@app.post("/gl/accounts/upload")
async def upload_gl_accounts(file: UploadFile = File(...)):
    """Save uploaded ChartOfAccounts.csv to disk and rebuild classifier index.
    Uses temp-file + replace to avoid locking errors on Windows."""
    import shutil, tempfile
    from backend.classifier.engine import rebuild as _engine_rebuild, evict as _engine_evict, warm as _engine_warm_path
    content = await file.read()

    coa_path = _DEFAULT_COA_PATH          # target path
    tmp_path  = coa_path.parent / ("ChartOfAccounts.tmp")
    alt_path  = coa_path.parent / "ChartOfAccounts_updated.csv"

    # Step 1: write to temp file
    try:
        tmp_path.write_bytes(content)
    except Exception as e:
        raise HTTPException(500, f"COA write failed: {e}")

    # Step 2: atomic replace — may fail on Windows if file is open in Excel
    saved_path = coa_path
    try:
        if coa_path.exists():
            coa_path.unlink()
        shutil.move(str(tmp_path), str(coa_path))
    except PermissionError:
        # File locked — save to alternate and use that for this session
        shutil.move(str(tmp_path), str(alt_path))
        saved_path = alt_path
        logger.warning("ChartOfAccounts.csv locked — saved to ChartOfAccounts_updated.csv")
    finally:
        if tmp_path.exists():
            try: tmp_path.unlink()
            except: pass

    # Step 3: rebuild engine index from saved file
    _engine_evict()
    _engine_warm_path(coa_path=saved_path)

    # Step 4: reload name/type map
    global _COA_NAMES, _COA_NAME_TO_TYPE, _ACTIVE_COA_PATH
    _COA_NAMES, _COA_NAME_TO_TYPE = _load_coa_names(saved_path)
    _ACTIVE_COA_PATH = saved_path

    msg = f"COA saved and index rebuilt ({len(_COA_NAMES)} accounts)"
    if saved_path != coa_path:
        msg += " — NOTE: original file was locked (close Excel). Saved as ChartOfAccounts_updated.csv. Restart app to make permanent."
    return {"ok": True, "message": msg}

@app.get("/gl/accounts/all")
def get_gl_accounts_all():
    """Return full COA rows with all columns for the GL Accounts modal and coaMap."""
    import csv
    from backend.classifier.engine import DEFAULT_COA_PATH
    rows = []
    try:
        _read_path = _ACTIVE_COA_PATH or DEFAULT_COA_PATH
        with open(_read_path, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                name = (r.get("*Name") or r.get("Name") or "").strip()
                if name:
                    rows.append({
                        # Keys the modal uses for its table columns
                        "Code":        (r.get("*Code")        or r.get("Code")        or "").strip(),
                        "Name":        name,
                        "Type":        (r.get("*Type")        or r.get("Type")        or "").strip(),
                        "TaxCode":     (r.get("*Tax Code")    or r.get("Tax Code")    or "").strip(),
                        "Description": (r.get("Description")  or "").strip(),
                        "Dashboard":   (r.get("Dashboard")    or "").strip(),
                        # Also snake_case for coaMap usage
                        "name":        name,
                        "type":        (r.get("*Type")        or r.get("Type")        or "").strip(),
                        "tax_code":    (r.get("*Tax Code")    or r.get("Tax Code")    or "").strip(),
                    })
    except Exception as e:
        logger.warning(f"COA read failed: {e}")
    return rows

@app.get("/gst/calculate")
def calc_gst(debit: float=0, credit: float=0, category: str="Unknown"):
    return {"gst": calculate_gst_value(debit, credit, category)}


# ══════════════════════════════════════════════════════════════════════════════
# USERNAME NORMALISATION
# The session folder is always the username string used at creation time.
# norm_username() must return exactly that string for both create and lookup.
#
# Strategy (in order):
#   1. Use username exactly as given if a matching folder already exists
#   2. If it looks like an email (has @), try the local part (before @)
#      and check if that folder exists
#   3. Fall back to the local part anyway (new sessions use local part)
# ══════════════════════════════════════════════════════════════════════════════
_DATA_DIR = Path(__file__).parent / "data"

def norm_username(username: str) -> str:
    """Return the folder name that matches this username.

    Handles the case where old sessions were saved under the full username
    string (e.g. 'p' from 'p@ex.com') or under a different casing.
    Falls back to stripping the email domain for new sessions.
    """
    raw = (username or "default_user").strip()
    if not raw:
        return "default_user"

    # 1. Exact match — folder already exists under this exact string
    if (_DATA_DIR / raw).is_dir():
        return raw

    # 2. Email → strip domain and check
    if "@" in raw:
        local = raw.split("@")[0].strip()
        if local and (_DATA_DIR / local).is_dir():
            return local
        # 3. No existing folder yet — use local part for new sessions
        return local or "default_user"

    return raw


# ══════════════════════════════════════════════════════════════════════════════
# SESSIONS
# ══════════════════════════════════════════════════════════════════════════════
class SaveSessReq(BaseModel):
    session_id: str; username: str; transactions: list
    pending_changes: dict = {}; page_number: int = 1

@app.get("/sessions")
def list_sessions(username: str):
    username = norm_username(username)
    ss = session_manager.get_all_sessions(username)
    for s in ss:
        if "datetime" in s and hasattr(s["datetime"], "isoformat"):
            s["datetime"] = s["datetime"].isoformat()
        # Enrich with accounts/file count from accounts.json.
        # Falls back to counting files from input/files/ on disk when the
        # accounts.json "files" arrays are empty (e.g. backfilled sessions).
        try:
            import json as _json
            sess_dir  = session_manager.get_session_dir(username, s["session_id"])
            acc_file  = sess_dir / "input" / "accounts.json"
            files_dir = sess_dir / "input" / "files"

            if acc_file.exists():
                accs = _json.loads(acc_file.read_text())

                # Recover filenames from disk when files arrays are all empty
                disk_names = (
                    sorted(f.name for f in files_dir.iterdir() if f.is_file())
                    if files_dir.exists() else []
                )
                if disk_names and all(len(a.get("files", [])) == 0 for a in accs):
                    n_acc   = len(accs)
                    n_files = len(disk_names)
                    if n_acc > 0 and n_files >= n_acc:
                        chunk = n_files // n_acc
                        for idx, a in enumerate(accs):
                            start = idx * chunk
                            end   = start + chunk if idx < n_acc - 1 else n_files
                            a["files"] = disk_names[start:end]
                    else:
                        for a in accs:
                            a["files"] = disk_names
                    # Persist repaired data so this only runs once
                    try:
                        acc_file.write_text(_json.dumps(accs, indent=2), encoding="utf-8")
                    except Exception:
                        pass

                s["accounts_meta"] = accs
                s["account_count"] = len(accs)
                s["file_count"]    = sum(len(a.get("files", [])) for a in accs)
            else:
                # No accounts.json — fall back to disk file count
                disk_count = (
                    sum(1 for f in files_dir.iterdir() if f.is_file())
                    if files_dir.exists() else 0
                )
                s["accounts_meta"] = []
                s["account_count"] = 0
                s["file_count"]    = disk_count
        except Exception:
            s["accounts_meta"] = []; s["account_count"] = 0; s["file_count"] = 0
    return ss

@app.delete("/sessions/{username}/{sid}")
def del_session(username: str, sid: str):
    return {"ok": session_manager.delete_session(norm_username(username), sid)}

@app.get("/sessions/{username}/{sid}")
def get_session(username: str, sid: str):
    username = norm_username(username)
    d = session_manager.load_session_data(username, sid)
    if not d: raise HTTPException(404, "Session not found")

    txns = []
    monthly = []
    if d.get("results") is not None and not d["results"].empty:
        df = _norm_cols(d["results"].copy())
        # Ensure all required columns exist
        for col, default in [("GL Account",""),("GL Type",""),("GST Category",""),("GST",0.0),("Who",""),("PairID","")]:
            if col not in df.columns: df[col] = default
        # Internal transfer rows — blank GL Account, GL Type, GST Category
        if "Classification" in df.columns:
            _int_mask = df["Classification"].str.contains("Internal", na=False)
            df.loc[_int_mask, ["GL Account","GL Type","GST Category"]] = ""
        monthly = _build_monthly_summary(df)
        txns = _to_frontend(df)
    # accounts from load_session_data is the accounts.json list
    accounts_meta = d.get("accounts") or []
    return {
        "session_id": sid,
        "transactions": txns,
        "monthly_summary": monthly,
        "accounts_meta": accounts_meta,   # [{bank_name, account_number, files:[str]}]
        "account_count": len(accounts_meta),
        "file_count": sum(len(a.get("files",[])) for a in accounts_meta),
        "page_number": d.get("page_number", 1),
        "pending_changes": {str(k): v for k, v in d.get("pending_changes", {}).items()},
    }

@app.post("/sessions/save")
def save_session(body: SaveSessReq):
    username = norm_username(body.username)
    df = pd.DataFrame(body.transactions) if body.transactions else pd.DataFrame()
    if not df.empty:
        df = _norm_cols(df)
    session_manager.save_output_data(username, body.session_id, df,
        {int(k): v for k, v in body.pending_changes.items()},
        set(), body.page_number)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# RECONCILIATION
# ══════════════════════════════════════════════════════════════════════════════
@app.post("/reconcile/process")
async def reconcile_process(
    files: List[UploadFile]=File(...),
    bank_names: List[str]=Form(...),
    account_numbers: List[str]=Form(...),
    account_names:   Optional[List[str]]=Form(default=None),
    username: str=Form(...),
):
    normed = []
    # Track filenames per (bank, account) as we read — files can only be read once
    _acc_files: dict = {}   # (bank, account) -> [filename, ...]
    for i, upload in enumerate(files):
        bank         = bank_names[i]      if i < len(bank_names)      else "Unknown"
        account      = account_numbers[i] if i < len(account_numbers) else "Unknown"
        account_name = (account_names or [])[i] if account_names and i < len(account_names) else ""
        fname        = upload.filename or f"file_{i}.csv"
        _acc_files.setdefault((bank, account), []).append((fname, account_name))
        try:
            df = pd.read_csv(io.BytesIO(await upload.read()))
            normalized = normalize_transactions(df, bank, account)
            if account_name:
                normalized["account_name"] = account_name
            normed.append(normalized)
        except Exception as e:
            logger.warning(f"Skip {upload.filename}: {e}")
    if not normed: raise HTTPException(400, "No valid CSVs")

    combined = pd.concat(normed, ignore_index=True)
    combined.columns = combined.columns.str.strip().str.lower()
    classified = rec_classifier.classify_transactions(combined, show_progress=False)
    classified = _norm_cols(classified)

    # Ensure all columns match original schema
    for col, default in [("GL Account",""),("GL Type",""),("GST Category",""),("GST",0.0),("Who",""),("PairID","")]:
        if col not in classified.columns: classified[col] = default

    # Auto-classify immediately (replicates needs_classification=True logic)
    classified = _run_classify_gl(classified)

    monthly = _build_monthly_summary(classified)

    username = norm_username(username)
    sid = session_manager.create_session(username)
    session_manager.save_output_data(username, sid, classified, {}, set(), 1)

    # Save accounts.json so sessions panel can show bank/file counts
    # and so session restore can repopulate the Input panel
    import json as _json
    accounts_meta = [
        {
            "bank_name":    bank,
            "account_number": account,
            "account_name": tuples[0][1] if tuples else "",
            "files":        [t[0] for t in tuples],
        }
        for (bank, account), tuples in _acc_files.items()
    ]

    try:
        input_dir = session_manager.get_session_dir(username, sid) / "input"
        input_dir.mkdir(parents=True, exist_ok=True)
        (input_dir / "accounts.json").write_text(
            _json.dumps(accounts_meta, indent=2), encoding="utf-8"
        )
    except Exception as _e:
        logger.warning(f"Failed to save accounts.json for session {sid}: {_e}")

    return {
        "session_id": sid,
        "transactions": _to_frontend(classified),
        "monthly_summary": monthly,
        "count": len(classified),
        "accounts_meta": accounts_meta,
    }


def _run_classify_gl(df: pd.DataFrame) -> pd.DataFrame:
    """
    Classify GL account, GST category and GST amount for every row.
    Delegates to backend.classifier.engine — single call per transaction,
    all three fields resolved from COA in one TF-IDF pass.
    """
    if "Description" not in df.columns:
        return df

    if "GL Account"   not in df.columns: df["GL Account"]   = ""
    if "GL Type"      not in df.columns: df["GL Type"]      = ""
    if "GST Category" not in df.columns: df["GST Category"] = ""
    if "GST"          not in df.columns: df["GST"]          = 0.0
    if "Who"          not in df.columns: df["Who"]          = ""

    def _to_float(v):
        parsed = pd.to_numeric(v, errors="coerce")
        return float(parsed) if pd.notnull(parsed) else 0.0

    _engine_warm(coa_path=_ACTIVE_COA_PATH)

    for idx in df.index:
        desc = str(df.at[idx, "Description"]) if pd.notnull(df.at[idx, "Description"]) else ""
        cl   = str(df.at[idx, "Classification"]) if "Classification" in df.columns and pd.notnull(df.at[idx, "Classification"]) else ""

        # Internal transfers: equity account / BAS Excluded / $0 GST
        if "Internal" in cl:
            # Internal transfers — always blank GL Account, GL Type, GST Category
            df.at[idx, "GL Account"]   = ""
            df.at[idx, "GL Type"]      = ""
            df.at[idx, "GST Category"] = ""
            df.at[idx, "GST"]          = 0.0
            df.at[idx, "Who"]          = extract_who_bank(desc)
            continue

        if not desc.strip():
            continue

        debit  = _to_float(df.at[idx, "Debit"]  if "Debit"  in df.columns else 0)
        credit = _to_float(df.at[idx, "Credit"] if "Credit" in df.columns else 0)

        # Only fill empty cells — preserve any manual edits already present
        existing_gl  = normalize_gl_account(df.at[idx, "GL Account"])
        existing_gst = normalize_gst_category(df.at[idx, "GST Category"])

        if not existing_gl or existing_gst in ("", "Unknown"):
            result = _engine_classify(desc, debit, credit)
            if not existing_gl:
                gl_candidate = result.gl_account
                gl_type      = result.gl_type or (_COA_NAME_TO_TYPE.get(gl_candidate, ""))

                # FIX 1: During AUTO-ALLOCATION, prevent assigning an Expense-type
                # GL to an Incoming (credit) transaction and vice versa.
                # The user can still manually override in the UI.
                _income_types  = {"revenue", "income", "other income", "sales"}
                _expense_types = {"expense", "direct costs", "overhead", "other expense"}
                _is_incoming   = "Incoming" in cl or "🔵" in cl
                _is_outgoing   = "Outgoing" in cl or "🟡" in cl
                _type_lower    = gl_type.lower()

                _direction_ok = True
                if _is_incoming and _type_lower in _expense_types:
                    # Incoming row got an Expense GL — find nearest income-type account
                    _direction_ok = False
                    for _fallback_name, _fallback_type in _COA_NAME_TO_TYPE.items():
                        if _fallback_type.lower() in _income_types:
                            gl_candidate = _fallback_name
                            gl_type      = _fallback_type
                            break
                elif _is_outgoing and _type_lower in _income_types:
                    # Outgoing row got an Income GL — find nearest expense-type account
                    _direction_ok = False
                    for _fallback_name, _fallback_type in _COA_NAME_TO_TYPE.items():
                        if _fallback_type.lower() in _expense_types:
                            gl_candidate = _fallback_name
                            gl_type      = _fallback_type
                            break

                df.at[idx, "GL Account"] = gl_candidate
                df.at[idx, "GL Type"]    = gl_type

            if existing_gst in ("", "Unknown"):
                df.at[idx, "GST Category"] = result.gst_category
                # FIX 5: Recalculate GST amount from actual debit/credit + tax code
                from backend.reconciliation.gst_calculator import calculate_gst_value
                df.at[idx, "GST"] = calculate_gst_value(debit, credit, result.gst_category)

        df.at[idx, "Who"] = extract_who_bank(desc)

    return df


class ClassifyReq(BaseModel):
    session_id: str; username: str

@app.post("/reconcile/classify")
def reconcile_classify(body: ClassifyReq):
    """Classify empty GL/GST cells only — preserves manual edits."""
    username = norm_username(body.username)
    d = session_manager.load_session_data(username, body.session_id)
    if not d or d.get("results") is None:
        raise HTTPException(404, "Session not found")

    df = _norm_cols(d["results"].copy())
    df = _run_classify_gl(df)
    monthly = _build_monthly_summary(df)
    session_manager.save_output_data(username, body.session_id, df, {}, set(), 1)
    return {"transactions": _to_frontend(df), "monthly_summary": monthly}


@app.post("/reconcile/reclassify")
def reconcile_reclassify(body: ClassifyReq):
    """Force full reclassification of ALL rows using the current COA.
    Clears GL Account, GL Type and GST Category before running the engine
    so updated COA changes are applied to every row."""
    username = norm_username(body.username)
    d = session_manager.load_session_data(username, body.session_id)
    if not d or d.get("results") is None:
        raise HTTPException(404, "Session not found")

    df = _norm_cols(d["results"].copy())

    # Wipe classification columns so _run_classify_gl re-runs on everything
    for col in ["GL Account", "GL Type", "GST Category", "GST"]:
        if col in df.columns:
            df[col] = "" if col != "GST" else 0.0

    df = _run_classify_gl(df)
    monthly = _build_monthly_summary(df)
    session_manager.save_output_data(username, body.session_id, df, {}, set(), 1)
    return {"transactions": _to_frontend(df), "monthly_summary": monthly}


class ExportReq(BaseModel):
    transactions: list

@app.post("/reconcile/export")
def reconcile_export(body: ExportReq):
    df = pd.DataFrame(body.transactions)
    # Rename lowercase keys to Title Case for exporter
    df = _norm_cols(df)
    monthly_rows = _build_monthly_summary(df)
    monthly = pd.DataFrame(monthly_rows) if monthly_rows else None
    excel = export_excel_bytes(df, monthly)
    return StreamingResponse(excel,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=accfino_reconciliation.xlsx"})



# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD STATS  — aggregates from ALL session pickles (no Save-to-DB needed)
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/dashboard/stats")
def dashboard_stats(username: str):
    """
    Stats from the LATEST session only.
    Returns all-zero totals if no sessions exist.
    """
    username = norm_username(username)
    ZERO = {
        "total_in":0.0,"total_out":0.0,"total_gst":0.0,
        "internal":0,"incoming":0,"outgoing":0,
        "txn_count":0,"net":0.0,"session_count":0,
    }

    sessions = session_manager.get_all_sessions(username)
    if not sessions:
        return ZERO

    # Sort by datetime descending — pick the most recent session with results
    def _sess_dt(s):
        try: return str(s.get("datetime") or s.get("session_id") or "")
        except: return ""

    sorted_sessions = sorted(sessions, key=_sess_dt, reverse=True)
    latest = next((s for s in sorted_sessions if s.get("has_results")), None)
    if not latest:
        return {**ZERO, "session_count": len(sessions)}

    totals = {**ZERO, "session_count": len(sessions)}
    try:
        d  = session_manager.load_session_data(username, latest["session_id"])
        df = d.get("results")
        if df is None or df.empty:
            return totals
        df = _norm_cols(df)
        for _, row in df.iterrows():
            cl  = str(row.get("Classification") or row.get("classification") or "")
            db  = float(row.get("Debit",0)  or row.get("debit",0)  or 0)
            cr  = float(row.get("Credit",0) or row.get("credit",0) or 0)
            gst = float(row.get("GST",0)    or row.get("gst",0)    or 0)
            if "Incoming" in cl:
                totals["total_in"]  += cr
                totals["total_gst"] += gst
                totals["incoming"]  += 1
            elif "Outgoing" in cl:
                totals["total_out"] += db
                totals["total_gst"] += gst
                totals["outgoing"]  += 1
            elif "Internal" in cl:
                totals["internal"]  += 1
            totals["txn_count"] += 1
        totals["net"] = totals["total_in"] - totals["total_out"]
    except Exception:
        pass
    return totals

# ══════════════════════════════════════════════════════════════════════════════
# TRADING
# ══════════════════════════════════════════════════════════════════════════════
@app.post("/trading/analyze")
async def trading_analyze(file: UploadFile=File(...)):
    import tempfile, os as _os
    raw = await file.read()
    suffix = ".json" if (file.filename or "").lower().endswith(".json") else ".csv"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw); tmp_path = tmp.name
    try:
        trades_df = parse_trading_file(open(tmp_path, "rb"))
        _os.unlink(tmp_path)
    except Exception as e:
        raise HTTPException(400, f"Parse failed: {e}")
    if trades_df is None or trades_df.empty:
        raise HTTPException(400, "No valid trading records found")
    try:
        per_symbol_df, totals_df, tax_df = generate_report_df(trades_df)
    except Exception as e:
        raise HTTPException(500, f"Report failed: {e}")

    def sdf(df):
        if df is None or df.empty: return []
        d = df.copy()
        for c in d.columns:
            d[c] = d[c].apply(lambda x: None if (isinstance(x, float) and pd.isna(x)) else
                              (str(x) if hasattr(x, "isoformat") else x))
        return d.to_dict(orient="records")

    return {"trades": sdf(trades_df), "tax": sdf(tax_df),
            "per_symbol": sdf(per_symbol_df), "count": len(trades_df)}

@app.post("/trading/export")
async def trading_export(file: UploadFile=File(...)):
    import tempfile, os as _os
    raw = await file.read()
    suffix = ".json" if (file.filename or "").lower().endswith(".json") else ".csv"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw); tmp_path = tmp.name
    trades_df = parse_trading_file(open(tmp_path, "rb")); _os.unlink(tmp_path)
    per_symbol_df, totals_df, tax_df = generate_report_df(trades_df)
    xlsx = export_report_trading(trades_df, per_symbol_df, tax_df, None)
    return Response(content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=trading_report.xlsx"})


# ══════════════════════════════════════════════════════════════════════════════
# CASH FLOW
# ══════════════════════════════════════════════════════════════════════════════
@app.post("/cashflow/detect")
async def cf_detect(file: UploadFile=File(...)):
    df = pd.read_csv(io.BytesIO(await file.read()))
    detected = auto_detect_columns(df)
    cols = [c for c in df.columns if not c.startswith("_")]
    rows = df.to_dict(orient="records")
    return {"detected": detected, "columns": cols, "row_count": len(df),
            "sample": df.head(5).to_dict(orient="records"), "rows": rows}

class CfRunReq(BaseModel):
    rows: list; col_map: dict

@app.post("/cashflow/run")
def cf_run(body: CfRunReq):
    if not body.rows: raise HTTPException(400, "No data")
    df_raw  = pd.DataFrame(body.rows)
    col_map = {k: (v if v != "(none)" else None) for k, v in body.col_map.items()}
    missing = [r for r in ("date", "debit", "credit") if not col_map.get(r)]
    if missing: raise HTTPException(400, f"Unmapped: {missing}")
    try:
        df_proc, _t, _o = preprocess(df_raw, col_map)
        months_span, d_min, d_max = validate_date_span(df_proc)
        monthly = monthly_features(df_proc)
        lb, trained_models, feature_cols, data = train_leaderboard(monthly)
    except Exception as e:
        raise HTTPException(500, str(e))
    run_id = str(uuid.uuid4())
    _cf_cache[run_id] = dict(trained_models=trained_models, feature_cols=feature_cols,
                              monthly=monthly, data=data)
    lb_img = base64.b64encode(LEADERBOARD_PLOT.read_bytes()).decode() if LEADERBOARD_PLOT.exists() else ""
    return {"run_id": run_id, "months_span": months_span,
            "date_min": str(d_min), "date_max": str(d_max),
            "model_names": lb["model"].tolist(),
            "leaderboard": lb.to_dict(orient="records"),
            "leaderboard_plot_b64": lb_img}

@app.post("/cashflow/predict/{run_id}")
def cf_predict(run_id: str, model_name: str=Body(..., embed=True)):
    cache = _cf_cache.get(run_id)
    if not cache: raise HTTPException(404, "Run expired — please re-run pipeline")
    try:
        pred = predict_next_month(model_name, cache["trained_models"],
                                  cache["feature_cols"], cache["monthly"], cache["data"])
    except Exception as e:
        raise HTTPException(500, str(e))
    plot_b64 = base64.b64encode(NEXT_MONTH_PLOT.read_bytes()).decode() if NEXT_MONTH_PLOT.exists() else ""
    csv_data = NEXT_MONTH_CSV.read_text() if NEXT_MONTH_CSV.exists() else ""
    return {**pred, "forecast_plot_b64": plot_b64, "forecast_csv": csv_data}


# ══════════════════════════════════════════════════════════════════════════════
# ML CLASSIFIER
# ══════════════════════════════════════════════════════════════════════════════
SAMPLE_CSV = "date,description,amount,category,gst_category\n15/09/2025,BUNNINGS,65.38,Expense,GST on Expenses\n16/08/2025,CLIENT PAYMENT ABC PTY,339.55,Revenue,GST on Income\n19/08/2025,AMAZON,97.98,Expense,GST on Expenses\n1/10/2025,SUPPLIER DIRECT COST,566.31,Direct Costs,GST on Expenses\n"

@app.get("/ml/status")
def ml_status():
    return {
        "category_model": (DEFAULT_MODEL_DIR / "category_classifier.pkl").exists(),
        "gst_model": (DEFAULT_MODEL_DIR / "gst_category_classifier.pkl").exists(),
    }

@app.get("/ml/sample-csv")
def ml_sample():
    return Response(content=SAMPLE_CSV, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=sample_training_data.csv"})

@app.post("/ml/train")
async def ml_train(file: UploadFile=File(...)):
    try: df = pd.read_csv(io.BytesIO(await file.read()))
    except Exception as e: raise HTTPException(400, f"Cannot read CSV: {e}")
    text_col = "description" if "description" in df.columns else "transaction_description"
    errors = []
    if text_col not in df.columns: errors.append("Need 'description' or 'transaction_description'")
    for col in ["category", "gst_category"]:
        if col not in df.columns: errors.append(f"Missing: '{col}'")
    if errors: raise HTTPException(400, "\n".join(errors))
    try: result = train_from_df(df, model_dir=str(DEFAULT_MODEL_DIR))
    except Exception as e: raise HTTPException(500, f"Training failed: {e}")
    return {"ok": True, "rows_used": result.get("rows_used", len(df)),
            "category_accuracy": result.get("category_accuracy"),
            "gst_accuracy": result.get("gst_accuracy"),
            "message": "Models saved. Auto-classify will use them immediately."}


# ══════════════════════════════════════════════════════════════════════════════
# RDR RULES  (uses EXACT same structure as transaction_classify.py)
# ══════════════════════════════════════════════════════════════════════════════
RDR_PATH = ROOT / "data" / "rdr_rules.json"

def _load_rdr():
    return json.loads(RDR_PATH.read_text("utf-8")) if RDR_PATH.exists() else []

def _save_rdr(rules):
    RDR_PATH.write_text(json.dumps(rules, indent=2, ensure_ascii=False), "utf-8")

@app.get("/rdr/rules")
def rdr_list(): return _load_rdr()

@app.post("/rdr/rules")
def rdr_create(rule: dict=Body(...)):
    rules = _load_rdr()
    rule.setdefault("id", f"rule_{int(datetime.now().timestamp()*1000)}")
    # Ensure correct field names matching transaction_classify.py
    # "then" = GL account string, "then_gst_category" = GST string
    rules.append(rule); _save_rdr(rules)
    return rule

@app.put("/rdr/rules/{rule_id}")
def rdr_update(rule_id: str, rule: dict=Body(...)):
    rules = _load_rdr()
    for i, r in enumerate(rules):
        if r.get("id") == rule_id:
            rules[i] = {**r, **rule, "id": rule_id}
            _save_rdr(rules)
            return rules[i]
    raise HTTPException(404, "Rule not found")

@app.delete("/rdr/rules/{rule_id}")
def rdr_delete(rule_id: str):
    rules = [r for r in _load_rdr() if r.get("id") != rule_id]
    _save_rdr(rules)
    return {"ok": True}

@app.post("/rdr/test")
def rdr_test(body: dict=Body(...)):
    import re
    desc   = str(body.get("description", ""))
    debit  = float(body.get("debit", 0) or 0)
    credit = float(body.get("credit", 0) or 0)
    d      = desc.lower()
    for rule in sorted(_load_rdr(), key=lambda r: int(r.get("priority", 0) or 0), reverse=True):
        cond = rule.get("if", {}) or {}
        if "debit_gt"     in cond and not debit  > float(cond["debit_gt"]):  continue
        if "credit_gt"    in cond and not credit > float(cond["credit_gt"]): continue
        if "contains_any" in cond and not any(str(k).lower() in d for k in cond["contains_any"]): continue
        if "regex_any"    in cond and not any(re.search(rx, d) for rx in cond["regex_any"]): continue
        return {"matched": True, "rule": rule}
    return {"matched": False, "rule": None}


# ══════════════════════════════════════════════════════════════════════════════
# INVOICE EXTRACTOR
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/invoice-extractor/status")
def ie_status():
    if not IE_AVAILABLE: return {"available": False, "reason": "Module not installed"}
    try: return {"available": True, **get_dependency_status()}
    except Exception as e: return {"available": False, "reason": str(e)}

@app.post("/invoice-extractor/process")
async def ie_process(
    files: List[UploadFile]=File(...),
    tesseract_cmd: str=Form(""), poppler_bin: str=Form(""),
):
    if not IE_AVAILABLE: raise HTTPException(503, "Invoice extractor not available")
    import tempfile, os as _os
    tmp_files = []
    try:
        for upload in files:
            raw = await upload.read()
            suffix = Path(upload.filename or "file").suffix or ".pdf"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(raw); tmp_files.append(tmp.name)
        kwargs = {}
        if tesseract_cmd: kwargs["tesseract_cmd"] = tesseract_cmd
        if poppler_bin:   kwargs["poppler_bin"]   = poppler_bin
        bank_results, invoice_results, excel_bytes = ie_process_files(
            [Path(p) for p in tmp_files], **kwargs)
        all_txns = []
        for result, src in bank_results:
            meta = result["meta"]
            for txn in result["transactions"]:
                all_txns.append({**txn, "bank": meta.get("bank", ""),
                    "account_type": meta.get("account_type", ""), "source_file": src})
        all_inv = [{"source_file": src, **res} for res, src in invoice_results]
        excel_b64 = base64.b64encode(excel_bytes).decode() if excel_bytes else ""
        return {"bank_transactions": all_txns, "invoices": all_inv, "excel_b64": excel_b64}
    finally:
        for p in tmp_files:
            try: _os.unlink(p)
            except: pass


# ══════════════════════════════════════════════════════════════════════════════
# OPEN BANKING
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/openbanking/status")
def ob_status():
    configured = bool(os.getenv("BASIQ_API_KEY"))
    return {"available": OB_AVAILABLE, "configured": configured}

@app.post("/openbanking/create-user")
def ob_create_user(body: dict=Body(...)):
    if not OB_AVAILABLE: raise HTTPException(503, "Open Banking not available")
    try:
        token = ob_auth.get_access_token()
        return ob_user.create_basiq_user_object(
            token, body.get("email",""), body.get("mobile",""),
            body.get("first_name",""), body.get("last_name",""))
    except Exception as e: raise HTTPException(500, str(e))

@app.get("/openbanking/accounts/{user_id}")
def ob_accounts(user_id: str):
    if not OB_AVAILABLE: raise HTTPException(503, "Open Banking not available")
    try:
        token = ob_auth.get_access_token()
        return ob_job.get_accounts(token, user_id)
    except Exception as e: raise HTTPException(500, str(e))

@app.get("/openbanking/transactions/{user_id}")
def ob_transactions(user_id: str):
    if not OB_AVAILABLE: raise HTTPException(503, "Open Banking not available")
    try:
        token = ob_auth.get_access_token()
        return ob_job.get_transactions(token, user_id)
    except Exception as e: raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
# STOCK / EQUITY TRADING  (integrated in backend/trading/)
# ══════════════════════════════════════════════════════════════════════════════
import tempfile as _tempfile, uuid as _uuid

# The equity module lives at main_app/backend/trading/
# equity_pipeline.py adds that directory to sys.path so shared/equity/output imports resolve.
_EQUITY_DIR        = ROOT / "backend" / "trading"
_trading_module_ok = False
_trading_import_err = ""

try:
    # Pre-insert equity module dir so its internal imports resolve
    _eq_dir_str = str(_EQUITY_DIR)
    if _eq_dir_str not in sys.path:
        sys.path.insert(0, _eq_dir_str)
    from backend.trading.equity_pipeline import run_trading_pipeline, TradingPipelineResult
    from backend.trading.equity.equity_engine import disposals_to_df, income_to_df, summary_to_df
    from backend.trading.output.excel_exporter import export_to_excel
    from backend.trading.shared.local_cost_base_db import ensure_local_db, get_resolution_log
    _trading_module_ok = True
except Exception as _te:
    _trading_import_err = str(_te)


def _stocks_clean(df) -> list:
    if df is None or df.empty: return []
    d = df.copy()
    for c in d.columns:
        d[c] = d[c].apply(lambda x: None if (isinstance(x, float) and pd.isna(x)) else
                          (str(x) if hasattr(x, "strftime") or hasattr(x, "isoformat") else x))
    return d.to_dict(orient="records")


@app.get("/stocks/status")
def stocks_status():
    return {
        "available":   _trading_module_ok,
        "module_root": str(_EQUITY_DIR),
        "error":       _trading_import_err if not _trading_module_ok else None,
    }


@app.post("/stocks/analyze")
async def stocks_analyze(
    files:          List[UploadFile] = File(...),
    financial_year: str              = Form("2024-25"),
):
    """
    Accept one or more broker Excel/CSV files.
    Runs the full HSLedger equity CGT pipeline (FIFO, ATO rules).
    Returns disposals, income, summary, and missing-buy flags.
    """
    if not _trading_module_ok:
        raise HTTPException(503, f"Stock trading module not available: {_trading_import_err}")

    # Write uploads to a temp directory
    tmp_dir = _tempfile.mkdtemp(prefix="accfino_stocks_")
    try:
        for upload in files:
            raw  = await upload.read()
            dest = os.path.join(tmp_dir, upload.filename or f"file_{_uuid.uuid4()}.xlsx")
            with open(dest, "wb") as f:
                f.write(raw)

        local_db = str(_EQUITY_DIR / "data" / "local_cost_base_db.json")
        ensure_local_db(local_db)

        result: TradingPipelineResult = run_trading_pipeline(
            source        = tmp_dir,
            local_db_path = local_db,
            target_fy     = financial_year,
            interactive_missing = False,
        )

        disposals_df = disposals_to_df(result.disposals)
        income_df    = income_to_df(result.income)
        summary_df   = summary_to_df({financial_year: result.summary})

        # Missing buys
        missing = []
        for flag in (result.missing_buys or []):
            missing.append({
                "code":           flag.code,
                "qty_unmatched":  flag.qty_unmatched,
                "disposal_date":  str(flag.disposal_date),
                "broker":         flag.broker,
                "reference":      flag.reference,
                "proceeds_per_unit": flag.proceeds_per_unit,
            })

        return {
            "financial_year":  financial_year,
            "disposals":       _stocks_clean(disposals_df),
            "income":          _stocks_clean(income_df),
            "summary":         _stocks_clean(summary_df),
            "missing_buys":    missing,
            "total_disposals": len(result.disposals),
            "load_report":     result.load_report.__dict__ if result.load_report else {},
        }
    except Exception as e:
        raise HTTPException(500, f"Pipeline failed: {e}")
    finally:
        import shutil as _shutil
        _shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/stocks/export")
async def stocks_export(
    files:          List[UploadFile] = File(...),
    financial_year: str              = Form("2024-25"),
):
    """Run the full pipeline and return a formatted Excel report."""
    if not _trading_module_ok:
        raise HTTPException(503, "Stock trading module not available")

    tmp_dir    = _tempfile.mkdtemp(prefix="accfino_stocks_")
    output_xlsx = os.path.join(tmp_dir, "report.xlsx")
    try:
        for upload in files:
            raw  = await upload.read()
            dest = os.path.join(tmp_dir, upload.filename or f"file_{_uuid.uuid4()}.xlsx")
            with open(dest, "wb") as f:
                f.write(raw)

        local_db = str(_EQUITY_DIR / "data" / "local_cost_base_db.json")
        ensure_local_db(local_db)

        result = run_trading_pipeline(
            source        = tmp_dir,
            output_path   = output_xlsx,
            local_db_path = local_db,
            target_fy     = financial_year,
        )

        if not os.path.exists(output_xlsx):
            # Build it manually via exporter
            export_to_excel(result, output_path=output_xlsx, target_fy=financial_year)

        with open(output_xlsx, "rb") as f:
            content = f.read()

        return Response(
            content    = content,
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers    = {"Content-Disposition": f"attachment; filename=HSLedger_CGT_{financial_year}.xlsx"},
        )
    except Exception as e:
        raise HTTPException(500, f"Export failed: {e}")
    finally:
        import shutil as _shutil
        _shutil.rmtree(tmp_dir, ignore_errors=True)


# ══════════════════════════════════════════════════════════════════════════════
# OPEN BANKING → CSV (normalised, ready for reconciliation)
# ══════════════════════════════════════════════════════════════════════════════
@app.post("/openbanking/fetch-and-normalise")
def ob_fetch_normalise(body: dict = Body(...)):
    """
    Fetch transactions from Open Banking, save as normalised CSV,
    and return rows ready to feed into /reconcile/process.
    Mirrors the original open_banking_connector.py logic.
    """
    if not OB_AVAILABLE:
        raise HTTPException(503, "Open Banking module not available")
    try:
        from backend.open_banking import csv_exporter as ob_csv_exp
        user_id    = body.get("user_id", "")
        account_id = body.get("account_id", "")
        token      = ob_auth.get_access_token()
        txns_raw   = ob_job.get_transactions(token, user_id)
        txns_list  = txns_raw.get("data", []) if isinstance(txns_raw, dict) else txns_raw

        # Normalise to bank_normalizer canonical format
        rows = []
        for t in txns_list:
            amount = float(t.get("amount", 0) or 0)
            rows.append({
                "date":        t.get("postDate") or t.get("valueDate", ""),
                "description": t.get("description") or t.get("narration", ""),
                "debit":       abs(amount) if amount < 0 else 0.0,
                "credit":      amount      if amount > 0 else 0.0,
                "balance":     float(t.get("runningBalance", 0) or 0),
                "bank":        body.get("bank_name", "OpenBanking"),
                "account":     account_id or t.get("accountId", ""),
            })

        # Also save to CSV
        csv_path = str(ROOT / "data" / f"ob_{user_id}_{account_id}.csv")
        pd.DataFrame(rows).to_csv(csv_path, index=False)

        return {"rows": rows, "count": len(rows), "csv_saved": csv_path}
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
# FILE MANAGER — browse main_app/data, read/write files & SQLite tables
# ══════════════════════════════════════════════════════════════════════════════
import csv        as _csv
import math       as _math
import pickle     as _pickle
import sqlite3    as _sqlite3
from urllib.parse import unquote as _unquote
import pandas     as _pd_fm

# _DATA_ROOT is resolved once at import time — absolute, immune to cwd changes
_DATA_ROOT = Path(__file__).parent.joinpath("data").resolve()


def _node_type(p: Path) -> str:
    if p.is_dir():                              return "folder"
    if p.suffix.lower() in (".db", ".sqlite"): return "database"
    return "file"


def _safe_val(v) -> str:
    """Convert any Python value to a clean, JSON-safe string."""
    try:
        if v is None:
            return ""
        if isinstance(v, float) and (_math.isnan(v) or _math.isinf(v)):
            return ""
        s = str(v)
        # Strip null bytes and non-printable control chars (keep newlines as space)
        s = "".join(c if c >= " " or c in "\t" else " " for c in s)
        return s[:500]
    except Exception:
        return ""


def _safe_rows(raw: list, cols: list) -> list:
    """Return list of {col: safe_str} dicts — every value is JSON-safe."""
    str_cols = [str(c) for c in cols]
    result   = []
    for row in raw:
        if isinstance(row, dict):
            result.append({c: _safe_val(row.get(orig)) for c, orig in zip(str_cols, cols)})
        else:
            result.append({c: _safe_val(getattr(row, str(orig), "")) for c, orig in zip(str_cols, cols)})
    return result


def _resolve_path(raw: str) -> Path:
    """
    Decode a URL-encoded relative path, normalise separators,
    resolve to an absolute path inside _DATA_ROOT.
    Raises HTTPException 403 if path escapes DATA_ROOT.
    Raises HTTPException 404 if path does not exist.
    """
    # 1. URL-decode (%20 → space, %2F → /, etc.)
    decoded = _unquote(raw or "")
    # 2. Normalise: forward slashes only, no leading slash
    clean   = decoded.replace("\\", "/").replace("\\\\", "/").strip("/")
    if not clean:
        raise HTTPException(400, "Empty path")
    # 3. Resolve to absolute
    target  = (_DATA_ROOT / clean).resolve()
    # 4. Security: must stay inside DATA_ROOT
    try:
        target.relative_to(_DATA_ROOT)
    except ValueError:
        raise HTTPException(403, f"Access denied: {clean}")
    return target


# ── Tree ──────────────────────────────────────────────────────────────────────

@app.get("/filemanager/tree")
def fm_tree():
    """Return full recursive tree of DATA_ROOT for the file manager."""
    def _walk(base: Path, rel: str) -> list:
        items = []
        try:
            for child in sorted(base.iterdir()):
                rel_path = f"{rel}/{child.name}" if rel else child.name
                node = {
                    "name": child.name,
                    "path": rel_path,          # forward-slash relative path
                    "type": _node_type(child),
                }
                if child.is_dir():
                    node["children"] = _walk(child, rel_path)
                elif child.suffix.lower() in (".db", ".sqlite"):
                    try:
                        cx = _sqlite3.connect(str(child))
                        node["tables"] = [
                            r[0] for r in cx.execute(
                                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
                            ).fetchall()
                        ]
                        cx.close()
                    except Exception:
                        node["tables"] = []
                items.append(node)
        except PermissionError:
            pass
        return items

    if not _DATA_ROOT.exists():
        return {"tree": [], "data_root": str(_DATA_ROOT), "error": "DATA_ROOT does not exist"}

    return {"tree": _walk(_DATA_ROOT, ""), "data_root": str(_DATA_ROOT)}


# ── Read ──────────────────────────────────────────────────────────────────────

@app.get("/filemanager/read/{file_path:path}")
def fm_read(file_path: str, table: str = ""):
    """
    Read a file or SQLite table and return {columns, rows, source}.
    file_path is a URL-encoded, forward-slash relative path from DATA_ROOT.
    All returned values are plain JSON-safe strings.
    """
    target = _resolve_path(file_path)

    if not target.exists():
        raise HTTPException(404, f"File not found: {file_path!r} → {target}")

    ext = target.suffix.lower()

    # ── SQLite table ──────────────────────────────────────────────────────────
    if table and ext in (".db", ".sqlite"):
        try:
            cx   = _sqlite3.connect(str(target))
            cols = [r[1] for r in cx.execute(f"PRAGMA table_info('{table}')").fetchall()]
            if not cols:
                cx.close()
                raise HTTPException(404, f"Table {table!r} not found in {target.name}")
            raw  = [dict(zip(cols, row)) for row in
                    cx.execute(f'SELECT * FROM "{table}" LIMIT 1000').fetchall()]
            cx.close()
            return {"columns": cols, "rows": _safe_rows(raw, cols),
                    "source": f"sqlite · {len(raw)} rows"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"SQLite error: {e}")

    # ── CSV — parse into columns/rows for tabular editing ───────────────────
    if ext == ".csv":
        try:
            import csv as _csv_r, io as _io
            raw_bytes = target.read_bytes()
            if raw_bytes.startswith(b"\xef\xbb\xbf"):
                raw_bytes = raw_bytes[3:]
            text = raw_bytes.decode("utf-8", errors="replace")
            text = text.replace("\r\n", "\n").replace("\r", "\n")
            reader = _csv_r.DictReader(_io.StringIO(text))
            items  = [dict(row) for row in reader]
            cols   = list(reader.fieldnames or (items[0].keys() if items else []))
            rows   = [{c: _safe_val(r.get(c, "")) for c in cols} for r in items[:2000]]
            return {
                "columns": cols,
                "rows":    rows,
                "source":  f"csv · {len(rows)} rows",
            }
        except Exception as e:
            raise HTTPException(500, f"CSV read error: {e}")

    # ── JSON — always tabular ─────────────────────────────────────────────────
    if ext in (".json", ".jsonl"):
        try:
            import json as _j
            raw_bytes = target.read_bytes()
            if raw_bytes.startswith(b"\xef\xbb\xbf"):
                raw_bytes = raw_bytes[3:]
            text = raw_bytes.decode("utf-8", errors="replace")
            if ext == ".jsonl":
                items = [_j.loads(ln) for ln in text.splitlines() if ln.strip()]
            else:
                items = _j.loads(text)
            if isinstance(items, list) and items and isinstance(items[0], dict):
                # Collect all keys across all rows (some rows may have extra keys)
                all_keys = list(dict.fromkeys(k for row in items[:500] for k in row))
                cols = [str(c) for c in all_keys]
                return {"columns": cols, "rows": _safe_rows(items[:500], all_keys),
                        "source": f"json · {len(items)} rows"}
            elif isinstance(items, dict):
                # If values are dicts (e.g. pricing.json), expand into tabular rows
                first_val = next(iter(items.values()), None)
                if isinstance(first_val, dict):
                    all_keys = list(dict.fromkeys(
                        k for v in items.values() if isinstance(v, dict) for k in v
                    ))
                    cols = ["_key"] + all_keys
                    rows = []
                    for k, v in list(items.items())[:500]:
                        if isinstance(v, dict):
                            row = {"_key": _safe_val(k)}
                            row.update({c: _safe_val(v.get(c, "")) for c in all_keys})
                        else:
                            row = {"_key": _safe_val(k), **{c: "" for c in all_keys}}
                        rows.append(row)
                    return {"columns": cols, "rows": rows,
                            "source": f"json · {len(rows)} entries"}
                else:
                    rows = [{"key": _safe_val(k), "value": _safe_val(v)}
                            for k, v in list(items.items())[:500]]
                    return {"columns": ["key", "value"], "rows": rows,
                            "source": f"json · {len(rows)} entries"}
            elif isinstance(items, list):
                rows = [{"#": str(i+1), "value": _safe_val(v)}
                        for i, v in enumerate(items[:500])]
                return {"columns": ["#", "value"], "rows": rows,
                        "source": f"json · {len(items)} items"}
            else:
                return {"columns": ["value"], "rows": [{"value": _safe_val(items)}],
                        "source": "json"}
        except Exception as e:
            raise HTTPException(500, f"JSON read error: {e}")

    # ── Pickle ────────────────────────────────────────────────────────────────
    if ext in (".pkl", ".pickle"):
        try:
            obj = _pd_fm.read_pickle(str(target))
            if isinstance(obj, _pd_fm.DataFrame):
                df   = obj.head(500)
                cols = [str(c) for c in df.columns]
                rows = []
                for _, row in df.iterrows():
                    rows.append({c: _safe_val(v) for c, v in zip(cols, row)})
                return {"columns": cols, "rows": rows,
                        "source": f"pickle · DataFrame {len(df)}r × {len(cols)}c"}
            elif isinstance(obj, dict):
                rows = [{"key": _safe_val(k), "value": _safe_val(v)}
                        for k, v in list(obj.items())[:500]]
                return {"columns": ["key", "value"], "rows": rows, "source": "pickle · dict"}
            elif isinstance(obj, list):
                if obj and isinstance(obj[0], dict):
                    cols = [str(k) for k in obj[0].keys()]
                    return {"columns": cols, "rows": _safe_rows(obj[:500], cols), "source": "pickle · list"}
                rows = [{"#": str(i), "value": _safe_val(v)} for i, v in enumerate(obj[:500])]
                return {"columns": ["#", "value"], "rows": rows, "source": "pickle · list"}
            else:
                return {"columns": ["type", "repr"],
                        "rows": [{"type": type(obj).__name__, "repr": _safe_val(obj)[:2000]}],
                        "source": "pickle"}
        except Exception as e:
            return {"columns": ["error"], "rows": [{"error": f"Cannot read pickle: {e}"}],
                    "source": "pickle · error"}

    # ── PDF ───────────────────────────────────────────────────────────────────
    # Run PDF extraction in a separate subprocess so any crash cannot
    # kill the uvicorn worker process.
    if ext == ".pdf":
        import subprocess, sys, json as _json_pdf
        script = f"""
import sys, json, traceback
try:
    import pdfplumber
    rows = []
    n_pages = 0
    with pdfplumber.open({str(target)!r}) as pdf:
        n_pages = len(pdf.pages)
        for pnum, page in enumerate(pdf.pages[:50], start=1):
            try:
                txt = page.extract_text() or ""
            except Exception:
                txt = ""
            for line in txt.splitlines():
                line = line.strip()
                if line:
                    rows.append({{"page": str(pnum), "text": line[:400]}})
    if not rows:
        rows = [{{"page": "-", "text": "(No extractable text — may be scanned PDF)"}}]
    print(json.dumps({{"ok": True, "rows": rows[:500], "n_pages": n_pages}}))
except Exception as e:
    print(json.dumps({{"ok": False, "error": str(e)[:300]}}))
"""
        try:
            result = subprocess.run(
                [sys.executable, "-c", script],
                capture_output=True, text=True, timeout=30
            )
            out = result.stdout.strip()
            if out:
                data = _json_pdf.loads(out)
                if data.get("ok"):
                    return {
                        "columns": ["page", "text"],
                        "rows":    data["rows"],
                        "source":  f"pdf · {data['n_pages']} page(s) · {target.stat().st_size // 1024} KB",
                        "display": "raw",
                    }
                else:
                    return {
                        "columns": ["error"],
                        "rows":    [{"error": data.get("error", "Unknown PDF error")}],
                        "source":  "pdf · error",
                    }
        except subprocess.TimeoutExpired:
            return {"columns": ["error"], "rows": [{"error": "PDF processing timed out (30s)"}], "source": "pdf"}
        except Exception as e:
            pass

        # Fallback: just show file info
        size_kb = target.stat().st_size // 1024
        return {
            "columns": ["property", "value"],
            "rows": [
                {"property": "filename", "value": target.name},
                {"property": "size",     "value": f"{size_kb} KB"},
                {"property": "note",     "value": "PDF text extraction unavailable"},
            ],
            "source": "pdf · info only",
        }

    # ── Plain text fallback ───────────────────────────────────────────────────
    try:
        raw_bytes = target.read_bytes()
        if raw_bytes.startswith(b"\xef\xbb\xbf"):
            raw_bytes = raw_bytes[3:]
        text  = raw_bytes.decode("utf-8", errors="replace")
        text  = text.replace("\r\n", "\n").replace("\r", "\n")
        lines = text.splitlines()[:1000]
        rows  = [{"#": str(i + 1), "line": _safe_val(ln)} for i, ln in enumerate(lines)]
        return {"columns": ["#", "line"], "rows": rows,
                "source": f"text · {len(rows)} lines"}
    except Exception as e:
        raise HTTPException(500, f"Cannot read file: {e}")


# ── Save ──────────────────────────────────────────────────────────────────────

@app.post("/filemanager/save")
def fm_save(body: dict = Body(...)):
    """Save edited rows back to a CSV file or SQLite table."""
    path   = body.get("path",   "")
    table  = body.get("table",  "")
    rows   = body.get("rows",   [])
    source = body.get("source", "")

    target = _resolve_path(path)

    if "sqlite" in source and table:
        try:
            cx   = _sqlite3.connect(str(target))
            cols = [r[1] for r in cx.execute(f"PRAGMA table_info('{table}')").fetchall()]
            cx.execute(f'DELETE FROM "{table}"')
            for row in rows:
                vals = [row.get(c) for c in cols]
                cx.execute(
                    f'INSERT INTO "{table}" ({",".join(cols)}) VALUES ({",".join(["?"]*len(cols))})',
                    vals
                )
            cx.commit(); cx.close()
            return {"ok": True, "saved": len(rows)}
        except Exception as e:
            raise HTTPException(500, f"SQLite save error: {e}")

    if "csv" in source or target.suffix.lower() == ".csv":
        if not rows:
            return {"ok": True, "saved": 0}
        cols = list(rows[0].keys())
        with open(target, "w", newline="", encoding="utf-8") as f:
            w = _csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader(); w.writerows(rows)
        return {"ok": True, "saved": len(rows)}

    if target.suffix.lower() in (".json", ".jsonl"):
        import json as _js
        if not rows:
            return {"ok": True, "saved": 0}
        if target.suffix.lower() == ".jsonl":
            with open(target, "w", encoding="utf-8") as f:
                for row in rows:
                    f.write(_js.dumps(row) + "\n")
        else:
            with open(target, "w", encoding="utf-8") as f:
                _js.dump(rows, f, indent=2, ensure_ascii=False)
        return {"ok": True, "saved": len(rows)}

    raise HTTPException(400, f"Save not supported for: {source or target.suffix}")


# ── Delete row ────────────────────────────────────────────────────────────────

@app.delete("/filemanager/delete-row")
def fm_delete_row(body: dict = Body(...)):
    """Delete a single row from a SQLite table by primary key."""
    path   = body.get("path",   "")
    table  = body.get("table",  "")
    row_id = body.get("row_id")
    pk_col = body.get("pk_col", "id")

    target = _resolve_path(path)

    if not table:
        raise HTTPException(400, "table is required for row delete")
    try:
        cx = _sqlite3.connect(str(target))
        cx.execute(f'DELETE FROM "{table}" WHERE "{pk_col}" = ?', (row_id,))
        cx.commit(); cx.close()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Delete error: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# LICENCE MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════
from db_app.database import SessionLocal as _SL
from db_app.models.user import User as _User


def _get_db_session():
    db = _SL()
    try:
        yield db
    finally:
        db.close()


# All module keys available for licence assignment
ALL_MODULES = [
    "dashboard", "reconciliation", "trading",
    "cash-flow", "invoice", "admin", "file-manager", "licence"
]

@app.get("/licence/list")
def licence_list():
    """All users with their licence data including module permissions."""
    import json as _json
    db = _SL()
    try:
        # Ensure modules column exists (migration for existing DBs)
        try:
            import sqlite3 as _s3
            from db_app.database import _DB_FILE as _dbf
            _dbf_str = str(_dbf)
            cx = _s3.connect(_dbf_str)
            cols = [r[1] for r in cx.execute("PRAGMA table_info(licence_records)").fetchall()]
            if "modules" not in cols:
                cx.execute("ALTER TABLE licence_records ADD COLUMN modules VARCHAR(1000) DEFAULT ''")
                cx.commit()
            cx.close()
        except Exception as _me:
            print(f"[licence] migration warning: {_me}")

        users = db.query(_User).all()
        result = []
        for u in users:
            lic = db.query(LicenceRecord).filter(LicenceRecord.user_id == u.id).first()
            # Parse modules — empty = base plan (dashboard + reconciliation)
            BASE_MODULES = ["dashboard", "reconciliation"]
            raw_mods = (lic.modules if lic and lic.modules else "")
            try:
                mods = _json.loads(raw_mods) if raw_mods and raw_mods.strip().startswith('[') else BASE_MODULES[:]
            except Exception:
                mods = BASE_MODULES[:]
            # Remove admin-only modules from user view
            mods = [m for m in mods if m not in ('admin', 'file-manager', 'licence')]
            result.append({
                "user_id":      u.id,
                "username":     u.username,
                "full_name":    u.full_name or "",
                "email":        u.email,
                "roles":        [r.name for r in u.roles],
                "licence_id":   lic.id           if lic else None,
                "licence_type": lic.licence_type if lic else "demo",
                "payment_mode": lic.payment_mode if lic else "",
                "start_date":   lic.start_date   if lic else "",
                "end_date":     lic.end_date     if lic else "",
                "notes":        lic.notes        if lic else "",
                "modules":      mods,
            })
        return result
    finally:
        db.close()


@app.get("/licence/my-modules")
def my_modules(user_id: int):
    """Return list of module keys the user is allowed to access."""
    import json as _json
    BASE_MODULES = ["dashboard", "reconciliation"]
    db = _SL()
    try:
        user = db.query(_User).filter(_User.id == user_id).first()
        if not user:
            return {"modules": BASE_MODULES}
        # Admins always get all modules
        if any(r.name == "admin" for r in user.roles):
            return {"modules": ALL_MODULES}
        lic = db.query(LicenceRecord).filter(LicenceRecord.user_id == user_id).first()
        if not lic or not lic.modules:
            return {"modules": BASE_MODULES}
        try:
            mods = _json.loads(lic.modules)
            if not mods:
                return {"modules": BASE_MODULES}
            # Remove admin-only modules
            mods = [m for m in mods if m not in ('admin', 'file-manager', 'licence')]
            return {"modules": mods}
        except Exception:
            return {"modules": BASE_MODULES}
    finally:
        db.close()


@app.post("/licence/save")
def licence_save(body: dict = Body(...)):
    """Create or update a licence record for a user including module permissions."""
    import json as _json
    db = _SL()
    try:
        user_id = body.get("user_id")
        if not user_id:
            raise HTTPException(400, "user_id required")
        lic = db.query(LicenceRecord).filter(LicenceRecord.user_id == user_id).first()
        if not lic:
            lic = LicenceRecord(user_id=user_id)
            db.add(lic)
        lic.licence_type = body.get("licence_type", "demo")
        lic.payment_mode = body.get("payment_mode", "")
        lic.start_date   = body.get("start_date",   "")
        lic.end_date     = body.get("end_date",     "")
        lic.notes        = body.get("notes",        "")
        mods = body.get("modules", ALL_MODULES)
        lic.modules      = _json.dumps(mods)
        db.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))
    finally:
        db.close()


@app.delete("/licence/user/{user_id}")
def licence_delete_user(user_id: int):
    """Delete a user and their licence record.
    SQLite does not enforce FK cascades unless PRAGMA foreign_keys=ON,
    so we manually delete related rows first.
    """
    import sqlite3 as _s3
    from db_app.database import _DB_FILE as _dbf
    try:
        cx = _s3.connect(str(_dbf))
        cx.execute("PRAGMA foreign_keys = ON")
        # Check user exists
        row = cx.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            cx.close()
            raise HTTPException(404, "User not found")
        # Delete related rows in correct order
        cx.execute("DELETE FROM user_roles WHERE user_id=?",        (user_id,))
        cx.execute("DELETE FROM licence_records WHERE user_id=?",   (user_id,))
        cx.execute("DELETE FROM password_reset_tokens WHERE user_id=?", (user_id,))
        cx.execute("DELETE FROM transactions WHERE user_id=?",      (user_id,))
        cx.execute("DELETE FROM users WHERE id=?",                   (user_id,))
        cx.commit()
        cx.close()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Delete failed: {e}")


@app.patch("/licence/user/{user_id}")
def licence_update_user(user_id: int, body: dict = Body(...)):
    """Update user details (username, email, full_name)."""
    db = _SL()
    try:
        user = db.query(_User).filter(_User.id == user_id).first()
        if not user:
            raise HTTPException(404, "User not found")
        if "username"  in body: user.username  = body["username"]
        if "email"     in body: user.email     = body["email"]
        if "full_name" in body: user.full_name = body["full_name"]
        db.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))
    finally:
        db.close()

# ══════════════════════════════════════════════════════════════════════════════
# PRICING MANAGEMENT — admin editable pricing from JSON file
# ══════════════════════════════════════════════════════════════════════════════
_PRICING_FILE = Path(__file__).parent / "data" / "pricing.json"

def _load_pricing() -> dict:
    """Load pricing from JSON file, fall back to payments.py PLANS if missing."""
    if _PRICING_FILE.exists():
        try:
            return json.loads(_PRICING_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    # Fallback to payments.py PLANS
    try:
        from db_app.api.payments import PLANS
        return PLANS
    except Exception:
        return {}

def _save_pricing(data: dict):
    _PRICING_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PRICING_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

@app.get("/pricing/plans")
def pricing_get():
    """Public — return all plan definitions."""
    return _load_pricing()

@app.post("/pricing/plans")
def pricing_save(body: dict = Body(...)):
    """Admin — save full pricing config."""
    _save_pricing(body)
    return {"ok": True}

@app.patch("/pricing/plans/{plan_id}")
def pricing_update_plan(plan_id: str, body: dict = Body(...)):
    """Admin — update a single plan's pricing fields."""
    data = _load_pricing()
    if plan_id not in data:
        raise HTTPException(404, f"Plan {plan_id!r} not found")
    data[plan_id].update(body)
    _save_pricing(data)
    return {"ok": True, "plan": data[plan_id]}

# ── Strip /api prefix middleware ──────────────────────────────────────────────
# In production the React frontend calls /api/banks, /api/sessions etc.
# This middleware strips the /api prefix before FastAPI processes the request.
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as _SReq

class StripApiPrefix(BaseHTTPMiddleware):
    async def dispatch(self, request: _SReq, call_next):
        scope = request.scope
        path  = scope.get("path", "")
        if path.startswith("/api/"):
            new_path          = path[4:]          # "/api/banks" → "/banks"
            scope["path"]     = new_path
            # raw_path must include query string for ASGI compliance
            qs = scope.get("query_string", b"")
            scope["raw_path"] = (new_path + ("?" + qs.decode() if qs else "")).encode()
        elif path == "/api":
            scope["path"]     = "/"
            scope["raw_path"] = b"/"
        # All other paths (/, /assets/*, /dashboard, etc.) pass through unchanged
        return await call_next(request)

app.add_middleware(StripApiPrefix)

# ── Serve React SPA + Marketing Site ─────────────────────────────────────────
# Registered LAST so all /api/* routes take priority.
#
# URL routing:
#   /                        → index-marketing.html  (public marketing site)
#   /login, /reset-password  → index.html            (React SPA — public)
#   /upgrade                 → index.html            (React SPA — public)
#   /dashboard, /reconciliation, /trading, etc.
#                            → index.html            (React SPA — auth guarded)
#   /assets/*                → StaticFiles           (JS / CSS / images)
# ─────────────────────────────────────────────────────────────────────────────
from fastapi.staticfiles import StaticFiles
from fastapi.responses   import FileResponse as _FileResponse

_ROOT       = Path(__file__).parent.parent          # project root
_DIST       = _ROOT / "react_frontend" / "dist"
_PUBLIC     = _ROOT / "react_frontend" / "public"   # Vite public folder (dev mode)

# Marketing page: prefer built dist/, fall back to source public/ (local dev)
_MARKETING  = _DIST / "index-marketing.html" if (_DIST / "index-marketing.html").exists()               else _PUBLIC / "index-marketing.html"
_APP_INDEX  = _DIST / "index.html"


def _serve_marketing():
    """Return the public marketing homepage with pricing pre-injected.
    Works in both dev mode (serves from react_frontend/public/)
    and production (serves from react_frontend/dist/).
    """
    if not _MARKETING.exists():
        return {"error": "Marketing page not found. Check react_frontend/public/index-marketing.html"}
    import json as _json_mkt
    from fastapi.responses import HTMLResponse as _HTMLResponse
    html = _MARKETING.read_text(encoding="utf-8")
    # Pre-inject pricing so cards render instantly — no fetch round-trip
    try:
        pricing = _load_pricing()
        pricing_json = _json_mkt.dumps(pricing, ensure_ascii=False)
        inject = f'''<script>
// Pricing pre-loaded server-side — no fetch needed
window.__ACCFINO_PRICING__ = {pricing_json};
</script>'''
        html = html.replace("</head>", inject + "\n</head>", 1)
    except Exception:
        pass  # Fall back to client-side fetch if inject fails
    return _HTMLResponse(content=html, status_code=200)


def _serve_app() -> _FileResponse:
    """Return the React SPA shell (only available after npm run build)."""
    if _APP_INDEX.exists():
        return _FileResponse(str(_APP_INDEX))
    return {"error": "React app not built. Run: cd react_frontend && npm run build"}


# ── Marketing page — served at /index-marketing.html ─────────────────────────
# "/" is intentionally NOT mapped here — React Router owns it.
# In dev mode Vite serves index.html at "/" via SPA fallback.
# In prod mode FastAPI serves index.html at "/" via spa_routes below.
@app.get("/index-marketing.html", include_in_schema=False)
def marketing_html():
    return _serve_marketing()

# ── Static assets (only available in production after npm run build) ──────────
if _DIST.exists() and (_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")


# ── Legal document routes ─────────────────────────────────────────────────────
_LEGAL_DIR = _ROOT / "main_app" / "data" / "legal_documents"

LEGAL_DOCS = {
    "terms-of-service":         "terms_of_service.pdf",
    "privacy-policy":           "privacy_policy.pdf",
    "acceptable-use-policy":    "acceptable_use_policy.pdf",
    "subscription-refund-policy": "subscription_refund_policy.pdf",
    "cookie-policy":            "cookie_policy.pdf",
    "disclaimer":               "disclaimer.pdf",
}

@app.get("/legal/{doc_name}", include_in_schema=False)
def serve_legal_doc(doc_name: str):
    from fastapi.responses import FileResponse as _FR
    filename = LEGAL_DOCS.get(doc_name)
    if not filename:
        raise HTTPException(404, "Document not found")
    path = _LEGAL_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Document file not found")
    return _FR(str(path), media_type="application/pdf",
               headers={"Content-Disposition": f"inline; filename={filename}"})

@app.get("/legal", include_in_schema=False)
def legal_index():
    from fastapi.responses import JSONResponse
    return JSONResponse({"documents": list(LEGAL_DOCS.keys())})

# ── Root "/" → marketing home page (top of page) ─────────────────────────────
@app.get("/", include_in_schema=False)
def root():
    return _serve_marketing()

# ── SPA routes (only available in production; in dev Vite handles these) ──────
if _DIST.exists() and _APP_INDEX.exists():

    # Public SPA routes (no auth required)
    @app.get("/login",          include_in_schema=False)
    @app.get("/reset-password", include_in_schema=False)
    @app.get("/upgrade",        include_in_schema=False)
    def public_spa_routes():
        return _serve_app()

    # Authenticated SPA routes
    @app.get("/dashboard",      include_in_schema=False)
    @app.get("/reconciliation", include_in_schema=False)
    @app.get("/trading",        include_in_schema=False)
    @app.get("/cash-flow",      include_in_schema=False)
    @app.get("/invoice",        include_in_schema=False)
    @app.get("/admin",          include_in_schema=False)
    @app.get("/file-manager",   include_in_schema=False)
    @app.get("/licence",        include_in_schema=False)
    @app.get("/pricing-admin",  include_in_schema=False)
    def auth_spa_routes():
        return _serve_app()

    # Catch-all for deep SPA paths
    @app.get("/{spa_path:path}", include_in_schema=False)
    def spa_fallback(spa_path: str = ""):
        return _serve_app()
