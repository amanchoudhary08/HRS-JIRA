@echo off
setlocal
set ROOT=%~dp0

echo.
echo  HRS.AI — Agentic Avatar Platform
echo  Starting backend and frontend...
echo.

:: Clear stale AWS credentials so boto3 uses SSO profile
set AWS_ACCESS_KEY_ID=
set AWS_SECRET_ACCESS_KEY=
set AWS_SESSION_TOKEN=
set AWS_SECURITY_TOKEN=

:: AWS SSO Login
echo  [0/3] Logging in via AWS SSO...
aws sso login --profile Developer-721906891174
if errorlevel 1 (
    echo  [!] AWS SSO login failed. Make sure AWS CLI is installed.
    pause
    exit /b 1
)

:: Install Python deps
echo  [1/3] Installing Python dependencies...
cd /d "%ROOT%backend"
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo  [!] pip install failed.
    pause
    exit /b 1
)

:: Seed DB (skips if already seeded)
echo  [1/3] Seeding database...
python seed.py

:: Start backend (hot reload via uvicorn --reload)
echo  [2/3] Starting backend on http://localhost:8000  [hot reload ON]
start "HRS.AI Backend" cmd /k "set AWS_ACCESS_KEY_ID=& set AWS_SECRET_ACCESS_KEY=& set AWS_SESSION_TOKEN=& set AWS_SECURITY_TOKEN=& cd /d "%ROOT%backend" && python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app --reload-dir main.py --reload-delay 0.25"

timeout /t 3 /nobreak >nul

:: Start frontend (hot reload via Vite HMR)
echo  [3/3] Starting frontend on http://localhost:5173  [HMR ON]
start "HRS.AI Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev -- --force"

echo.
echo  Backend  ^>  http://localhost:8000
echo  API Docs ^>  http://localhost:8000/docs
echo  Frontend ^>  http://localhost:5173
echo.
echo  Login: admin@hrs.ai / Admin@123
echo.
endlocal
