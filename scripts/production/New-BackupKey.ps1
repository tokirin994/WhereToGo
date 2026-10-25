param([string]$KeyDirectory = 'D:\Application\WhereToGo\backup-keys')
$ErrorActionPreference = 'Stop'
$tool = 'D:\Application\age\age-keygen.exe'
if (-not (Test-Path -LiteralPath $tool)) {
    throw 'Download the official Windows age release, verify its published checksum, and extract age-keygen.exe to D:\Application\age first. See the deployment guide.'
}
$privateKey = Join-Path $KeyDirectory 'wheretogo-backup.agekey'
$recipient = Join-Path $KeyDirectory 'wheretogo-backup-recipient.txt'
if ((Test-Path -LiteralPath $privateKey) -or (Test-Path -LiteralPath $recipient)) { throw 'A backup key already exists; it will not be overwritten.' }
New-Item -ItemType Directory -Force -Path $KeyDirectory | Out-Null
# Limit the offline key folder to its operator, local SYSTEM and administrators.
$acl = Get-Acl -LiteralPath $KeyDirectory
$acl.SetAccessRuleProtection($true, $false)
$identities = @([Security.Principal.WindowsIdentity]::GetCurrent().User,
    [Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
    [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
foreach ($identity in $identities) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.SetAccessRule($rule)
}
Set-Acl -LiteralPath $KeyDirectory -AclObject $acl
& $tool -o $privateKey
if ($LASTEXITCODE -ne 0) { throw 'age-keygen failed; inspect the key directory before retrying.' }
$public = & $tool -y $privateKey
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the public backup recipient.' }
[IO.File]::WriteAllText($recipient, ($public -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
Write-Host "Private key (keep offline): $privateKey"
Write-Host "Public recipient (copy to server): $recipient"
Write-Host 'Store a second copy of the private key on a separate protected/offline device. Do not upload it to GitHub or the production server.'
