import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const realm=process.env.IDENTITY_REALM||'personal'
if(!/^[a-zA-Z0-9_-]{1,80}$/.test(realm))throw new Error('Invalid realm name')
function origin(name){
  const value=process.env[name]
  if(!value)throw new Error(`Set ${name} to an exact HTTPS origin`)
  const url=new URL(value)
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error(`Invalid HTTPS origin: ${name}`)
  return url.origin
}
const portal=origin('PORTAL_ORIGIN'),ledger=origin('LEDGER_ORIGIN')
const config=JSON.parse(readFileSync(resolve(root,'identity/realm-local.json'),'utf8'))
config.realm=realm;config.sslRequired='all';delete config.users
for(const client of config.clients){
  const base=client.clientId==='smartledger-web'?ledger:portal
  client.rootUrl=base
  client.redirectUris=[base+'/auth/callback',base+'/auth/silent']
  client.webOrigins=[base]
  client.attributes['post.logout.redirect.uris']=base+'/auth/signed-out'
  client.attributes['frontchannel.logout.url']=base+'/auth/frontchannel'
  client.protocolMappers.push({name:'portal-roles',protocol:'openid-connect',protocolMapper:'oidc-usermodel-realm-role-mapper',config:{'claim.name':'portal_roles','jsonType.label':'String',multivalued:'true','id.token.claim':'true','access.token.claim':'true','userinfo.token.claim':'true'}})
}
const target=resolve(process.argv[2]||resolve(root,'.local/identity-import'))
mkdirSync(target,{recursive:true})
writeFileSync(resolve(target,realm+'-realm.json'),JSON.stringify(config,null,2)+'\n',{mode:0o600})
console.log(`Identity configuration written to ${target}; no bootstrap users or passwords are included.`)
