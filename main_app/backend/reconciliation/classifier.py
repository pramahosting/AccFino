import pandas as pd
import itertools

# Safe optional streamlit import — when running under FastAPI/uvicorn, st is a no-op stub
try:
    import streamlit as st
    _ST_AVAILABLE = True
except Exception:
    _ST_AVAILABLE = False

from .gst_calculator import calculate_gst  # Import GST function


class _NoOpProgress:
    """Drop-in replacement for st.progress() when Streamlit is not available."""
    def progress(self, *a, **kw): pass
    def empty(self): pass


# --- Transaction classifier ---
def classify_transactions(df: pd.DataFrame, show_progress=True) -> pd.DataFrame:
    df.columns = df.columns.str.strip().str.lower()
    df = df.reset_index(drop=True)

    # Ensure numeric with zero fallback
    df["debit"] = pd.to_numeric(df.get("debit", 0), errors="coerce").fillna(0)
    df["credit"] = pd.to_numeric(df.get("credit", 0), errors="coerce").fillna(0)

    # Description-based adjustment
    # Runs only when BOTH debit and credit are non-zero on the same row (ambiguous row).
    # Picks one side based on description keywords and zeros out the other.
    def desc_based_adjust(row):
        debit = row.get("debit", 0)
        credit = row.get("credit", 0)
        if not (debit > 0 and credit > 0):
            return row
        desc = str(row.get("description", "")).lower()
        if any(keyword in desc for keyword in ["transfer to", "payment", "card", "bill", "invoice"]):
            row["debit"] = debit if debit > 0 else credit
            row["credit"] = 0
        elif any(keyword in desc for keyword in ["direct credit", "salary", "refund", "fast transfer from"]):
            row["credit"] = credit if credit > 0 else debit
            row["debit"] = 0
        else:
            row["debit"] = debit if debit > 0 else credit
            row["credit"] = 0
        return row

    df = df.apply(desc_based_adjust, axis=1)
    df["tmp_idx"] = df.index

    # Prepare debit and credit DataFrames for internal transfer matching
    debit_df = df[df["debit"] != 0][["tmp_idx", "date", "debit", "bank", "account"]].copy()
    credit_df = df[df["credit"] != 0][["tmp_idx", "date", "credit", "bank", "account"]].copy()

    debit_df = debit_df.rename(columns={
        "tmp_idx": "tmp_idx_debit", "date": "date_debit", "debit": "amount",
        "bank": "bank_debit", "account": "account_debit"
    })
    credit_df = credit_df.rename(columns={
        "tmp_idx": "tmp_idx_credit", "date": "date_credit", "credit": "amount",
        "bank": "bank_credit", "account": "account_credit"
    })

    merged = pd.merge(
        debit_df, credit_df,
        on="amount", how="outer", indicator=True
    )

    # Initialize classification columns
    df["classification"] = None
    df["pairid"] = None
    df["GL Account"] = None
    df["GST"] = 0.0
    df["GST Category"] = None
    df["Who"] = None

    pair_id_counter = itertools.count(1)
    matched_debits, matched_credits = set(), set()

    # Only use real Streamlit progress bar when inside a Streamlit session
    if show_progress and _ST_AVAILABLE:
        try:
            progress_bar = st.progress(0, text="Matching internal transfers...")
        except Exception:
            progress_bar = _NoOpProgress()
    else:
        progress_bar = _NoOpProgress()

    total = len(merged)

    for i, row in enumerate(merged.itertuples(index=False), 1):
        d_idx = getattr(row, "tmp_idx_debit", None)
        c_idx = getattr(row, "tmp_idx_credit", None)
        if d_idx in matched_debits or c_idx in matched_credits:
            continue
        if pd.isna(d_idx) or pd.isna(c_idx):
            continue
        account_debit = getattr(row, "account_debit", None)
        account_credit = getattr(row, "account_credit", None)
        if account_debit == account_credit:
            continue

        date_debit = pd.to_datetime(getattr(row, "date_debit", None), dayfirst=True, errors="coerce")
        date_credit = pd.to_datetime(getattr(row, "date_credit", None), dayfirst=True, errors="coerce")
        if pd.isna(date_debit) or pd.isna(date_credit):
            continue
        if abs((date_debit - date_credit).days) > 3:
            continue

        transfer_keywords = [
            "transfer", "trf", "tfr", "internet transfer",
            "inter-bank", "interbank", "funds transfer",
            "bank transfer", "direct transfer", "telegraphic",
            "wire", "remittance", "remit", "bpay transfer",
            "online transfer", "account transfer",
        ]
        desc_debit = str(df.at[int(d_idx), "description"]).lower() if "description" in df.columns else ""
        desc_credit = str(df.at[int(c_idx), "description"]).lower() if "description" in df.columns else ""
        if not (any(k in desc_debit for k in transfer_keywords) or
                any(k in desc_credit for k in transfer_keywords)):
            continue

        pid = f"PAIR{next(pair_id_counter):05d}"
        df.loc[int(d_idx), ["classification", "pairid"]] = ["🟢Internal", pid]
        df.loc[int(c_idx), ["classification", "pairid"]] = ["🟢Internal", pid]
        matched_debits.add(int(d_idx))
        matched_credits.add(int(c_idx))

        if i % 50 == 0:
            progress_bar.progress(min(i / total, 1.0), text="Matching internal transfers...")

    progress_bar.progress(1.0, text="Matching complete ✅")

    # External classification
    mask_unclassified = df["classification"].isna()
    df.loc[mask_unclassified & (df["debit"] > 0), "classification"] = "🟡Outgoing"
    df.loc[mask_unclassified & (df["credit"] > 0), "classification"] = "🔵Incoming"
    df["classification"] = df["classification"].fillna("⚪Unclassified")

    if "date" in df.columns:
        df["Month"] = df["date"].apply(lambda x: x.month if hasattr(x, "month") else None)
        df["Year"] = df["date"].apply(lambda x: x.year if hasattr(x, "year") else None)

    df = calculate_gst(df)

    return df
