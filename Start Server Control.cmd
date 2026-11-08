@echo off
setlocal
set "TRIAD_NODE=%~dp0.tools\node-v24.22.2\node.exe"
if exist "%TRIAD_NODE%" goto launch
where.exe node.exe >nul 2>&1
if errorlevel 1 (
  echo Gacha Triad needs Node.js 24 LTS installed with Add to PATH enabled.
  echo Download: https://nodejs.org/en/download
  echo After installing it, reopen this launcher.
  pause
  exit /b 1
)
set "TRIAD_NODE=node.exe"
:launch
"%TRIAD_NODE%" "%~dp0tools\server-control\launch.mjs"
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
