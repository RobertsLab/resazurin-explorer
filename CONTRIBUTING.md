# Contributing an experiment

1. Open the website's **Add your data** tab. Fill in the experiment details and drop in your readings file (long or wide format).
2. Fix anything the validation report lists. Check that the context plots look like your data.
3. Click **Download submission package**. You get `experiment.json` and `readings.csv`.
4. Fork this repository. Create `data/experiments/<id>/` (the `id` from your `experiment.json`) and add both files.
5. Optionally check locally. Python 3.8 or later, no packages needed:
   ```bash
   python scripts/validate.py                       # all experiments
   python scripts/validate.py data/experiments/<id> # just yours
   python scripts/build_site.py                     # refresh docs/data/db.js to preview in docs/index.html
   ```
6. Open a pull request with only your new folder. Do not commit `docs/data/db.js`; it is rebuilt after merge.

A maintainer will check that the species, temperatures and units look right and that the data are raw fluorescence.

## Correcting an existing experiment

Edit the files in `data/experiments/<id>/` and open a pull request describing the change. Keep wells that should be ignored and set `excluded` to the reason.

## Changing the site

The site is plain files in `docs/`. `docs/js/core.js` holds parsing, validation and normalization and is shared by the bundled data and the uploader. If you change a validation rule there, change it in `scripts/rzlib.py` too, and update `DATA_FORMAT.md`.
