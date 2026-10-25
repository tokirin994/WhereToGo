$ErrorActionPreference = 'Stop'
$secretsHome = 'D:\Application\WhereToGo\secrets'
$marker = Join-Path $secretsHome 'identity-configuration-v3'
if (Test-Path $marker) { return }
$bootstrap = Import-Clixml (Join-Path $secretsHome 'identity-bootstrap.clixml')
$password = [Net.NetworkCredential]::new('', $bootstrap.AdminPassword).Password
$deadline = (Get-Date).AddMinutes(2)
do {
    try {
        $token = Invoke-RestMethod 'http://localhost:8091/realms/master/protocol/openid-connect/token' -Method Post -Body @{client_id='admin-cli';grant_type='password';username='identity-admin';password=$password} -TimeoutSec 10
        break
    } catch { if ((Get-Date) -gt $deadline) { throw 'Identity bootstrap configuration failed; check the identity service logs' }; Start-Sleep -Milliseconds 800 }
} while ($true)
$headers = @{Authorization="Bearer $($token.access_token)"}
$base = 'http://localhost:8091/admin/realms/local'
function Admin-Request([string]$path,[string]$method='Get',$body=$null) {
    $options=@{Uri="$base$path";Method=$method;Headers=$headers;TimeoutSec=20}
    if($null -ne $body){$options.ContentType='application/json';$options.Body=ConvertTo-Json -InputObject $body -Depth 15 -Compress}
    Invoke-RestMethod @options
}
Admin-Request '' 'Put' @{registrationAllowed=$true;loginTheme='personal';defaultLocale='zh-CN'} | Out-Null
$roles = Admin-Request '/roles'
if (-not ($roles | Where-Object name -eq 'portal-admin')) { Admin-Request '/roles' 'Post' @{name='portal-admin';description='Personal portal account administrator'} | Out-Null }
$role = Admin-Request '/roles/portal-admin'
Admin-Request '/users/local-demo-user/role-mappings/realm' 'Post' @($role) | Out-Null
$management = (Admin-Request '/clients?clientId=realm-management')[0]
$adminRole = Admin-Request "/clients/$($management.id)/roles/realm-admin"
Admin-Request "/users/local-demo-user/role-mappings/clients/$($management.id)" 'Post' @($adminRole) | Out-Null
foreach ($clientName in @('wheretogo-web','smartledger-web')) {
    $client = (Admin-Request "/clients?clientId=$clientName")[0]
    $basic = (Admin-Request '/client-scopes') | Where-Object name -eq 'basic' | Select-Object -First 1
    if (-not $basic) { throw 'Required OIDC basic client scope is missing' }
    Admin-Request "/clients/$($client.id)/default-client-scopes/$($basic.id)" 'Put' | Out-Null
    $mappers = Admin-Request "/clients/$($client.id)/protocol-mappers/models"
    if (-not ($mappers | Where-Object name -eq 'portal-roles')) {
        Admin-Request "/clients/$($client.id)/protocol-mappers/models" 'Post' @{name='portal-roles';protocol='openid-connect';protocolMapper='oidc-usermodel-realm-role-mapper';config=@{'claim.name'='portal_roles';'jsonType.label'='String';'multivalued'='true';'id.token.claim'='true';'access.token.claim'='true';'userinfo.token.claim'='true'}} | Out-Null
    }
}
[IO.File]::WriteAllText($marker,'Applied account administration role and application role claims.')
$password=$null; $token=$null; $headers=$null
Write-Host 'Unified account administration configured.'
