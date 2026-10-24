$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$appHome = 'D:\Application\WhereToGo'
$logs = Join-Path $appHome 'logs'
$jdk = 'D:\Application\Jdk-1.8\jdk-1.8\bin\java.exe'
$node = 'D:\Application\Nodejs\node.exe'
$pgBin = 'D:\Application\PostgreSQL16\pgsql\bin'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Test-Listening($port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Wait-Listening($port) {
    $deadline = (Get-Date).AddSeconds(45)
    while (-not (Test-Listening $port) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if (-not (Test-Listening $port)) { throw "Timed out waiting for local port $port" }
}

if (-not (Test-Listening 5432)) {
    $pgStart = Start-Process -FilePath "$pgBin\pg_ctl.exe" `
        -ArgumentList @('-D', 'D:\Application\PostgreSQL16\data', '-l', 'D:\Application\PostgreSQL16\postgresql.log', '-o', '"-h 127.0.0.1 -p 5432"', '-w', 'start') `
        -WindowStyle Hidden -Wait -PassThru `
        -RedirectStandardOutput (Join-Path $logs 'postgres-start.out.log') `
        -RedirectStandardError (Join-Path $logs 'postgres-start.err.log')
    if ($pgStart.ExitCode -ne 0) { throw "PostgreSQL could not start; see $logs\postgres-start.err.log" }
}
Wait-Listening 5432

if (-not (Test-Listening 8091)) {
    Start-Process -FilePath $node -ArgumentList @((Join-Path $repo 'smartledger\local-auth\server.mjs')) `
        -WorkingDirectory $repo -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'local-oidc.out.log') `
        -RedirectStandardError (Join-Path $logs 'local-oidc.err.log') | Out-Null
}
Wait-Listening 8091

if (-not (Test-Listening 8090)) {
    $env:SPRING_DATASOURCE_URL = 'jdbc:postgresql://localhost:5432/smartledger'
    $env:SPRING_DATASOURCE_USERNAME = 'smartledger'
    $env:SPRING_DATASOURCE_PASSWORD = Get-Content 'D:\Application\PostgreSQL16\smartledger-password.txt' -Raw
    $env:SMARTLEDGER_OIDC_ISSUER = 'http://localhost:8091/realms/local'
    $env:SMARTLEDGER_OIDC_AUDIENCE = 'smartledger-api'
    $env:SMARTLEDGER_ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:5174'
    $env:SMARTLEDGER_PUBLIC_URL = 'http://localhost:5174'
    $env:PORT = '8090'
    Start-Process -FilePath $jdk -ArgumentList @('-jar', (Join-Path $repo 'smartledger\backend\target\smartledger-api-0.1.0-SNAPSHOT.jar'), '--server.address=127.0.0.1') `
        -WorkingDirectory (Join-Path $repo 'smartledger\backend') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'smartledger-api.out.log') `
        -RedirectStandardError (Join-Path $logs 'smartledger-api.err.log') | Out-Null
    Remove-Item Env:SPRING_DATASOURCE_PASSWORD
}

if (-not (Test-Listening 8080) -and (Test-Path 'D:\Application\PostgreSQL16\pgsql\share\extension\postgis.control')) {
    $env:SPRING_DATASOURCE_URL = 'jdbc:postgresql://localhost:5432/travelatlas'
    $env:SPRING_DATASOURCE_USERNAME = 'travelatlas'
    $env:SPRING_DATASOURCE_PASSWORD = Get-Content 'D:\Application\PostgreSQL16\travelatlas-password.txt' -Raw
    $env:PORT = '8080'
    Start-Process -FilePath $jdk -ArgumentList @('-jar', (Join-Path $repo 'backend\target\travelatlas-api-0.1.0-SNAPSHOT.jar'), '--server.address=127.0.0.1') `
        -WorkingDirectory (Join-Path $repo 'backend') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'wheretogo-api.out.log') `
        -RedirectStandardError (Join-Path $logs 'wheretogo-api.err.log') | Out-Null
    Remove-Item Env:SPRING_DATASOURCE_PASSWORD
}
elseif (-not (Test-Listening 8080)) {
    Write-Warning 'WhereToGo API was not started because the PostgreSQL PostGIS extension is not installed yet.'
}

if (-not (Test-Listening 5174)) {
    Start-Process -FilePath $node -ArgumentList @((Join-Path $repo 'smartledger\frontend\node_modules\vite\bin\vite.js'), '--host', '127.0.0.1', '--port', '5174') `
        -WorkingDirectory (Join-Path $repo 'smartledger\frontend') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'smartledger-web.out.log') `
        -RedirectStandardError (Join-Path $logs 'smartledger-web.err.log') | Out-Null
}

if (-not (Test-Listening 5173)) {
    Start-Process -FilePath $node -ArgumentList @((Join-Path $repo 'frontend\node_modules\vite\bin\vite.js'), '--host', '127.0.0.1', '--port', '5173') `
        -WorkingDirectory (Join-Path $repo 'frontend') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'wheretogo-web.out.log') `
        -RedirectStandardError (Join-Path $logs 'wheretogo-web.err.log') | Out-Null
}

Write-Host 'SmartLedger Web: http://localhost:5174'
Write-Host 'WhereToGo Web: http://localhost:5173'
Write-Host 'SmartLedger API: http://localhost:8090/actuator/health'
Wait-Listening 8090
Wait-Listening 5174
Wait-Listening 5173
if (Test-Listening 8080) { Write-Host 'WhereToGo API: http://localhost:8080/api/v1/health' }
Write-Host 'Local OIDC: http://localhost:8091/realms/local/.well-known/openid-configuration'
Write-Host 'Logs: D:\Application\WhereToGo\logs'
