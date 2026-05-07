# Global Ads Performance

I built this as a React/Vite media analytics dashboard for the Kaggle Global Ads Performance dataset. It is meant to feel like a clean Paramount-style reporting workspace: quick to scan, easy to filter, and useful for comparing spend, conversions, CPA, ROAS, and campaign efficiency without digging through raw CSV rows.

This is an independent portfolio project and is not affiliated with or endorsed by Paramount.

Live demo: https://global-ads-marketing-analytics-dashboard.vercel.app

![Dashboard preview](docs/dashboard-preview.png?v=2026-05-07-sparklines)

## What I Included

- KPI cards for spend, conversions, CPA, CTR, CPC, revenue, and ROAS.
- Weekly/day/month trend views for spend, conversions, and revenue.
- Platform mix, campaign CPA ranking, efficiency quadrant, and budget opportunity summaries.
- Sidebar filters for date range, platform, country, industry, campaign type, and campaign.
- CSV upload/download support for working with filtered campaign data.
- A compact metric dictionary for the formulas used in the dashboard.
- Playwright layout checks for the 1920-style desktop dashboard.

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

The app loads the processed JSON and CSV from `public/data`, with the raw Kaggle CSV kept beside them for reference.

## Notes

I tuned this version around the Kaggle data instead of keeping the older sample datasets around. The goal is a focused dashboard that fills the page well, stays readable at a 1920 desktop viewport, and keeps the charts useful without feeling cramped.
