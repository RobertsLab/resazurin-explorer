# How the published data were imported

These two scripts are a record of how the seven assays from Huffmyer et al. 2026 were converted. They need `pandas` and `openpyxl`, and local clones of the two source repositories. You do not need them to use or extend this repository.

```bash
git clone --depth 1 https://github.com/RobertsLab/resazurin-assay-development
git clone --depth 1 https://github.com/RobertsLab/vims-resazurin
python 01_build_tidy_table.py resazurin-assay-development vims-resazurin tidy.csv
python 02_tidy_to_repo_format.py tidy.csv ../../data/experiments
```

`01` reads the raw plate exports and metadata the same way the paper's R scripts do. `02` writes `experiment.json` and `readings.csv` for each assay.
