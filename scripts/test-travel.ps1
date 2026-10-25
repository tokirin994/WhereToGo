$ErrorActionPreference='Stop'
$bootstrap=Import-Clixml 'D:\Application\WhereToGo\secrets\identity-bootstrap.clixml'
$env:IDENTITY_TEST_ADMIN_PASSWORD=[Net.NetworkCredential]::new('',$bootstrap.AdminPassword).Password
$env:TRAVEL_TEST_DB_PASSWORD=([IO.File]::ReadAllText('D:\Application\PostgreSQL16\travelatlas-password.txt')).Trim()
try{& 'D:\Application\Nodejs\node.exe' (Join-Path $PSScriptRoot 'verify-travel.mjs');$result=$LASTEXITCODE}
finally{Remove-Item Env:IDENTITY_TEST_ADMIN_PASSWORD,Env:TRAVEL_TEST_DB_PASSWORD -ErrorAction SilentlyContinue}
exit $result
