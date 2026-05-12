@echo off
title Stop Accfino Services

echo Stopping frontend/backend...

:: Kill Vite / React
taskkill /F /IM node.exe >nul 2>&1

:: Kill Python / FastAPI / Uvicorn
taskkill /F /IM python.exe >nul 2>&1

:: Optional: kill specific ports
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8001" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo.
echo All Accfino services stopped.
pause