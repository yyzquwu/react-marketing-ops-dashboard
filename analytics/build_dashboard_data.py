from __future__ import annotations

import csv
import io
import json
import math
import sqlite3
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
ANALYTICS_DIR = REPO_ROOT / "analytics"
SQL_DIR = ANALYTICS_DIR / "sql"
DATA_DIR = REPO_ROOT / "public" / "data"
RAW_CSV = DATA_DIR / "raw_global_ads_performance_dataset.csv"
DB_PATH = ANALYTICS_DIR / "marketing_ops.sqlite"
OUTPUT_JSON = DATA_DIR / "global_ads_performance_daily.json"
OUTPUT_CSV = DATA_DIR / "global_ads_performance_daily.csv"

DASHBOARD_HEADERS = [
    "date",
    "source",
    "source_label",
    "medium",
    "medium_label",
    "campaign_id",
    "campaign_name",
    "segment",
    "impressions",
    "clicks",
    "spend",
    "conversions",
    "total_conversion",
    "revenue",
    "ctr",
    "cpc",
    "cpa",
    "roas",
    "dataset",
]


def js_round(value: float | None, decimals: int) -> float | None:
    if value is None:
        return None
    multiplier = 10**int(decimals)
    return math.floor((float(value) + sys.float_info.epsilon) * multiplier + 0.5) / multiplier


def normalize_number(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def run_sql_file(connection: sqlite3.Connection, filename: str) -> None:
    sql = (SQL_DIR / filename).read_text(encoding="utf-8")
    connection.executescript(sql)


def load_raw_csv(connection: sqlite3.Connection) -> int:
    with RAW_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    connection.execute("drop table if exists raw_global_ads")
    connection.execute(
        """
        create table raw_global_ads (
          row_id integer primary key,
          date text,
          platform text,
          campaign_type text,
          industry text,
          country text,
          impressions real,
          clicks real,
          source_ctr real,
          source_cpc real,
          ad_spend real,
          conversions real,
          source_cpa real,
          revenue real,
          source_roas real
        )
        """,
    )

    records = [
        (
            index,
            row["date"],
            row["platform"],
            row["campaign_type"],
            row["industry"],
            row["country"],
            row["impressions"],
            row["clicks"],
            row["CTR"],
            row["CPC"],
            row["ad_spend"],
            row["conversions"],
            row["CPA"],
            row["revenue"],
            row["ROAS"],
        )
        for index, row in enumerate(rows, start=1)
    ]
    connection.executemany(
        """
        insert into raw_global_ads (
          row_id, date, platform, campaign_type, industry, country,
          impressions, clicks, source_ctr, source_cpc, ad_spend,
          conversions, source_cpa, revenue, source_roas
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        records,
    )
    return len(records)


def export_dashboard_dataset(connection: sqlite3.Connection) -> int:
    rows = [
        {key: normalize_number(value) for key, value in dict(row).items()}
        for row in connection.execute(
            f"select {', '.join(DASHBOARD_HEADERS)} from campaign_daily order by date, campaign_id",
        ).fetchall()
    ]

    OUTPUT_JSON.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    csv_buffer = io.StringIO()
    writer = csv.DictWriter(csv_buffer, fieldnames=DASHBOARD_HEADERS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    OUTPUT_CSV.write_text(csv_buffer.getvalue().rstrip("\n"), encoding="utf-8")

    return len(rows)


def write_findings(connection: sqlite3.Connection) -> None:
    summary = connection.execute(
        """
        select
          round(sum(spend), 0) as spend,
          round(sum(revenue), 0) as revenue,
          round(sum(conversions), 0) as conversions,
          round(sum(spend) / nullif(sum(conversions), 0), 2) as cpa,
          round(sum(revenue) / nullif(sum(spend), 0), 2) as roas
        from campaign_daily
        """,
    ).fetchone()

    print("Dashboard dataset rebuilt")
    print(f"- Spend: ${summary['spend']:,.0f}")
    print(f"- Revenue: ${summary['revenue']:,.0f}")
    print(f"- Conversions: {summary['conversions']:,.0f}")
    print(f"- CPA: ${summary['cpa']:,.2f}")
    print(f"- ROAS: {summary['roas']:,.2f}x")


def main() -> None:
    if not RAW_CSV.exists():
        raise FileNotFoundError(f"Missing raw Kaggle CSV: {RAW_CSV}")

    ANALYTICS_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.create_function("js_round", 2, js_round)
    try:
        raw_count = load_raw_csv(connection)
        run_sql_file(connection, "01_campaign_daily.sql")
        run_sql_file(connection, "02_dashboard_views.sql")
        exported_count = export_dashboard_dataset(connection)
        connection.commit()

        print(f"Loaded {raw_count:,} raw rows")
        print(f"Exported {exported_count:,} dashboard rows")
        write_findings(connection)
    finally:
        connection.close()


if __name__ == "__main__":
    main()
