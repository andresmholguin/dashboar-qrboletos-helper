@echo off
title Tunel Seguro - QRBoletos a Vercel
echo =======================================================================
echo     CONECTANDO TUNEL SEGURO HTTPS HACIA VERCEL
echo =======================================================================
echo.
echo Este script mantiene abierto un tunel HTTPS publico para que tu
echo despliegue en Vercel pueda comunicarse con tu PC local y Chrome (9222).
echo.
cd /d "%~dp0"
python scripts/start_tunnel.py 3001
pause
