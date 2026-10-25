$ErrorActionPreference = 'Stop'
$appRoot = 'D:\Application'
$identityHome = Join-Path $appRoot 'Keycloak'
$runtimeHome = Join-Path $appRoot 'Jdk-21'
$version = '26.8.1'
New-Item -ItemType Directory -Force -Path $identityHome,$runtimeHome | Out-Null
if (-not (Test-Path "$runtimeHome\runtime\bin\java.exe")) {
    $assets = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $package = $assets[0].binary.package
    $archive = Join-Path $runtimeHome 'runtime.zip'
    Invoke-WebRequest $package.link -OutFile $archive
    if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $package.checksum) { throw 'JDK checksum mismatch' }
    Expand-Archive -LiteralPath $archive -DestinationPath "$runtimeHome\unpacked" -Force
    $directory = Get-ChildItem "$runtimeHome\unpacked" -Directory | Select-Object -First 1
    Move-Item -LiteralPath $directory.FullName -Destination "$runtimeHome\runtime"
}
if (-not (Test-Path "$identityHome\keycloak-$version\bin\kc.bat")) {
    $url = "https://github.com/keycloak/keycloak/releases/download/$version/keycloak-$version.zip"
    $archive = Join-Path $identityHome "keycloak-$version.zip"
    if (-not (Test-Path $archive)) { Invoke-WebRequest $url -OutFile $archive }
    $checksumFile = "$archive.sha1"
    Invoke-WebRequest "$url.sha1" -OutFile $checksumFile
    $checksum = ([IO.File]::ReadAllText($checksumFile)).Trim().Split(' ')[0]
    if ((Get-FileHash $archive -Algorithm SHA1).Hash.ToLowerInvariant() -ne $checksum.ToLowerInvariant()) { throw 'Keycloak checksum mismatch' }
    Expand-Archive -LiteralPath $archive -DestinationPath $identityHome -Force
}
Write-Host "Identity installed: $identityHome\keycloak-$version"
Write-Host 'Business APIs continue to use D:\Application\Jdk-1.8.'
