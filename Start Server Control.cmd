@echo off
setlocal
where.exe node.exe >nul 2>&1
if errorlevel 1 (
  echo Gacha Triad needs Node.js 24 LTS installed with Add to PATH enabled.
  echo Download: https://nodejs.org/en/download
  echo After installing it, reopen this launcher.
  pause
  exit /b 1
)
node.exe "%~dp0tools\server-control\launch.mjs"
if errorlevel 1 (
  echo.
  echo The launcher encountered an error. See the message above.
) else (
  echo.
  echo If no browser appeared, open the panel address printed above manually.
)
echo.
echo You can close this window. The control panel will keep running.
pause
