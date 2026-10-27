$ErrorActionPreference='Stop'
$application='D:\Application\Tailscale'
$version='1.104.2'
$package=Join-Path $application "tailscale-setup-$version-amd64.msi"
$url="https://pkgs.tailscale.com/stable/tailscale-setup-$version-amd64.msi"
$administrator=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $administrator){throw 'Open PowerShell as Administrator, then run this script. It installs Tailscale to D:\Application\Tailscale.'}
New-Item -ItemType Directory -Force -Path $application | Out-Null
if(-not(Test-Path $package)){Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $package -TimeoutSec 180}
$expected=((Invoke-WebRequest -UseBasicParsing -Uri ($url+'.sha256') -TimeoutSec 30).Content.Trim() -split '\s+')[0]
if((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash -ne $expected){throw 'Installer checksum mismatch; do not install the package'}
$signature=Get-AuthenticodeSignature -LiteralPath $package
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Tailscale'){throw 'The installer does not have a valid Tailscale signature'}
$installer=Start-Process 'msiexec.exe' -ArgumentList @('/i',('"'+$package+'"'),'/qn','/norestart',('INSTALLDIR="'+$application+'"'),'TS_NOLAUNCH=1','/L*v',('"'+(Join-Path $application 'install.log')+'"')) -WindowStyle Hidden -PassThru
if(-not $installer.WaitForExit(180000)){throw 'Installation is still running; inspect D:\Application\Tailscale\install.log before retrying'}
if($installer.ExitCode -notin @(0,3010)){throw "Installation failed with code $($installer.ExitCode); inspect D:\Application\Tailscale\install.log"}
if(-not(Test-Path (Join-Path $application 'tailscale.exe'))){throw 'Tailscale was not found in the requested installation directory'}
Write-Host 'Tailscale installed to D:\Application\Tailscale.'
Write-Host 'Next run: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\connect-funnel.ps1'
if($installer.ExitCode -eq 3010){Write-Host 'Windows reports that a restart is needed before the network component is fully ready.'}
