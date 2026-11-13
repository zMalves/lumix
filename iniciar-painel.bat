@echo off
title LUMIX — AI Video Studio
cd /d "%~dp0"
echo ============================================================
echo   Iniciando LUMIX — AI Video Studio
echo   Simplicity * Modern * Elegant * Futuristic
echo ============================================================
echo.
echo Abrindo o painel no navegador em: http://localhost:3333 ...
start http://localhost:3333
node dashboard/server.js
pause
