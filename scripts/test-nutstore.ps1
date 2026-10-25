param([string]$Username,[Security.SecureString]$AppPassword)
$ErrorActionPreference='Stop'
if (-not $Username) { $Username=Read-Host 'Nutstore account email' }
if (-not $AppPassword) { $AppPassword=Read-Host 'Nutstore third-party app password' -AsSecureString }
$bootstrap=Import-Clixml 'D:\Application\WhereToGo\secrets\identity-bootstrap.clixml'
$env:IDENTITY_TEST_ADMIN_PASSWORD=[Net.NetworkCredential]::new('',$bootstrap.AdminPassword).Password
$env:LEDGER_TEST_DB_PASSWORD=([IO.File]::ReadAllText('D:\Application\PostgreSQL16\smartledger-password.txt')).Trim()
$env:NUTSTORE_TEST_USERNAME=$Username
$env:NUTSTORE_TEST_PASSWORD=[Net.NetworkCredential]::new('',$AppPassword).Password
$result=1
try {
    & 'D:\Application\Nodejs\node.exe' (Join-Path $PSScriptRoot 'verify-nutstore.mjs')
    $result=$LASTEXITCODE
} finally {
    'IDENTITY_TEST_ADMIN_PASSWORD','LEDGER_TEST_DB_PASSWORD','NUTSTORE_TEST_USERNAME','NUTSTORE_TEST_PASSWORD' | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}
exit $result
