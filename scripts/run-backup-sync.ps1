param([string]$Configuration='D:\Application\WhereToGo\backup-sync\config.json')
$ErrorActionPreference='Stop'
$mutex=New-Object Threading.Mutex($false,'Local\WhereToGo-BackupSync')
if(-not $mutex.WaitOne(0)){Write-Output 'A backup synchronization is already running';$mutex.Dispose();exit 0}
$config=Get-Content -LiteralPath $Configuration -Raw | ConvertFrom-Json
$secureKey=Import-Clixml -LiteralPath $config.privateKey
$env:WTG_BACKUP_PRIVATE_KEY=[Net.NetworkCredential]::new('',$secureKey).Password
$previousPythonPath=$env:PYTHONPATH
$env:PYTHONPATH=$config.pythonPackages
try{
 $logDirectory=Join-Path (Split-Path -Parent $Configuration) 'logs'
 New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
 $log=Join-Path $logDirectory ((Get-Date -Format 'yyyyMMdd')+'.log')
 $ErrorActionPreference='Continue'
 $output=& $config.python (Join-Path $PSScriptRoot 'pull-vps-backups.py') --config $Configuration 2>&1
 $result=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 $output | Out-File -LiteralPath $log -Encoding utf8 -Append
 $output | Write-Output
 if($result -ne 0){throw 'Backup synchronization failed; inspect the local backup log'}
}finally{Remove-Item Env:WTG_BACKUP_PRIVATE_KEY -ErrorAction SilentlyContinue;$env:PYTHONPATH=$previousPythonPath;$secureKey=$null;$mutex.ReleaseMutex();$mutex.Dispose()}
