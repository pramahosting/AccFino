@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title AccFino Launcher

REM ── Config ────────────────────────────────────────────────────────────────
set SMTP_HOST=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=pramahosting@gmail.com
set SMTP_PASSWORD=ocyyqtkmrsfpggsp
set APP_URL=http://localhost:3000
set PYTHONPATH=%~dp0

echo.
echo  AccFino starting...
echo.

REM ── Python ────────────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 ( echo ERROR: Python not found & pause & exit /b 1 )
echo [OK] Python found.

REM ── Node ──────────────────────────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 ( echo ERROR: Node.js not found & pause & exit /b 1 )
echo [OK] Node.js found.

REM ── Python packages ───────────────────────────────────────────────────────
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo Installing Python packages, please wait...
    pip install -r "%~dp0requirements.txt"
    if errorlevel 1 ( echo ERROR: pip install failed & pause & exit /b 1 )
)
echo [OK] Python packages ready.

REM ── Node packages ─────────────────────────────────────────────────────────
if not exist "%~dp0react_frontend\node_modules" (
    echo Installing Node packages - this window will show progress...
    echo DO NOT CLOSE THIS WINDOW
    cd /d "%~dp0react_frontend"
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. See error above.
        echo Try running manually: cd react_frontend then npm install
        cd /d "%~dp0"
        pause
        exit /b 1
    )
    cd /d "%~dp0"
    echo [OK] Node packages installed.
) else (
    echo [OK] Node packages ready.
)

REM ── Free ports ────────────────────────────────────────────────────────────
echo Freeing ports...
for /f "tokens=5" %%i in ('netstat -aon 2^>nul ^| findstr ":8000 "') do taskkill /PID %%i /F >nul 2>&1
for /f "tokens=5" %%i in ('netstat -aon 2^>nul ^| findstr ":8001 "') do taskkill /PID %%i /F >nul 2>&1
for /f "tokens=5" %%i in ('netstat -aon 2^>nul ^| findstr ":3000 "') do taskkill /PID %%i /F >nul 2>&1
timeout /t 2 /nobreak >nul

REM ── Write temp launchers ──────────────────────────────────────────────────
set "TMPDB=%TEMP%\af_db.bat"
set "TMPAPI=%TEMP%\af_api.bat"
set "TMPUI=%TEMP%\af_ui.bat"

(
    echo @echo off
    echo title AccFino Auth :8000
    echo cd /d "%~dp0"
    echo set PYTHONPATH=%~dp0
    echo set SMTP_HOST=%SMTP_HOST%
    echo set SMTP_PORT=%SMTP_PORT%
    echo set SMTP_USER=%SMTP_USER%
    echo set SMTP_PASSWORD=%SMTP_PASSWORD%
    echo set APP_URL=%APP_URL%
    echo python -m uvicorn main_app.api_call:app --host 127.0.0.1 --port 8000
    echo pause
) > "%TMPDB%"

(
    echo @echo off
    echo title AccFino API :8001
    echo cd /d "%~dp0"
    echo set PYTHONPATH=%~dp0
    echo set SMTP_HOST=%SMTP_HOST%
    echo set SMTP_PORT=%SMTP_PORT%
    echo set SMTP_USER=%SMTP_USER%
    echo set SMTP_PASSWORD=%SMTP_PASSWORD%
    echo set APP_URL=%APP_URL%
    echo python -m uvicorn main_app.react_api:app --host 127.0.0.1 --port 8001
    echo pause
) > "%TMPAPI%"

(
    echo @echo off
    echo title AccFino UI :3000
    echo cd /d "%~dp0react_frontend"
    echo npm run dev
    echo pause
) > "%TMPUI%"


REM ── Launch Auth API (hidden) ───────────────────────────────────────────────
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/k ""%TMPDB%""' -WindowStyle Hidden"
echo [OK] Auth API starting...

:wait8000
timeout /t 1 /nobreak >nul
netstat -an | findstr "127.0.0.1:8000.*LISTENING" >nul 2>&1
if errorlevel 1 goto wait8000
echo [OK] Auth API ready.

REM ── Launch Main API (hidden) ───────────────────────────────────────────────
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/k ""%TMPAPI%""' -WindowStyle Hidden"
echo [OK] Main API starting (loading ML models, 15-60s)...

:wait8001
timeout /t 1 /nobreak >nul
netstat -an | findstr "127.0.0.1:8001.*LISTENING" >nul 2>&1
if errorlevel 1 goto wait8001
echo [OK] Main API ready.

REM ── Watcher ───────────────────────────────────────────────────────────────

REM ── Launch React UI (visible) ─────────────────────────────────────────────
start "AccFino UI :3000" cmd /k "%TMPUI%"

:wait3000
timeout /t 1 /nobreak >nul
netstat -an | findstr ":3000.*LISTENING" >nul 2>&1
if errorlevel 1 goto wait3000

echo.
echo ================================================
echo   AccFino is READY
echo   http://localhost:3000          Marketing
echo   http://localhost:3000/login    Sign in
echo   http://localhost:8001/docs     API docs
echo   Email:    admin@ex.com
echo   Password: 1
echo   Keep this window open.
echo   Run stop.bat to stop.
echo ================================================
echo.
REM ── Open in Brave Browser ────────────────────────────────────────────────
set "BRAVE1=%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"
set "BRAVE2=%PROGRAMFILES%\BraveSoftware\Brave-Browser\Application\brave.exe"
set "BRAVE3=%PROGRAMFILES(X86)%\BraveSoftware\Brave-Browser\Application\brave.exe"

if exist "%BRAVE1%" (
    start "" "%BRAVE1%" http://localhost:3000/index-marketing.html
) else if exist "%BRAVE2%" (
    start "" "%BRAVE2%" http://localhost:3000/index-marketing.html
) else if exist "%BRAVE3%" (
    start "" "%BRAVE3%" http://localhost:3000/index-marketing.html
) else (
    echo WARNING: Brave not found. Opening with default browser.
    start "" http://localhost:3000/index-marketing.html
)
pause