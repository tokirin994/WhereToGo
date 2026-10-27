param([ValidatePattern('^[0-9]+$')][string]$ServerId='22576',[string]$Username='tok')
$ErrorActionPreference='Stop'
$directory=Join-Path 'D:\Application\WhereToGo\remote-deploy' $ServerId
$accounts=Import-Clixml (Join-Path $directory 'accounts.clixml')
foreach($account in $accounts){if(-not $Username -or $account.Username -eq $Username){Write-Host "Username: $($account.Username)";Write-Host ('Password: '+[Net.NetworkCredential]::new('',$account.Password).Password)}}
