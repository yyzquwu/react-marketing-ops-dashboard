# Global Ads Performance

I built this as a full media analytics workflow, starting from campaign-level data prep and ending in a React/Vite dashboard that is quick to scan, easy to filter, and useful for comparing spend, conversions, CPA, ROAS, and campaign efficiency without digging through raw CSV rows.

This is an independent portfolio project and is not affiliated with or endorsed by Paramount.

Live demo: https://global-ads-marketing-analytics-dashboard.vercel.app

![Dashboard preview](docs/dashboard-preview.png?v=2026-05-07-sparklines)

## How I Built It

I started from the same structure I used in my companion Airflow marketing data ops repo: pull campaign data into a repeatable daily grain, clean the messy source fields, and publish a unified campaign performance table. For this dashboard version, I focused the final app on the Kaggle Global Ads Performance dataset and shaped the raw CSV into the same kind of reporting model.

The data workflow looks like this:

- Ingest the raw Kaggle ads CSV and keep it in `public/data` for reference.
- Normalize platform names, campaign types, countries, and calculated metric fields.
- Create campaign names from industry, campaign type, and country so the dashboard can rank and filter campaigns clearly.
- Recalculate core metrics from base columns instead of trusting every source metric blindly: CTR, CPC, CPA, and ROAS.
- Export a clean daily campaign table as both JSON and CSV for the React app.
- Aggregate that table in the app by time period, platform, country, industry, campaign type, and campaign.

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

## Data

The dashboard currently uses one built-in dataset:

- `Kaggle Global Ads Performance`

The app loads the processed JSON and CSV from `public/data`, with the raw Kaggle CSV kept beside them for reference. The transformation script lives in `scripts/build-data.mjs`.

## Notes

I tuned this version around the Kaggle data instead of keeping the older sample datasets around. The goal is a focused dashboard that fills the page well, stays readable at a 1920 desktop viewport, and keeps the charts useful without feeling cramped.
