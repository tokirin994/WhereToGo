param([switch]$AllApps)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$shareHome='D:\Application\WhereToGo\share'
$root=(Get-Content (Join-Path $shareHome 'current.txt') -Raw).Trim()
if(-not([IO.Path]::GetFullPath($root).StartsWith(([IO.Path]::GetFullPath($shareHome)+'\'),[StringComparison]::OrdinalIgnoreCase))){throw 'Invalid sharing session path'}
$stateFile=Join-Path $root 'state.json'
$state=Get-Content $stateFile -Raw -Encoding utf8 | ConvertFrom-Json
if(-not $state.ready -or [datetime]$state.expiresAt -le (Get-Date).ToUniversalTime()){throw 'Start an active sharing session before switching it to ledger only'}
$node='D:\Application\Nodejs\node.exe'
$gateway=Get-CimInstance Win32_Process -Filter "ProcessId=$($state.processes.gateway)"
if(-not $gateway.CommandLine.Contains((Join-Path $repo 'scripts\share-gateway.mjs'))){throw 'The gateway process does not belong to this project'}
if($AllApps){
 if(-not $state.database_travel -or -not(Test-Path (Join-Path $root 'build\travel\target\travelatlas-api-0.1.0-SNAPSHOT.jar')) -or -not(Test-Path (Join-Path $root 'dist\portal\index.html'))){throw 'This session has no complete travel deployment. Start a full sharing session without -LedgerOnly.'}
 $listener=Get-NetTCPConnection -LocalPort $state.ports.travel -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
 if($listener){$process=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)";if(-not $process.CommandLine.Contains((Join-Path $root 'build\travel\target'))){throw 'The travel API port belongs to an unrelated process'}}
}
$base=$state.publicOrigin
$output=Join-Path $root ('dist\ledger-'+$(if($AllApps){'full-'}else{'only-'})+(Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))
$settings=@{
 VITE_LOCAL_MOCK_AUTH='false';VITE_REGISTRATION_ENABLED='false';VITE_LEDGER_ONLY=$(if($AllApps){'false'}else{'true'});VITE_APP_BASE_PATH='/ledger/'
 VITE_OIDC_AUTHORITY="$base/identity/realms/share";VITE_OIDC_CLIENT_ID='smartledger-web';VITE_OIDC_AUDIENCE='smartledger-api'
 VITE_SMARTLEDGER_API_URL="$base/ledger-api";VITE_SMARTLEDGER_PUBLIC_URL="$base/ledger/"
 VITE_API_BASE_URL="$base/travel-api";VITE_PORTAL_PUBLIC_URL="$base/";VITE_WHERE_TO_GO_PUBLIC_URL="$base/travel/"
}
$previous=@{}
try{
 foreach($name in $settings.Keys){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$settings[$name],'Process')}
 $oldPath=$env:PATH;$env:PATH='D:\Application\Nodejs;'+$env:PATH
 Push-Location (Join-Path $repo 'apps\ledger')
 try{& 'D:\Application\Nodejs\npm.cmd' run build -- --mode share --outDir $output --emptyOutDir;if($LASTEXITCODE -ne 0){throw 'Ledger build failed; the running session was not changed'}}finally{Pop-Location}
}finally{foreach($name in $previous.Keys){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')};$env:PATH=$oldPath}
if($AllApps -and -not $listener){
 $secrets=Import-Clixml (Join-Path $root 'accounts.clixml')
 $apiSettings=@{
  SPRING_PROFILES_ACTIVE='';SPRING_DATASOURCE_URL="jdbc:postgresql://127.0.0.1:5432/$($state.database_travel)";SPRING_DATASOURCE_USERNAME=$state.database_travel
  SPRING_DATASOURCE_PASSWORD=[Net.NetworkCredential]::new('',$secrets.database.travel).Password
  APP_OIDC_ISSUER="$base/identity/realms/share";APP_OIDC_AUDIENCE='wheretogo-api';APP_CORS_ALLOWED_ORIGINS=$base
  API_OIDC_JWK_SET_URI="$base/identity/realms/share/protocol/openid-connect/certs";API_ALLOW_ANY_AUTHENTICATED_USER='false';API_ALLOWED_SUBJECTS=($secrets.accounts.id -join ',')
  DB_POOL_SIZE='2';HTTP_MAX_THREADS='16'
 }
 $before=@{}
 try{
  foreach($name in $apiSettings.Keys){$before[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$apiSettings[$name],'Process')}
  $jar=Join-Path $root 'build\travel\target\travelatlas-api-0.1.0-SNAPSHOT.jar'
  $travel=Start-Process 'D:\Application\Jdk-1.8\jdk-1.8\bin\java.exe' -ArgumentList @('-Xms32m','-Xmx192m','-XX:MaxMetaspaceSize=128m','-XX:+ExitOnOutOfMemoryError','-jar',('"'+$jar+'"'),"--server.port=$($state.ports.travel)",'--server.address=127.0.0.1') -WorkingDirectory (Join-Path $root 'build\travel') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'logs\travel.out.log') -RedirectStandardError (Join-Path $root 'logs\travel.err.log')
  $state.processes.travel=$travel.Id
  [IO.File]::WriteAllText($stateFile,($state|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
 }finally{foreach($name in $before.Keys){[Environment]::SetEnvironmentVariable($name,$before[$name],'Process')};$apiSettings.Clear();$secrets=$null}
}
if($AllApps){
 $deadline=(Get-Date).AddSeconds(180);$healthy=$false
 do{try{$response=Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$($state.ports.travel)/api/v1/health" -TimeoutSec 5;$healthy=$response.StatusCode -eq 200}catch{};if(-not $healthy){Start-Sleep -Milliseconds 600}}while(-not $healthy -and (Get-Date)-lt $deadline)
 if(-not $healthy){throw 'Travel API is not ready. The current sharing mode was retained; see private travel logs.'}
 if($listener){$state.processes.travel=$listener.OwningProcess}
}
$state | Add-Member -NotePropertyName ledgerOnly -NotePropertyValue (-not $AllApps) -Force
$state | Add-Member -NotePropertyName ledgerDist -NotePropertyValue $output -Force
[IO.File]::WriteAllText($stateFile,($state|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
if(-not $AllApps -and $state.processes.travel){
 $travel=Get-CimInstance Win32_Process -Filter "ProcessId=$($state.processes.travel)"
 if($travel -and $travel.CommandLine.Contains((Join-Path $root 'build\travel\target'))){Stop-Process -Id $travel.ProcessId;$state.processes.travel=$null}
}
[IO.File]::WriteAllText($stateFile,($state|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
if($AllApps){Write-Host "Portal: $base/";Write-Host "Travel: $base/travel/";Write-Host "Ledger: $base/ledger/"}else{Write-Host "Ledger only: $base/ledger/"}
Write-Host 'Existing identity, accounts, ledger data and sharing expiry were retained.'
