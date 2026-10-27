param([switch]$RestoreLocal)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$homePath='D:\Application\WhereToGo\share'
$current=Join-Path $homePath 'current.txt'
if(-not(Test-Path -LiteralPath $current)){Write-Host 'No sharing session recorded.';return}
$root=(Get-Content -LiteralPath $current -Raw).Trim()
$resolved=[IO.Path]::GetFullPath($root)
if(-not $resolved.StartsWith(([IO.Path]::GetFullPath($homePath)+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Sharing state points outside the expected application directory'}
$statePath=Join-Path $resolved 'state.json'
$state=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$state.ready=$false;$state.expiresAt=(Get-Date).ToUniversalTime().ToString('o')
[IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
$ids=@()
foreach($property in $state.processes.PSObject.Properties){if($property.Value){$ids+=[int]$property.Value}}
foreach($port in @(18180,8191,8082,8092)){$ids+=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)}
foreach($ownerId in ($ids|Sort-Object -Unique)){
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
  if(-not $process){continue}
  $command=$process.CommandLine
  $owned=$command -and ($command.Contains($resolved) -or $command.Contains((Join-Path $homePath 'keycloak-26.8.1')) -or ($command.Contains('cloudflared') -and $command.Contains('127.0.0.1:18180')))
  if($owned){Stop-Process -Id $ownerId -ErrorAction SilentlyContinue}else{Write-Warning "Skipped unrelated process $ownerId"}
}
Write-Host 'Temporary external sharing stopped. Isolated databases and private session files were retained.'
if($RestoreLocal){& (Join-Path $repo 'scripts\start-local.ps1')}
