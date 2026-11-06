@echo off
title Configurar Actualizacion Automatica Diaria 06:00 AM - QRBoletos
echo =======================================================================
echo    CONFIGURAR ACTUALIZACION AUTOMATICA DIARIA A LAS 06:00 AM
echo =======================================================================
echo.
echo Este asistente registra o actualiza la tarea programada en Windows
echo para extraer las ventas de QRBoletos todos los dias a las 06:00 AM.
echo.
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\register_task_06am.ps1"

echo.
pause
