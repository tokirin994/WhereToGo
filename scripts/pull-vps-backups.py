"""Pull encrypted VPS backups with a forced-command SSH key; never restore over local data."""
import argparse,datetime,hashlib,io,json,os,pathlib,re,sys
import paramiko

NAME=re.compile(r'^\d{8}T\d{6}Z\.tar\.age$')
def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as handle:
        for data in iter(lambda:handle.read(1024*1024),b''):h.update(data)
    return h.hexdigest()

def pull(config):
    destination=pathlib.Path(config['destination']).resolve();destination.mkdir(parents=True,exist_ok=True)
    client=paramiko.SSHClient();client.load_host_keys(config['knownHosts']);client.set_missing_host_key_policy(paramiko.RejectPolicy())
    key=paramiko.Ed25519Key.from_private_key(io.StringIO(os.environ['WTG_BACKUP_PRIVATE_KEY']))
    client.connect(config['host'],port=config['port'],username='wtgbackup',pkey=key,look_for_keys=False,allow_agent=False,timeout=20,auth_timeout=20,banner_timeout=20)
    def command(value):
        stdin,stdout,stderr=client.exec_command(value,timeout=120);stdin.close();data=stdout.read(2*1024*1024)
        if stdout.channel.recv_exit_status()!=0:raise RuntimeError('Remote backup request rejected')
        return json.loads(data)
    try:
        rows=command('list')
        if not isinstance(rows,list) or not rows:raise RuntimeError('No encrypted server backup is available')
        for row in rows:
            if not NAME.fullmatch(row['name']) or not isinstance(row['size'],int) or row['size']<=0:raise RuntimeError('Invalid backup manifest')
        latest=max(rows,key=lambda r:r['name'])
        if datetime.datetime.now(datetime.timezone.utc).timestamp()-latest['modified']>config.get('maxAgeHours',30)*3600:raise RuntimeError('Latest server backup is stale; inspect the server backup timer')
        copied=0
        for row in sorted(rows,key=lambda r:r['name']):
            target=destination/row['name']
            if target.is_symlink():raise RuntimeError('Unexpected backup destination symlink')
            if target.exists() and target.stat().st_size==row['size'] and row!=latest:continue
            meta=command('stat '+row['name'])
            if target.exists() and target.stat().st_size==meta['size'] and sha256(target)==meta['sha256']:continue
            temporary=target.with_suffix(target.suffix+'.partial')
            if temporary.is_symlink():raise RuntimeError('Unexpected partial file symlink')
            stdin,stdout,stderr=client.exec_command('read '+row['name'],timeout=300);stdin.close()
            try:
                with open(temporary,'wb') as handle:
                    for data in iter(lambda:stdout.read(1024*1024),b''):handle.write(data)
                if stdout.channel.recv_exit_status()!=0 or temporary.stat().st_size!=meta['size'] or sha256(temporary)!=meta['sha256']:raise RuntimeError('Backup transfer size or SHA-256 verification failed')
                with open(temporary,'rb') as handle:
                    if not handle.read(32).startswith(b'age-encryption.org/v1\n'):raise RuntimeError('Expected an age encrypted backup archive')
                os.replace(temporary,target);copied+=1
            finally:
                if temporary.exists():temporary.unlink()
        status={'lastSuccess':datetime.datetime.now(datetime.timezone.utc).isoformat(),'latestBackup':latest['name'],'copiedFiles':copied,'serverFiles':len(rows),'destination':str(destination),'integrity':'SHA-256 and encrypted archive header verified','restorePerformed':False}
        status_path=pathlib.Path(config['statusFile']);status_path.write_text(json.dumps(status,indent=2),encoding='utf-8')
        print(json.dumps(status,ensure_ascii=False))
    finally:client.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--config');parser.add_argument('--generate-key',action='store_true');args=parser.parse_args()
    if args.generate_key:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import Encoding,PrivateFormat,PublicFormat,NoEncryption
        key=Ed25519PrivateKey.generate()
        print(json.dumps({'private':key.private_bytes(Encoding.PEM,PrivateFormat.OpenSSH,NoEncryption()).decode(),'public':key.public_key().public_bytes(Encoding.OpenSSH,PublicFormat.OpenSSH).decode()}))
    else:
        try:pull(json.loads(pathlib.Path(args.config).read_text(encoding='utf-8-sig')))
        except Exception as error:
            print('Backup pull failed: '+str(error),file=sys.stderr);sys.exit(1)
