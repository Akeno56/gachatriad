@echo off
setlocal
set "TRIAD_NODE=%~dp0.tools\node-v24.22.2\node.exe"
if exist "%TRIAD_NODE%" goto launch
where.exe node.exe >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 LTS, then reopen this launcher.
  pause
  exit /b 1
)
set "TRIAD_NODE=node.exe"
:launch
echo Preparing the current LOCAL TEST version. This can take a minute.
"%TRIAD_NODE%" "%~dp0tools\server-control\launch.mjs" --local-test
if errorlevel 1 (
  echo.
  echo Local test setup failed. See the message above.
) else (
  echo.
  echo Local test panel: http://127.0.0.1:3040
  echo Click Start server, then Open local game preview.
)
echo.
pause
