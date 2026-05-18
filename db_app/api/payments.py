"""
Accfino Payment API — Stripe integration
========================================
Environment variables required:
  STRIPE_SECRET_KEY       sk_live_... or sk_test_... from Stripe Dashboard
  STRIPE_WEBHOOK_SECRET   whsec_... from Stripe Dashboard → Webhooks
  APP_URL                 https://accfino.com

Stripe Dashboard setup:
  1. Create products for each plan in Stripe Dashboard → Products
  2. Copy Price IDs (price_...) into PLANS below
  3. Set up webhook endpoint: https://accfino.com/payments/webhook
     Events: checkout.session.completed, customer.subscription.deleted
  4. Add your CBA bank account in Stripe → Settings → Payouts
"""
import os, json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Body, HTTPException, Request, Header
from sqlalchemy.orm import Session
from db_app.database import SessionLocal
from db_app.models.licence import LicenceRecord
from db_app.models.user import User

router = APIRouter()

# ── Plan definitions ──────────────────────────────────────────────────────────
# Set your own prices here (AUD cents for Stripe, display in AUD dollars)
# After creating products in Stripe Dashboard, paste the Price IDs below

PLANS = {
    "base": {
        "name":        "Base",
        "description": "Start free — CSV reconciliation included",
        "price_monthly": 0,
        "price_yearly":  0,
        "modules": ["dashboard", "reconciliation"],   # CSV only, no Open Banking
        "features": [
            "Dashboard overview",
            "CSV bank reconciliation",
            "Up to 500 transactions/month",
            "6-month free access",
        ],
        "stripe_price_monthly": "",   # free — no Stripe price needed
        "stripe_price_yearly":  "",
        "highlight": False,
        "badge": "Free",
    },
    "reconciliation": {
        "name":        "Reconciliation",
        "description": "Full bank reconciliation including Open Banking",
        "price_monthly": 1900,   # AUD cents = $19.00
        "price_yearly":  19000,  # = $190.00 (2 months free)
        "modules": ["dashboard", "reconciliation"],   # full incl Open Banking
        "features": [
            "Everything in Base",
            "Open Banking / direct bank feeds",
            "Unlimited transactions",
            "GST calculation & BAS-ready",
            "Excel export with monthly summaries",
        ],
        "stripe_price_monthly": "price_REPLACE_RECON_MONTHLY",
        "stripe_price_yearly":  "price_REPLACE_RECON_YEARLY",
        "highlight": False,
        "badge": "",
    },
    "trading": {
        "name":        "Trading",
        "description": "Crypto & equity CGT tax reports",
        "price_monthly": 1500,
        "price_yearly":  15000,
        "modules": ["dashboard", "trading"],
        "features": [
            "Crypto CGT calculation",
            "Equity CGT reports",
            "ATO-ready tax summaries",
        ],
        "stripe_price_monthly": "price_REPLACE_TRADING_MONTHLY",
        "stripe_price_yearly":  "price_REPLACE_TRADING_YEARLY",
        "highlight": False,
        "badge": "",
    },
    "cashflow": {
        "name":        "Cash Flow",
        "description": "ML-powered cash flow forecasting",
        "price_monthly": 1500,
        "price_yearly":  15000,
        "modules": ["dashboard", "cash-flow"],
        "features": [
            "ML next-month forecast",
            "Visual cash flow charts",
            "Export to Excel",
        ],
        "stripe_price_monthly": "price_REPLACE_CASHFLOW_MONTHLY",
        "stripe_price_yearly":  "price_REPLACE_CASHFLOW_YEARLY",
        "highlight": False,
        "badge": "",
    },
    "invoice": {
        "name":        "Invoice",
        "description": "GST invoices & PDF extraction",
        "price_monthly": 1200,
        "price_yearly":  12000,
        "modules": ["dashboard", "invoice"],
        "features": [
            "Create GST invoices",
            "Extract data from PDF invoices",
            "Customer management",
        ],
        "stripe_price_monthly": "price_REPLACE_INVOICE_MONTHLY",
        "stripe_price_yearly":  "price_REPLACE_INVOICE_YEARLY",
        "highlight": False,
        "badge": "",
    },
    "basic": {
        "name":        "Full Bundle",
        "description": "Reconciliation + Trading + Cash Flow + Invoice",
        "price_monthly": 4900,   # $49/mo (save ~$12)
        "price_yearly":  49000,  # $490/yr
        "modules": ["dashboard", "reconciliation", "trading", "cash-flow", "invoice"],
        "features": [
            "Full bank reconciliation + Open Banking",
            "Crypto & equity CGT reports",
            "ML cash flow forecast",
            "GST invoice management",
            "Save $12/month vs individual",
        ],
        "stripe_price_monthly": "price_REPLACE_BASIC_MONTHLY",
        "stripe_price_yearly":  "price_REPLACE_BASIC_YEARLY",
        "highlight": False,
        "badge": "",
    },
    "premium": {
        "name":        "Premium",
        "description": "Complete suite — best value, all modules included",
        "price_monthly": 3900,   # $39/mo (cheaper than Basic $49 — reward commitment)
        "price_yearly":  39000,  # $390/yr (2 months free = $325/yr effective)
        "modules": ["dashboard", "reconciliation", "trading", "cash-flow", "invoice"],
        "features": [
            "Everything in Basic Bundle",
            "Save $10/month vs Basic Bundle",
            "Priority support",
            "Early access to new features",
            "Unlimited transactions & exports",
        ],
        "stripe_price_monthly": "price_REPLACE_PREMIUM_MONTHLY",
        "stripe_price_yearly":  "price_REPLACE_PREMIUM_YEARLY",
        "highlight": True,
        "badge": "Best Value",
    },
}

# Modules NEVER available regardless of plan
LOCKED_MODULES = ["admin", "file-manager", "licence"]


def _get_stripe():
    """Get Stripe client — raises clear error if not configured."""
    secret = os.environ.get("STRIPE_SECRET_KEY", "")
    if not secret or secret.startswith("price_REPLACE"):
        raise HTTPException(503, "Payment gateway not configured. Contact admin.")
    try:
        import stripe
        stripe.api_key = secret
        return stripe
    except ImportError:
        raise HTTPException(503, "stripe package not installed. Run: pip install stripe")


def _db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/plans")
def get_plans():
    """Return all plan definitions for the pricing page."""
    safe = {}
    for plan_id, plan in PLANS.items():
        safe[plan_id] = {k: v for k, v in plan.items()
                         if not k.startswith("stripe_price")}
        safe[plan_id]["plan_id"] = plan_id
    return safe


@router.post("/create-checkout")
def create_checkout(body: dict = Body(...)):
    """
    Create a Stripe Checkout session for a plan.
    Body: { plan_id, billing_period, user_id, user_email }
    Returns: { checkout_url }
    """
    plan_id        = body.get("plan_id", "")
    billing_period = body.get("billing_period", "monthly")
    user_id        = body.get("user_id")
    user_email     = body.get("user_email", "")

    # Allow 'custom' for individual module selection
    if plan_id not in PLANS and plan_id != "custom":
        raise HTTPException(400, f"Unknown plan: {plan_id}")

    # Support custom plan (individual module selection)
    is_custom = plan_id == "custom" or plan_id not in PLANS
    plan      = PLANS.get(plan_id, {})  # may be empty for custom

    # Amount — use passed amount first (custom selection), then plan price
    passed_amount = body.get("amount")
    if passed_amount and int(passed_amount) > 0:
        amount = int(passed_amount)
    elif plan:
        amount = plan["price_yearly"] if billing_period == "yearly" else plan["price_monthly"]
    else:
        raise HTTPException(400, "No amount provided for custom plan")

    if amount == 0:
        raise HTTPException(400, "Base plan is free — no payment needed")

    period_label = "/ year" if billing_period == "yearly" else "/ month"
    plan_name    = body.get("plan_name") or plan.get("name") or plan_id.title()

    # Modules — use passed modules first, then plan default
    modules = body.get("modules")
    if not isinstance(modules, list) or not modules:
        modules = plan.get("modules", ["dashboard", "reconciliation"])

    stripe  = _get_stripe()
    app_url = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        mode="payment",
        customer_email=user_email or None,
        line_items=[{
            "price_data": {
                "currency":     "aud",
                "unit_amount":  amount,
                "product_data": {
                    "name":        f"Accfino {plan_name}",
                    "description": f"{plan.get('description','')} · {period_label}",
                },
            },
            "quantity": 1,
        }],
        metadata={
            "user_id":        str(user_id),
            "plan_id":        plan_id,
            "billing_period": billing_period,
            "modules":        json.dumps(modules),
        },
        success_url=f"{app_url}/?payment=success&plan={plan_id}&period={billing_period}&mods={'|'.join(modules)}",
        cancel_url=f"{app_url}/upgrade?cancelled=1",
    )
    return {"checkout_url": session.url}


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
):
    """
    Handle Stripe webhook events.
    Configure in Stripe Dashboard → Webhooks → Add endpoint:
      URL: https://accfino.com/payments/webhook
      Events: checkout.session.completed, customer.subscription.deleted
    """
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise HTTPException(503, "STRIPE_WEBHOOK_SECRET not configured")

    stripe  = _get_stripe()
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid Stripe signature")

    db = SessionLocal()
    try:
        if event["type"] == "checkout.session.completed":
            session  = event["data"]["object"]
            meta     = session.get("metadata", {})
            user_id  = int(meta.get("user_id", 0))
            plan_id  = meta.get("plan_id", "")
            period   = meta.get("billing_period", "monthly")

            if user_id and plan_id in PLANS:
                meta_modules = meta.get("modules", "")
                try:
                    custom_mods = json.loads(meta_modules) if meta_modules else None
                except Exception:
                    custom_mods = None
                _activate_plan(db, user_id, plan_id, period,
                               stripe_customer_id=session.get("customer", ""),
                               stripe_sub_id=session.get("subscription", ""),
                               amount=str(session.get("amount_total", 0)),
                               custom_modules=custom_mods)

        elif event["type"] == "customer.subscription.deleted":
            sub    = event["data"]["object"]
            cus_id = sub.get("customer", "")
            if cus_id:
                lic = db.query(LicenceRecord).filter(
                    LicenceRecord.stripe_customer_id == cus_id
                ).first()
                if lic:
                    lic.licence_type   = "demo"
                    lic.plan_id        = "demo"
                    lic.billing_period = ""
                    lic.stripe_sub_id  = ""
                    lic.modules        = json.dumps(PLANS["demo"]["modules"])
                    db.commit()

    finally:
        db.close()

    return {"received": True}


def _activate_plan(db, user_id: int, plan_id: str, billing_period: str,
                   stripe_customer_id="", stripe_sub_id="", amount="", custom_modules=None):
    """Update licence record after successful payment.
    Merges new modules with existing ones — never removes previously paid modules.
    """
    from datetime import datetime, timedelta, timezone
    today     = datetime.now(timezone.utc).date()
    end_delta = timedelta(days=366 if billing_period == "yearly" else 31)
    end_date  = today + end_delta
    # For custom plans, use empty dict — modules come from custom_modules param
    plan      = PLANS.get(plan_id, {})

    lic = db.query(LicenceRecord).filter(LicenceRecord.user_id == user_id).first()
    if not lic:
        lic = LicenceRecord(user_id=user_id)
        db.add(lic)

    # Merge modules — add new ones to existing, never remove
    existing_mods = []
    if lic.modules:
        try:
            existing_mods = json.loads(lic.modules)
        except Exception:
            existing_mods = []

    new_mods = custom_modules if custom_modules else plan.get("modules", ["dashboard", "reconciliation"])
    LOCKED   = {"admin", "file-manager", "licence"}
    merged   = [m for m in list(dict.fromkeys(["dashboard"] + existing_mods + new_mods))
                if m not in LOCKED]

    # Preserve original start_date from first payment
    original_start = lic.start_date if (lic.start_date and lic.licence_type == "paid") else str(today)

    # Build upgrade history in notes
    prev_notes = (lic.notes or "").strip()
    new_note   = str(today) + ": " + plan.get("name", plan_id) + " — " + ", ".join(new_mods) + " (" + billing_period + ")"
    notes      = (prev_notes + "\n" + new_note).strip()

    lic.licence_type       = "paid"
    lic.plan_id            = plan_id
    lic.billing_period     = billing_period
    lic.payment_mode       = "card"
    lic.start_date         = original_start
    lic.end_date           = str(end_date)
    lic.stripe_customer_id = stripe_customer_id or (lic.stripe_customer_id or "")
    lic.stripe_sub_id      = stripe_sub_id      or (lic.stripe_sub_id or "")
    lic.amount_paid        = amount
    lic.modules            = json.dumps(merged)
    lic.notes              = notes
    db.commit()


@router.get("/my-plan/{user_id}")
def my_plan(user_id: int):
    """Return current plan details for a user."""
    db = SessionLocal()
    try:
        lic = db.query(LicenceRecord).filter(LicenceRecord.user_id == user_id).first()
        if not lic:
            return {"plan_id": "base", "licence_type": "demo",
                    "end_date": "", "modules": PLANS["demo"]["modules"]}
        return {
            "plan_id":        lic.plan_id or "demo",
            "licence_type":   lic.licence_type,
            "billing_period": lic.billing_period,
            "start_date":     lic.start_date,
            "end_date":       lic.end_date,
            "modules":        json.loads(lic.modules) if lic.modules else PLANS["demo"]["modules"],
        }
    finally:
        db.close()


@router.post("/admin/activate")
def admin_activate(body: dict = Body(...)):
    """Admin endpoint to manually activate a plan (no Stripe needed)."""
    db = SessionLocal()
    try:
        _activate_plan(
            db,
            user_id        = body["user_id"],
            plan_id        = body.get("plan_id", "basic"),
            billing_period = body.get("billing_period", "monthly"),
            amount         = "manual",
        )
        return {"ok": True}
    finally:
        db.close()


@router.post("/activate-after-payment")
def activate_after_payment(body: dict = Body(...)):
    """
    Called by frontend after Stripe payment success.
    Merges newly purchased modules with existing ones.
    Returns updated plan info for immediate UI refresh.
    """
    db = SessionLocal()
    try:
        user_id = body.get("user_id")
        plan_id = body.get("plan_id", "")
        period  = body.get("billing_period", "monthly")
        modules = body.get("modules", [])

        if not user_id:
            raise HTTPException(400, "user_id required")

        if not isinstance(modules, list):
            modules = []

        # Derive modules from plan if not passed
        if not modules and plan_id in PLANS:
            modules = PLANS[plan_id]["modules"]

        # Always include dashboard
        if modules and "dashboard" not in modules:
            modules = ["dashboard"] + modules

        if not modules:
            modules = ["dashboard", "reconciliation"]

        # Build meaningful plan_id from selected modules if custom
        if plan_id not in PLANS:
            paid_mods = [m for m in modules if m != "dashboard"]
            plan_id   = "+".join(paid_mods) if paid_mods else "base"

        _activate_plan(
            db,
            user_id        = user_id,
            plan_id        = plan_id,
            billing_period = period,
            amount         = "stripe_payment",
            custom_modules = modules,
        )

        # Return updated licence for immediate UI refresh
        lic = db.query(LicenceRecord).filter(
            LicenceRecord.user_id == user_id
        ).first()
        updated_mods = json.loads(lic.modules) if lic and lic.modules else modules

        return {
            "ok":       True,
            "plan_id":  lic.plan_id if lic else plan_id,
            "modules":  updated_mods,
            "end_date": lic.end_date if lic else "",
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        err_msg = "Activation failed: " + str(e)
        print("[activate-after-payment] " + err_msg)
        print(traceback.format_exc())
        raise HTTPException(500, err_msg)
    finally:
        db.close()
