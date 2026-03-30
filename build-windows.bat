@echo off
setlocal
call npm install
if errorlevel 1 exit /b 1
call npm run check
if errorlevel 1 exit /b 1
call npm run dist:win
if errorlevel 1 exit /b 1
echo Build finished. See dist folder.
endlocal
