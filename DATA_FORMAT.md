# Data format

An experiment is one folder with two files:

```
data/experiments/<id>/
├── experiment.json    what was done
└── readings.csv       what the plate reader measured
```

Templates are in [`docs/templates/`](docs/templates/) and can be downloaded from the website's **Data format** tab.

## Minimum required information

1. **About the experiment:** `id`, `title`, `species`, `contact`, `date_start`, `container`.
2. **For every well, cup or animal:** a unique `sample_id`, its `plate`, and its `type` (`sample` or `blank`).
3. **For every reading:** `hour` since resazurin was added, and the raw `fluorescence`.
4. **For every sample:** `temperature_c`.
5. **A reading at hour 0 for every well**, plus at least one later reading. Hour 0 is the baseline for fold change.

Strongly recommended: at least one blank well per plate (resazurin solution with no animal), and `length_mm` for each animal. Without blanks there is no blank correction; without lengths there is no size normalization.

## readings.csv

Long format: one row per well per time point. Comma-separated with a header row. Column order does not matter. Leave cells empty when a value is unknown.

| Column | Status | Description | Example |
|---|---|---|---|
| `sample_id` | **Required** | Unique name for one well, cup or animal within the experiment | `plate2_B07` |
| `plate` | **Required** | Plate, run or batch. Wells with the same `plate` share blanks | `2025-06-10_27C` |
| `type` | **Required** | `sample` (animal or control object) or `blank` (solution only) | `sample` |
| `hour` | **Required** | Hours since resazurin was added. Decimals allowed | `2.5` |
| `fluorescence` | **Required** | Raw plate-reader value (RFU). Not blank-subtracted, not normalized | `1532` |
| `temperature_c` | **Required for samples** | Incubation temperature in °C | `38` |
| `length_mm` | Recommended | Shell length in millimetres | `7.4` |
| `group` | Optional | Treatment, line, ploidy or control label | `triploid` |
| `family` | Optional | Family or genetic line identifier | `F12` |
| `mortality` | Optional | `alive` or `dead` at the end of the assay (`0`/`1` accepted) | `alive` |
| `date` | Optional | Date the well was run, `YYYY-MM-DD` | `2026-03-10` |
| `excluded` | Optional | Reason to hide this well by default; empty means include | `spilled` |
| `notes` | Optional | Free text | |

Example:

```csv
sample_id,plate,type,hour,fluorescence,temperature_c,length_mm,group,mortality,date
plateA_oyster01,plateA,sample,0,600,18,9.6,diploid,alive,2026-03-10
plateA_oyster01,plateA,sample,1,884,18,9.6,diploid,alive,2026-03-10
plateA_oyster01,plateA,sample,2,1151,18,9.6,diploid,alive,2026-03-10
plateA_blank1,plateA,blank,0,702,18,,,,2026-03-10
plateA_blank1,plateA,blank,1,709,18,,,,2026-03-10
```

Sample-level columns (`plate`, `type`, `temperature_c`, `length_mm`, `group`, `family`, `mortality`, `date`, `excluded`, `notes`) repeat on every row of a well. The value on the first row is used.

### Wide format (website uploader only)

The uploader also accepts one row per well with one column per time point, named by the hour: `0, 1, 2`, or `T0, T1, T2`, or `h0, h1, h2`. It converts to long format, and the submission package it downloads is always long. Files in the repository must be long.

```csv
sample_id,plate,type,temperature_c,length_mm,group,0,1,2,3,4
plateA_oyster01,plateA,sample,18,9.6,diploid,600,884,1151,1402,1739
plateA_blank1,plateA,blank,18,,,702,709,715,722,731
```

The uploader also recognizes a few common header names: `well` or `sample` for `sample_id`, `rfu` or `value` for `fluorescence`, `time` or `timepoint` for `hour`, `temperature` for `temperature_c`, `length` for `length_mm`, `treatment` for `group`.

## experiment.json

| Field | Status | Description | Example |
|---|---|---|---|
| `id` | **Required** | 3 to 64 characters: lowercase letters, digits, hyphens. Must equal the folder name | `roberts-2026-heat-trial` |
| `title` | **Required** | Short title | `Triploid seed heat trial` |
| `species` | **Required** | Full binomial | `Crassostrea gigas` |
| `contact` | **Required** | Person or lab responsible, and how to reach them | `J. Doe, Example Lab, jdoe@example.edu` |
| `date_start` | **Required** | First assay date, `YYYY-MM-DD` | `2026-03-10` |
| `container` | **Required** | What the animals were incubated in | `96-well plate` |
| `life_stage` | Recommended | larvae, seed, juvenile, adult, tissue | `seed` |
| `size_class` | Recommended | Approximate size range | `5-10 mm` |
| `volume_ml` | Recommended | Working solution per animal, mL | `0.28` |
| `reader` | Recommended | Plate reader make and model | `BioTek Synergy HTX` |
| `excitation_nm`, `emission_nm` | Recommended | Wavelengths in nm | `530`, `590` |
| `resazurin_ug_ml` | Recommended | Working concentration, µg/mL | `111` |
| `salinity_psu` | Recommended | Salinity of the working solution | `25` |
| `temperature_profile` | Recommended | Plain-language temperature schedule | `18 C for 3 h, then 40 C for 3 h` |
| `group_label` | Optional | What the `group` column means here | `Ploidy` |
| `description` | Optional | One or two sentences on the design | |
| `doi`, `citation`, `source_url`, `license`, `date_end` | Optional | Provenance | |

Example:

```json
{
  "id": "example-ploidy-heat-trial",
  "title": "Example: ploidy heat trial",
  "species": "Crassostrea gigas",
  "contact": "Your name, your lab, you@example.edu",
  "date_start": "2026-03-10",
  "container": "96-well plate",
  "size_class": "5-10 mm",
  "reader": "BioTek Synergy HTX",
  "excitation_nm": 530,
  "emission_nm": 590,
  "temperature_profile": "18 or 38 C for 4 h",
  "group_label": "Ploidy"
}
```

## Rules the validator enforces

Errors (the experiment is rejected):

- A required column or field is missing or empty.
- `type` is something other than `sample` or `blank`.
- `hour`, `fluorescence`, `temperature_c` or `length_mm` is not a number.
- The same `sample_id` has two readings at the same hour.
- A well has no reading at hour 0, a hour-0 value of zero or less, or fewer than two readings.
- A sample has no `temperature_c`, or any well has an empty `plate`.
- `id` does not match the folder name or is already in use.

Warnings (accepted, but check):

- A plate has no blanks.
- Samples lack `length_mm`.
- `mortality` is not `alive` or `dead`.
- Temperature or length is outside a plausible range for the units.

## Conventions

- **Blanks and `plate`.** Blank correction uses blanks that share a `plate` value with the sample. If you ran separate blanks per temperature or per day, give each set its own `plate` name.
- **Controls that are not animals** (empty shells, killed animals) are `type = sample` with a `group` label.
- **Two-phase temperature designs.** Put the stress temperature in `temperature_c` and the schedule in `temperature_profile`.
- **Subsampled designs.** If you incubate in cups and pipette a subsample to a reading plate, `sample_id` is the cup or animal, and `container` says so.
- **Bad wells.** Keep them and give a reason in `excluded`. Do not delete rows.
- **Raw values only.** Never upload blank-subtracted or normalized fluorescence.
