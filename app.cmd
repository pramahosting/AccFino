@echo off
cd /d "%~dp0"

REM ── 1. DB init ────────────────────────────────────────────────────────────
if not exist "%~dp0db_app\hsledger.db" (
    python "%~dp0db_app\init_db.py"
)

REM ── 2. Python deps ────────────────────────────────────────────────────────
pip install -r "%~dp0requirements.txt" -q >nul 2>&1

REM ── 3. Node deps ──────────────────────────────────────────────────────────
if not exist "%~dp0react_frontend\node_modules" (
    cd /d "%~dp0react_frontend"
    call npm install --silent
    cd /d "%~dp0"
)

REM ── 4. Write helper bat files (avoids all quote-nesting issues) ───────────
set "TMPDB=%TEMP%\af_db.bat"
set "TMPAPI=%TEMP%\af_api.bat"
set "TMPUI=%TEMP%\af_ui.bat"

(
    echo @echo off
    echo cd /d "%~dp0"
    echo python -m uvicorn main_app.api_call:app --host 127.0.0.1 --port 8000 --reload
) > "%TMPDB%"

(
    echo @echo off
    echo cd /d "%~dp0"
    echo python -m uvicorn main_app.react_api:app --host 127.0.0.1 --port 8001 --reload
) > "%TMPAPI%"

(
    echo @echo off
    echo cd /d "%~dp0react_frontend"
    echo npm run dev
) > "%TMPUI%"

REM ── 5. Launch both APIs hidden ────────────────────────────────────────────
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/k \"%TMPDB%\"' -WindowStyle Hidden"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/k \"%TMPAPI%\"' -WindowStyle Hidden"

REM ── 6. React UI visible + wait for Vite then open browser ────────────────
start "Accfino" cmd /k "%TMPUI%"
timeout /t 9 /nobreak >nul
start "" http://localhost:3000

exit