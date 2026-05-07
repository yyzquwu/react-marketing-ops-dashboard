# Global Ads Marketing Analytics Dashboard

I built this as a full media analytics workflow, starting from raw campaign data, moving through a Python + SQL transformation layer, and ending in a React/Vite dashboard that is quick to scan, easy to filter, and useful for comparing spend, conversions, CPA, ROAS, and campaign efficiency without digging through raw CSV rows.

This is an independent portfolio project and is not affiliated with or endorsed by Paramount.

Live demo: https://global-ads-marketing-analytics-dashboard.vercel.app

![Dashboard preview](docs/dashboard-preview.png?v=2026-05-07-sparklines)

## How I Built It

I started from the same structure I used in my companion Airflow marketing data ops repo: pull campaign data into a repeatable daily grain, clean the messy source fields, and publish a unified campaign performance table. For this dashboard version, I focused the final app on the Kaggle Global Ads Performance dataset and made the Python + SQLite pipeline the source of truth for the dashboard-ready data.

The data workflow looks like this:

- Ingest the raw Kaggle ads CSV and keep the original file in `public/data` for reference.
- Use Python to load the CSV into a local SQLite database.
- Clean the reporting fields in SQL, including platform names, countries, industries, campaign types, and dates.
- Create readable campaign names from industry, campaign type, and country so the dashboard can rank and filter campaigns clearly.
- Recalculate the important metrics from base columns: CTR, CPC, CPA, and ROAS.
- Use SQL views to structure weekly KPI trends, platform mix, campaign leaderboard rows, country performance, and campaign type performance.
- Export dashboard-ready JSON and CSV files back into `public/data`.
- Let the React dashboard handle fast filtering, charting, comparison views, and CSV download.

## What I Included

- KPI cards for spend, conversions, CPA, CTR, CPC, revenue, and ROAS, with weekly sparklines.
- Weekly/day/month trend views for spend, conversions, and revenue.
- Platform mix, campaign CPA ranking, efficiency quadrant, and budget opportunity summaries.
- Sidebar filters for date range, platform, country, industry, campaign type, and campaign.
- CSV upload/download support for working with filtered campaign data.
- A compact metric dictionary for the formulas used in the dashboard.

## Key Findings

- The dashboard covers 1,800 daily campaign rows, with about $11.1M in spend, $54.2M in revenue, 326.8K conversions, $33.99 CPA, and 4.88x ROAS.
- Google Ads took the largest share of spend at about $6.35M, but TikTok was the strongest efficiency story with 7.62x ROAS and a $21.67 CPA.
- Paid Search was the best campaign type by blended efficiency, landing around 5.31x ROAS and $31.64 CPA.
- India had the strongest country-level ROAS at 5.50x, while the USA had the largest spend base.
- The best campaign opportunities came from high-ROAS, lower-spend campaigns like Healthcare Display UK, EdTech Search Australia, and Fintech Video Germany.

## Run Locally

```bash
npm install
npm run dev
```

For a production check:

```bash
npm run build
npm run verify:layout
```

To rebuild the dashboard data from the Python + SQL pipeline:

```bash
npm run build:data:sql
```

## Data

The dashboard currently uses one built-in dataset:

- `Kaggle Global Ads Performance`

The app loads the processed JSON and CSV from `public/data`, with the raw Kaggle CSV kept beside them for reference. The active transformation workflow lives in `analytics/`:

- `analytics/build_dashboard_data.py` loads raw CSV data, runs the SQL files, and exports dashboard-ready files.
- `analytics/sql/01_campaign_daily.sql` creates the normalized daily campaign table.
- `analytics/sql/02_dashboard_views.sql` creates reusable aggregate views for analysis.

I kept the earlier Node transform in `scripts/build-data.mjs` for history, but the deployed dashboard data now comes from the Python + SQL workflow.
