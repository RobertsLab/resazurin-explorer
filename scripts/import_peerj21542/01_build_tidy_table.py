"""Assemble every resazurin time series from Huffmyer et al. 2026 (PeerJ 21542)
into one tidy table, following the normalization in the paper's own R scripts:
  fold = F_t / F_0 (per individual)
  fold_corr = fold - mean blank fold (same plate/group, same time point)
  fold_corr_mm = fold_corr / shell length (mm)   ("metabolism" in the paper)
"""
import sys, re, glob, os
import pandas as pd, numpy as np

R1, R2, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
D = os.path.join(R1, "data")


def read_biotek(path):
    """Return {well: value} from a BioTek txt export (any plate size)."""
    out = {}
    with open(path, encoding="latin-1") as fh:
        for line in fh:
            p = line.rstrip("\r\n").split("\t")
            if re.fullmatch(r"[A-H]", p[0] or "") and len(p) > 2:
                for i, v in enumerate(p[1:], start=1):
                    try:
                        out[f"{p[0]}{i:02d}"] = float(v)
                    except ValueError:
                        continue  # NA reads and the trailing filter label
    return out


def load_plates(pattern, has_plate=True):
    rows = []
    for f in sorted(glob.glob(pattern)):
        b = os.path.basename(f)
        date = re.match(r"(\d{8})", b).group(1)
        tp = int(re.search(r"T(\d+)", b).group(1))
        plate = re.search(r"plate\d+", b).group(0) if has_plate else "plate1"
        for w, v in read_biotek(f).items():
            rows.append(dict(date=date, plate=plate, well=w, hour=tp, raw=v))
    return pd.DataFrame(rows)


def normalize(df, id_cols, blank_cols):
    """fold change vs T0, blank mean per blank_cols+hour, corrected values."""
    df = df.sort_values(id_cols + ["hour"]).copy()
    df["fold"] = df["raw"] / df.groupby(id_cols)["raw"].transform("first")
    bl = (df[df.type == "blank"].groupby(blank_cols + ["hour"])["fold"]
          .mean().rename("blank_fold").reset_index())
    df = df.merge(bl, on=blank_cols + ["hour"], how="left")
    df["fold_corr"] = df["fold"] - df["blank_fold"]
    df["fold_corr_mm"] = df["fold_corr"] / df["length_mm"]
    return df


frames = []

# 1. Oxygen correlation: C. gigas 4-7 mm, 27C, 48-well plates
p = load_plates(f"{D}/oxygen-correlation/plate-files/*.txt")
m = pd.read_excel(f"{D}/oxygen-correlation/resazurin_metadata.xlsx", dtype={"date": str})
s = pd.read_excel(f"{D}/oxygen-correlation/size-images/sizes.xlsx").rename(columns={"length.mm": "length_mm"})
d = p.merge(m, on=["date", "plate", "well"]).merge(s, on="oyster", how="left")
d["temperature"] = "27C"
d = normalize(d, ["date", "plate", "well"], ["date", "plate"])
d["sample_id"] = d.date + "_" + d.plate + "_" + d.well
d["experiment"] = "1 Oxygen correlation"
d["species"] = "Crassostrea gigas"; d["size_class"] = "4-7 mm"
frames.append(d)

# 2. Shell vs live: 15-20 mm, 35C, 12-well plates (size column is in cm)
x = pd.read_excel(f"{D}/testing/optimization/shell-vs-blank.xlsx", sheet_name="raw_data")
d = x.melt(id_vars=["type", "well", "size.mm"], var_name="tp", value_name="raw")
d["hour"] = d.tp.str[1:].astype(int)
d["length_mm"] = d["size.mm"] * 10
d["group"] = d["type"]
d["type"] = np.where(d.type == "Blank", "blank", "sample")
d["date"] = "shell-test"; d["plate"] = "all"; d["temperature"] = "35C"
d = normalize(d, ["well"], ["date"])
d["sample_id"] = "shell_" + d.well
d["experiment"] = "2 Shell vs live"
d["species"] = "Crassostrea gigas"; d["size_class"] = "15-20 mm"
frames.append(d)

# 3. Small seed thermal response: C. gigas 3-8 mm, 96-well plates
p = load_plates(f"{D}/spat-stress/plate-files/*.txt")
m = pd.read_excel(f"{D}/spat-stress/metadata_spat.xlsx", dtype={"date": str})
s = pd.read_csv(f"{D}/spat-stress/size-spat.csv", dtype={"date": str})[["date", "plate", "well", "length.mm"]].rename(columns={"length.mm": "length_mm"})
v = pd.read_csv(f"{D}/spat-stress/survival-spat.csv", dtype={"date": str})[["date", "plate", "well", "mortality"]]
d = p.merge(m, on=["date", "plate", "well"]).merge(s, on=["date", "plate", "well"], how="left").merge(v, on=["date", "plate", "well"], how="left")
d = d[d.type.notna()]
d["group"] = d["spat_treatment"]
d["mortality"] = d.mortality.map({0: "alive", 1: "dead"})
d = normalize(d, ["date", "plate", "well"], ["date", "plate"])
d["sample_id"] = d.date + "_" + d.plate + "_" + d.well
d["experiment"] = "3 Small seed thermal response"
d["species"] = "Crassostrea gigas"; d["size_class"] = "3-8 mm"
frames.append(d)

# 4. Medium seed thermal curve: C. gigas 5-15 mm
p = load_plates(f"{D}/thermal-curve/plate-files/*.txt")
m = pd.read_excel(f"{D}/thermal-curve/metadata.xlsx", dtype={"date": str})
s = pd.read_excel(f"{D}/thermal-curve/size.xlsx", dtype={"date": str})[["date", "plate", "well", "length.mm"]].rename(columns={"length.mm": "length_mm"})
d = p.merge(m, on=["date", "plate", "well"]).merge(s, on=["date", "plate", "well"], how="left")
d["type"] = d.type.str.lower()
d["temperature"] = d.temperature.astype(str) + "C"
d = normalize(d, ["date", "plate", "well"], ["date", "plate"])
d["sample_id"] = d.date + "_" + d.plate + "_" + d.well
# high-value outliers removed in the paper's script
rm = {"20250610_plate2_B02", "20250601_plate1_B05", "20250601_plate1_B02"}
d["excluded"] = np.where(d.sample_id.isin(rm), "outlier removed in paper script", "")
d["experiment"] = "4 Medium seed thermal curve"
d["species"] = "Crassostrea gigas"; d["size_class"] = "5-15 mm"
frames.append(d)

# 5. Large seed acute thermal stress (10K seed): C. gigas 15-35 mm
x = pd.read_csv(f"{D}/10k-seed/resazurin_data.csv", dtype={"date": str, "sample": str, "bag": str})
d = x.melt(id_vars=["date", "bag", "sample", "type", "hardening", "temperature"], var_name="hour", value_name="raw")
d["hour"] = d.hour.astype(int)
s = pd.read_csv(f"{D}/10k-seed/resazurin-size.csv", dtype={"date": str, "sample": str, "bag": str})[["date", "bag", "sample", "length.mm"]].rename(columns={"length.mm": "length_mm"})
v = pd.read_excel(f"{D}/10k-seed/survival_resazurin.xlsx", sheet_name="data", dtype={"date.resazurin": str, "oyster": str, "bag": str})
v = v.rename(columns={"date.resazurin": "date", "oyster": "sample", 4: "dead4", 24: "dead24"})[["date", "bag", "sample", "dead4", "dead24"]]
d = d.merge(s, on=["date", "bag", "sample"], how="left").merge(v, on=["date", "bag", "sample"], how="left")
d["mortality"] = d.dead4.map({0: "alive", 1: "dead"})
d["mortality_24h"] = d.dead24.map({0: "alive", 1: "dead"})
d["group"] = d["hardening"]
d["plate"] = "bag" + d.bag
d = normalize(d, ["date", "bag", "sample"], ["date", "bag", "temperature"])
d["sample_id"] = d.date + "_bag" + d.bag + "_" + d["sample"]
d["experiment"] = "5 Large seed acute thermal stress"
d["species"] = "Crassostrea gigas"; d["size_class"] = "15-35 mm"
frames.append(d)

# 6. USDA families A-E: C. gigas 13-25 mm, 18C for 3 h then 40C for 3 h
p = load_plates(f"{D}/usda-families/fluorescence/*/*.txt", has_plate=False)
m = pd.read_excel(f"{D}/usda-families/metadata/sample_metadata.xlsx", dtype={"date": str})
m = m.rename(columns={m.columns[5]: "meta_note"})
s = pd.read_excel(f"{D}/usda-families/size/size.xlsx", dtype={"date": str})[["date", "sample", "length.mm"]].rename(columns={"length.mm": "length_mm"})
v = pd.read_excel(f"{D}/usda-families/mortality/mortality.xlsx", dtype={"date": str})[["date", "sample", "mortality"]]
d = p.merge(m, on=["date", "well"]).merge(s, on=["date", "sample"], how="left").merge(v, on=["date", "sample"], how="left")
d["mortality"] = d.mortality.map({0: "alive", 1: "dead"})
d["temperature"] = "18C then 40C"
d = normalize(d, ["date", "well"], ["date"])
d["sample_id"] = d.date + "_" + d["sample"].astype(str) + "_" + d.well
d["excluded"] = d.meta_note.fillna("").str.strip()
d["experiment"] = "6 Family variation (USDA A-E)"
d["species"] = "Crassostrea gigas"; d["size_class"] = "13-25 mm"
frames.append(d)

# 7. VIMS 50 families: C. virginica 7-25 mm, 40C for 2.5 h then recovery (repo: RobertsLab/vims-resazurin)
rows = []
for f in sorted(glob.glob(f"{R2}/data/plate-files/2025070[123]/*.xlsx")):
    b = os.path.basename(f)
    date = b[:8]; plate = re.search(r"plate\d+", b).group(0); tp = int(re.search(r"_T(\d+)", b).group(1))
    x = pd.read_excel(f, header=None)
    i = x.index[x[0] == "RFU"][0]
    blk = x.iloc[i + 1:i + 5]
    for _, r in blk.iterrows():
        for c in range(1, 7):
            rows.append(dict(date=date, plate=plate, well=f"{r[0]}{c:02d}", hour=tp, raw=float(r[c])))
p = pd.DataFrame(rows)
m = pd.read_excel(f"{R2}/data/trial_metadata.xlsx", dtype={"date": str})
s = pd.read_excel(f"{R2}/data/size/trial_size.xlsx", dtype={"date": str})[["date", "plate", "well", "length.mm"]].rename(columns={"length.mm": "length_mm"})
d = p.merge(m, on=["date", "plate", "well"]).merge(s, on=["date", "plate", "well"], how="left")
d = d[d.type.notna()]
d["family"] = d.family.apply(lambda v: "" if pd.isna(v) else str(int(v)))
d["group"] = d["phenotype"]
d["temperature"] = d.temperature.map({"40C": "40C then recovery", "4C": "4C (test plate)", "21C": "21C (test plate)"})
d = normalize(d, ["date", "plate", "well"], ["date", "plate"])
d["sample_id"] = d.date + "_" + d.plate + "_" + d.well
sat = d[d.raw > 3000].sample_id.unique()
d["excluded"] = np.where(d.sample_id.isin(sat), "oversaturated (>3000 RFU), removed in paper script", "")
d["meta_note"] = d.notes
d["experiment"] = "7 Selectively bred families (VIMS)"
d["species"] = "Crassostrea virginica"; d["size_class"] = "7-25 mm"
frames.append(d)

cols = ["experiment", "species", "size_class", "date", "plate", "sample_id", "type", "temperature",
        "group", "family", "mortality", "mortality_24h", "length_mm", "hour", "raw", "fold",
        "blank_fold", "fold_corr", "fold_corr_mm", "excluded", "meta_note"]
all_ = pd.concat(frames, ignore_index=True)
for c in cols:
    if c not in all_:
        all_[c] = np.nan
all_ = all_[cols]
all_["excluded"] = all_.excluded.fillna("")
all_.to_csv(OUT, index=False)

smp = all_[all_.type == "sample"]
print(smp.groupby(["experiment", "species", "size_class"]).agg(
    n=("sample_id", "nunique"), excl=("excluded", lambda s: smp.loc[s.index][s != ""].sample_id.nunique()),
    hours=("hour", "max"), fold_max=("fold", "max"), fold_med_end=("fold", "median"),
    len_min=("length_mm", "min"), len_max=("length_mm", "max")).to_string())
print(all_[all_.type == "blank"].groupby("experiment").sample_id.nunique())
print(all_.isna().sum())
