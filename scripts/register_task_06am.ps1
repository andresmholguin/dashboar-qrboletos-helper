$pythonExe = (Get-Command python).Source
$scriptPath = Join-Path $PSScriptRoot "cron_daily_snapshot.py"

Write-Host "Configurando tarea programada a las 06:00 AM..."
Write-Host "Python: $pythonExe"
Write-Host "Script: $scriptPath"

$action = New-ScheduledTaskAction -Execute $pythonExe -Argument "`"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At "06:00AM"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun

Register-ScheduledTask -TaskName "QRBoletos_Actualizacion_Diaria_06am" -Action $action -Trigger $trigger -Settings $settings -Force

Write-Host "======================================================="
Write-Host "¡Tarea programada registrada exitosamente a las 06:00 AM!"
Write-Host "======================================================="
