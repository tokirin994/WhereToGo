"""Render managed public OIDC clients, without users or secrets. Python 2/3 compatible."""
from __future__ import print_function
import json, os, sys
try: from urllib.parse import urlparse
except ImportError: from urlparse import urlparse
template, origin_path, destination = sys.argv[1:4]
origin = open(origin_path).read().strip().rstrip('/')
if urlparse(origin).scheme != 'https': raise ValueError('HTTPS origin required')
if not os.path.isdir(destination): os.makedirs(destination)
paths = {'portal-web':'/', 'travel-web':'/travel/', 'smartledger-web':'/ledger/'}
for client in json.load(open(template))['clients']:
    if client['clientId'] not in paths: continue
    base = origin + paths[client['clientId']]
    client.update(rootUrl=base, baseUrl=base, redirectUris=[base+'auth/callback',base+'auth/silent'],webOrigins=[origin])
    if origin+'/auth/silent' not in client['redirectUris']: client['redirectUris'].append(origin+'/auth/silent')
    client['attributes'].update({'post.logout.redirect.uris':base+'auth/signed-out','frontchannel.logout.url':base+'auth/frontchannel'})
    if not any(m['name']=='portal-roles' for m in client.get('protocolMappers',[])):
        client.setdefault('protocolMappers',[]).append({'name':'portal-roles','protocol':'openid-connect','protocolMapper':'oidc-usermodel-realm-role-mapper','config':{'claim.name':'portal_roles','jsonType.label':'String','multivalued':'true','id.token.claim':'true','access.token.claim':'true','userinfo.token.claim':'true'}})
    with open(os.path.join(destination,client['clientId']+'.json'),'w') as handle: json.dump(client,handle)
print('Rendered portal/travel/ledger OIDC clients; no accounts modified')
