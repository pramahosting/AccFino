@echo off
cd /d "%~dp0"

REM ── SMTP config for password reset emails ────────────────────────────────
set SMTP_HOST=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=pramahosting@gmail.com
set SMTP_PASSWORD=ocyyqtkmrsfpggsp
set APP_URL=http://localhost:3000

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

REM ── 4. Write helper bat files (SMTP vars passed via set commands) ─────────
set "TMPDB=%TEMP%\af_db.bat"
set "TMPAPI=%TEMP%\af_api.bat"
set "TMPUI=%TEMP%\af_ui.bat"
set "TMPWATCH=%TEMP%\af_watch.ps1"

(
    echo @echo off
    echo cd /d "%~dp0"
    echo set SMTP_HOST=%SMTP_HOST%
    echo set SMTP_PORT=%SMTP_PORT%
    echo set SMTP_USER=%SMTP_USER%
    echo set SMTP_PASSWORD=%SMTP_PASSWORD%
    echo set APP_URL=%APP_URL%
    echo python -m uvicorn main_app.api_call:app --host 127.0.0.1 --port 8000
) > "%TMPDB%"

(
    echo @echo off
    echo cd /d "%~dp0"
    echo set SMTP_HOST=%SMTP_HOST%
    echo set SMTP_PORT=%SMTP_PORT%
    echo set SMTP_USER=%SMTP_USER%
    echo set SMTP_PASSWORD=%SMTP_PASSWORD%
    echo set APP_URL=%APP_URL%
    echo python -m uvicorn main_app.react_api:app --host 127.0.0.1 --port 8001
) > "%TMPAPI%"

(
    echo @echo off
    echo cd /d "%~dp0react_frontend"
    echo npm run dev
) > "%TMPUI%"

REM ── 5. Write PowerShell watcher script ────────────────────────────────────
(
    echo $title = 'Accfino'
    echo Start-Sleep -Seconds 15
    echo do {
    echo     Start-Sleep -Seconds 3
    echo     $win = Get-Process ^| Where-Object { $_.MainWindowTitle -like "*$title*" }
    echo } while ^($win^)
    echo $ports = @(8000, 8001^)
    echo foreach ^($port in $ports^) {
    echo     $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    echo     if ^($conn^) {
    echo         Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    echo     }
    echo }
    echo Get-Process -Name "node" -ErrorAction SilentlyContinue ^| Stop-Process -Force -ErrorAction SilentlyContinue
) > "%TMPWATCH%"

REM ── 6. Launch both APIs hidden ────────────────────────────────────────────
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/k \"%TMPDB%\"' -WindowStyle Hidden"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/k \"%TMPAPI%\"' -WindowStyle Hidden"

REM ── 7. Launch watcher hidden ──────────────────────────────────────────────
powershell -WindowStyle Hidden -Command "Start-Process powershell -ArgumentList '-WindowStyle Hidden -ExecutionPolicy Bypass -File \"%TMPWATCH%\"' -WindowStyle Hidden"

REM ── 8. React UI visible + wait for Vite then open browser ────────────────
start "Accfino" cmd /k "%TMPUI%"
timeout /t 9 /nobreak >nul
start "" http://localhost:3000

exit