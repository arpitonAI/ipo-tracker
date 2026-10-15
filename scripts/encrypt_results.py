#!/usr/bin/env python3
"""Encrypt allotment results for the IPO Tracker app.

Usage: python3 scripts/encrypt_results.py /tmp/new_results.json [--replace]

Input: JSON list of {account, ipo, symbol?, status: allotted|not_allotted, shares}. NO PAN field allowed.
Merges into the private plaintext store ~/.ipo-results/results.json (chmod 600, outside the repo),
then writes ONLY data/results.enc.json (RSA-OAEP-2048/SHA-256 wrapped AES-256-GCM key).
The repo holds only the public key (data/results_pubkey.txt); nothing here can decrypt.
"""
import base64, json, os, re, sys, datetime
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(REPO, 'data', 'results_pubkey.txt')
OUT = os.path.join(REPO, 'data', 'results.enc.json')
STORE_DIR = os.path.expanduser(os.environ.get('IPO_RESULTS_DIR', '~/.ipo-results'))
STORE = os.path.join(STORE_DIR, 'results.json')
PAN_RE = re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b', re.I)
FIELDS = ('account', 'ipo', 'symbol', 'status', 'shares')

def die(m): sys.exit('ERROR: ' + m)

def inside_repo(p):
    p = os.path.realpath(p); return p == REPO or p.startswith(REPO + os.sep)

def safe_write(path, text, mode=0o600):
    if inside_repo(path) and os.path.realpath(path) != os.path.realpath(OUT):
        die('refusing to write inside the repo: ' + path)
    tmp = path + '.tmp'
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, 'w') as f: f.write(text)
    os.chmod(tmp, mode); os.replace(tmp, path)

def clean(e):
    if not isinstance(e, dict): die('each entry must be an object')
    extra = set(e) - set(FIELDS)
    if extra: die('unexpected field(s): %s (no PAN or other personal fields allowed)' % ', '.join(sorted(extra)))
    for v in e.values():
        if PAN_RE.search(str(v)): die('a value looks like a PAN; remove it')
    st = str(e.get('status', '')).strip().lower().replace(' ', '_').replace('-', '_')
    if st not in ('allotted', 'not_allotted'): die('status must be allotted or not_allotted')
    acc, ipo = str(e.get('account', '')).strip(), str(e.get('ipo', '')).strip()
    if not acc or not ipo: die('account and ipo are required')
    sh = int(e.get('shares') or 0) if st == 'allotted' else 0
    out = {'account': acc, 'ipo': ipo, 'status': st, 'shares': sh}
    if e.get('symbol'): out['symbol'] = str(e['symbol']).strip().upper()
    return out

def key(e):
    norm = lambda s: re.sub(r'\b(ltd|limited)\b', '', re.sub(r'[^a-z0-9 ]', ' ', s.lower())).split()
    return (' '.join(e['account'].lower().split()), e.get('symbol') or ' '.join(norm(e['ipo'])))

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 1: die(__doc__)
    src = args[0]
    if inside_repo(src): die('input file must be outside the repo (e.g. /tmp)')
    if not os.path.exists(PUB): die('missing data/results_pubkey.txt (paste the app public key there)')
    new = json.load(open(src))
    if not isinstance(new, list): die('input must be a JSON list')
    new = [clean(e) for e in new]
    os.makedirs(STORE_DIR, mode=0o700, exist_ok=True); os.chmod(STORE_DIR, 0o700)
    if inside_repo(STORE): die('store must be outside the repo')
    old = [] if '--replace' in sys.argv or not os.path.exists(STORE) else json.load(open(STORE))
    merged = {key(e): e for e in old}
    for e in new: merged[key(e)] = e
    results = list(merged.values())
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    safe_write(STORE, json.dumps(results, indent=1))
    pub = serialization.load_der_public_key(base64.b64decode(open(PUB).read().strip()))
    aes = AESGCM.generate_key(256); iv = os.urandom(12)
    ct = AESGCM(aes).encrypt(iv, json.dumps({'updated': now, 'results': results}).encode(), None)
    wk = pub.encrypt(aes, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    b = lambda x: base64.b64encode(x).decode()
    safe_write(OUT, json.dumps({'v': 1, 'alg': 'RSA-OAEP-256+A256GCM', 'updated': now,
                                'iv': b(iv), 'wrappedKey': b(wk), 'ciphertext': b(ct)}), 0o644)
    print('Encrypted %d result(s) (%d new/updated) -> data/results.enc.json' % (len(results), len(new)))

if __name__ == '__main__': main()
