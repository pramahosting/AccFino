import bcrypt
from db_app.database import engine, SessionLocal
from db_app.models.base import Base
from db_app.models.user import User
from db_app.models.role import Role
from db_app.models.permission import Permission
from db_app.models.invoice import BusinessDetail, Customer, Invoice, InvoiceItem
from db_app.models import association

PERMISSIONS = [
    ("read",  "Read access"),
    ("write", "Write access"),
    ("admin", "Admin access"),
]

ROLE_PERMISSIONS = {
    "admin": ["read", "write", "admin"],
    "user":  ["read", "write"],
}

def _ensure_home_company_column():
    """Add home_company column to users table if it doesn't exist yet.
    Must run BEFORE any ORM query on User, since the shipped hsledger.db
    was created before this column was added."""
    import sqlite3
    from db_app.database import _DATABASE_URL
    if not _DATABASE_URL.startswith("sqlite"):
        return  # Postgres handles this via Base.metadata.create_all
    db_path = _DATABASE_URL.replace("sqlite:///", "")
    try:
        conn = sqlite3.connect(db_path)
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "home_company" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN home_company VARCHAR(255) DEFAULT ''")
            conn.commit()
            print("Migration: added users.home_company column")
        conn.close()
    except Exception as e:
        print(f"Warning: home_company migration skipped: {e}")


def _ensure_admin_exists(db):
    """
    Ensure the admin user exists with correct password and role.
    Runs every startup even when users already exist — fixes broken deployments
    where init_db crashed mid-run leaving partial data (roles but no admin user).
    """
    try:
        from db_app.models.user import User
        from db_app.models.role import Role
        import bcrypt as _bcrypt

        admin = db.query(User).filter(
            (User.email == "admin@accfino.com") | (User.username == "admin")
        ).first()

        if not admin:
            # Admin user missing — create it now
            print("Admin user missing — creating...")
            admin_role = db.query(Role).filter(Role.name == "admin").first()

            hashed = _bcrypt.hashpw("1".encode(), _bcrypt.gensalt()).decode()
            admin = User(
                username="admin",
                full_name="Administrator",
                email="admin@accfino.com",
                password=hashed,
            )
            if admin_role:
                admin.roles.append(admin_role)
            db.add(admin)
            db.commit()
            print("Admin user created with password 'Accfino$1'.")
            return

        # Admin exists — ensure it has the admin role
        role_names = [r.name for r in admin.roles]
        if "admin" not in role_names:
            admin_role = db.query(Role).filter(Role.name == "admin").first()
            if admin_role:
                admin.roles.append(admin_role)
                db.commit()
                print("Fixed: admin role attached to admin user.")

    except Exception as e:
        print(f"Warning: _ensure_admin_exists failed (non-fatal): {e}")


def init_db():
    print("Initializing database...")
    # Patch missing columns BEFORE any ORM query (shipped DB may be older schema)
    _ensure_home_company_column()
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        if db.query(User).count() > 0:
            print("Users already exist. Skipping user creation.")
            _ensure_admin_exists(db)
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
            "1".encode(),
            bcrypt.gensalt()
        ).decode()   # store as string, not bytes

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

    except Exception as e:
        db.rollback()
        print(f"Error initializing database: {e}")
        raise

    finally:
        db.close()

    # Seed company database (runs every startup — skips existing entries)
    _seed_companies_safe()


def _seed_companies_safe():
    """Seed company database — safe to run multiple times."""
    try:
        from db_app.company_seed import seed_companies
        db2 = SessionLocal()
        n = seed_companies(db2)
        if n > 0:
            print(f"Company DB: {n} new companies seeded.")
        else:
            print("Company DB: already seeded, no new entries.")
        db2.close()
    except Exception as e:
        print(f"Warning: company seed failed (non-fatal): {e}")


def ensure_demo_licences():
    """Ensure every user has a licence record with correct start/end dates."""
    from datetime import datetime, timedelta, timezone
    from db_app.models.licence import LicenceRecord
    from db_app.models.user import User
    import json as _json

    BASE_MODULES  = ["dashboard", "reconciliation"]
    ADMIN_MODULES = ["dashboard", "reconciliation", "trading",
                     "cash-flow", "invoice", "admin", "file-manager", "licence"]

    db = SessionLocal()
    try:
        today   = datetime.now(timezone.utc).date()
        today_s = str(today)

        users = db.query(User).all()
        for user in users:
            is_admin = any(r.name == "admin" for r in user.roles)
            lic = db.query(LicenceRecord).filter(LicenceRecord.user_id == user.id).first()

            if not lic:
                lic = LicenceRecord(
                    user_id      = user.id,
                    licence_type = "admin" if is_admin else "base",
                    plan_id      = "premium" if is_admin else "base",
                    payment_mode = "",
                    # start_date fixed to today if not set
                    start_date   = today_s,
                    # admin: never expires | user: 6 months
                    end_date     = "9999-12-31" if is_admin else str(today + timedelta(days=183)),
                    notes        = "Auto-created",
                    modules      = _json.dumps(ADMIN_MODULES if is_admin else BASE_MODULES),
                )
                db.add(lic)
            else:
                # Fix missing start_date — lock to original value
                if not lic.start_date:
                    lic.start_date = today_s
                # Fix missing end_date
                if not lic.end_date:
                    lic.end_date = "9999-12-31" if is_admin else str(today + timedelta(days=183))
                # Fix licence_type
                if not lic.licence_type or lic.licence_type == "demo":
                    lic.licence_type = "admin" if is_admin else "base"
                # Fix plan_id — "admin" is not a real plan in pricing.json
                if is_admin and lic.plan_id in ("admin", "", None):
                    lic.plan_id = "premium"
                # Fix admin end date
                if is_admin and lic.end_date != "9999-12-31":
                    lic.end_date = "9999-12-31"
                # Fix modules
                if not lic.modules or lic.modules == "":
                    lic.modules = _json.dumps(ADMIN_MODULES if is_admin else BASE_MODULES)

        db.commit()
        print("Licences ensured for all users.")
    except Exception as e:
        db.rollback()
        print(f"Warning: could not ensure licences: {e}")
    finally:
        db.close()


def migrate_db():
    """Add missing columns to existing DBs — safe to run multiple times."""
    import sqlite3
    from db_app.database import _DB_FILE
    db = sqlite3.connect(str(_DB_FILE))
    try:
        cols = [r[1] for r in db.execute("PRAGMA table_info(licence_records)").fetchall()]
        new_cols = [
            ("plan_id",            "VARCHAR(50)"),
            ("billing_period",     "VARCHAR(10)"),
            ("stripe_customer_id", "VARCHAR(100)"),
            ("stripe_sub_id",      "VARCHAR(100)"),
            ("amount_paid",        "VARCHAR(20)"),
        ]
        # Users table migrations
        user_cols = [r[1] for r in db.execute("PRAGMA table_info(users)").fetchall()]
        if "home_company" not in user_cols:
            db.execute("ALTER TABLE users ADD COLUMN home_company VARCHAR(255) DEFAULT ''")
            print("Migration: added column users.home_company")
        for col, typ in new_cols:
            if col not in cols:
                db.execute(f"ALTER TABLE licence_records ADD COLUMN {col} {typ} DEFAULT ''")
                print(f"Migration: added column {col}")
        db.commit()
    except Exception as e:
        print(f"Migration warning: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    migrate_db()
    ensure_demo_licences()
