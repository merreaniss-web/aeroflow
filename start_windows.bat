@echo off
cd /d "%~dp0"
node --version >nul 2>&1 || (echo Installez Node.js 20+ depuis https://nodejs.org/ & pause & exit /b 1)
node server.mjs
pause
