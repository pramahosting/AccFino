"""
backend/reconciliation/classifier.py
─────────────────────────────────────
classify_transactions(df) → annotated DataFrame

Responsibilities
  1. Resolve ambiguous rows (both debit+credit non-zero)
  2. Match internal transfers across accounts (pair-id tagging)
  3. Classify every remaining row in one vectorised call via engine.classify_df
  4. Add Month, Year columns
"""

from __future__ import annotations

import itertools
from pathlib import Path
from typing import Optional

import pandas as pd

try:
    import streamlit as st
    _ST = True
except Exception:
    _ST = False

from backend.classifier.engine import classify_df, warm as _warm

_TRANSFER_KW = [
    "transfer","trf","tfr","internet transfer","inter-bank","interbank",
    "funds transfer","bank transfer","direct transfer","telegraphic","wire",
    "remittance","remit","bpay transfer","online transfer","account transfer",
    "internal transfer","own account","self transfer","sweep","redraw",
    "linked account",
    # FIX 6: directional patterns were being missed
    "transfer to","transfer from","tfr to","tfr from","trf to","trf from",
    "fast transfer","osko","pay anyone","ib transfer",
]
_EXCLUDE_KW = [
    "salary","wages","payroll","pay run","payg","superannuation","super",
    "dividend","invoice","bill payment","direct debit","insurance","mortgage",
    "loan repayment","subscription","direct credit","ato ","tax payment",
    "council ","rent ","lease ","refund",
]


class _NoOp:
    def progress(self, *a, **kw): pass
    def empty(self): pass


def _is_transfer(desc: str) -> bool:
    dl = desc.lower()
    if any(k in dl for k in _EXCLUDE_KW):
        return False
    return any(k in dl for k in _TRANSFER_KW)


import re as _re

def _extract_who(desc: str) -> str:
    """FIX 6: Extract To/From counterparty from transfer description.
    'Transfer to SAVINGS 12345' -> 'To: SAVINGS 12345'
    'TFR FROM CBA 9999'         -> 'From: CBA 9999'
    """
    m = _re.search(r"\b(?:transfer|tfr|trf)\s+to\s+([\w\s]{2,30})", desc, _re.IGNORECASE)
    if m: return f"To: {m.group(1).strip()}"
    m = _re.search(r"\b(?:transfer|tfr|trf)\s+from\s+([\w\s]{2,30})", desc, _re.IGNORECASE)
    if m: return f"From: {m.group(1).strip()}"
    return ""


def _parse_date(v):
    return pd.to_datetime(v, dayfirst=True, errors="coerce")


def _round2(v) -> float:
    try:
        return round(float(v), 2)
    except Exception:
        return 0.0


def classify_transactions(
    df:            pd.DataFrame,
    account_id:    str            = "__default__",
    coa_path:      Optional[Path] = None,
    show_progress: bool            = True,
) -> pd.DataFrame:
    """
    Full reconciliation pipeline:
      1. Normalise columns
      2. Resolve ambiguous debit+credit rows
      3. Match internal transfers (pair IDs)
      4. Classify remaining rows (GL / GST category / GST amount)
      5. Add Month, Year columns

    Returns the annotated DataFrame.
    """
    df = df.copy()
    df.columns = df.columns.str.strip().str.lower()
    df = df.reset_index(drop=True)

    df["debit"]  = pd.to_numeric(df.get("debit",  0), errors="coerce").fillna(0.0)
    df["credit"] = pd.to_numeric(df.get("credit", 0), errors="coerce").fillna(0.0)

    # ── 1. Resolve ambiguous rows ────────────────────────────────────────
    def _resolve(row):
        d, c = row.get("debit", 0), row.get("credit", 0)
        if not (d > 0 and c > 0):
            return row
        desc = str(row.get("description", "")).lower()
        if any(k in desc for k in ["transfer to","payment","card","bill","invoice"]):
            row["debit"], row["credit"] = d, 0
        elif any(k in desc for k in ["direct credit","salary","refund","fast transfer from"]):
            row["debit"], row["credit"] = 0, c
        else:
            row["debit"], row["credit"] = d, 0
        return row

    df = df.apply(_resolve, axis=1)

    # ── Initialise output columns ────────────────────────────────────────
    df["classification"] = None
    df["pairid"]         = None
    df["GL Account"]     = ""
    df["GL Type"]        = ""
    df["GST"]            = 0.0
    df["GST Category"]   = ""

    pair_counter    = itertools.count(1)
    matched_debits  = set()
    matched_credits = set()

    # ── 2. Internal transfer matching ────────────────────────────────────
    # NOTE: use df.index directly — avoids itertuples() _-prefix attribute
    # bug where pandas silently renames columns starting with underscore.
    pb = _NoOp()
    if show_progress and _ST:
        try:
            pb = st.progress(0, text="Matching internal transfers…")
        except Exception:
            pass

    has_date = "date" in df.columns
    has_bank = "bank" in df.columns
    has_acct = "account" in df.columns
    has_desc = "description" in df.columns

    debit_by_amt:  dict = {}
    credit_by_amt: dict = {}

    for idx in df.index:
        d    = _round2(df.at[idx, "debit"])
        c    = _round2(df.at[idx, "credit"])
        desc = str(df.at[idx, "description"]) if has_desc else ""
        dt   = _parse_date(df.at[idx, "date"])  if has_date else pd.NaT
        bank = str(df.at[idx, "bank"])           if has_bank else ""
        acct = str(df.at[idx, "account"])        if has_acct else ""

        if d > 0:
            debit_by_amt.setdefault(d, []).append((idx, dt, bank, acct, desc))
        if c > 0:
            credit_by_amt.setdefault(c, []).append((idx, dt, bank, acct, desc))

    MAX_DAYS = 5

    for amount in sorted(debit_by_amt):
        if amount not in credit_by_amt:
            continue

        debits = sorted(
            [x for x in debit_by_amt[amount]  if x[0] not in matched_debits],
            key=lambda x: x[1] if pd.notnull(x[1]) else pd.Timestamp.max,
        )
        credits = sorted(
            [x for x in credit_by_amt[amount] if x[0] not in matched_credits],
            key=lambda x: x[1] if pd.notnull(x[1]) else pd.Timestamp.max,
        )
        if not debits or not credits:
            continue

        scores = []
        for i, (di, ddt, dbk, dac, dds) in enumerate(debits):
            for j, (ci, cdt, cbk, cac, cds) in enumerate(credits):
                if dac == cac and dbk == cbk:
                    continue
                if pd.isna(ddt) or pd.isna(cdt):
                    continue
                day_diff = abs((ddt - cdt).days)
                if day_diff > MAX_DAYS:
                    continue
                if not _is_transfer(dds) or not _is_transfer(cds):
                    continue
                sc = (MAX_DAYS - day_diff) * 10
                if dbk != cbk:
                    sc += 5
                dl, cl = dds.lower(), cds.lower()
                if dac.lower() in cl or cac.lower() in dl:
                    sc += 20
                if dbk.lower() in cl or cbk.lower() in dl:
                    sc += 10
                scores.append((sc, i, j, di, ci))

        scores.sort(key=lambda x: -x[0])
        used_d, used_c = set(), set()
        for sc, i, j, di, ci in scores:
            if i in used_d or j in used_c:
                continue
            if di in matched_debits or ci in matched_credits:
                continue
            pid = f"PAIR{next(pair_counter):05d}"
            df.loc[int(di), ["classification", "pairid"]] = ["🟢Internal", pid]
            df.loc[int(ci), ["classification", "pairid"]] = ["🟢Internal", pid]
            matched_debits.add(int(di))
            matched_credits.add(int(ci))
            used_d.add(i); used_c.add(j)

    pb.progress(1.0, text="Transfer matching complete ✅")

    # ── 3. Classify non-internal rows via engine ─────────────────────────
    mask = df["classification"].isna()

    if mask.any():
        _warm(account_id, coa_path)
        sub = df[mask].copy()
        sub = classify_df(sub, account_id=account_id, coa_path=coa_path)

        df.loc[mask, "GL Account"]   = sub["gl_account"].values
        df.loc[mask, "GL Type"]      = sub["gl_type"].values
        df.loc[mask, "GST Category"] = sub["gst_category"].values
        df.loc[mask, "GST"]          = sub["gst_amount"].values

        df.loc[mask & (df["debit"]  > 0), "classification"] = "🟡Outgoing"
        df.loc[mask & (df["credit"] > 0), "classification"] = "🔵Incoming"

    df["classification"] = df["classification"].fillna("⚪Unclassified")

    # FIX 6: Populate Who field for auto-matched internal pairs from description
    if "Who" not in df.columns:
        df["Who"] = ""
    for idx in df.index:
        if df.at[idx, "classification"] == "🟢Internal":
            desc = str(df.at[idx, "description"]) if "description" in df.columns else ""
            who  = _extract_who(desc)
            if who:
                df.at[idx, "Who"] = who

    # ── 4. Date parts ────────────────────────────────────────────────────
    if has_date:
        df["Month"] = df["date"].apply(lambda x: getattr(x, "month", None))
        df["Year"]  = df["date"].apply(lambda x: getattr(x, "year",  None))

    return df

