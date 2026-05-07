# Python + SQL Analytics Pipeline

This folder is an optional data prep layer for the dashboard. It keeps the React layout untouched and recreates the dashboard-ready `global_ads_performance_daily.json` and `.csv` from the raw Kaggle CSV using Python plus SQL.

The flow is:

```text
raw Kaggle CSV
  -> Python loads the file into SQLite
  -> SQL normalizes fields and recalculates metrics
  -> SQL builds analysis views
  -> Python exports dashboard-ready JSON/CSV
```

Run it from the repo root:

```bash
python analytics/build_dashboard_data.py
```

By default, the script writes:

- `public/data/global_ads_performance_daily.json`
- `public/data/global_ads_performance_daily.csv`
- `analytics/marketing_ops.sqlite`

The SQLite database is ignored by git so the repo keeps the SQL and Python logic, not a generated local database file.
