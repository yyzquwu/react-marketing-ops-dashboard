# React Marketing Ops Dashboard

A polished React/Vite paid media analytics dashboard that reads generated CSV/JSON exports. It includes two dataset modes:

- `Portfolio multi-platform sample`: deterministic demo output from the companion Airflow marketing data ops pipeline.
- `Real public Facebook ads`: anonymized public Facebook campaign performance data sourced from Kaggle and mirrored in the referenced GitHub project.

This is an independent portfolio project and is not affiliated with or endorsed by Paramount.

## Run Locally

```bash
npm install
npm run build:data
npm run dev
```

The app loads data from `public/data/*.json` and keeps the matching CSV files beside them for reproducibility.

## Data

The real dataset is `public/data/raw_real_facebook_ads.csv`, transformed by `scripts/build-data.mjs` into `public/data/real_facebook_ads_daily.csv` and `public/data/real_facebook_ads_daily.json`.

The real public CSV contains mixed row shapes where some later rows omit campaign identifiers. The transform preserves those rows as unmapped Facebook audience segments instead of inventing private campaign IDs.

Source: https://github.com/Zayd1602/Facebook-Ad-Campaign-Analysis

Original dataset listing: https://www.kaggle.com/datasets/madislemsalu/facebook-ad-campaign
