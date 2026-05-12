import httpx
import math
from datetime import date, datetime

FASTAPI_BASE_URL = "http://localhost:8000"


# ==================================================
# 🔧 Helpers
# ==================================================
def _json_safe(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    return value


# ==================================================
# 🔐 AUTH APIs
# ==================================================
def login(email: str, password: str):
    try:
        response = httpx.post(
            f"{FASTAPI_BASE_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=10.0
        )

        if response.status_code == 200:
            return response.json()

        return None

    except httpx.ConnectError as e:
        raise ConnectionError(f"Backend not reachable: {e}")


def register(username, full_name, email, password, phone="", address="", role="user"):
    try:
        payload = {
            "username": username,
            "full_name": full_name,
            "email": email,
            "password": password,
            "phone": phone,
            "address": address,
            "role": role
        }

        response = httpx.post(
            f"{FASTAPI_BASE_URL}/auth/register",
            json=payload,
            timeout=10.0
        )

        if response.status_code in [200, 201]:
            return response.json()

        print("REGISTER ERROR:", response.status_code, response.text)
        return None

    except httpx.ConnectError as e:
        raise ConnectionError(f"Backend not reachable: {e}")


def change_password(email: str, old_password: str, new_password: str):
    try:
        response = httpx.post(
            f"{FASTAPI_BASE_URL}/auth/change-password",
            json={
                "email": email,
                "old_password": old_password,
                "new_password": new_password
            },
            timeout=10.0
        )

        if response.status_code == 200:
            return response.json()

        print("CHANGE PASSWORD ERROR:", response.text)
        return None

    except httpx.ConnectError as e:
        raise ConnectionError(f"Backend not reachable: {e}")


# ==================================================
# 👤 USER ADMIN APIs
# ==================================================
def get_all_users_api():
    try:
        response = httpx.get(
            f"{FASTAPI_BASE_URL}/auth/users",
            timeout=10.0
        )

        if response.status_code == 200:
            return response.json()

        return []

    except httpx.ConnectError as e:
        raise ConnectionError(f"Backend not reachable: {e}")


def delete_user(user_id: int, admin_email: str):
    try:
        response = httpx.delete(
            f"{FASTAPI_BASE_URL}/auth/users/{user_id}",
            json={"admin_email": admin_email},
            timeout=10.0
        )

        if response.status_code == 200:
            return response.json()

        print("DELETE ERROR:", response.text)
        return None

    except httpx.ConnectError as e:
        raise ConnectionError(f"Backend not reachable: {e}")


# ==================================================
# 💰 TRANSACTION APIs
# ==================================================
def save_transactions(user_id, df):
    columns = [
        "date", "bank", "account", "description",
        "debit", "credit", "classification",
        "pair_id", "gl_account", "gst",
        "gst_category", "who"
    ]

    available = [col for col in columns if col in df.columns]

    raw_rows = df.where(df.notna(), None)[available].to_dict(orient="records")
    rows = [{k: _json_safe(v) for k, v in row.items()} for row in raw_rows]

    try:
        response = httpx.post(
            f"{FASTAPI_BASE_URL}/transactions/save",
            json={
                "user_id": user_id,
                "transactions": rows
            },
            timeout=30.0
        )

        response.raise_for_status()
        return response.json()

    except httpx.ConnectError as e:
        raise ConnectionError(f"Backend not reachable: {e}")

    except httpx.HTTPStatusError as e:
        raise RuntimeError(
            f"Transaction API failed: {e.response.status_code} {e.response.text}"
        )