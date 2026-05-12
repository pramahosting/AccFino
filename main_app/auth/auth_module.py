# ---------------------------
# FILE: auth_module.py (FASTAPI VERSION)

import streamlit as st
from datetime import datetime, timedelta
import extra_streamlit_components as stx

# ✅ ONLY API CLIENT (no JSON)
from auth.api_auth import (
    login,
    register,
    delete_user,
    get_all_users_api,
    change_password
)

# ===== COOKIE MANAGER =====
def get_cookie_manager():
    return stx.CookieManager()


# ===== LOGIN TAB =====
def login_tab(cookie_manager):
    st.subheader("Login")

    email = st.text_input("Email or Username", key="login_email")
    password = st.text_input("Password", type="password", key="login_password")
    remember_me = st.checkbox("Remember me", key="login_remember")

    if st.button("Login", key="login_btn"):
        email = email.strip()
        password = password.strip()

        if not email or not password:
            st.warning("Please enter both email and password.")
            return

        try:
            user = login(email, password)
        except ConnectionError as e:
            st.error(str(e))
            return

        if user:
            role_names = [str(r).strip().lower() for r in user.get("roles", [])]
            user["is_admin"] = "admin" in role_names

            st.session_state.logged_in = True
            st.session_state.user = user

            if remember_me:
                cookie_manager.set("auth_email", email, expires_at=datetime.now() + timedelta(days=30))
            else:
                try:
                    cookie_manager.delete("auth_email")
                except Exception:
                    pass

            st.rerun()
        else:
            st.error("Invalid email or password")


# ===== SIGNUP TAB =====
def signup_tab():
    st.subheader("Sign Up")

    name = st.text_input("Full Name", key="signup_name")
    username = st.text_input("Username", key="signup_username")
    email = st.text_input("Email", key="signup_email")
    password = st.text_input("Password", type="password", key="signup_password")
    address = st.text_area("Address", key="signup_address")
    company = st.text_input("Company", key="signup_company")
    phone = st.text_input("Phone", key="signup_phone")

    # ✅ NO DB ACCESS FROM FRONTEND
    selected_role = st.selectbox("Role", ["user", "admin"], key="signup_role")

    if st.button("Sign Up", key="signup_btn"):
        print("\n===== SIGNUP CLICKED =====")

        print("RAW INPUTS:")
        print("Full Name:", name)
        print("Username:", username)
        print("Email:", email)
        print("Password:", password)
        print("Address:", address)
        print("Company:", company)
        print("Phone:", phone)
        print("Role:", selected_role)

        username = username.strip()
        full_name = name.strip()
        email = email.strip()
        password = password.strip()

        print("\nAFTER STRIP:")
        print("Full Name:", full_name)
        print("Username:", username)
        print("Email:", email)
        print("Password:", password)

        if not username or not full_name or not email or not password:
            st.warning("Please enter full name, username, email, and password.")
            return

        try:
            user = register(username, full_name, email, password, phone, address, selected_role)
        except ConnectionError as e:
            st.error(str(e))
            return

        if user:
            st.success("Account created! Please log in.")
        else:
            st.error("Signup failed. Email or username may already exist.")


# ===== CHANGE PASSWORD =====
def change_password_ui():
    st.subheader("Change Password")

    email = st.session_state.user.get("email")

    old_password = st.text_input("Old Password", type="password")
    new_password = st.text_input("New Password", type="password")

    if st.button("Update Password"):
        if not old_password or not new_password:
            st.warning("Please fill all fields")
            return

        result = change_password(email, old_password, new_password)

        if result:
            st.success("Password updated successfully")
        else:
            st.error("Failed to update password")


# ===== ADMIN PANEL =====
def admin_panel():
    st.subheader("Admin Control Panel")

    users = get_all_users_api()

    for user in users:
        with st.expander(f"{user['name']} ({user['email']})"):
            st.write(f"ID: {user['id']}")
            st.write(f"Roles: {user['roles']}")

            # ❌ Prevent self-delete
            if user["email"] == st.session_state.user["email"]:
                st.warning("You cannot delete yourself")
            else:
                if st.button(f"Delete User {user['id']}", key=f"del_{user['id']}"):
                    result = delete_user(
                        user_id=user["id"],
                        admin_email=st.session_state.user["email"]
                    )

                    if result:
                        st.success("User deleted")
                        st.rerun()
                    else:
                        st.error("Delete failed")


# ===== MAIN AUTH FUNCTION =====
def auth_ui():
    if "logged_in" not in st.session_state:
        st.session_state.logged_in = False

    if "user" not in st.session_state:
        st.session_state.user = {}

    cookie_manager = get_cookie_manager()

    # ===== LOGGED IN FLOW =====
    if st.session_state.logged_in:

        # ===== ADMIN =====
        if st.session_state.user.get("is_admin", False):
            col1, col2 = st.columns([6, 1])

            with col1:
                st.subheader("Admin Control Panel")

            with col2:
                if st.button("Logout"):
                    st.session_state.logged_in = False
                    st.session_state.user = {}
                    st.rerun()

            admin_panel()
            change_password_ui()

            return True

        # ===== NORMAL USER =====
        change_password_ui()
        return False

    # ===== NOT LOGGED IN =====
    st.markdown(
        """
        <div class="auth-title">Authentication</div>
        <style>
        .auth-title {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 10px;
        }
        </style>
        """,
        unsafe_allow_html=True
    )

    tab1, tab2 = st.tabs(["Login", "Sign Up"])

    with tab1:
        login_tab(cookie_manager)

    with tab2:
        signup_tab()

    return False