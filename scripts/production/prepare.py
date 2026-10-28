#!/usr/bin/env python3
"""Generate a fresh production configuration; never overwrite existing encryption keys."""
import argparse
import base64
import datetime
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shlex
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / '.local' / 'production'


def hostname(value):
    value = value.strip().lower()
    if not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', value):
        raise ValueError('Use a public DNS hostname without a scheme, port or path')
    if value == 'example.com' or value.endswith(('.example.com', '.localhost', '.invalid', '.test')):
        raise ValueError('Replace the example hostname with a domain you control')
    return value


def origin(value):
    parsed = urlsplit(value.strip())
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/') or parsed.port:
        raise ValueError('Use an exact HTTPS origin without a path or port')
    return 'https://' + hostname(parsed.hostname or '')


def write_once(path, value, mode=0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as output:
        os.fchmod(output.fileno(), mode)
        output.write(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('portal', 'ledger', 'identity-host', 'travel-api-host', 'ledger-api-host', 'email', 'admin-cidr', 'backup-recipient-file'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--travel', help='Optional independent travel HTTPS origin')
    args = parser.parse_args()
    if os.name != 'posix' or os.geteuid() != 0:
        parser.error('Run on the Linux server with sudo; Windows local settings are not modified')
    try:
        portal, ledger = origin(args.portal), origin(args.ledger)
        travel = origin(args.travel) if args.travel else portal + '/travel'
        hosts = [hostname(value) for value in (args.identity_host, args.travel_api_host, args.ledger_api_host)]
        if len(set([portal[8:], ledger[8:], *hosts])) != 5:
            raise ValueError('Use five distinct hostnames for the two SPAs and three server endpoints')
        cidrs = [ipaddress.ip_network(value, strict=False) for value in args.admin_cidr.split()]
        if not cidrs or any(not network.network_address.is_global or network.prefixlen == 0 for network in cidrs):
            raise ValueError('Admin CIDRs must identify your own public operator IP, not an open/private/documentation range')
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', args.email):
            raise ValueError('Enter a valid certificate contact email')
        recipients = [line.strip() for line in Path(args.backup_recipient_file).read_text(encoding='utf-8-sig').splitlines() if line.strip() and not line.lstrip().startswith('#')]
        if not recipients or any(not re.fullmatch(r'age1[a-z0-9]+', line) for line in recipients):
            raise ValueError('Provide age PUBLIC recipients only; never upload the AGE-SECRET-KEY file here')
    except (ValueError, OSError) as error:
        parser.error(str(error))
    if RUNTIME.exists() and any(RUNTIME.iterdir()):
        parser.error('Existing production state found. Edit its public .env or follow the restore guide; do not regenerate keys')
    RUNTIME.mkdir(parents=True, exist_ok=True)
    RUNTIME.chmod(0o700)
    for directory in ('secrets', 'identity-import', 'backups'):
        (RUNTIME / directory).mkdir(mode=0o700)
    # Secret files must be readable by the unprivileged container UIDs. Their host parent is root-only.
    for name in ('postgres-password', 'travel-password', 'travel-migration-password', 'ledger-password', 'ledger-migration-password', 'identity-password', 'identity-admin-password'):
        write_once(RUNTIME / 'secrets' / name, secrets.token_urlsafe(36) + '\n', 0o644)
    kid = 'prod-' + datetime.date.today().strftime('%Y%m%d')
    keyring = {'activeKeyId': kid, 'keys': {kid: base64.b64encode(secrets.token_bytes(32)).decode('ascii')}}
    write_once(RUNTIME / 'secrets' / 'credential-keyring.json', json.dumps(keyring) + '\n', 0o644)
    write_once(RUNTIME / 'secrets' / 'travel-ai-key', '', 0o644)
    values = {
        'PORTAL_ORIGIN': portal, 'LEDGER_ORIGIN': ledger, 'IDENTITY_HOST': hosts[0],
        'TRAVEL_API_HOST': hosts[1], 'LEDGER_API_HOST': hosts[2], 'IDENTITY_REALM': 'personal',
        'IDENTITY_ADMIN_USERNAME': 'bootstrap-admin', 'ACME_EMAIL': args.email,
        'ADMIN_ALLOWED_CIDRS': ' '.join(str(network) for network in cidrs),
        'API_ALLOWED_SUBJECTS': '00000000-0000-0000-0000-000000000000',
        'TRAVEL_AI_BASE_URL': '', 'TRAVEL_AI_MODEL': '', 'TRAVEL_AI_PROTOCOL': 'chat-completions',
        'TRAVEL_AI_TOKEN_FIELD': 'max_tokens', 'TRAVEL_AI_AUTH_MODE': 'api-key',
        'TRAVEL_AI_ANTHROPIC_VERSION': '2023-06-01', 'BACKUP_RCLONE_DEST': '', 'BACKUP_KEEP_DAYS': '14',
    }
    write_once(RUNTIME / '.env', '\n'.join(f'{key}={shlex.quote(value)}' for key, value in values.items()) + '\n')
    write_once(RUNTIME / 'backup-recipients.txt', '\n'.join(recipients) + '\n')
    config = json.loads((ROOT / 'identity' / 'realm-local.json').read_text(encoding='utf-8-sig'))
    config.update(realm='personal', sslRequired='all', registrationAllowed=False, resetPasswordAllowed=False)
    config.pop('users', None)
    for client in config['clients']:
        if client['clientId'] not in ('smartledger-web', 'portal-web', 'travel-web'):
            raise ValueError('Review an unexpected identity client before generating production settings')
        base = {'smartledger-web':ledger,'portal-web':portal,'travel-web':travel}[client['clientId']]
        client.update(rootUrl=base, redirectUris=[base + '/auth/callback', base + '/auth/silent'], webOrigins=[urlsplit(base).scheme+'://'+urlsplit(base).netloc])
        client['redirectUris']=list(dict.fromkeys(client['redirectUris']+[portal+'/auth/silent']))
        client['webOrigins']=list(dict.fromkeys(client['webOrigins']+[portal]))
        client['attributes'].update({'post.logout.redirect.uris': base + '/auth/signed-out', 'frontchannel.logout.url': base + '/auth/frontchannel'})
        client['protocolMappers'] = [mapper for mapper in client.get('protocolMappers', []) if mapper.get('name') != 'portal-roles'] + [{
            'name': 'portal-roles', 'protocol': 'openid-connect', 'protocolMapper': 'oidc-usermodel-realm-role-mapper',
            'config': {'claim.name': 'portal_roles', 'jsonType.label': 'String', 'multivalued': 'true', 'id.token.claim': 'true', 'access.token.claim': 'true', 'userinfo.token.claim': 'true'},
        }]
    # Import files contain no secrets and must be readable by the Keycloak UID (1000).
    # The mount parent on the host remains root-only; inside the mounted directory use traverse permission.
    (RUNTIME / 'identity-import').chmod(0o755)
    write_once(RUNTIME / 'identity-import' / 'personal-realm.json', json.dumps(config, ensure_ascii=False, indent=2) + '\n', 0o644)
    common = {
        'VITE_LOCAL_MOCK_AUTH': 'false', 'VITE_OIDC_AUTHORITY': f'https://{hosts[0]}/realms/personal',
        'VITE_SMARTLEDGER_API_URL': 'https://' + hosts[2],
    }
    portal_env = {**common, 'VITE_OIDC_CLIENT_ID': 'portal-web', 'VITE_OIDC_AUDIENCE': 'portal-api', 'VITE_API_BASE_URL': 'https://' + hosts[1], 'VITE_SMARTLEDGER_PUBLIC_URL': ledger}
    ledger_env = {**common, 'VITE_OIDC_CLIENT_ID': 'smartledger-web', 'VITE_OIDC_AUDIENCE': 'smartledger-api', 'VITE_PORTAL_PUBLIC_URL': portal, 'VITE_WHERE_TO_GO_PUBLIC_URL': travel+'/'}
    portal_env.update(VITE_WHERE_TO_GO_PUBLIC_URL=travel+'/',VITE_AUTH_MODE='portal')
    travel_env={**portal_env,'VITE_OIDC_CLIENT_ID':'travel-web','VITE_OIDC_AUDIENCE':'wheretogo-api','VITE_APP_BASE_PATH':urlsplit(travel+'/').path}
    for name, settings in (('portal-pages.env', portal_env), ('travel-pages.env', travel_env), ('ledger-pages.env', ledger_env)):
        write_once(RUNTIME / name, '\n'.join(f'{key}={value}' for key, value in settings.items()) + '\n')
    print(f'Production state generated in {RUNTIME}. No passwords or encryption keys have been printed.')
    print('Copy only portal-pages.env / ledger-pages.env values to Pages. Keep the secrets directory and backup private key out of GitHub.')


if __name__ == '__main__':
    main()
