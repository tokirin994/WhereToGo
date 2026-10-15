#!/usr/bin/env sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

if [ -e .env ]; then
  printf '%s\n' '已有 .env，保持不变。'
  exit 0
fi

python3 - <<'PY'
from pathlib import Path
from secrets import token_hex
import os

template = Path('.env.example').read_text(encoding='utf-8')
password = token_hex(24)
lines = []
for line in template.splitlines():
    if line.startswith('DB_PASSWORD='):
        line = f'DB_PASSWORD={password}'
    lines.append(line)

path = Path('.env')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as stream:
    stream.write('\n'.join(lines) + '\n')
PY

printf '%s\n' '已创建仅供本机使用的 .env，并生成随机数据库密码。'
