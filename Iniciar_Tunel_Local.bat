@echo off
title Tunel Seguro y Servidor Local - QRBoletos a Vercel
echo =======================================================================
echo     CONECTANDO TUNEL SEGURO HTTPS HACIA VERCEL
echo =======================================================================
echo.
echo Este script mantiene abierto el servidor y tunel HTTPS publico para
echo que tu despliegue en Vercel pueda comunicarse con tu PC y Chrome (9222).
echo.
cd /d "%~dp0"

:: Verificar si el servidor local en puerto 3001 ya esta corriendo
netstat -ano | findstr :3001 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [INFO] Iniciando servidor Next.js en puerto 3001...
    start "Servidor Local QRBoletos (Puerto 3001)" cmd /c "npm run dev -- -p 3001"
    timeout /t 4 >nul
) else (
    echo [OK] Servidor Next.js ya esta activo en puerto 3001.
)

python scripts/start_tunnel.py 3001
pause
