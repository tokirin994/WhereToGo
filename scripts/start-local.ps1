$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$appHome = 'D:\Application\WhereToGo'
$logs = Join-Path $appHome 'logs'
$jdk = 'D:\Application\Jdk-1.8\jdk-1.8\bin\java.exe'
$node = 'D:\Application\Nodejs\node.exe'
$pgBin = 'D:\Application\PostgreSQL16\pgsql\bin'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Write-LocalWebSettings([string]$path, [hashtable]$values) {
    $content = if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { '' }
    foreach ($key in $values.Keys) {
        $pattern = '(?m)^' + [regex]::Escape($key) + '=.*$'
        $line = "$key=$($values[$key])"
        if ([regex]::IsMatch($content, $pattern)) { $content = [regex]::Replace($content, $pattern, $line) }
        else { $content = $content.TrimEnd() + "`n" + $line + "`n" }
    }
    [IO.File]::WriteAllText($path, $content.Trim() + "`n", [Text.UTF8Encoding]::new($false))
}

# Loopback development uses real Keycloak accounts. Production builds use separate HTTPS settings.
Write-LocalWebSettings (Join-Path $repo 'apps\portal\.env.local') @{
    VITE_API_BASE_URL='/api'; VITE_LOCAL_MOCK_AUTH='false'; VITE_OIDC_AUTHORITY='http://localhost:8091/realms/local';
    VITE_OIDC_CLIENT_ID='portal-web'; VITE_OIDC_AUDIENCE='portal-api';
    VITE_SMARTLEDGER_API_URL='http://localhost:8090'; VITE_SMARTLEDGER_PUBLIC_URL='http://localhost:5174/'; VITE_WHERE_TO_GO_PUBLIC_URL='http://localhost:5175/'; VITE_AUTH_MODE='portal'
}
Write-LocalWebSettings (Join-Path $repo 'apps\ledger\.env.local') @{
    VITE_SMARTLEDGER_API_URL='http://localhost:8090'; VITE_LOCAL_MOCK_AUTH='false'; VITE_OIDC_AUTHORITY='http://localhost:8091/realms/local';
    VITE_OIDC_CLIENT_ID='smartledger-web'; VITE_OIDC_AUDIENCE='smartledger-api';
    VITE_PORTAL_PUBLIC_URL='http://localhost:5173/'; VITE_WHERE_TO_GO_PUBLIC_URL='http://localhost:5175/'; VITE_AUTH_MODE='portal'
}

Write-LocalWebSettings (Join-Path $repo 'apps\travel\.env.local') @{
    VITE_API_BASE_URL='/api'; VITE_LOCAL_MOCK_AUTH='false'; VITE_OIDC_AUTHORITY='http://localhost:8091/realms/local';
    VITE_OIDC_CLIENT_ID='travel-web'; VITE_OIDC_AUDIENCE='wheretogo-api'; VITE_AUTH_MODE='portal';
    VITE_PORTAL_PUBLIC_URL='http://localhost:5173/'; VITE_WHERE_TO_GO_PUBLIC_URL='http://localhost:5175/';
    VITE_SMARTLEDGER_PUBLIC_URL='http://localhost:5174/'; VITE_SMARTLEDGER_API_URL='http://localhost:8090'
}

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

# Retire only this repository's legacy mock server; never stop an unrelated listener.
if (Test-Listening 8091) {
    $ownerId = (Get-NetTCPConnection -LocalPort 8091 -State Listen | Select-Object -First 1).OwningProcess
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
    if ($owner.CommandLine -and $owner.CommandLine.Contains((Join-Path $repo 'smartledger\local-auth\server.mjs'))) { Stop-Process -Id $ownerId; Start-Sleep -Milliseconds 500 }
    elseif ($owner.CommandLine -notlike '*Keycloak*' -and $owner.CommandLine -notlike '*keycloak*') { throw 'Port 8091 belongs to an unrelated service' }
}
& (Join-Path $PSScriptRoot 'start-identity.ps1')
$identityDeadline = (Get-Date).AddMinutes(3)
while (-not (Test-Listening 8091) -and (Get-Date) -lt $identityDeadline) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Listening 8091)) { throw 'Identity service failed to start; see identity.out.log and identity.err.log' }
& (Join-Path $PSScriptRoot 'configure-local-identity.ps1')

if (-not (Test-Listening 8090)) {
    $env:SPRING_PROFILES_ACTIVE = 'local'
    $env:SPRING_DATASOURCE_URL = 'jdbc:postgresql://localhost:5432/smartledger'
    $env:SPRING_DATASOURCE_USERNAME = 'smartledger'
    $env:SPRING_DATASOURCE_PASSWORD = Get-Content 'D:\Application\PostgreSQL16\smartledger-password.txt' -Raw
    $env:SMARTLEDGER_OIDC_ISSUER = 'http://localhost:8091/realms/local'
    $env:SMARTLEDGER_OIDC_AUDIENCE = 'smartledger-api'
    $env:SMARTLEDGER_ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:5174,http://localhost:5175'
    $env:SMARTLEDGER_PUBLIC_URL = 'http://localhost:5174'
    $env:SMARTLEDGER_CREDENTIAL_KEY_FILE = Join-Path $appHome 'secrets\credential-keyring.json'
    $env:PORT = '8090'
    Start-Process -FilePath $jdk -ArgumentList @('-jar', (Join-Path $repo 'smartledger\backend\target\smartledger-api-0.1.0-SNAPSHOT.jar'), '--server.address=127.0.0.1') `
        -WorkingDirectory (Join-Path $repo 'smartledger\backend') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'smartledger-api.out.log') `
        -RedirectStandardError (Join-Path $logs 'smartledger-api.err.log') | Out-Null
    Remove-Item Env:SPRING_DATASOURCE_PASSWORD
    Remove-Item Env:SMARTLEDGER_CREDENTIAL_KEY_FILE
}

if (-not (Test-Listening 8080) -and (Test-Path 'D:\Application\PostgreSQL16\pgsql\share\extension\postgis.control')) {
    $travelAiPath=Join-Path $appHome 'secrets\travel-ai.clixml'
    $previousTravelKey=[Environment]::GetEnvironmentVariable('TRAVEL_AI_API_KEY','Process')
    $loadedTravelAi=$false
    if(Test-Path -LiteralPath $travelAiPath){
        $travelAi=Import-Clixml -LiteralPath $travelAiPath
        $env:TRAVEL_AI_BASE_URL=$travelAi.BaseUrl
        $env:TRAVEL_AI_MODEL=$travelAi.Model
        $env:TRAVEL_AI_PROTOCOL=$travelAi.Protocol
        $env:TRAVEL_AI_TOKEN_FIELD=$travelAi.TokenField
        $env:TRAVEL_AI_AUTH_MODE=$travelAi.AuthMode
        if($travelAi.AnthropicVersion){$env:TRAVEL_AI_ANTHROPIC_VERSION=$travelAi.AnthropicVersion}
        $env:TRAVEL_AI_API_KEY=[Net.NetworkCredential]::new('',$travelAi.ApiKey).Password
        $loadedTravelAi=$true
    }
    $env:SPRING_PROFILES_ACTIVE = 'local'
    $env:SPRING_DATASOURCE_URL = 'jdbc:postgresql://localhost:5432/travelatlas'
    $env:SPRING_DATASOURCE_USERNAME = 'travelatlas'
    $env:SPRING_DATASOURCE_PASSWORD = Get-Content 'D:\Application\PostgreSQL16\travelatlas-password.txt' -Raw
    $env:APP_CORS_ALLOWED_ORIGINS='http://localhost:5173,http://localhost:5175'
    $env:PORT = '8080'
    try { Start-Process -FilePath $jdk -ArgumentList @('-jar', (Join-Path $repo 'backend\target\travelatlas-api-0.1.0-SNAPSHOT.jar'), '--server.address=127.0.0.1') `
        -WorkingDirectory (Join-Path $repo 'backend') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'wheretogo-api.out.log') `
        -RedirectStandardError (Join-Path $logs 'wheretogo-api.err.log') | Out-Null
    } finally {
        Remove-Item Env:SPRING_DATASOURCE_PASSWORD -ErrorAction SilentlyContinue
        if($loadedTravelAi){[Environment]::SetEnvironmentVariable('TRAVEL_AI_API_KEY',$previousTravelKey,'Process');$travelAi=$null}
    }
    Wait-Listening 8080
}
elseif (-not (Test-Listening 8080)) {
    Write-Warning 'WhereToGo API was not started because the PostgreSQL PostGIS extension is not installed yet.'
}

foreach($app in @(@('portal',5173),@('travel',5175),@('ledger',5174))){
    if(-not(Test-Listening $app[1])){
        $directory=Join-Path $repo "apps\$($app[0])"
        $npmCli=Join-Path (Split-Path $node) 'node_modules\npm\bin\npm-cli.js'
        Start-Process -FilePath $node -ArgumentList @($npmCli,'run','dev','--workspace',"@personal/$($app[0])") `
            -WorkingDirectory $repo -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logs "$($app[0])-web.out.log") `
            -RedirectStandardError (Join-Path $logs "$($app[0])-web.err.log") | Out-Null
    }
}

Write-Host 'SmartLedger Web: http://localhost:5174'
Write-Host 'Personal Portal: http://localhost:5173/'
Write-Host 'WhereToGo Web: http://localhost:5175/'
Write-Host 'SmartLedger API: http://localhost:8090/actuator/health'
Wait-Listening 8090
Wait-Listening 5174
Wait-Listening 5173
Wait-Listening 5175
if (Test-Listening 8080) { Write-Host 'WhereToGo API: http://localhost:8080/api/v1/health' }
Write-Host 'Unified account: http://localhost:5173/account/'
Write-Host 'Identity administration: http://localhost:8091/admin/'
Write-Host 'Initial credentials: run scripts/show-initial-account.ps1 (add -Administrator for identity administration)'
Write-Host 'Logs: D:\Application\WhereToGo\logs'
