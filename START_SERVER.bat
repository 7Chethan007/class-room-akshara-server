@echo off
title Akshara Backend Server
cd /d "%~dp0"
echo Killing any existing Node processes...
taskkill /IM node.exe /F 2>nul
timeout /t 3 >nul
echo Starting server...
npm run dev
pause
