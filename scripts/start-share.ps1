param([ValidateRange(1,24)][int]$Hours=8,[ValidateRange(1,10)][int]$GuestCount=3,[switch]$Resume,[switch]$LedgerOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$homePath='D:\Application\WhereToGo\share'
$node='D:\Application\Nodejs\node.exe'
$maven='D:\Application\Apache-maven-3.9.11\bin\mvn.cmd'
$pg='D:\Application\PostgreSQL16\pgsql\bin'
$jdk8='D:\Application\Jdk-1.8\jdk-1.8'
$jdk21='D:\Application\Jdk-21\runtime'
$cloud='D:\Application\cloudflared\cloudflared-2026.10.3.exe'
New-Item -ItemType Directory -Force -Path $homePath | Out-Null
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $homePath '/inheritance:r' '/grant:r' "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to protect the sharing directory'}
$currentPath=Join-Path $homePath 'current.txt'
if(Test-Path -LiteralPath $currentPath){
  $old=Get-Content -LiteralPath $currentPath -Raw
  if(Test-Path -LiteralPath (Join-Path $old.Trim() 'state.json')){
    $oldState=Get-Content (Join-Path $old.Trim() 'state.json') -Raw | ConvertFrom-Json
    if(-not $Resume -and $oldState.processes.gateway -and (Get-Process -Id $oldState.processes.gateway -ErrorAction SilentlyContinue)){throw 'A sharing session exists. Run scripts/stop-share.ps1 before starting another.'}
  }
}
if(-not(Test-Path $cloud)){
  Write-Host 'Installing verified cloudflared to D:\Application\cloudflared...'
  New-Item -ItemType Directory -Force -Path (Split-Path $cloud) | Out-Null
  $candidate=Join-Path (Split-Path $cloud) 'cloudflared.exe.download'
  if(-not(Test-Path $candidate)){Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.3/cloudflared-windows-amd64.exe' -OutFile $candidate -TimeoutSec 120}
  $expected='76b2805253d0d6ffacb092a7acfbee99e7af6917835c0c5410e23f3ef5052da2'
  if((Get-FileHash $candidate -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'cloudflared checksum mismatch'}
  Move-Item -LiteralPath $candidate -Destination $cloud
}
foreach($file in @($node,$maven,"$pg\psql.exe","$jdk8\bin\java.exe","$jdk21\bin\java.exe")){if(-not(Test-Path -LiteralPath $file)){throw "Missing local dependency: $file"}}
$id=(Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
$root=Join-Path $homePath "sessions\$id"
New-Item -ItemType Directory -Force -Path $root,(Join-Path $root 'logs'),(Join-Path $root 'dist') | Out-Null
$state=@{sessionId=$id;root=$root;publicOrigin='';ledgerOnly=$LedgerOnly.IsPresent;expiresAt=(Get-Date).ToUniversalTime().AddHours($Hours).ToString('o');ready=$false;processes=@{};ports=@{identity=8191;travel=8082;ledger=8092;gateway=18180};originalServices=@()}
if($Resume){
  if(-not $oldState -or $oldState.ready){throw 'Resume requires an unfinished sharing session'}
  $state=@{};foreach($property in $oldState.PSObject.Properties){$state[$property.Name]=$property.Value}
  $state.processes=@{};foreach($property in $oldState.processes.PSObject.Properties){$state.processes[$property.Name]=$property.Value}
  $root=$state.root;$id=$state.sessionId
  foreach($name in @('gateway','tunnel')){if(-not(Get-Process -Id $state.processes[$name] -ErrorAction SilentlyContinue)){throw 'Resume requires the existing gateway and tunnel to be running'}}
  foreach($name in @('identity','travel','ledger')){if($state.processes[$name] -and (Get-Process -Id $state.processes[$name] -ErrorAction SilentlyContinue)){throw 'A backend is already running; stop this session before restarting it'}}
}
function Save-State { [IO.File]::WriteAllText((Join-Path $root 'state.json'),($state|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false)) }
function Plain([Security.SecureString]$value){[Net.NetworkCredential]::new('',$value).Password}
function New-Secret { $bytes=New-Object byte[] 24; $rng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$rng.GetBytes($bytes)}finally{$rng.Dispose()};'Aa1!'+[Convert]::ToBase64String($bytes) }
function Start-Background([string]$name,[string]$file,[string[]]$arguments,[string]$working){
  $quoted=$arguments | ForEach-Object {if($_ -match '[\s"]'){ '"'+$_.Replace('"','\"')+'"' }else{$_}}
  $child=Start-Process -FilePath $file -ArgumentList $quoted -WorkingDirectory $working -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root "logs\$name.out.log") -RedirectStandardError (Join-Path $root "logs\$name.err.log")
  $state.processes[$name]=$child.Id;Save-State
}
function Wait-Address([string]$address,[int]$seconds=180,[hashtable]$headers=@{}){
  $deadline=(Get-Date).AddSeconds($seconds)
  do{try{$response=Invoke-WebRequest -UseBasicParsing -Uri $address -Headers $headers -TimeoutSec 8;if($response.StatusCode -eq 200){return}}catch{};Start-Sleep -Milliseconds 600}while((Get-Date)-lt$deadline)
  throw "Service did not become ready: $address. See protected logs in $root\logs"
}
Save-State
[IO.File]::WriteAllText($currentPath,$root,[Text.UTF8Encoding]::new($false))
try{
  if(-not $Resume){
  Write-Host 'Switching the local development processes to the isolated sharing session...'
  foreach($port in @(5173,5174,5175,8080,8090,8091)){
    $listeners=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    foreach($ownerId in ($listeners.OwningProcess | Sort-Object -Unique)){
      $process=Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
      if(-not($process.CommandLine -and ($process.CommandLine.Contains($repo) -or $process.CommandLine -like '*D:\Application\Keycloak\*'))){throw "Port $port belongs to an unrelated process; no action was taken on it"}
      $state.originalServices+=@{port=$port;processId=$ownerId};Save-State
      Stop-Process -Id $ownerId
    }
  }
  foreach($port in @(18180,8191,8082,8092)){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw "Sharing port $port is occupied"}}
  & "$pg\pg_ctl.exe" status -D 'D:\Application\PostgreSQL16\data' *> $null
  if($LASTEXITCODE -ne 0){
    $pgStart=Start-Process "$pg\pg_ctl.exe" -ArgumentList @('-D','D:\Application\PostgreSQL16\data','-l','D:\Application\PostgreSQL16\postgresql.log','-o','"-h 127.0.0.1 -p 5432"','-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'logs\postgres.out.log') -RedirectStandardError (Join-Path $root 'logs\postgres.err.log')
    $pgStart.WaitForExit()
    if($pgStart.ExitCode -ne 0){throw 'Unable to start PostgreSQL; see the sharing PostgreSQL logs'}
  }
  $secrets=@{adminPassword=ConvertTo-SecureString (New-Secret) -AsPlainText -Force;database=@{};accounts=@()}
  foreach($kind in @('travel','ledger','identity')){$secrets.database[$kind]=ConvertTo-SecureString (New-Secret) -AsPlainText -Force}
  for($index=0;$index -le $GuestCount;$index++){$secrets.accounts+=@{id=[guid]::NewGuid().ToString();username=$(if($index -eq 0){'host'}else{"guest$index"});password=ConvertTo-SecureString (New-Secret) -AsPlainText -Force}}
  $secrets | Export-Clixml (Join-Path $root 'accounts.clixml')
  $env:PGPASSWORD=([IO.File]::ReadAllText('D:\Application\PostgreSQL16\postgres-password.txt')).Trim()
  try{
    foreach($kind in @('travel','ledger','identity')){
      if($state.ledgerOnly -and $kind -eq 'travel'){continue}
      $name="wtg_share_${id}_$kind";$state["database_$kind"]=$name
      $env:SHARE_DB_PASSWORD=Plain $secrets.database[$kind]
      $sql=@'
\getenv password SHARE_DB_PASSWORD
CREATE ROLE :"name" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'password';
CREATE DATABASE :"name" OWNER :"name";
REVOKE ALL ON DATABASE :"name" FROM PUBLIC;
'@
      $sql | & "$pg\psql.exe" -X -q -v ON_ERROR_STOP=1 -v "name=$name" -h 127.0.0.1 -U postgres -d postgres
      if($LASTEXITCODE -ne 0){throw 'Unable to provision the isolated sharing database'}
      if($kind -eq 'travel'){& "$pg\psql.exe" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d $name -c 'CREATE EXTENSION IF NOT EXISTS postgis;' | Out-Null;if($LASTEXITCODE -ne 0){throw 'PostGIS initialization failed'}}
    }
  }finally{Remove-Item Env:PGPASSWORD,Env:SHARE_DB_PASSWORD -ErrorAction SilentlyContinue}
  $bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
  $key=@{activeKeyId='share';keys=@{share=[Convert]::ToBase64String($bytes)}}|ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText((Join-Path $root 'credential-keyring.json'),$key,[Text.UTF8Encoding]::new($false))
  Save-State
  Start-Background 'gateway' $node @((Join-Path $repo 'scripts\share-gateway.mjs'),(Join-Path $root 'state.json')) $repo
  Start-Background 'tunnel' $cloud @('tunnel','--no-autoupdate','--url','http://127.0.0.1:18180','--protocol','http2','--edge-ip-version','4') $root
  $deadline=(Get-Date).AddSeconds(100)
  do{
    $log=Get-Content (Join-Path $root 'logs\tunnel.err.log') -Raw -ErrorAction SilentlyContinue
    if($log -match 'https://[a-z0-9-]+\.trycloudflare\.com'){$state.publicOrigin=$matches[0];break}
    Start-Sleep -Milliseconds 600
  }while((Get-Date)-lt$deadline)
  if(-not $state.publicOrigin){throw 'Unable to create a temporary HTTPS tunnel; check the tunnel log'}
  Save-State
  Write-Host "Temporary HTTPS entry allocated: $($state.publicOrigin)"
  Write-Host 'Building isolated production bundles and Java APIs...'
  $env:JAVA_HOME=$jdk8;$env:PATH="$jdk8\bin;D:\Application\Nodejs;$env:PATH"
  foreach($pair in @(@('backend','travel'),@('smartledger\backend','ledger'))){
    if($state.ledgerOnly -and $pair[1] -eq 'travel'){continue}
    $destination=Join-Path $root "build\$($pair[1])"
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo "$($pair[0])\pom.xml") -Destination (Join-Path $destination 'pom.xml')
    Copy-Item -LiteralPath (Join-Path $repo "$($pair[0])\src") -Destination $destination -Recurse
    & $maven -q -f (Join-Path $destination 'pom.xml') -DskipTests package
    if($LASTEXITCODE -ne 0){throw "Java build failed: $($pair[1])"}
  }
  $base=$state.publicOrigin
  $env:VITE_LOCAL_MOCK_AUTH='false';$env:VITE_REGISTRATION_ENABLED='false'
  $env:VITE_LEDGER_ONLY=if($state.ledgerOnly){'true'}else{'false'}
  $env:VITE_OIDC_AUTHORITY="$base/identity/realms/share"
  $env:VITE_API_BASE_URL="$base/travel-api";$env:VITE_SMARTLEDGER_API_URL="$base/ledger-api"
  $env:VITE_SMARTLEDGER_PUBLIC_URL="$base/ledger/";$env:VITE_PORTAL_PUBLIC_URL="$base/";$env:VITE_WHERE_TO_GO_PUBLIC_URL="$base/travel/"
  foreach($kind in @('portal','travel','ledger')){
    if($state.ledgerOnly -and $kind -ne 'ledger'){continue}
    $directory=Join-Path $repo "apps\$kind"
    $env:VITE_OIDC_CLIENT_ID=@{portal='portal-web';travel='travel-web';ledger='smartledger-web'}[$kind]
    $env:VITE_OIDC_AUDIENCE=@{portal='portal-api';travel='wheretogo-api';ledger='smartledger-api'}[$kind]
    $env:VITE_APP_BASE_PATH=if($kind -eq 'portal'){'/'}else{"/$kind/"}
    Push-Location $directory
    try{& 'D:\Application\Nodejs\npm.cmd' run build -- --mode share --outDir (Join-Path $root "dist\$kind") --emptyOutDir;if($LASTEXITCODE -ne 0){throw "Frontend build failed: $kind"}}finally{Pop-Location}
  }
  }else{$secrets=Import-Clixml (Join-Path $root 'accounts.clixml');$base=$state.publicOrigin}
  Write-Host 'Preparing the dedicated sharing identity service...'
  $identity=Join-Path $homePath 'keycloak-26.8.1'
  if(-not(Test-Path (Join-Path $identity 'bin\kc.bat'))){Expand-Archive -LiteralPath 'D:\Application\Keycloak\keycloak-26.8.1.zip' -DestinationPath $homePath}
  Copy-Item (Join-Path $repo 'identity\themes\personal') -Destination (Join-Path $identity 'themes') -Recurse -Force
  $realm=Get-Content (Join-Path $repo 'identity\realm-local.json') -Raw -Encoding utf8 | ConvertFrom-Json
  $realm.realm='share';$realm.displayName='我的空间 · 临时体验';$realm.sslRequired='all';$realm.registrationAllowed=$false;$realm.resetPasswordAllowed=$false
  if($state.ledgerOnly){$realm.clients=@($realm.clients | Where-Object clientId -eq 'smartledger-web');$realm.displayName='SmartLedger · 临时体验'}
  $realm.users=@($secrets.accounts | ForEach-Object {@{id=$_.id;username=$_.username;enabled=$true;email="$($_.username)@example.invalid";emailVerified=$false;firstName='体验';lastName=$_.username;requiredActions=@();credentials=@(@{type='password';value=(Plain $_.password);temporary=$false})}})
  foreach($client in $realm.clients){
    $app=$base+(@{'portal-web'='/';'travel-web'='/travel/';'smartledger-web'='/ledger/'}[$client.clientId])
    $client.rootUrl=$app;$client.baseUrl=$app;$client.redirectUris=@("${app}auth/callback","${app}auth/silent", "$base/auth/silent") | Select-Object -Unique;$client.webOrigins=@($base)
    $client.attributes.'post.logout.redirect.uris'="${app}auth/signed-out";$client.attributes.'frontchannel.logout.url'="${app}auth/frontchannel"
  }
  $import=Join-Path $identity 'data\import';New-Item -ItemType Directory -Force -Path $import | Out-Null
  $realm | ConvertTo-Json -Depth 30 | Set-Content (Join-Path $import 'share-realm.json') -Encoding utf8
  $env:JAVA_HOME=$jdk21;$env:KC_DB='postgres';$env:KC_DB_URL="jdbc:postgresql://127.0.0.1:5432/$($state.database_identity)";$env:KC_DB_USERNAME=$state.database_identity;$env:KC_DB_PASSWORD=Plain $secrets.database.identity
  $env:KC_BOOTSTRAP_ADMIN_USERNAME='share-admin';$env:KC_BOOTSTRAP_ADMIN_PASSWORD=Plain $secrets.adminPassword
  $env:PORTAL_PUBLIC_URL="$base/";$env:JAVA_OPTS_APPEND='-Xms64m -Xmx320m -XX:MaxMetaspaceSize=192m'
  try{Start-Background 'identity' (Join-Path $identity 'bin\kc.bat') @('start','--http-enabled=true','--http-host=127.0.0.1','--http-port=8191','--http-relative-path=/identity',"--hostname=$base/identity",'--proxy-headers=xforwarded','--proxy-trusted-addresses=127.0.0.1/32','--cache=local','--db-pool-initial-size=1','--db-pool-min-size=1','--db-pool-max-size=3','--import-realm') $identity}finally{'KC_DB','KC_DB_URL','KC_DB_USERNAME','KC_DB_PASSWORD','KC_BOOTSTRAP_ADMIN_USERNAME','KC_BOOTSTRAP_ADMIN_PASSWORD','PORTAL_PUBLIC_URL','JAVA_OPTS_APPEND'|ForEach-Object{Remove-Item "Env:$_" -ErrorAction SilentlyContinue}}
  Wait-Address 'http://127.0.0.1:8191/identity/realms/share/.well-known/openid-configuration' 180 @{'X-Forwarded-Proto'='https';Host=([uri]$base).Host}
  # The import contains temporary account passwords; remove it after successful startup/import.
  Remove-Item -LiteralPath (Join-Path $import 'share-realm.json')
  $env:SPRING_PROFILES_ACTIVE='';$env:API_ALLOWED_SUBJECTS=($secrets.accounts.id -join ',');$env:API_ALLOW_ANY_AUTHENTICATED_USER='false';$env:API_OIDC_JWK_SET_URI="$base/identity/realms/share/protocol/openid-connect/certs";$env:DB_POOL_SIZE='2';$env:HTTP_MAX_THREADS='16'
  foreach($kind in @('travel','ledger')){
    if($state.ledgerOnly -and $kind -eq 'travel'){continue}
    $env:SPRING_DATASOURCE_URL="jdbc:postgresql://127.0.0.1:5432/$($state["database_$kind"])";$env:SPRING_DATASOURCE_USERNAME=$state["database_$kind"];$env:SPRING_DATASOURCE_PASSWORD=Plain $secrets.database[$kind]
    $env:APP_OIDC_ISSUER="$base/identity/realms/share";$env:APP_CORS_ALLOWED_ORIGINS=$base
    $env:SMARTLEDGER_OIDC_ISSUER="$base/identity/realms/share";$env:SMARTLEDGER_ALLOWED_ORIGINS=$base;$env:SMARTLEDGER_PUBLIC_URL="$base/ledger/";$env:SMARTLEDGER_CREDENTIAL_KEY_FILE=Join-Path $root 'credential-keyring.json'
    $artifact=if($kind -eq 'travel'){'travelatlas-api'}else{'smartledger-api'}
    $port=if($kind -eq 'travel'){8082}else{8092}
    try{Start-Background $kind "$jdk8\bin\java.exe" @('-Xms32m','-Xmx192m','-XX:MaxMetaspaceSize=128m','-XX:+ExitOnOutOfMemoryError','-jar',(Join-Path $root "build\$kind\target\$artifact-0.1.0-SNAPSHOT.jar"),"--server.port=$port",'--server.address=127.0.0.1') (Join-Path $root "build\$kind")}finally{Remove-Item Env:SPRING_DATASOURCE_PASSWORD -ErrorAction SilentlyContinue}
  }
  if(-not $state.ledgerOnly){Wait-Address 'http://127.0.0.1:8082/api/v1/health'}
  Wait-Address 'http://127.0.0.1:8092/actuator/health'
  $state.ready=$true;Save-State
  $state | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $root 'session-info.json') -Encoding utf8
  Write-Host "Ready: $base"
  Write-Host "Expires (Hong Kong): $([TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([datetime]$state.expiresAt,'China Standard Time').ToString('yyyy-MM-dd HH:mm'))"
  Write-Host 'Show temporary guest credentials: scripts/show-share-accounts.ps1'
}catch{
  $state.ready=$false;Save-State
  Write-Host 'Sharing did not finish. The original database was not changed. Stop the partial sharing session and restore localhost with scripts/stop-share.ps1 -RestoreLocal.'
  throw
}finally{
  'SPRING_DATASOURCE_PASSWORD','KC_DB_PASSWORD','KC_BOOTSTRAP_ADMIN_PASSWORD','API_ALLOWED_SUBJECTS','API_ALLOW_ANY_AUTHENTICATED_USER','API_OIDC_JWK_SET_URI','SPRING_PROFILES_ACTIVE','SPRING_DATASOURCE_URL','SPRING_DATASOURCE_USERNAME','DB_POOL_SIZE','HTTP_MAX_THREADS','APP_OIDC_ISSUER','APP_CORS_ALLOWED_ORIGINS','SMARTLEDGER_OIDC_ISSUER','SMARTLEDGER_ALLOWED_ORIGINS','SMARTLEDGER_PUBLIC_URL','SMARTLEDGER_CREDENTIAL_KEY_FILE'|ForEach-Object{Remove-Item "Env:$_" -ErrorAction SilentlyContinue}
}
