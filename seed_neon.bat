@echo off
cd /d "%~dp0"
set PYTHONPATH=%~dp0
set PYTHONIOENCODING=utf-8
set DATABASE_URL=postgresql+psycopg2://neondb_owner:npg_XH2QFas3gYDd@ep-dawn-scene-aqma9lhs.c-8.us-east-1.aws.neon.tech/neondb

echo.
echo  Seeding companies into Neon database...
echo.
python seed_neon.py
echo.
pause
