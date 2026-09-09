@echo off
title Chrome Automation - QRBoletos
echo =======================================================================
echo    INICIANDO GOOGLE CHROME EN MODO DEPURACION (PUERTO 9222)
echo =======================================================================
echo.
echo Este script abre Chrome con el puerto de automatizacion CDP habilitado.
echo Tu sesion y credenciales se guardaran en:
echo %USERPROFILE%\chrome-dev-profile
echo.

set CHROME_PATH=""

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

if %CHROME_PATH%=="" (
    echo [ERROR] No se encontro chrome.exe en las rutas estandar.
    pause
    exit /b 1
)

start "" %CHROME_PATH% --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\chrome-dev-profile" https://dashboard.qrboletos.com

echo [OK] Chrome iniciado exitosamente en puerto 9222.
echo Ya puedes ir a tu aplicacion y pulsar "Detectar Show en Chrome".
timeout /t 3 >nul
exit /b 0
