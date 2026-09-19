@echo off
title Configurar Tarea Programada Diaria 00:00 - QRBoletos
echo =======================================================================
echo    CONFIGURAR CAPTURA AUTOMATICA DIARIA A LAS 00:00 (TASK SCHEDULER)
echo =======================================================================
echo.
echo Este asistente registrara una tarea programada en Windows para ejecutar
echo la captura de ventas de todos los eventos activos diariamente a las 00:00.
echo.
cd /d "%~dp0"

set TASK_NAME=QRBoletos_Daily_Snapshot_00h
set SCRIPT_PATH=%~dp0scripts\cron_daily_snapshot.py

echo Comprobando Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python no esta en el PATH del sistema. Asegurate de tener Python instalado.
    pause
    exit /b 1
)

echo.
echo Registrando tarea programada en Windows Task Scheduler: '%TASK_NAME%'...
schtasks /create /tn "%TASK_NAME%" /tr "python \"%SCRIPT_PATH%\"" /sc daily /st 00:00 /f

if %errorlevel% equ 0 (
    echo.
    echo =======================================================================
    echo [OK] Tarea programada registrada exitosamente!
    echo Horario: Todos los dias a las 00:00:00
    echo Comando: python "%SCRIPT_PATH%"
    echo Retencion: Los ultimos 7 dias rotativos se conservan automaticamente.
    echo =======================================================================
) else (
    echo.
    echo [AVISO] Se requieren privilegios de Administrador para registrar la tarea.
    echo Haz clic derecho en este archivo y selecciona "Ejecutar como administrador".
)

echo.
pause
