param(
 [string]$Archive='',
 [string]$Age='D:\Application\Age\age\age.exe',
 [string]$RecoveryKey='D:\Application\WhereToGo\remote-deploy\22576\backup-recovery-key.clixml'
)
$ErrorActionPreference='Stop'
if(-not $Archive){$Archive=(Get-ChildItem -LiteralPath 'D:\Application\WhereToGo\backups' -Filter '*.tar.age' -File | Sort-Object Name -Descending | Select-Object -First 1).FullName}
if(-not $Archive -or -not (Test-Path -LiteralPath $Archive)){throw 'Encrypted backup archive not found'}
$secure=Import-Clixml -LiteralPath $RecoveryKey
$env:WTG_BACKUP_RECOVERY_KEY=[Net.NetworkCredential]::new('',$secure).Password
try{
 & 'D:\Application\Anaconda3\python.exe' (Join-Path $PSScriptRoot 'verify-backup-archive.py') --age $Age --archive $Archive
 if($LASTEXITCODE -ne 0){throw 'Encrypted archive verification failed'}
}finally{Remove-Item Env:WTG_BACKUP_RECOVERY_KEY -ErrorAction SilentlyContinue;$secure=$null}
