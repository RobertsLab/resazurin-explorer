"""Convert the tidy table from 01_build_tidy_table.py into this repository's
standard layout: data/experiments/<id>/experiment.json + readings.csv.
Usage: python 02_tidy_to_repo_format.py tidy.csv ../../data/experiments
"""
import sys, os, json, re
import pandas as pd, numpy as np

tidy, out = sys.argv[1], sys.argv[2]
d = pd.read_csv(tidy, dtype={"date": str, "family": str})
PAPER = dict(doi="10.7717/peerj.21542",
             citation="Huffmyer AS et al. 2026. From blue to pink: resazurin as a high-throughput proxy for metabolic rate in oysters. PeerJ 14:e21542",
             contact="Roberts Lab, University of Washington (SAFS)", license="CC BY 4.0",
             resazurin_ug_ml=111, salinity_psu=25)
R1 = "https://github.com/RobertsLab/resazurin-assay-development"
R2 = "https://github.com/RobertsLab/vims-resazurin"
META = {
 "1": dict(id="peerj21542-oxygen-correlation", title="Oxygen-correlation assay", species="Crassostrea gigas",
           life_stage="seed", size_class="4-7 mm", container="48-well plate", volume_ml=1.0,
           reader="BioTek Synergy HTX", excitation_nm=528, emission_nm=590, temperature_profile="27 C for 5 h",
           description="Resazurin read hourly on the same 95 seed measured by microplate respirometry the previous day.",
           source_url=R1 + "/tree/main/data/oxygen-correlation"),
 "2": dict(id="peerj21542-live-vs-shell", title="Live oysters vs empty shells", species="Crassostrea gigas",
           life_stage="seed", size_class="15-20 mm", container="12-well plate", reader="BioTek Synergy HTX",
           excitation_nm=528, emission_nm=590, temperature_profile="35 C for 4 h", group_label="Sample kind",
           description="Live seed, empty shells and blank wells, to confirm the signal comes from the animal. Species is not recorded in the source repository; C. gigas is assumed.",
           source_url=R1 + "/tree/main/data/testing/optimization"),
 "3": dict(id="peerj21542-small-seed-thermal", title="Small-seed thermal response", species="Crassostrea gigas",
           life_stage="seed", size_class="3-8 mm", container="96-well plate", volume_ml=0.28, reader="BioTek FLx800",
           excitation_nm=530, emission_nm=590, temperature_profile="20, 36, 38, 40 or 42 C for 4 h", group_label="Seed group",
           description="One control plate (20 C) and one elevated-temperature plate per day; survival scored after the final read.",
           source_url=R1 + "/tree/main/data/spat-stress"),
 "4": dict(id="peerj21542-medium-seed-thermal-curve", title="Medium-seed thermal performance curve", species="Crassostrea gigas",
           life_stage="seed", size_class="5-15 mm", container="12-well plate, 300 uL subsampled to 96-well plate", volume_ml=4,
           reader="BioTek Synergy LX", excitation_nm=528, emission_nm=590, temperature_profile="21, 26, 32, 37, 42 or 45 C for 5 h",
           description="One temperature per day at the USDA Pacific Shellfish Research Unit. Source metadata records 26 C; the paper reports 27 C.",
           source_url=R1 + "/tree/main/data/thermal-curve"),
 "5": dict(id="peerj21542-large-seed-acute-stress", title="Large-seed acute thermal stress", species="Crassostrea gigas",
           life_stage="seed", size_class="15-35 mm", container="20 mL cup, 200 uL subsampled to 96-well plate", volume_ml=20,
           reader="PerkinElmer Victor 3", excitation_nm=528, emission_nm=590, temperature_profile="18 or 42 C for 4 h",
           group_label="Prior conditioning",
           description="Control vs acute heat stress with hourly survival checks. Seed had received sublethal conditioning two months earlier.",
           source_url=R1 + "/tree/main/data/10k-seed"),
 "6": dict(id="peerj21542-usda-families", title="Family variation (USDA families A-E)", species="Crassostrea gigas",
           life_stage="seed", size_class="13-25 mm", container="20 mL cup, 200 uL subsampled to 96-well plate", volume_ml=20,
           reader="BioTek Synergy HTX", excitation_nm=528, emission_nm=590, temperature_profile="18 C for 3 h, then 40 C for 3 h",
           description="Five families from the USDA Pacific Oyster Genome Selection program, six trial days. temperature_c records the stress temperature (40 C).",
           source_url=R1 + "/tree/main/data/usda-families"),
 "7": dict(id="peerj21542-vims-families", title="Selectively bred families (VIMS ABC)", species="Crassostrea virginica",
           life_stage="seed", size_class="7-25 mm", container="24-well plate", volume_ml=2.5, reader="Thermo Varioskan Lux",
           excitation_nm=530, emission_nm=590, temperature_profile="40 C incubator for 2.5 h, then 1.5 h recovery (two test plates held at 4 C and 21 C)",
           group_label="Selection line",
           description="50 families, 25 bred for low salinity and 25 for moderate/high salinity. Wells above 3000 RFU are flagged as excluded, as in the paper.",
           source_url=R2 + "/tree/main/data"),
}

def temp_c(s):
    m = re.match(r"(\d+(?:\.\d+)?)C", str(s))
    if "18C then 40C" in str(s): return 40.0
    return float(m.group(1)) if m else np.nan

for k, m in META.items():
    x = d[d.experiment.str.startswith(k + " ")].copy()
    x["temperature_c"] = x.temperature.map(temp_c)
    if k == "5":
        x["plate"] = x.date + "_" + x.plate + "_" + x.temperature
    elif k == "2":
        x["plate"] = "trial2"; x["date"] = ""
        x["group"] = x.group.map({"Live": "live oyster", "Shell": "empty shell"})
    else:
        x["plate"] = x.date + "_" + x.plate
    if k == "6":
        x["plate"] = x.date
    x["notes"] = x.meta_note.fillna("").astype(str).str.strip() if k == "7" else ""
    x["date"] = x.date.fillna("").map(lambda s: f"{s[:4]}-{s[4:6]}-{s[6:]}" if re.fullmatch(r"\d{8}", str(s)) else "")
    x = x.rename(columns={"raw": "fluorescence"})
    cols = ["sample_id", "plate", "type", "hour", "fluorescence", "temperature_c", "length_mm",
            "group", "family", "mortality", "date", "excluded", "notes"]
    x = x[cols].sort_values(["plate", "type", "sample_id", "hour"])
    x = x.dropna(axis=1, how="all")
    x = x.loc[:, [c for c in x.columns if not (x[c].fillna("") == "").all()]]
    x["length_mm"] = x["length_mm"].round(3) if "length_mm" in x else np.nan
    dates = sorted(v for v in x.get("date", pd.Series(dtype=str)).unique() if v)
    meta = dict(m, date_start=dates[0] if dates else "2025-01-01", date_end=dates[-1] if dates else None, **PAPER)
    if k == "2": meta["date_start"] = "2025-01-01"; meta["date_note"] = "Exact run date not recorded in the source repository"
    meta = {a: b for a, b in meta.items() if b is not None}
    p = os.path.join(out, m["id"]); os.makedirs(p, exist_ok=True)
    json.dump(meta, open(os.path.join(p, "experiment.json"), "w"), indent=2)
    x.to_csv(os.path.join(p, "readings.csv"), index=False, float_format="%g")
    print(m["id"], len(x), x.sample_id.nunique())
