param([Parameter(Mandatory=$true)][string]$PublicOrigin,[string]$OutputDirectory='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$origin=[uri]$PublicOrigin
if($origin.Scheme -ne 'https' -or $origin.UserInfo -or $origin.Query -or $origin.Fragment -or $origin.AbsolutePath -ne '/'){throw 'PublicOrigin must be an HTTPS origin without a path'}
$base=$origin.GetLeftPart([UriPartial]::Authority)
if(-not $OutputDirectory){$OutputDirectory=Join-Path $repo ('.local\vps-package-'+(Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))}
$output=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $output,(Join-Path $output 'app'),(Join-Path $output 'dist'),(Join-Path $output 'build') | Out-Null
$settings=@{
 JAVA_HOME='D:\Application\Jdk-1.8\jdk-1.8';VITE_LOCAL_MOCK_AUTH='false';VITE_REGISTRATION_ENABLED='true';VITE_LEDGER_ONLY='false';VITE_ADMIN_CONSOLE_ENABLED='false'
 VITE_OIDC_AUTHORITY="$base/identity/realms/personal";VITE_API_BASE_URL="$base/travel-api";VITE_SMARTLEDGER_API_URL="$base/ledger-api"
 VITE_SMARTLEDGER_PUBLIC_URL="$base/ledger/";VITE_PORTAL_PUBLIC_URL="$base/";VITE_WHERE_TO_GO_PUBLIC_URL="$base/travel/"
}
$before=@{};$oldPath=$env:PATH
try{
 foreach($name in $settings.Keys){$before[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$settings[$name],'Process')}
 $env:PATH='D:\Application\Jdk-1.8\jdk-1.8\bin;D:\Application\Nodejs;'+$env:PATH
 foreach($pair in @(@('backend','travel','travelatlas-api'),@('smartledger\backend','ledger','smartledger-api'))){
  $destination=Join-Path $output "build\$($pair[1])"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-Item -LiteralPath (Join-Path $repo "$($pair[0])\pom.xml") -Destination (Join-Path $destination 'pom.xml')
  Copy-Item -LiteralPath (Join-Path $repo "$($pair[0])\src") -Destination $destination -Recurse -Force
  & 'D:\Application\Apache-maven-3.9.11\bin\mvn.cmd' -q -f (Join-Path $destination 'pom.xml') -DskipTests package
  if($LASTEXITCODE -ne 0){throw "Java build failed: $($pair[1])"}
  Copy-Item -LiteralPath (Join-Path $destination "target\$($pair[2])-0.1.0-SNAPSHOT.jar") -Destination (Join-Path $output "app\$($pair[1]).jar")
 }
 foreach($kind in @('portal','ledger')){
  foreach($name in @('VITE_OIDC_CLIENT_ID','VITE_OIDC_AUDIENCE','VITE_APP_BASE_PATH')){if(-not $before.ContainsKey($name)){$before[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}}
  $env:VITE_OIDC_CLIENT_ID=if($kind -eq 'portal'){'wheretogo-web'}else{'smartledger-web'}
  $env:VITE_OIDC_AUDIENCE=if($kind -eq 'portal'){'wheretogo-api'}else{'smartledger-api'}
  $env:VITE_APP_BASE_PATH=if($kind -eq 'portal'){'/'}else{'/ledger/'}
  $directory=if($kind -eq 'portal'){Join-Path $repo 'frontend'}else{Join-Path $repo 'smartledger\frontend'}
  Push-Location $directory
  try{& 'D:\Application\Nodejs\npm.cmd' run build -- --mode vps --outDir (Join-Path $output "dist\$kind") --emptyOutDir;if($LASTEXITCODE -ne 0){throw "Frontend build failed: $kind"}}finally{Pop-Location}
 }
}finally{foreach($name in $before.Keys){[Environment]::SetEnvironmentVariable($name,$before[$name],'Process')};$env:PATH=$oldPath}
foreach($file in @('compose.yml','Api.Dockerfile','Identity.Dockerfile','provision.py','activate.sh','backup.sh','init-databases.sh','host-firewall.sh','configure-operations.sh','configure-registration.sh','configure-registration.py')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $output $file)}
foreach($file in @('Postgres.Dockerfile','runtime-grants.sql')){Copy-Item -LiteralPath (Join-Path $repo "deploy\production\$file") -Destination (Join-Path $output $file)}
Copy-Item -LiteralPath (Join-Path $repo 'identity\themes\personal') -Destination (Join-Path $output 'identity-theme') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo 'identity\realm-local.json') -Destination (Join-Path $output 'realm-template.json')
$caddy=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Caddyfile'))
foreach($kind in @('portal','ledger')){
 $headers=[IO.File]::ReadAllText((Join-Path $output "dist\$kind\_headers"))
 $policy=[regex]::Match($headers,'(?m)^\s*Content-Security-Policy:\s*(.+)$').Groups[1].Value.Trim()
 if(-not $policy){throw "Missing $kind content security policy"}
 $caddy=$caddy.Replace(('__'+$kind.ToUpperInvariant()+'_CSP__'),$policy)
}
[IO.File]::WriteAllText((Join-Path $output 'Caddyfile'),$caddy.Replace("`r`n","`n"),[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $output 'public-origin.txt'),$base+"`n",[Text.UTF8Encoding]::new($false))
foreach($file in Get-ChildItem $output -File){if($file.Extension -in @('.sh','.py','.yml','.Dockerfile') -or $file.Name.EndsWith('Dockerfile')){$value=[IO.File]::ReadAllText($file.FullName);[IO.File]::WriteAllText($file.FullName,$value.Replace("`r`n","`n"),[Text.UTF8Encoding]::new($false))}}
Write-Host "Production package: $output"
