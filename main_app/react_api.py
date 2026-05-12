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
from backend.transaction_classifier.transaction_classify import (
    classify_transaction, load_models, load_rdr_rules
)

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

# ── api_app carries all routes, mounted at /api on the root app ──────────────
# Dev:  Vite proxy rewrites /api → :8001 (strips prefix)
# Prod: built React SPA is served by this same process; all XHR goes to /api/…
api_app = FastAPI(title="Accfino API", version="2.0")

_extra_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
api_app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000","http://127.0.0.1:3000",
                   "http://localhost:5173","http://127.0.0.1:5173"] + _extra_origins,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

api_app.include_router(db_auth.router,         prefix="/auth",        tags=["auth"])
api_app.include_router(db_transactions.router, prefix="/transactions", tags=["transactions"])
api_app.include_router(db_invoice.router,      prefix="/invoice",      tags=["invoice"])

# Root app: mounts the API sub-app and serves the React SPA
app = FastAPI(title="Accfino", docs_url=None, redoc_url=None)
app.mount("/api", api_app)

# ── Serve built React SPA in production ──────────────────────────────────────
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse as _FileResponse

_DIST = ROOT.parent / "react_frontend" / "dist"
if _DIST.exists():
    if (_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/", include_in_schema=False)
    @app.get("/{spa_path:path}", include_in_schema=False)
    def spa_fallback(spa_path: str = ""):
        """Return index.html for all non-API paths so React Router works."""
        index = _DIST / "index.html"
        if index.exists():
            return _FileResponse(str(index))
        return {"error": "Frontend not built — run: cd react_frontend && npm run build"}

_cf_cache: dict = {}


# ── GST normalization (from original normalize_gst_category) ──────────────────
_GST_ALIASES = {
    "gst on expenses": "GST on Purchase",
    "gst on income":   "GST on Sale",
    "gst on capital":  "GST on Purchase",
    "gst free expenses": "GST Free Sale",
    "gst free income":   "GST Free Sale",
    "bas excluded":    "BAS Excluded",
    "input taxed":     "Input Taxed Sales",
    "interest":        "Interest Income",
}

def normalize_gst_category(value) -> str:
    text = "" if pd.isna(value) else str(value).strip()
    if not text: return "Unknown"
    for option in GST_CATEGORY_OPTIONS:
        if option.lower() == text.lower(): return option
    for alias, canonical in _GST_ALIASES.items():
        if alias in text.lower(): return canonical
    return "Unknown"

def normalize_gl_account(value) -> str:
    text = "" if pd.isna(value) else str(value).strip()
    if not text: return ""
    for option in CATEGORY_ENUM:
        if option.lower() == text.lower(): return option
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
        "account":      "Account",
        "description":  "Description",
        "debit":        "Debit",
        "credit":       "Credit",
        "classification": "Classification",
        "pairid":       "PairID",
        "GL Account":   "GL Account",   # already correct
        "GST":          "GST",
        "GST Category": "GST Category",
        "Who":          "Who",
        "Month":        "Month",
        "Year":         "Year",
        # snake_case variants
        "gl_account":   "GL Account",
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
        "Date": "date", "Bank": "bank", "Account": "account",
        "Description": "description", "Debit": "debit", "Credit": "credit",
        "Classification": "classification", "PairID": "pairid",
        "GL Account": "gl_account", "GST": "gst",
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
@api_app.get("/banks")
def get_banks(): return sorted(BANK_PRESETS.keys())

@api_app.get("/gst/categories")
def get_gst_cats(): return GST_CATEGORY_OPTIONS

@api_app.get("/gl/accounts")
def get_gl_accounts(): return CATEGORY_ENUM + [""]

@api_app.get("/gst/calculate")
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

@api_app.get("/sessions")
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

@api_app.delete("/sessions/{username}/{sid}")
def del_session(username: str, sid: str):
    return {"ok": session_manager.delete_session(norm_username(username), sid)}

@api_app.get("/sessions/{username}/{sid}")
def get_session(username: str, sid: str):
    username = norm_username(username)
    d = session_manager.load_session_data(username, sid)
    if not d: raise HTTPException(404, "Session not found")

    txns = []
    monthly = []
    if d.get("results") is not None and not d["results"].empty:
        df = _norm_cols(d["results"].copy())
        # Ensure all required columns exist
        for col, default in [("GL Account",""),("GST Category","Unknown"),("GST",0.0),("Who",""),("PairID","")]:
            if col not in df.columns: df[col] = default
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

@api_app.post("/sessions/save")
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
@api_app.post("/reconcile/process")
async def reconcile_process(
    files: List[UploadFile]=File(...),
    bank_names: List[str]=Form(...),
    account_numbers: List[str]=Form(...),
    username: str=Form(...),
):
    normed = []
    # Track filenames per (bank, account) as we read — files can only be read once
    _acc_files: dict = {}   # (bank, account) -> [filename, ...]
    for i, upload in enumerate(files):
        bank    = bank_names[i]      if i < len(bank_names)      else "Unknown"
        account = account_numbers[i] if i < len(account_numbers) else "Unknown"
        fname   = upload.filename or f"file_{i}.csv"
        _acc_files.setdefault((bank, account), []).append(fname)
        try:
            df = pd.read_csv(io.BytesIO(await upload.read()))
            normed.append(normalize_transactions(df, bank, account))
        except Exception as e:
            logger.warning(f"Skip {upload.filename}: {e}")
    if not normed: raise HTTPException(400, "No valid CSVs")

    combined = pd.concat(normed, ignore_index=True)
    combined.columns = combined.columns.str.strip().str.lower()
    classified = rec_classifier.classify_transactions(combined, show_progress=False)
    classified = _norm_cols(classified)

    # Ensure all columns match original schema
    for col, default in [("GL Account",""),("GST Category","Unknown"),("GST",0.0),("Who",""),("PairID","")]:
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
        {"bank_name": bank, "account_number": account, "files": fnames}
        for (bank, account), fnames in _acc_files.items()
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
    Replicates classify_gl_and_gst_for_session() from render_output_ui.py exactly.
    Uses ML models if available, falls back gracefully if not.
    """
    if "Description" not in df.columns: return df

    if "GL Account"   not in df.columns: df["GL Account"]   = ""
    if "GST Category" not in df.columns: df["GST Category"] = "Unknown"
    if "GST"          not in df.columns: df["GST"]          = 0.0
    if "Who"          not in df.columns: df["Who"]           = ""

    # Check if models exist
    models_available = (
        (DEFAULT_MODEL_DIR / "category_classifier.pkl").exists() and
        (DEFAULT_MODEL_DIR / "gst_category_classifier.pkl").exists()
    )

    def _to_float(v):
        parsed = pd.to_numeric(v, errors="coerce")
        return float(parsed) if pd.notnull(parsed) else 0.0

    # Build deduped prediction cache
    prediction_by_key = {}
    if models_available:
        try:
            load_models()
            seen = set()
            for idx in df.index:
                desc   = str(df.at[idx, "Description"]) if pd.notnull(df.at[idx, "Description"]) else ""
                if not desc.strip(): continue
                debit  = _to_float(df.at[idx, "Debit"]  if "Debit"  in df.columns else 0)
                credit = _to_float(df.at[idx, "Credit"] if "Credit" in df.columns else 0)
                key = (desc, debit, credit)
                if key not in seen:
                    seen.add(key)
                    try:
                        prediction_by_key[key] = classify_transaction(desc, debit=debit, credit=credit)
                    except Exception:
                        prediction_by_key[key] = {}
        except Exception:
            models_available = False

    for idx in df.index:
        desc  = str(df.at[idx, "Description"]) if pd.notnull(df.at[idx, "Description"]) else ""
        cl    = str(df.at[idx, "Classification"]) if "Classification" in df.columns and pd.notnull(df.at[idx, "Classification"]) else ""

        # Internal transfers: always Transfer / BAS Excluded / 0 GST (original logic)
        if "Internal" in cl:
            existing_gl = normalize_gl_account(df.at[idx, "GL Account"])
            if existing_gl == "":
                df.at[idx, "GL Account"] = "Transfer"
            if normalize_gst_category(df.at[idx, "GST Category"]) != "BAS Excluded":
                df.at[idx, "GST Category"] = "BAS Excluded"
                df.at[idx, "GST"] = 0.0
            df.at[idx, "Who"] = extract_who_bank(desc)
            continue

        if not desc.strip(): continue

        debit  = _to_float(df.at[idx, "Debit"]  if "Debit"  in df.columns else 0)
        credit = _to_float(df.at[idx, "Credit"] if "Credit" in df.columns else 0)
        key = (desc, debit, credit)

        prediction     = prediction_by_key.get(key, {})
        normalized_gl  = normalize_gl_account(prediction.get("gl_account", ""))
        normalized_gst = normalize_gst_category(prediction.get("gst_category", "Unknown"))

        existing_gl  = normalize_gl_account(df.at[idx, "GL Account"])
        existing_gst = normalize_gst_category(df.at[idx, "GST Category"])

        # Only fill empty values (preserve manual edits)
        if existing_gl == "" and normalized_gl:
            df.at[idx, "GL Account"] = normalized_gl

        if existing_gst == "Unknown" and normalized_gst and normalized_gst != "Unknown":
            df.at[idx, "GST Category"] = normalized_gst
            df.at[idx, "GST"] = calculate_gst_value(debit, credit, normalized_gst)

        # Extract who from description
        df.at[idx, "Who"] = extract_who_bank(desc)

    return df


class ClassifyReq(BaseModel):
    session_id: str; username: str

@api_app.post("/reconcile/classify")
def reconcile_classify(body: ClassifyReq):
    username = norm_username(body.username)
    d = session_manager.load_session_data(username, body.session_id)
    if not d or d.get("results") is None:
        raise HTTPException(404, "Session not found")

    df = _norm_cols(d["results"].copy())
    df = _run_classify_gl(df)
    monthly = _build_monthly_summary(df)
    session_manager.save_output_data(username, body.session_id, df, {}, set(), 1)
    return {"transactions": _to_frontend(df), "monthly_summary": monthly}


class ExportReq(BaseModel):
    transactions: list

@api_app.post("/reconcile/export")
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
@api_app.get("/dashboard/stats")
def dashboard_stats(username: str):
    """
    Aggregate totals across ALL reconciliation sessions for this user.
    Does NOT require Save-to-DB — reads session pickle files directly.
    """
    username = norm_username(username)
    sessions = session_manager.get_all_sessions(username)
    totals = {
        "total_in":   0.0,
        "total_out":  0.0,
        "total_gst":  0.0,
        "internal":   0,
        "incoming":   0,
        "outgoing":   0,
        "txn_count":  0,
    }

    for s in sessions:
        if not s.get("has_results"):
            continue
        try:
            d = session_manager.load_session_data(username, s["session_id"])
            df = d.get("results")
            if df is None or df.empty:
                continue
            # Normalise column names
            df = _norm_cols(df)
            for _, row in df.iterrows():
                cl = str(row.get("Classification") or row.get("classification") or "")
                db = float(row.get("Debit",0) or row.get("debit",0) or 0)
                cr = float(row.get("Credit",0) or row.get("credit",0) or 0)
                gst= float(row.get("GST",0)   or row.get("gst",0)   or 0)
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
        except Exception:
            continue

    totals["net"] = totals["total_in"] - totals["total_out"]
    totals["session_count"] = len(sessions)
    return totals

# ══════════════════════════════════════════════════════════════════════════════
# TRADING
# ══════════════════════════════════════════════════════════════════════════════
@api_app.post("/trading/analyze")
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

@api_app.post("/trading/export")
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
@api_app.post("/cashflow/detect")
async def cf_detect(file: UploadFile=File(...)):
    df = pd.read_csv(io.BytesIO(await file.read()))
    detected = auto_detect_columns(df)
    cols = [c for c in df.columns if not c.startswith("_")]
    rows = df.to_dict(orient="records")
    return {"detected": detected, "columns": cols, "row_count": len(df),
            "sample": df.head(5).to_dict(orient="records"), "rows": rows}

class CfRunReq(BaseModel):
    rows: list; col_map: dict

@api_app.post("/cashflow/run")
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

@api_app.post("/cashflow/predict/{run_id}")
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

@api_app.get("/ml/status")
def ml_status():
    return {
        "category_model": (DEFAULT_MODEL_DIR / "category_classifier.pkl").exists(),
        "gst_model": (DEFAULT_MODEL_DIR / "gst_category_classifier.pkl").exists(),
    }

@api_app.get("/ml/sample-csv")
def ml_sample():
    return Response(content=SAMPLE_CSV, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=sample_training_data.csv"})

@api_app.post("/ml/train")
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

@api_app.get("/rdr/rules")
def rdr_list(): return _load_rdr()

@api_app.post("/rdr/rules")
def rdr_create(rule: dict=Body(...)):
    rules = _load_rdr()
    rule.setdefault("id", f"rule_{int(datetime.now().timestamp()*1000)}")
    # Ensure correct field names matching transaction_classify.py
    # "then" = GL account string, "then_gst_category" = GST string
    rules.append(rule); _save_rdr(rules)
    # Force reload
    load_rdr_rules(force_reload=True)
    return rule

@api_app.put("/rdr/rules/{rule_id}")
def rdr_update(rule_id: str, rule: dict=Body(...)):
    rules = _load_rdr()
    for i, r in enumerate(rules):
        if r.get("id") == rule_id:
            rules[i] = {**r, **rule, "id": rule_id}
            _save_rdr(rules); load_rdr_rules(force_reload=True)
            return rules[i]
    raise HTTPException(404, "Rule not found")

@api_app.delete("/rdr/rules/{rule_id}")
def rdr_delete(rule_id: str):
    rules = [r for r in _load_rdr() if r.get("id") != rule_id]
    _save_rdr(rules); load_rdr_rules(force_reload=True)
    return {"ok": True}

@api_app.post("/rdr/test")
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
@api_app.get("/invoice-extractor/status")
def ie_status():
    if not IE_AVAILABLE: return {"available": False, "reason": "Module not installed"}
    try: return {"available": True, **get_dependency_status()}
    except Exception as e: return {"available": False, "reason": str(e)}

@api_app.post("/invoice-extractor/process")
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
@api_app.get("/openbanking/status")
def ob_status():
    configured = bool(os.getenv("BASIQ_API_KEY"))
    return {"available": OB_AVAILABLE, "configured": configured}

@api_app.post("/openbanking/create-user")
def ob_create_user(body: dict=Body(...)):
    if not OB_AVAILABLE: raise HTTPException(503, "Open Banking not available")
    try:
        token = ob_auth.get_access_token()
        return ob_user.create_basiq_user_object(
            token, body.get("email",""), body.get("mobile",""),
            body.get("first_name",""), body.get("last_name",""))
    except Exception as e: raise HTTPException(500, str(e))

@api_app.get("/openbanking/accounts/{user_id}")
def ob_accounts(user_id: str):
    if not OB_AVAILABLE: raise HTTPException(503, "Open Banking not available")
    try:
        token = ob_auth.get_access_token()
        return ob_job.get_accounts(token, user_id)
    except Exception as e: raise HTTPException(500, str(e))

@api_app.get("/openbanking/transactions/{user_id}")
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


@api_app.get("/stocks/status")
def stocks_status():
    return {
        "available":   _trading_module_ok,
        "module_root": str(_EQUITY_DIR),
        "error":       _trading_import_err if not _trading_module_ok else None,
    }


@api_app.post("/stocks/analyze")
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


@api_app.post("/stocks/export")
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
@api_app.post("/openbanking/fetch-and-normalise")
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
