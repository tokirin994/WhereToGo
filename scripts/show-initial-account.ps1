param([switch]$Administrator)
$data = Import-Clixml 'D:\Application\WhereToGo\secrets\identity-bootstrap.clixml'
if ($Administrator) { $name='identity-admin'; $password=$data.AdminPassword; $url='http://localhost:8091/admin/' }
else { $name='admin'; $password=$data.PortalPassword; $url='http://localhost:5173/' }
Write-Host "Login: $url"
Write-Host "Username: $name"
Write-Host ('Initial password: ' + [Net.NetworkCredential]::new('', $password).Password)
Write-Host 'The portal initial password must be changed on first login. This command only displays the original bootstrap value.'
