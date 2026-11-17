#!/usr/bin/env python3
"""Convert the Taylor Shellfish Sept 2025 family screening to the repository format.

Source: https://github.com/RobertsLab/resazurin-family-screenings/tree/main/taylor-shellfish-sept2025
Needs pandas and openpyxl. Usage:

    python import_taylor_sept2025.py <path/to/taylor-shellfish-sept2025> ../../data/experiments

Follows taylor-shellfish-sept2025-metabolism-export.Rmd in the source repository:
- Raw plate reads at 0.5, 1.5 and 2.5 h. There is no hour-0 read, so hour 0 is the
  plate's mean blank fluorescence (all blank wells, all time points), as in the source.
- Wells the source analysis drops are kept and given an `excluded` reason.
"""
import glob, json, os, re, sys
import pandas as pd

EXP_ID = "taylor-shellfish-sept2025"
SAT, INACTIVE, STRAY_BLANK = 22000, 1000, 2.5


def read_plate(path):
    m = re.match(r"(\d{8})_(plate\d+)_T([\d.]+)\.txt$", os.path.basename(path))
    date, plate, hour = m.group(1), m.group(2), float(m.group(3))
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    start = next(i for i, l in enumerate(lines) if l.strip() == "Results") + 2
    rows = []
    for l in lines[start:start + 8]:
        cells = l.split("\t")
        for col in range(1, 13):
            rows.append(dict(date=date, plate=plate, well=f"{cells[0]}{col:02d}", hour=hour,
                             fluorescence=float(cells[col])))
    return rows


def main(src, out_root):
    reads = pd.DataFrame([r for f in sorted(glob.glob(os.path.join(src, "data/plate-files/*.txt")))
                          for r in read_plate(f)])
    meta = pd.read_excel(os.path.join(src, "data/metadata/taylor-shellfish-sept2025-metadata.xlsx"))
    meta["date"] = meta.date.astype(str)
    size = pd.read_excel(os.path.join(src, "data/size/taylor-shellfish-individual-size.xlsx"))
    size = size[["plate", "well", "number_oysters", "length.mm"]]
    temp = pd.read_excel(os.path.join(src, "data/temperature/temperature.xlsx"))

    x = reads.merge(meta, on=["date", "plate", "well"]).dropna(subset=["type"])
    # Day 2 re-ran plates 1-19 with the same oysters in the same wells, so size joins on plate + well.
    x = x.merge(size, on=["plate", "well"], how="left")

    # Synthetic hour 0: plate mean blank across all reads.
    bm = x[x.type == "blank"].groupby(["date", "plate"]).fluorescence.mean().rename("f0")
    t0 = x.drop_duplicates(["date", "plate", "well"]).drop(columns=["hour", "fluorescence"])
    t0 = t0.merge(bm.reset_index(), on=["date", "plate"])
    t0 = t0.assign(hour=0.0, fluorescence=t0.f0.round(1)).drop(columns="f0")
    x = pd.concat([x, t0], ignore_index=True)
    x = x.merge(bm.reset_index(), on=["date", "plate"])
    x["fold"] = x.fluorescence / x.f0

    # Well-level exclusion reasons, in the order the source applies its filters.
    w = x.groupby(["date", "plate", "well"]).agg(type=("type", "first"), n=("number_oysters", "first"),
                                                  fmax=("fluorescence", "max"), fold=("fold", "max"))
    def reason(r):
        if r.type == "blank":
            return f"blank fold change > {STRAY_BLANK} (likely stray oyster)" if r.fold > STRAY_BLANK else ""
        if pd.isna(r.n) or r.n != 1:
            n = "unknown number of" if pd.isna(r.n) else int(r.n)
            return f"{n} oysters in well" if n != 1 else ""
        if r.fmax > SAT:
            return f"saturated (> {SAT} RFU)"
        if r.fmax < INACTIVE:
            return f"never reached {INACTIVE} RFU (likely dead or inactive)"
        return ""
    w["excluded"] = w.apply(reason, axis=1)
    x = x.merge(w[["excluded"]].reset_index(), on=["date", "plate", "well"])

    x["sample_id"] = x.date + "_" + x.plate + "_" + x.well
    x["plate_id"] = x.date + "_" + x.plate
    x["iso"] = pd.to_datetime(x.date).dt.strftime("%Y-%m-%d")
    x["group"] = x.date.map({"20250903": "day 1 initial", "20250904": "day 2 repeat"})
    x["family"] = x.family.apply(lambda v: "" if pd.isna(v) else str(int(v)))
    x.loc[x.type == "blank", ["family", "group"]] = ""
    x["length_mm"] = x["length.mm"].where(x.type == "sample").round(3)
    x["temperature_c"] = 35

    x["_pn"] = x.plate.str.extract(r"(\d+)$")[0].astype(int)
    x = x.sort_values(["date", "_pn", "well", "hour"])
    cols = ["sample_id", "plate", "type", "hour", "fluorescence", "temperature_c", "length_mm",
            "group", "family", "date", "excluded"]
    out = x.drop(columns=["plate", "date"]).rename(columns={"plate_id": "plate", "iso": "date"})[cols]
    out["hour"] = out.hour.map(lambda h: f"{h:g}")
    out["fluorescence"] = out.fluorescence.map(lambda v: f"{v:g}")

    ts = temp.groupby("timepoint").temperature.mean()
    exp = {
        "id": EXP_ID,
        "title": "Taylor Shellfish family screening (Sept 2025)",
        "species": "Crassostrea gigas",
        "life_stage": "seed",
        "size_class": "1-7 mm",
        "container": "96-well plate",
        "reader": "BioTek Synergy HTX",
        "excitation_nm": 528,
        "emission_nm": 590,
        "temperature_profile": (f"Warmed from {ts['T0.5']:.0f} to {ts['T2.5']:.0f} C over 2.5 h (measured on day 1); "
                                f"temperature_c records the 35 C plateau"),
        "group_label": "Trial day",
        "description": ("38 Taylor Shellfish hatchery families screened on 2025-09-03 (38 plates); plates 1-19 were "
                        "re-run with the same oysters on 2025-09-04 as a repeat stressor. Reads at 0.5, 1.5 and 2.5 h; "
                        "there was no hour-0 read, so hour 0 is each plate's mean blank fluorescence, as in the source "
                        "analysis. Wells the source analysis drops (not exactly one oyster, saturated, inactive) "
                        "are flagged as excluded."),
        "source_url": "https://github.com/RobertsLab/resazurin-family-screenings/tree/main/taylor-shellfish-sept2025",
        "date_start": "2025-09-03",
        "date_end": "2025-09-04",
        "contact": "Roberts Lab, University of Washington (SAFS)",
    }
    d = os.path.join(out_root, EXP_ID)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "experiment.json"), "w") as fh:
        json.dump(exp, fh, indent=2)
        fh.write("\n")
    out.to_csv(os.path.join(d, "readings.csv"), index=False)
    print(f"{d}: {out.sample_id.nunique()} wells, {len(out)} rows, "
          f"{(w.excluded != '').sum()} excluded")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
