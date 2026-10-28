"""Inspect Git objects without printing matched values. No third party dependencies.

Default: tracked files at HEAD. --history: all fetched origin refs and tags.
Reports contain locations and categories only; store them under ignored .local/.
This is a pattern scanner, not proof that arbitrary secrets cannot be present.
"""
import argparse
import collections
import ipaddress
import json
import pathlib
import re
import subprocess


def git(*args):
    return subprocess.check_output(['git', '-c', 'core.quotePath=false', *args])


RULES = {
    'private-key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'provider-key': re.compile(r'\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b'),
    'jwt': re.compile(r'\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b'),
    'personal-email': re.compile(r'\b[A-Za-z0-9._%+-]+@(?:qq\.com|163\.com|126\.com|gmail\.com|outlook\.com|hotmail\.com)\b', re.I),
    'personal-home-path': re.compile(r'[A-Za-z]:[\\/]+Users[\\/]+(?!Public\b|USER\b|<|example\b)[^\\/\s\x22\x27]+', re.I),
    'credential-in-url': re.compile(r'https?://[^\s/:<>]+:[^\s/@<>]+@'),
    'ip-derived-domain': re.compile(r'\b(?:\d{1,3}[-.]){3}\d{1,3}\.(?:sslip\.io|nip\.io)\b', re.I),
}
ASSIGNMENT = re.compile(r'(?i)(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|appPassword|secretKey)[\x22\x27]?\s*[:=]\s*[\x22\x27]([^\x22\x27\r\n]{8,})[\x22\x27]')
TEST_NETS = [ipaddress.ip_network(value) for value in ('192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24')]


def inspect_text(text):
    findings = []
    for number, line in enumerate(text.splitlines(), 1):
        for kind, pattern in RULES.items():
            for match in pattern.finditer(line):
                if kind == 'ip-derived-domain':
                    numeric = re.split(r'\.(?:sslip|nip)', match.group(), flags=re.I)[0].replace('-', '.')
                    try:
                        address = ipaddress.ip_address(numeric)
                    except ValueError:
                        continue
                    if address.is_loopback or any(address in network for network in TEST_NETS):
                        continue
                findings.append({'line': number, 'kind': kind, 'severity': 'block'})
        # Literal credential-like values need review; references, SQL bind variables
        # and deliberately fake fixture strings can also match this advisory rule.
        if ASSIGNMENT.search(line):
            findings.append({'line': number, 'kind': 'credential-assignment-review', 'severity': 'review'})
    return findings


def tree(ref):
    return [(entry.split(b'\t', 1)[0].split()[2].decode(), entry.split(b'\t', 1)[1].decode('utf-8'))
            for entry in git('ls-tree', '-rz', ref).split(b'\0') if entry]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history', action='store_true')
    parser.add_argument('--worktree', action='store_true', help='Inspect tracked and unignored new working files before committing')
    parser.add_argument('--ref', default='HEAD')
    parser.add_argument('--report')
    args = parser.parse_args()
    if args.report:
        output = pathlib.Path(args.report).resolve()
        local = pathlib.Path('.local').resolve()
        if local not in output.parents:
            parser.error('Audit reports must be stored under ignored .local/')
        if not git('check-ignore', str(output.relative_to(pathlib.Path.cwd()))).strip():
            parser.error('Report location must be ignored by Git')
    if args.history and args.worktree:
        parser.error('Choose either --history or --worktree')
    if args.worktree:
        refs = ['HEAD']
        objects = [('', path) for path in git('ls-files', '-coz', '--exclude-standard').decode('utf-8').split('\0') if path]
    elif args.history:
        refs = git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin', 'refs/tags').decode().splitlines()
        if not refs:
            parser.error('Fetch origin refs before running --history')
        objects = []
        for row in git('rev-list', '--objects', *refs).decode('utf-8').splitlines():
            parts = row.split(' ', 1)
            if len(parts) == 2:
                objects.append((parts[0], parts[1]))
    else:
        refs = [args.ref]
        objects = tree(args.ref)
    proc = subprocess.Popen(['git', 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    findings, binary_objects, count, byte_count = [], [], 0, 0
    try:
        for oid, path in objects:
            if args.worktree:
                if not pathlib.Path(path).is_file():
                    continue
                data = pathlib.Path(path).read_bytes()
            else:
                proc.stdin.write((oid + '\n').encode())
                proc.stdin.flush()
                header = proc.stdout.readline().split()
                data = proc.stdout.read(int(header[2]))
                proc.stdout.read(1)
                if header[1] != b'blob':
                    continue
            count += 1
            byte_count += len(data)
            if re.search(r'(?:^|/)(?:\.env(?:\..*)?|.*\.(?:clixml|pem|key|agekey|dump|sqlite3?))$', path) and not path.endswith('.example'):
                findings.append({'path': path, 'blob': oid, 'line': 0, 'kind': 'private-file', 'severity': 'block'})
            if b'\0' in data[:8192]:
                binary_objects.append({'path': path, 'bytes': len(data)})
                continue
            for finding in inspect_text(data.decode('utf-8', errors='replace')):
                findings.append({'path': path, 'blob': oid, **finding})
    finally:
        proc.stdin.close()
        proc.stdout.close()
        proc.wait()
    authors = git('log', *refs, '--format=%ae%n%ce').decode().splitlines()
    report = {
        'scope': 'fetched origin branches and tags, reachable history' if args.history else 'worktree' if args.worktree else args.ref,
        'refs': len(refs), 'commits': int(git('rev-list', '--count', *refs)),
        'blobs': count, 'bytes': byte_count, 'binaryObjects': binary_objects,
        'personalAuthorEmails': sum(bool(RULES['personal-email'].fullmatch(email)) for email in set(authors)),
        'findings': findings,
    }
    if args.report:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('scope', 'refs', 'commits', 'blobs', 'bytes', 'personalAuthorEmails')}))
    print('Categories: ' + json.dumps(dict(collections.Counter(row['kind'] for row in findings))))
    blocking = [row for row in findings if row['severity'] == 'block']
    for row in blocking:
        print(json.dumps({key: row[key] for key in ('path', 'line', 'kind')}, ensure_ascii=True))
    print('Matched values are never printed. Binary content needs separate review; credential-assignment-review is advisory.')
    return 1 if blocking else 0


if __name__ == '__main__':
    raise SystemExit(main())
