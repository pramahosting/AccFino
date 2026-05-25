"""
Run from Accfino/ root to reset admin password.
    python reset_password.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import bcrypt, sqlite3
from pathlib import Path

DB = Path(__file__).parent / "db_app" / "hsledger.db"
NEW_PW = "Admin@1"

conn = sqlite3.connect(DB)
cur  = conn.cursor()

cur.execute("SELECT id,username,email FROM users")
print("Current users:")
for r in cur.fetchall(): print(f"  {r}")

new_hash = bcrypt.hashpw(NEW_PW.encode(), bcrypt.gensalt()).decode()
cur.execute("UPDATE users SET password=? WHERE email='admin@ex.com' OR username='admin'", (new_hash,))
conn.commit()
print(f"\n✓ Admin password reset to: {NEW_PW}")
print(f"  Login: admin@ex.com  /  {NEW_PW}")
print(f"     or: admin         /  {NEW_PW}")
conn.close()
