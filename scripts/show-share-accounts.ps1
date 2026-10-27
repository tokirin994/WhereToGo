param([string]$Username='')
$ErrorActionPreference='Stop'
$homePath='D:\Application\WhereToGo\share'
$root=(Get-Content (Join-Path $homePath 'current.txt') -Raw).Trim()
if(-not([IO.Path]::GetFullPath($root).StartsWith(([IO.Path]::GetFullPath($homePath)+'\'),[StringComparison]::OrdinalIgnoreCase))){throw 'Invalid sharing state path'}
$state=Get-Content (Join-Path $root 'state.json') -Raw | ConvertFrom-Json
$secrets=Import-Clixml (Join-Path $root 'accounts.clixml')
Write-Host "Entry: $($state.publicOrigin)"
Write-Host "Expires (Hong Kong): $([TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([datetime]$state.expiresAt,'China Standard Time').ToString('yyyy-MM-dd HH:mm'))"
foreach($account in $secrets.accounts){
  if($Username -and $account.username -ne $Username){continue}
  Write-Host "Username: $($account.username)"
  Write-Host ('Temporary password: '+[Net.NetworkCredential]::new('', $account.password).Password)
}
Write-Host 'Give each friend a different guest account. host is for the sharing owner. No account has system administrator access.'
