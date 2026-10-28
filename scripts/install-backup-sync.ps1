param(
 [Parameter(Mandatory=$true)][string]$ServerHost,
 [Parameter(Mandatory=$true)][string]$KnownHostsFile,
 [ValidateRange(1,65535)][int]$ServerPort=22,
 [ValidatePattern('^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')][string]$DailyAt='00:00',
 [string]$Destination='D:\Application\WhereToGo\backups',
 [string]$InstallDirectory='D:\Application\WhereToGo\backup-sync',
 [string]$Python='D:\Application\Anaconda3\python.exe',
 [switch]$RunNow
)
$ErrorActionPreference='Stop'
if(-not (Test-Path -LiteralPath $Python)){throw 'Python with paramiko is required; specify its installed path'}
New-Item -ItemType Directory -Force -Path $InstallDirectory,$Destination | Out-Null
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $InstallDirectory /inheritance:r /grant:r "*$($sid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to protect the backup synchronization configuration directory'}
foreach($name in @('pull-vps-backups.py','run-backup-sync.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $InstallDirectory $name) -Force}
$packages=Join-Path $InstallDirectory 'python-packages'
if(-not (Test-Path -LiteralPath (Join-Path $packages 'backup-dependencies.json'))){
 & $Python (Join-Path $PSScriptRoot 'prepare-backup-python.py') $packages
 if($LASTEXITCODE -ne 0){throw 'Install paramiko in the selected Python interpreter, then rerun this installer'}
}
$privateKey=Join-Path $InstallDirectory 'download-key.clixml'
$publicKey=Join-Path $InstallDirectory 'download-key.pub'
if(-not (Test-Path -LiteralPath $privateKey)){
 $keyJson=& $Python (Join-Path $InstallDirectory 'pull-vps-backups.py') --generate-key
 if($LASTEXITCODE -ne 0){throw 'Backup key generation failed'}
 $keys=$keyJson | ConvertFrom-Json
 ConvertTo-SecureString $keys.private -AsPlainText -Force | Export-Clixml -LiteralPath $privateKey
 [IO.File]::WriteAllText($publicKey,$keys.public+"`n",[Text.UTF8Encoding]::new($false))
 $keys=$null;$keyJson=$null
}
$knownHosts=Join-Path $InstallDirectory 'known_hosts'
if(-not (Test-Path -LiteralPath $KnownHostsFile -PathType Leaf)){throw 'Specify the verified server known_hosts file; automatic host key acceptance is not allowed'}
Copy-Item -LiteralPath $KnownHostsFile -Destination $knownHosts -Force
$configuration=Join-Path $InstallDirectory 'config.json'
$config=@{host=$ServerHost;port=$ServerPort;knownHosts=$knownHosts;privateKey=$privateKey;destination=[IO.Path]::GetFullPath($Destination);statusFile=(Join-Path $InstallDirectory 'status.json');python=$Python;pythonPackages=$packages;dailyAt=$DailyAt;timeZone=[TimeZoneInfo]::Local.Id;maxAgeHours=30}
[IO.File]::WriteAllText($configuration,($config | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $InstallDirectory 'run-backup-sync.ps1')+'" -Configuration "'+$configuration+'"')
$triggers=@((New-ScheduledTaskTrigger -Daily -At $DailyAt),(New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)))
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10)
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'WhereToGo-EncryptedDatabaseBackup' -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Pull encrypted VPS database backups; never restore over local business data.' -Force | Out-Null
Write-Output "Daily backup pull scheduled at $DailyAt ($([TimeZoneInfo]::Local.Id)); destination: $Destination"
Write-Output "Authorize the read-only public key on the server: $publicKey"
if($RunNow){& (Join-Path $InstallDirectory 'run-backup-sync.ps1') -Configuration $configuration}
