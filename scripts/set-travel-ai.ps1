param(
    [Parameter(Mandatory=$true)][ValidateSet('deepseek','glm','openai','claude','custom')][string]$Provider,
    [Parameter(Mandatory=$true)][string]$Model,
    [string]$BaseUrl,
    [ValidateSet('chat-completions','responses','anthropic')][string]$Protocol,
    [ValidateSet('max_tokens','max_completion_tokens')][string]$TokenField='max_tokens',
    [ValidateSet('api-key','bearer')][string]$AuthMode='api-key',
    [ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$AnthropicVersion='2023-06-01',
    [Security.SecureString]$ApiKey
)
$ErrorActionPreference='Stop'
$defaults=@{deepseek='https://api.deepseek.com';glm='https://open.bigmodel.cn/api/paas/v4';openai='https://api.openai.com/v1';claude='https://api.anthropic.com/v1'}
if(-not $BaseUrl){$BaseUrl=$defaults[$Provider]}
if(-not $Protocol){$Protocol=if($Provider -eq 'claude'){'anthropic'}elseif($Provider -eq 'openai'){'responses'}else{'chat-completions'}}
$targetUri=$null
if(-not [Uri]::TryCreate($BaseUrl,[UriKind]::Absolute,[ref]$targetUri) -or $targetUri.Scheme -ne 'https' -or $targetUri.UserInfo -or $targetUri.Query -or $targetUri.Fragment){throw 'BaseUrl must be HTTPS without embedded credentials, query or fragment'}
if(-not $Model.Trim() -or $Model.Length -gt 200){throw 'Provide the exact model ID offered by your provider'}
if(-not $ApiKey){$ApiKey=Read-Host 'AI API key (hidden; encrypted with Windows DPAPI)' -AsSecureString}
if($ApiKey.Length -eq 0){throw 'API key cannot be empty'}
$secrets='D:\Application\WhereToGo\secrets'
New-Item -ItemType Directory -Force -Path $secrets | Out-Null
$path=Join-Path $secrets 'travel-ai.clixml'
# Export-Clixml encrypts SecureString using current-user Windows DPAPI, not reversible Base64.
[pscustomobject]@{Provider=$Provider;BaseUrl=$BaseUrl.TrimEnd('/');Model=$Model.Trim();Protocol=$Protocol;TokenField=$TokenField;AuthMode=$AuthMode;AnthropicVersion=$AnthropicVersion;ApiKey=$ApiKey} | Export-Clixml -LiteralPath $path
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl=Get-Acl -LiteralPath $path
$acl.SetAccessRuleProtection($true,$false)
foreach($existingRule in @($acl.Access)){$acl.RemoveAccessRuleAll($existingRule)}
$rule=[Security.AccessControl.FileSystemAccessRule]::new($account,'FullControl','Allow')
$acl.SetAccessRule($rule)
Set-Acl -LiteralPath $path -AclObject $acl
Write-Host 'AI settings saved with current-user DPAPI encryption. No key was printed.'
Write-Host 'Restart this workspace travel API using scripts/start-local.ps1 to apply. Model/API access still depends on your provider account.'
