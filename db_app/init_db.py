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


def ensure_demo_licences():
    """Ensure every user has a demo licence record with start/end dates."""
    from datetime import datetime, timedelta, timezone
    from db_app.models.licence import LicenceRecord
    from db_app.models.user import User

    db = SessionLocal()
    try:
        today    = datetime.now(timezone.utc).date()
        end_date = today + timedelta(days=183)
        today_s  = str(today)
        end_s    = str(end_date)

        users = db.query(User).all()
        for user in users:
            lic = db.query(LicenceRecord).filter(LicenceRecord.user_id == user.id).first()
            if not lic:
                lic = LicenceRecord(
                    user_id      = user.id,
                    licence_type = "demo",
                    payment_mode = "",
                    start_date   = today_s,
                    end_date     = end_s,
                    notes        = "Auto-created",
                    modules      = "",
                )
                db.add(lic)
            else:
                # Fill in missing dates
                if not lic.start_date:
                    lic.start_date = today_s
                if not lic.end_date:
                    lic.end_date = end_s
                if not lic.licence_type:
                    lic.licence_type = "demo"
        db.commit()
        print("Demo licences ensured for all users.")
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