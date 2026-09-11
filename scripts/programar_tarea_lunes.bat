@echo off
chcp 65001 > nul
echo =========================================================================
echo    PROGRAMADOR DE TAREA WINDOWS: INSTANTÁNEA SEMANAL (LUNES 00:00)
echo =========================================================================
echo.
echo Esta acción creará una Tarea Programada en Windows para ejecutarse
echo automáticamente todos los lunes a las 00:00 (medianoche).
echo.
set SCRIPT_PATH=%~dp0cron_weekly_snapshot.py

schtasks /create /tn "QRBoletos_Snapshot_Lunes" /tr "python \"%SCRIPT_PATH%\"" /sc weekly /d MON /st 00:00 /f

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ ¡Tarea programada con éxito!
    echo Nombre: QRBoletos_Snapshot_Lunes
    echo Frecuencia: Todos los lunes a las 00:00
) else (
    echo.
    echo ❌ Hubo un inconveniente creando la tarea. Si es necesario, ejecuta este .bat como Administrador.
)
echo.
pause
