$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$identityHome = 'D:\Application\Keycloak\keycloak-26.8.1'
$secretsHome = 'D:\Application\WhereToGo\secrets'
$logs = 'D:\Application\WhereToGo\logs'
$pgBin = 'D:\Application\PostgreSQL16\pgsql\bin'
New-Item -ItemType Directory -Force -Path $secretsHome,$logs | Out-Null
# Windows DPAPI protects bootstrap passwords at rest. The vault key file has a user-only ACL.
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $secretsHome '/inheritance:r' '/grant:r' "*${currentSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict local secret directory permissions' }
function Random-Bytes([int]$count) { $bytes=New-Object byte[] $count; $generator=[Security.Cryptography.RandomNumberGenerator]::Create(); try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }; return ,$bytes }
function New-Secret { return 'Aa1!' + [Convert]::ToBase64String((Random-Bytes 30)) }
$bootstrapFile = Join-Path $secretsHome 'identity-bootstrap.clixml'
if (-not (Test-Path $bootstrapFile)) {
    @{ PortalPassword=(ConvertTo-SecureString (New-Secret) -AsPlainText -Force); AdminPassword=(ConvertTo-SecureString (New-Secret) -AsPlainText -Force); DatabasePassword=(ConvertTo-SecureString (New-Secret) -AsPlainText -Force) } | Export-Clixml $bootstrapFile
}
$secrets = Import-Clixml $bootstrapFile
function Reveal([Security.SecureString]$value) { return [Net.NetworkCredential]::new('', $value).Password }
$keyFile = Join-Path $secretsHome 'credential-keyring.json'
$keyMarker = 'D:\Application\WhereToGo\credential-key-initialized'
if (-not (Test-Path $keyFile)) {
    if (Test-Path $keyMarker) { throw 'Credential key is missing. Restore the original keyring from backup; a replacement cannot decrypt existing credentials.' }
    $keyring = @{activeKeyId='v1';keys=@{v1=[Convert]::ToBase64String((Random-Bytes 32))}} | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText($keyFile, $keyring, [Text.UTF8Encoding]::new($false))
}
[IO.File]::WriteAllText($keyMarker,'External credential key initialized; restore the original keyring if missing.')
if (-not (Test-Path "$identityHome\bin\kc.bat")) { throw 'Run scripts/install-identity.ps1 first' }
Copy-Item -LiteralPath (Join-Path $repo 'identity\themes\personal') -Destination (Join-Path $identityHome 'themes') -Recurse -Force
if (Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue) { Write-Host 'Identity port 8091 is already running.'; return }
$env:PGPASSWORD = ([IO.File]::ReadAllText('D:\Application\PostgreSQL16\postgres-password.txt')).Trim()
$env:IDENTITY_DATABASE_PASSWORD = Reveal $secrets.DatabasePassword
try {
    # psql variable quoting prevents interpolation of the generated password into SQL text.
    $sql = @'
\getenv identity_password IDENTITY_DATABASE_PASSWORD
SELECT format('CREATE ROLE portal_identity LOGIN PASSWORD %L', :'identity_password') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='portal_identity') \gexec
SELECT 'CREATE DATABASE portal_identity OWNER portal_identity' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='portal_identity') \gexec
'@
    $sql | & "$pgBin\psql.exe" -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres -q
    if ($LASTEXITCODE -ne 0) { throw 'Identity database provisioning failed' }
} finally { Remove-Item Env:PGPASSWORD; Remove-Item Env:IDENTITY_DATABASE_PASSWORD }
$importDir = Join-Path $identityHome 'data\import'
New-Item -ItemType Directory -Force -Path $importDir | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'identity\realm-local.json') -Destination (Join-Path $importDir 'local-realm.json') -Force
$env:JAVA_HOME = 'D:\Application\Jdk-21\runtime'
$env:KC_DB = 'postgres'
$env:KC_DB_URL = 'jdbc:postgresql://127.0.0.1:5432/portal_identity'
$env:KC_DB_USERNAME = 'portal_identity'
$env:KC_DB_PASSWORD = Reveal $secrets.DatabasePassword
$env:KC_BOOTSTRAP_ADMIN_USERNAME = 'identity-admin'
$env:KC_BOOTSTRAP_ADMIN_PASSWORD = Reveal $secrets.AdminPassword
$env:PORTAL_INITIAL_PASSWORD = Reveal $secrets.PortalPassword
$env:JAVA_OPTS_APPEND = '-Xms128m -Xmx512m'
$env:PORTAL_PUBLIC_URL = 'http://localhost:5173/'
try {
    Start-Process -FilePath "$identityHome\bin\kc.bat" -ArgumentList @('start-dev','--http-host=127.0.0.1','--http-port=8091','--hostname=http://localhost:8091','--db-pool-initial-size=1','--db-pool-min-size=1','--db-pool-max-size=4','--import-realm') -WorkingDirectory $identityHome -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'identity.out.log') -RedirectStandardError (Join-Path $logs 'identity.err.log') | Out-Null
} finally {
    'KC_DB_PASSWORD','KC_BOOTSTRAP_ADMIN_PASSWORD','PORTAL_INITIAL_PASSWORD','KC_DB','KC_DB_URL','KC_DB_USERNAME','KC_BOOTSTRAP_ADMIN_USERNAME','JAVA_OPTS_APPEND','JAVA_HOME','PORTAL_PUBLIC_URL' | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}
Write-Host 'Unified identity starting on http://localhost:8091; see identity.out.log.'
