# Resazurin Explorer

A self-contained repository and static website for whole-animal resazurin metabolic assays in shellfish.

- **Search and explore** every well from the seven resazurin assays in Huffmyer et al. 2026 (PeerJ 14:e21542), plus the Taylor Shellfish family screening (Sept 2025, 38 families, 4,788 wells).
- **Add a new experiment** in the browser, validate it, and see it plotted against the published studies.
- **Contribute it permanently** with a pull request. One folder, two files, checked automatically.

There is no server and no build tooling. The site is plain HTML, CSS and JavaScript in `docs/`, and the scripts use only the Python standard library.

## Use the website

- **Online:** enable GitHub Pages for this repository (Settings → Pages → Deploy from a branch → `main` / `docs`). The site appears at `https://<org>.github.io/<repo>/`.
- **Offline:** open `docs/index.html` in a browser. Everything works from the file system.

| Tab | What it does |
|---|---|
| Overview | Summary numbers and a searchable card for each experiment |
| Explore | Filter by experiment, species, temperature, shell length, survival and free text; plot fold change, blank-corrected or size-normalized values; color and panel by any attribute; sortable table; CSV download of whatever is filtered |
| Add your data | Describe an experiment, drop in a readings file, get a validation report, and see your data against prior studies (median curves, rate by temperature, rate by shell length) |
| Data format | The file specification, with downloadable templates |

Uploaded files never leave the browser. "Add to the Explorer" stores the experiment in that browser's local storage so it persists between visits on the same machine.

## Add an experiment to the repository

1. Prepare the two files described in [DATA_FORMAT.md](DATA_FORMAT.md). The **Add your data** tab validates them and downloads a ready-made `experiment.json` and `readings.csv`.
2. Put them in `data/experiments/<id>/`, where `<id>` matches the `id` in `experiment.json`.
3. Run the checks locally (optional):
   ```bash
   python scripts/validate.py
   python scripts/build_site.py
   ```
4. Open a pull request. The `validate` workflow checks every experiment. After merge, the `build-site` workflow regenerates `docs/data/db.js` and the website updates.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Minimum required information

| Level | Required |
|---|---|
| Experiment (`experiment.json`) | `id`, `title`, `species`, `contact`, `date_start`, `container` |
| Every row (`readings.csv`) | `sample_id`, `plate`, `type` (`sample` or `blank`), `hour`, `fluorescence` (raw) |
| Every sample | `temperature_c` |
| Every well | a reading at hour 0 and at least one later reading |

Strongly recommended: blank wells on every plate and `length_mm` for every animal. Full specification: [DATA_FORMAT.md](DATA_FORMAT.md).

## Repository layout

```
data/experiments/<id>/experiment.json   experiment description
data/experiments/<id>/readings.csv      raw fluorescence, long format
docs/                                   the website (GitHub Pages root)
docs/data/db.js                         generated bundle of all experiments
docs/js/core.js                         parsing, validation, normalization (shared by site and uploader)
docs/templates/                         template files for new experiments
scripts/validate.py                     validates data/experiments
scripts/build_site.py                   regenerates docs/data/db.js
scripts/import_peerj21542/              how the published data were converted from the source repositories
scripts/import_taylor_sept2025/         how the Taylor Shellfish Sept 2025 screening was converted
.github/workflows/                      validation on pull requests, site rebuild on merge
```

## What is calculated

| Value | Definition |
|---|---|
| Fold change | fluorescence at hour *t* ÷ fluorescence of the same well at hour 0 |
| Blank-corrected fold change | fold change − mean fold change of blanks on the same `plate` at the same hour |
| Per mm | blank-corrected fold change ÷ shell length (the paper's "metabolism") |
| Rate | blank-corrected fold change at the last reading ÷ hours elapsed |

These follow the analysis scripts published with the paper. Raw fluorescence is the only thing stored; everything else is computed in the browser, so published and uploaded data go through identical code.

## Data sources and citation

Huffmyer AS, Ozguner N, Baird M, Elvrum C, Kounellas C, Dicksion D, White SJ, Plough L, Gavery MR, Krebs N, Walton W, Small J, Pitsenbarger M, Ealy-Whitfield H, Roberts S. 2026. From blue to pink: resazurin as a high-throughput proxy for metabolic rate in oysters. PeerJ 14:e21542. https://doi.org/10.7717/peerj.21542

Raw plate files: [RobertsLab/resazurin-assay-development](https://github.com/RobertsLab/resazurin-assay-development) and [RobertsLab/vims-resazurin](https://github.com/RobertsLab/vims-resazurin).

Notes on the conversion:

- Wells the authors removed (three thermal-curve outliers, three empty-shell or spilled family samples, 145 saturated VIMS wells) are kept with a reason in `excluded` and hidden by default.
- The live-vs-shell test has no species or date in the source repository. It is labeled *Crassostrea gigas*, and `date_start` is a placeholder.
- The second thermal-curve temperature is 26 °C in the source metadata and 27 °C in the paper. The data use 26.
- For the two-phase family trials, `temperature_c` is the stress temperature (40 °C) and the schedule is in `temperature_profile`.

## Caveat on cross-study comparison

Fold change depends on reader gain, solution volume per animal, and the temperature of the solution at the hour-0 read. Differences in level between studies are not purely biological. Compare curve shapes and within-study contrasts first.

## License

Code: MIT. Published data: CC BY 4.0, credit Huffmyer et al. 2026.
