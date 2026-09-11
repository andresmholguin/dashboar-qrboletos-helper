@echo off
chcp 65001 > nul
echo =========================================================================
echo    DESACTIVADOR DE TAREA WINDOWS: INSTANTÁNEA SEMANAL (LUNES 00:00)
echo =========================================================================
echo.
schtasks /delete /tn "QRBoletos_Snapshot_Lunes" /f

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ ¡Tarea eliminada con éxito!
) else (
    echo.
    echo ℹ️ La tarea no estaba registrada o ya fue eliminada.
)
echo.
pause
