@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 20 or later, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Dorm3D is starting. The local address is printed below.
echo Keep this window open. Press Ctrl+C to stop the local server.
call npm run dev -- --open
if errorlevel 1 pause
endlocal
