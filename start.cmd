@echo off
setlocal
cd /d "%~dp0"

set "Q3D_NODE=node.exe"
where.exe node.exe >nul 2>&1
if errorlevel 1 (
  set "Q3D_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if not exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" goto missing_node
)

if not exist "%~dp0node_modules\vite\bin\vite.js" goto missing_dependencies

echo.
echo q3d: http://127.0.0.1:5173/
echo Keep this window open while using the editor. Press Ctrl+C to stop.
echo.
"%Q3D_NODE%" "%~dp0node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5173 --strictPort
if errorlevel 1 pause
exit /b

:missing_node
echo Node.js was not found. Install Node.js 24 from https://nodejs.org and try again.
pause
exit /b 1

:missing_dependencies
echo Project dependencies are missing. Install them as described in README.md.
pause
exit /b 1
