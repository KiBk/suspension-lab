"""Verify served bytes, local dependency coverage and health on the public app."""
from pathlib import Path
import hashlib
import json
import urllib.request
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[1]
base = 'https://suspension-lab.apps.kibk.net'
checks = []
for name in ['index.html', 'style.css', 'app.js', 'physics.js', 'model.js', 'view.js', 'tyres.js', 'driving-input.js', 'sound.js', 'sound-model.js', 'sound-dsp.js', 'sound-worklet.js', 'vendor/rapier.js', 'vendor/three.module.js', 'vendor/three.core.js', 'vendor/OrbitControls.js']:
    local = (root / 'public' / name).read_bytes()
    with urllib.request.urlopen(base + '/' + name, timeout=30) as response:
        remote = response.read()
        assert response.status == 200
        assert response.headers['X-Content-Type-Options'] == 'nosniff'
    assert local == remote, f'Public content mismatch: {name}'
    checks.append({'path': name, 'sha256': hashlib.sha256(remote).hexdigest(), 'bytes': len(remote)})
with urllib.request.urlopen(base + '/healthz', timeout=30) as response:
    assert response.status == 200 and response.read().strip() == b'ok'
result = {'checked_at': datetime.now(timezone.utc).isoformat(), 'url': base, 'health': 'ok', 'files': checks}
path = root / 'evidence' / (datetime.now(timezone.utc).strftime('%Y-%m-%dT%H%M%SZ') + '-live-verification.json')
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(result, indent=2) + '\n')
print(f'Health and all {len(checks)} public files verified: {base}')
print(f'Evidence: {path}')
