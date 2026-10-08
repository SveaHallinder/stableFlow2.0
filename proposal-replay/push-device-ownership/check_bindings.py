#!/usr/bin/env python3
"""Verify every frozen source byte before any PostgreSQL runtime discovery."""
import hashlib
import json
from pathlib import Path
root = Path(__file__).resolve().parents[2]
bindings = json.loads((Path(__file__).parent / 'bindings.json').read_text())
for name, expected in bindings['files'].items():
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit('[push device ownership] Frozen source hash mismatch: ' + name)
print('[push device ownership] All frozen source hashes verified; SQL runtime not run.')
