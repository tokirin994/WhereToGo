#!/usr/bin/env python
"""Forced SSH command for encrypted backup downloads only (Python 2/3 compatible)."""
from __future__ import print_function
import os, sys, re, json, hashlib
ROOT='/opt/wheretogo/backups'
PATTERN=r'^\d{8}T\d{6}Z\.tar\.age$'
command=os.environ.get('SSH_ORIGINAL_COMMAND','').split()
if command==['list']:
    rows=[]
    for name in sorted(os.listdir(ROOT))[-365:]:
        path=os.path.join(ROOT,name)
        if re.match(PATTERN,name) and not os.path.islink(path) and os.path.isfile(path):
            stat=os.stat(path);rows.append({'name':name,'size':stat.st_size,'modified':int(stat.st_mtime)})
    print(json.dumps(rows));sys.exit(0)
if len(command)!=2 or command[0] not in ('read','stat') or not re.match(PATTERN,command[1]):
    sys.stderr.write('Only list, stat and read of encrypted database archives are allowed\n');sys.exit(1)
path=os.path.join(ROOT,command[1])
with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),'rb') as handle:
    if command[0]=='stat':
        digest=hashlib.sha256()
        while True:
            data=handle.read(1024*1024)
            if not data:break
            digest.update(data)
        print(json.dumps({'name':command[1],'size':os.fstat(handle.fileno()).st_size,'sha256':digest.hexdigest()}))
    else:
        out=getattr(sys.stdout,'buffer',sys.stdout)
        while True:
            data=handle.read(1024*1024)
            if not data:break
            out.write(data)
