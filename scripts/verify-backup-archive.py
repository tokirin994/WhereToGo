"""Decrypt a local age archive to a memory stream and inspect SQL; write no plaintext files."""
import argparse,json,os,subprocess,tarfile
parser=argparse.ArgumentParser();parser.add_argument('--age',required=True);parser.add_argument('--archive',required=True);args=parser.parse_args()
environment={key:value for key,value in os.environ.items() if key!='WTG_BACKUP_RECOVERY_KEY'}
process=subprocess.Popen([args.age,'--decrypt','--identity','-',args.archive],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=environment)
process.stdin.write(os.environ['WTG_BACKUP_RECOVERY_KEY'].encode());process.stdin.close()
found=set();sql_bytes=0;header=False;members=0
try:
    with tarfile.open(fileobj=process.stdout,mode='r|') as archive:
        for member in archive:
            members+=1
            if member.name=='database.sql':
                source=archive.extractfile(member);tail=b''
                for data in iter(lambda:source.read(1024*1024),b''):
                    sql_bytes+=len(data);block=tail+data
                    header=header or b'PostgreSQL database cluster dump' in block
                    for database in ['travelatlas','smartledger','identity']:
                        if ('CREATE DATABASE '+database).encode() in block:found.add(database)
                    tail=block[-200:]
    # Consume to EOF so age verifies the final authentication tag as well.
    while process.stdout.read(1024*1024):pass
    code=process.wait();process.stderr.read()
    if code!=0 or not header or found!={'travelatlas','smartledger','identity'} or sql_bytes==0:raise RuntimeError('Archive integrity or database SQL validation failed')
    print(json.dumps({'verified':True,'authenticatedDecryption':True,'databases':sorted(found),'sqlBytes':sql_bytes,'archiveEntries':members,'plaintextFilesWritten':False,'restoredIntoPostgres':False}))
finally:
    if process.poll() is None:process.kill();process.wait()
