import sys, os
# Ensure project root is on sys.path so 'db_app' package resolves
# whether this file is run directly or as a module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
from db_app.database import engine, SessionLocal
from db_app.models.base import Base
from db_app.models.user import User
from db_app.models.role import Role
from db_app.models.permission import Permission
from db_app.models.invoice import BusinessDetail, Customer, Invoice, InvoiceItem
from db_app.models import association

# ── Permissions ───────────────────────────────────────────────────────────────
PERMISSIONS = [
    ("view_dashboard",    "View dashboard"),
    ("view_reports",      "View reports"),
    ("manage_users",      "Create, edit and delete users"),
    ("manage_roles",      "Create, edit and delete roles"),
    ("reconcile",         "Run bank reconciliation"),
    ("export_data",       "Export data to Excel/CSV"),
    ("invoice",           "Create and manage invoices"),
    ("admin",             "Full administrative access"),
]

# ── Role → Permission mapping ─────────────────────────────────────────────────
ROLE_PERMISSIONS = {
    "admin": [p[0] for p in PERMISSIONS],   # admin gets everything
    "user":  [
        "view_dashboard",
        "view_reports",
        "reconcile",
        "export_data",
        "invoice",
    ],
}


def init_db():
    print("Initializing database...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        if db.query(User).count() > 0:
            print("Users already exist. Skipping user creation.")
            return

        permission_map = {}

        for name, description in PERMISSIONS:
            p = Permission(name=name, description=description)
            db.add(p)
            permission_map[name] = p

        db.flush()

        role_map = {}

        for role_name, perms in ROLE_PERMISSIONS.items():
            role = Role(
                name=role_name,
                description='Admin with full access' if role_name == 'admin'
                else 'Regular user'
            )

            for perm_name in perms:
                perm = permission_map.get(perm_name)
                if perm:
                    role.permissions.append(perm)

            db.add(role)
            role_map[role_name] = role

        db.flush()

        hashed_password = bcrypt.hashpw(
            "Admin@1".encode(),
            bcrypt.gensalt()
        )

        admin_user = User(
            username="admin",
            full_name="Administrator",
            email="admin@ex.com",
            password=hashed_password,
        )

        admin_user.roles.append(role_map["admin"])

        db.add(admin_user)
        db.commit()

        print("Admin user created successfully.")
        print("  Login: admin@ex.com  /  Admin@1")

    except Exception as e:
        db.rollback()
        print(f"Error initializing database: {e}")
        raise

    finally:
        db.close()


if __name__ == "__main__":
    init_db()
