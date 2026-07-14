@echo off
title NoteMitra Backend - Port 5000
color 0B
cd /d "%~dp0"
echo.
echo ========================================
echo   NOTEMITRA BACKEND STARTING
echo ========================================
echo.
echo Starting Express server on http://localhost:5000
echo.
:start
node server-enhanced.js
echo.
echo Backend crashed! Restarting in 3 seconds...
echo Press Ctrl+C to stop...
timeout /t 3 /nobreak
goto start
