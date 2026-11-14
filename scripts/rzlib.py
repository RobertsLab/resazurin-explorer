"""Shared reader and validator for experiments in data/experiments/.
Standard library only. The rules mirror docs/js/core.js (the website's uploader)."""
import csv, json, os, re

REQUIRED_COLS = ["sample_id", "plate", "type", "hour", "fluorescence"]
OPTIONAL_COLS = ["temperature_c", "length_mm", "group", "family", "mortality", "date", "excluded", "notes"]
REQUIRED_META = ["id", "title", "species", "contact", "date_start", "container"]


def _num(v):
    v = (v or "").strip()
    if v == "" or v.lower() in ("na", "nan", "null"):
        return None
    return float(v)


def load_experiment(folder):
    """Return (meta, samples, errors, warnings). samples: list of dicts."""
    errors, warnings = [], []
    name = os.path.basename(os.path.normpath(folder))
    mp, rp = os.path.join(folder, "experiment.json"), os.path.join(folder, "readings.csv")
    if not os.path.exists(mp) or not os.path.exists(rp):
        return None, [], [f"{name}: needs both experiment.json and readings.csv"], warnings
    try:
        meta = json.load(open(mp, encoding="utf-8"))
    except Exception as e:
        return None, [], [f"{name}/experiment.json is not valid JSON: {e}"], warnings
    for k in REQUIRED_META:
        if str(meta.get(k, "") or "").strip() == "":
            errors.append(f'experiment.json: "{k}" is required')
    if meta.get("id") and not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,63}", meta["id"]):
        errors.append('experiment.json: "id" must be 3-64 chars of lowercase letters, digits, hyphens')
    if meta.get("id") and meta["id"] != name:
        errors.append(f'experiment.json: "id" ({meta["id"]}) must match the folder name ({name})')
    if meta.get("date_start") and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(meta["date_start"])):
        errors.append('experiment.json: "date_start" must be YYYY-MM-DD')

    with open(rp, newline="", encoding="utf-8-sig") as fh:
        rd = csv.DictReader(fh)
        cols = [c.strip().lower() for c in (rd.fieldnames or [])]
        rd.fieldnames = cols
        missing = [c for c in REQUIRED_COLS if c not in cols]
        if missing:
            return meta, [], errors + [f"readings.csv: missing required column(s): {', '.join(missing)}"], warnings
        unknown = [c for c in cols if c not in REQUIRED_COLS + OPTIONAL_COLS]
        if unknown:
            warnings.append(f"readings.csv: extra column(s) ignored: {', '.join(unknown)}")
        by = {}
        for n, r in enumerate(rd, start=2):
            sid = (r.get("sample_id") or "").strip()
            typ = (r.get("type") or "").strip().lower()
            if not sid:
                errors.append(f"readings.csv line {n}: empty sample_id"); continue
            if typ not in ("sample", "blank"):
                errors.append(f'readings.csv line {n}: type must be "sample" or "blank"'); continue
            try:
                h, f = _num(r.get("hour")), _num(r.get("fluorescence"))
                t, ln = _num(r.get("temperature_c")), _num(r.get("length_mm"))
            except ValueError:
                errors.append(f"readings.csv line {n}: non-numeric hour, fluorescence, temperature_c or length_mm"); continue
            if f is None:
                continue
            if h is None or h < 0:
                errors.append(f"readings.csv line {n}: hour is missing or negative"); continue
            s = by.get(sid)
            if s is None:
                mort = (r.get("mortality") or "").strip().lower()
                mort = {"0": "alive", "1": "dead"}.get(mort, mort)
                s = by[sid] = dict(id=sid, plate=(r.get("plate") or "").strip(), type=typ, t=t, len=ln,
                                   g=(r.get("group") or "").strip(), fam=(r.get("family") or "").strip(), mort=mort,
                                   date=(r.get("date") or "").strip(), excl=(r.get("excluded") or "").strip(),
                                   notes=(r.get("notes") or "").strip(), pts={})
            if h in s["pts"]:
                errors.append(f"readings.csv line {n}: duplicate reading for {sid} at hour {h:g}"); continue
            s["pts"][h] = f
    samples = []
    for s in by.values():
        hs = sorted(s["pts"]); s["h"] = hs; s["f"] = [s["pts"][h] for h in hs]; del s["pts"]
        samples.append(s)
        if hs[0] != 0:
            errors.append(f"{s['id']}: no reading at hour 0")
        elif not s["f"][0] > 0:
            errors.append(f"{s['id']}: hour-0 fluorescence must be greater than zero")
        if len(hs) < 2:
            errors.append(f"{s['id']}: fewer than two readings")
        if not s["plate"]:
            errors.append(f"{s['id']}: empty plate")
        if s["type"] == "sample" and s["t"] is None:
            errors.append(f"{s['id']}: temperature_c is required for samples")
        if s["mort"] not in ("", "alive", "dead"):
            warnings.append(f"{s['id']}: mortality should be alive or dead")
    animals = [s for s in samples if s["type"] == "sample"]
    if not animals:
        errors.append('readings.csv: no rows with type "sample"')
    no_blank = sorted({s["plate"] for s in animals} - {s["plate"] for s in samples if s["type"] == "blank"})
    if no_blank:
        warnings.append(f"{len(no_blank)} plate(s) without blanks (no blank correction possible): {', '.join(no_blank[:5])}")
    nolen = sum(1 for s in animals if s["len"] is None)
    if nolen:
        warnings.append(f"{nolen} of {len(animals)} samples have no length_mm (no size normalization possible)")
    return meta, samples, errors, warnings


def experiment_folders(root):
    return sorted(os.path.join(root, d) for d in os.listdir(root) if os.path.isdir(os.path.join(root, d)))
