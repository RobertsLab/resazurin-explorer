#!/usr/bin/env python3
"""Validate every experiment in data/experiments (or the folders given).
Exit code 1 if any experiment has errors. Usage: python scripts/validate.py [folder ...]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rzlib import load_experiment, experiment_folders

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "experiments")
folders = sys.argv[1:] or experiment_folders(root)
failed, seen = 0, set()
for f in folders:
    meta, samples, errors, warnings = load_experiment(f)
    name = os.path.basename(os.path.normpath(f))
    if meta and meta.get("id") in seen:
        errors.append(f"duplicate experiment id {meta['id']}")
    if meta:
        seen.add(meta.get("id"))
    n = sum(1 for s in samples if s["type"] == "sample"); b = len(samples) - n
    print(f"{'FAIL' if errors else 'ok  '}  {name}: {n} samples, {b} blanks, {len(warnings)} warning(s)")
    for w in warnings[:10]:
        print(f"      warning: {w}")
    for e in errors[:30]:
        print(f"      ERROR: {e}")
    if len(errors) > 30:
        print(f"      ... and {len(errors) - 30} more errors")
    failed += bool(errors)
sys.exit(1 if failed else 0)
