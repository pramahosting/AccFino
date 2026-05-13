"""
Password reset endpoints.

Environment variables required (set in Northflank → Environment):
    SMTP_HOST      e.g. smtp.gmail.com
    SMTP_PORT      e.g. 587
    SMTP_USER      your sending email address
    SMTP_PASSWORD  your email password or app password
    APP_URL        e.g. https://accfino.com  (no trailing slash)
"""
import os
import secrets
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import bcrypt
from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db_app.database import get_db
from db_app.models.user import User
from db_app.models.password_reset_token import PasswordResetToken

router = APIRouter()

TOKEN_EXPIRY_MINUTES = 30


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _send_reset_email(to_email: str, reset_url: str) -> None:
    """Send password reset email via SMTP."""
    smtp_host = os.environ.get("SMTP_HOST", "")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASSWORD", "")
    app_url   = os.environ.get("APP_URL", "https://accfino.com")

    if not all([smtp_host, smtp_user, smtp_pass]):
        raise RuntimeError(
            "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD "
            "in Northflank environment variables."
        )

    subject = "Reset your Accfino password"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:1.5rem;font-weight:700;color:#FF6B35;">Accfino</span>
      </div>
      <h2 style="color:#1a1a2e;margin-bottom:8px;">Reset your password</h2>
      <p style="color:#555;line-height:1.6;">
        We received a request to reset your password. Click the button below
        to choose a new one. This link expires in {TOKEN_EXPIRY_MINUTES} minutes.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="{reset_url}"
           style="background:#FF6B35;color:#fff;padding:14px 32px;border-radius:8px;
                  text-decoration:none;font-weight:600;font-size:1rem;">
          Reset Password
        </a>
      </div>
      <p style="color:#888;font-size:.85rem;line-height:1.6;">
        If you didn't request a password reset, you can ignore this email —
        your password will not change.<br><br>
        Or copy this link into your browser:<br>
        <a href="{reset_url}" style="color:#FF6B35;word-break:break-all;">{reset_url}</a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
      <p style="color:#bbb;font-size:.75rem;text-align:center;">
        © {datetime.utcnow().year} Accfino · Australian Accounting Platform
      </p>
    </div>
    """

    text = (
        f"Reset your Accfino password\n\n"
        f"Click this link to reset your password (expires in {TOKEN_EXPIRY_MINUTES} minutes):\n"
        f"{reset_url}\n\n"
        f"If you didn't request this, ignore this email."
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = smtp_user
    msg["To"]      = to_email
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, to_email, msg.as_string())


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/forgot-password")
def forgot_password(
    request: ForgotPasswordRequest = Body(...),
    db: Session = Depends(get_db),
):
    """
    Generate a password reset token and email it to the user.
    Always returns 200 even if email not found (prevents user enumeration).
    """
    email = request.email.strip().lower()
    user  = db.query(User).filter(User.email.ilike(email)).first()

    if user:
        # Invalidate any existing unused tokens for this user
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used    == False,
        ).update({"used": True})
        db.flush()

        # Create new token
        raw_token  = secrets.token_urlsafe(48)
        expires_at = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRY_MINUTES)
        token_row  = PasswordResetToken(
            user_id    = user.id,
            token      = raw_token,
            expires_at = expires_at,
            used       = False,
        )
        db.add(token_row)
        db.commit()

        app_url   = os.environ.get("APP_URL", "https://accfino.com").rstrip("/")
        reset_url = f"{app_url}/reset-password?token={raw_token}"

        try:
            _send_reset_email(user.email, reset_url)
        except Exception as e:
            # Log but don't reveal error to client
            print(f"[reset] Email send failed for {user.email}: {e}")

    # Always return the same response
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(
    request: ResetPasswordRequest = Body(...),
    db: Session = Depends(get_db),
):
    """Validate reset token and update password."""
    token_row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token == request.token)
        .first()
    )

    if not token_row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid or expired reset link.")

    if token_row.used:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="This reset link has already been used.")

    if datetime.utcnow() > token_row.expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="This reset link has expired. Please request a new one.")

    if len(request.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Password must be at least 8 characters.")

    # Update password
    user = db.query(User).filter(User.id == token_row.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="User not found.")

    hashed = bcrypt.hashpw(request.new_password.encode(), bcrypt.gensalt()).decode()
    user.password = hashed

    # Mark token as used
    token_row.used = True

    db.commit()
    return {"message": "Password updated successfully. You can now log in."}


@router.get("/verify-reset-token")
def verify_reset_token(
    token: str,
    db: Session = Depends(get_db),
):
    """Check if a reset token is valid before showing the reset form."""
    token_row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token == token)
        .first()
    )

    if not token_row or token_row.used or datetime.utcnow() > token_row.expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid or expired reset link.")

    user = db.query(User).filter(User.id == token_row.user_id).first()
    return {"valid": True, "email": user.email if user else ""}
