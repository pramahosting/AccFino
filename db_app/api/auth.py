"""
db_app/api/auth.py — JWT-secured authentication
Adds:
  - JWT token on login (expires 8 hours)
  - get_current_user() dependency for route protection
  - All routes return 401 if token missing/invalid
"""
import os, json
import bcrypt
import json as _json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from db_app.database import SessionLocal
from db_app.models.user import User
from db_app.models.role import Role
from db_app.models.licence import LicenceRecord

try:
    import jwt as _jwt
    JWT_AVAILABLE = True
except ImportError:
    JWT_AVAILABLE = False

router   = APIRouter()
_bearer  = HTTPBearer(auto_error=False)

# ── JWT config ────────────────────────────────────────────────────────────────
JWT_SECRET    = os.environ.get("JWT_SECRET", "accfino-change-this-in-production-32chars")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HRS= 8


def _make_token(user_id: int, username: str, roles: list) -> str:
    if not JWT_AVAILABLE:
        return f"simple:{user_id}:{username}"
    payload = {
        "sub":   str(user_id),
        "usr":   username,
        "roles": roles,
        "exp":   datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HRS),
    }
    return _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    if not JWT_AVAILABLE:
        # Simple fallback — not secure, only for dev without PyJWT
        if token.startswith("simple:"):
            parts = token.split(":")
            return {"sub": parts[1], "usr": parts[2], "roles": []}
        raise HTTPException(401, "Invalid token")
    try:
        return _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except _jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired — please log in again")
    except _jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """FastAPI dependency — returns decoded token payload or raises 401."""
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode_token(creds.credentials)


def require_admin(current: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — raises 403 if user is not admin."""
    if "admin" not in current.get("roles", []):
        raise HTTPException(403, "Admin access required")
    return current


# ── Pydantic models ───────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    username:  str
    full_name: str | None = None
    email:     str
    password:  str
    phone:     str | None = None
    address:   str | None = None
    role:      str | None = None
    plan_id:   str | None = "base"

class UserResponse(BaseModel):
    id:          int
    username:    str
    name:        str
    email:       str
    roles:       list
    permissions: list
    token:       str = ""   # JWT token


class ForgotPasswordRequest(BaseModel):
    email: str


def build_user_response(user: User, token: str = "") -> dict:
    return {
        "id":          user.id,
        "username":    user.username,
        "name":        user.full_name or user.username,
        "email":       user.email,
        "roles":       [r.name for r in user.roles],
        "permissions": list({p.name for r in user.roles for p in r.permissions}),
        "token":       token,
    }


def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Login ─────────────────────────────────────────────────────────────────────
def authenticate_user(email: str, password: str, db: Session) -> dict:
    login_value = email.strip()
    user = db.query(User).filter(
        or_(User.email == login_value, User.username == login_value)
    ).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid email or password")

    stored_pw = user.password if isinstance(user.password, bytes) else user.password.encode()
    if not bcrypt.checkpw(password.encode(), stored_pw):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid email or password")

    roles = [r.name for r in user.roles]
    token = _make_token(user.id, user.username, roles)
    return build_user_response(user, token)


@router.post("/login", response_model=UserResponse)
def login_post(request: LoginRequest, db: Session = Depends(_get_db)):
    return authenticate_user(request.email, request.password, db)


@router.get("/login", response_model=UserResponse)
def login_get(
    email: str = Query(...),
    password: str = Query(...),
    db: Session = Depends(_get_db),
):
    return authenticate_user(email, password, db)


# ── Register ──────────────────────────────────────────────────────────────────
@router.post("/register", response_model=UserResponse)
def register(request: RegisterRequest, db: Session = Depends(_get_db)):
    existing = db.query(User).filter(
        or_(User.email == request.email, User.username == request.username)
    ).first()
    if existing:
        raise HTTPException(400, "Email or username already registered")

    # Only first user or admin can set role
    user_count = db.query(User).count()
    role_name  = "admin" if user_count == 0 else "user"

    hashed = bcrypt.hashpw(request.password.encode(), bcrypt.gensalt()).decode()

    role = db.query(Role).filter(Role.name == role_name).first()
    if not role:
        role = Role(name=role_name)
        db.add(role)
        db.flush()

    new_user = User(
        username=request.username.strip(),
        full_name=(request.full_name or "").strip(),
        email=request.email.strip(),
        password=hashed,
        phone=(request.phone or "").strip(),
        address="",
    )
    new_user.roles.append(role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Auto-create licence with plan modules
    try:
        from datetime import datetime, timedelta, timezone
        PLAN_MODULES = {
            "base":    ["dashboard", "reconciliation"],
            "reconciliation": ["dashboard", "reconciliation"],
            "trading": ["dashboard", "trading"],
            "cashflow":["dashboard", "cash-flow"],
            "invoice": ["dashboard", "invoice"],
            "basic":   ["dashboard", "reconciliation", "trading", "cash-flow", "invoice"],
            "premium": ["dashboard", "reconciliation", "trading", "cash-flow", "invoice"],
        }
        plan_id      = request.plan_id or "base"
        today        = datetime.now(timezone.utc).date()
        end_date     = today + timedelta(days=183)
        plan_modules = PLAN_MODULES.get(plan_id, PLAN_MODULES["base"])
        lic = LicenceRecord(
            user_id      = new_user.id,
            licence_type = plan_id,
            plan_id      = plan_id,
            payment_mode = "",
            start_date   = str(today),
            end_date     = str(end_date),
            notes        = f"Auto-created on registration — {plan_id} plan",
            modules      = _json.dumps(plan_modules),
        )
        db.add(lic)
        db.commit()
    except Exception:
        pass

    roles  = [r.name for r in new_user.roles]
    token  = _make_token(new_user.id, new_user.username, roles)
    return build_user_response(new_user, token)
