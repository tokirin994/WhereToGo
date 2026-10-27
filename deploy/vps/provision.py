from __future__ import print_function
import os,sys,json,base64,uuid
try: from urllib.parse import urlparse
except ImportError: from urlparse import urlparse

root='/opt/wheretogo'
secret_dir=root+'/secrets'
os.umask(0o077)
if not os.path.isdir(secret_dir):os.makedirs(secret_dir)
os.chmod(secret_dir,0o700)
def write(path,value,mode=0o600):
 with open(path,'w') as handle:handle.write(value)
 os.chmod(path,mode)
def password():return 'Aa1!'+base64.urlsafe_b64encode(os.urandom(24)).decode('ascii')
def secret(name):
 path=secret_dir+'/'+name
 if not os.path.exists(path):write(path,password(),0o444)
 value=open(path).read().strip()
 if open(path).read()!=value:write(path,value,0o444)
 return value
origin=open('public-origin.txt').read().strip().rstrip('/')
parsed=urlparse(origin)
if parsed.scheme!='https' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username:raise ValueError('Invalid public origin')
for name in ['postgres-password','travel-password','travel-migration-password','ledger-password','ledger-migration-password','identity-password','identity-admin-password']:secret(name)
if not os.path.exists(secret_dir+'/travel-ai-key'):write(secret_dir+'/travel-ai-key','',0o444)
if not os.path.exists(secret_dir+'/credential-keyring.json'):
 write(secret_dir+'/credential-keyring.json',json.dumps({'activeKeyId':'vps1','keys':{'vps1':base64.b64encode(os.urandom(32)).decode('ascii')}})+'\n',0o444)
metadata_path=secret_dir+'/accounts-metadata.json'
initial_path=secret_dir+'/initial-accounts.json'
if not os.path.exists(metadata_path):
 accounts=[{'id':str(uuid.uuid4()),'username':name,'password':password()} for name in ['tok','guest1','guest2','guest3']]
 write(initial_path,json.dumps(accounts)+'\n')
 write(metadata_path,json.dumps([{'id':a['id'],'username':a['username']} for a in accounts])+'\n')
else:accounts=json.load(open(initial_path)) if os.path.exists(initial_path) else []
metadata=json.load(open(metadata_path))
config=json.load(open('realm-template.json'))
config.update({'realm':'personal','sslRequired':'all','registrationAllowed':True,'resetPasswordAllowed':False})
config['users']=[]
for account in accounts:
 user={'id':account['id'],'username':account['username'],'enabled':True,'firstName':'User','lastName':account['username'],'email':account['username']+'@example.invalid','emailVerified':False,'requiredActions':[], 'credentials':[{'type':'password','value':account['password'],'temporary':False}]}
 if account['username']=='tok':user['realmRoles']=['portal-admin','default-roles-personal']
 config['users'].append(user)
for client in config['clients']:
 app=origin+('/ledger/' if client['clientId']=='smartledger-web' else '/')
 client.update({'rootUrl':app,'baseUrl':app,'redirectUris':[app+'auth/callback',app+'auth/silent'],'webOrigins':[origin]})
 client['attributes']['post.logout.redirect.uris']=app+'auth/signed-out'
 client['attributes']['frontchannel.logout.url']=app+'auth/frontchannel'
 client.setdefault('protocolMappers',[]).append({'name':'portal-roles','protocol':'openid-connect','protocolMapper':'oidc-usermodel-realm-role-mapper','config':{'claim.name':'portal_roles','jsonType.label':'String','multivalued':'true','id.token.claim':'true','access.token.claim':'true','userinfo.token.claim':'true'}})
imports=root+'/identity-import'
if not os.path.isdir(imports):os.makedirs(imports)
os.chown(imports,1000,1000);os.chmod(imports,0o700)
path=imports+'/personal-realm.json'
write(path,json.dumps(config,ensure_ascii=True)+'\n',0o400);os.chown(path,1000,1000)
write('.env','PUBLIC_ORIGIN='+origin+'\nPUBLIC_HOST='+parsed.hostname+'\nAPI_ALLOWED_SUBJECTS=\nAPI_ALLOW_ANY_AUTHENTICATED_USER=true\n')
print('Provisioned public registration; existing accounts and private secrets preserved')
