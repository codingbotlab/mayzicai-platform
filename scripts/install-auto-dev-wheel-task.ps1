$ErrorActionPreference = 'Stop'
$taskName = 'MayzicAI Auto Development Wheel'
$user = "$env:USERDOMAIN\$env:USERNAME"
$workspace = 'D:\META_D\02_PRODUCTS\MAYZICAI'
$launcher = Join-Path $workspace 'scripts\run-auto-dev-wheel.vbs'
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument ('"' + $launcher + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Starts the local MayzicAI Studio Auto Development Wheel. The wheel only creates proposal records; it does not edit code or run commands.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Scheduled task registered and start requested.'
