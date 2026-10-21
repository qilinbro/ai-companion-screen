@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 22.12+ from https://nodejs.org/ first.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [INFO] Installing dependencies ^(first run downloads Electron, about 100 MB^)...
  call npm install --include=dev
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check network/proxy and try again.
    pause
    exit /b 1
  )
)

echo [INFO] Building Banping ^(original black character^) ...
call npm run build
if errorlevel 1 (
  echo.
  echo [ERROR] Build failed. Read the messages above.
  pause
  exit /b 1
)

echo [INFO] Starting the original black character desktop app...
echo [INFO] Click the companion to chat; send a request to open the canvas. Quit from the system tray.
call npm run desktop:start
if errorlevel 1 (
  echo.
  echo [ERROR] Startup failed. Read the messages above.
  pause
  exit /b 1
)

endlocal
