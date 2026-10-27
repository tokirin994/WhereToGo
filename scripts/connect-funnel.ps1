param([ValidatePattern('^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$')][string]$Hostname='personal-space')
$ErrorActionPreference='Stop'
$cli='D:\Application\Tailscale\tailscale.exe'
if(-not(Test-Path $cli)){throw 'Install Tailscale first with scripts/install-tailscale.ps1 in Administrator PowerShell'}
$stateText=& $cli status --json
try{$status=$stateText | ConvertFrom-Json}catch{throw 'Unable to read Tailscale status; ensure its Windows service is running'}
if(-not $status.BackendState){throw 'Unable to read Tailscale state; ensure its Windows service is running'}
if($status.BackendState -ne 'Running'){
 Write-Host 'Use the official login URL printed below to connect this computer to your own Tailscale account.'
 Write-Host 'This prepares a shared hostname for the portal, travel, ledger and identity service. It does not publish them yet.'
 Write-Host 'No exit node, subnet route, or system DNS replacement is enabled.'
 & $cli up "--hostname=$Hostname" --accept-dns=false --accept-routes=false --shields-up=true --timeout=30s
 if($LASTEXITCODE -ne 0){Write-Host 'Complete login in your browser, then run this script again to check the assigned hostname.';return}
 $status=(& $cli status --json) | ConvertFrom-Json
}
$dnsName=([string]$status.Self.DNSName).TrimEnd('.')
if($status.BackendState -ne 'Running' -or $dnsName -notmatch '^[a-z0-9][a-z0-9.-]*\.ts\.net$'){throw 'Tailscale has not assigned a DNS name yet; finish login and device approval first'}
Write-Host "Assigned hostname: $dnsName"
Write-Host 'Connected. This hostname is not a working public application link yet.'
Write-Host 'Next: configure Funnel HTTPS and migrate the full deployment public address, OIDC callbacks and identity-bound data before switching traffic.'
