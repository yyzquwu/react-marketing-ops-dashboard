import React, { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileUp,
  MousePointer2,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const DATASETS = {
  portfolio: {
    label: "Portfolio multi-platform sample",
    sourceName: "UnifiedPaidMedia_v2025-05-18.csv",
    file: "/data/portfolio_campaign_daily.json",
    csv: "/data/portfolio_campaign_daily.csv",
    asOf: "May 18, 2025",
    uploaded: "Uploaded May 18, 2025 9:41 AM",
    realness: "Deterministic portfolio sample",
  },
  real_facebook_ads: {
    label: "Real public Facebook ads",
    sourceName: "RealFacebookAds_2017-08.csv",
    file: "/data/real_facebook_ads_daily.json",
    csv: "/data/real_facebook_ads_daily.csv",
    asOf: "Aug 30, 2017",
    uploaded: "Public anonymized dataset",
    realness: "Real public Facebook campaign data",
  },
};

const COLORS = {
  Meta: "#2563eb",
  "Google Ads": "#12b8ba",
  TikTok: "#d92782",
  YouTube: "#f59e0b",
  "Microsoft Ads": "#8057e8",
  Other: "#8f99a8",
};

const KPI_ICONS = {
  spend: Zap,
  conversions: Users,
  cpa: Target,
  ctr: MousePointer2,
  cpc: MousePointer2,
};

const DEFAULT_FILTERS = Object.freeze({
  platform: "All Platforms",
  campaign: "All Campaigns",
  medium: "All",
  includeTest: false,
});

const CHART_GRANULARITIES = ["day", "week", "month"];

const MEDIUM_OPTIONS = ["Paid Search", "Paid Social", "Paid Video", "Display"];

const CSV_HEADERS = [
  "date",
  "source_label",
  "medium_label",
  "campaign_id",
  "campaign_name",
  "segment",
  "impressions",
  "clicks",
  "spend",
  "conversions",
  "ctr",
  "cpc",
  "cpa",
];

function formatCurrency(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
}

function formatPercent(value, digits = 2) {
  return `${((value || 0) * 100).toFixed(digits)}%`;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return value;
}

function labelDate(value, withYear = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(parseDate(value));
}

function labelBucket(value, granularity) {
  if (granularity === "month") {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(parseDate(value));
  }
  if (granularity === "week") {
    return `Wk ${labelDate(value)}`;
  }
  return labelDate(value);
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((parseDate(end) - parseDate(start)) / 86400000) + 1);
}

function summarize(rows) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.spend += Number(row.spend) || 0;
      acc.conversions += Number(row.conversions) || 0;
      acc.impressions += Number(row.impressions) || 0;
      acc.clicks += Number(row.clicks) || 0;
      return acc;
    },
    { spend: 0, conversions: 0, impressions: 0, clicks: 0 },
  );

  return {
    ...totals,
    cpa: totals.conversions ? totals.spend / totals.conversions : 0,
    ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
    cpc: totals.clicks ? totals.spend / totals.clicks : 0,
    cvr: totals.clicks ? totals.conversions / totals.clicks : 0,
  };
}

function groupBy(rows, keyFn) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  if (!headers) return [];
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), record[index] ?? ""])),
  );
}

function normalizeRecords(records, dataset = "uploaded") {
  return records
    .map((record, index) => {
      const date = normalizeDate(record.date || record.reporting_start || record.reporting_end);
      const impressions = Number(record.impressions ?? record.Impressions) || 0;
      const clicks = Number(record.clicks ?? record.Clicks) || 0;
      const spend = Number(record.spend ?? record.spent ?? record.Spent) || 0;
      const conversions =
        Number(record.conversions ?? record.approved_conversion ?? record.Total_Conversion ?? record.total_conversion) || 0;
      const source = record.source || record.source_label || "uploaded";
      const sourceLabel = record.source_label || record.platform || record.source || "Uploaded";
      const medium = record.medium || "uploaded";
      const mediumLabel = record.medium_label || record.medium || "Uploaded";
      const campaignId = record.campaign_id || record.campaign || record.fb_campaign_id || `UP-${index + 1}`;
      const campaignName = record.campaign_name || record.campaign || record.campaign_id || `Uploaded Campaign ${index + 1}`;

      return {
        ...record,
        date,
        source,
        source_label: sourceLabel,
        medium,
        medium_label: mediumLabel,
        campaign_id: campaignId,
        campaign_name: campaignName,
        segment: record.segment || "",
        impressions,
        clicks,
        spend,
        conversions,
        total_conversion: Number(record.total_conversion) || conversions,
        ctr: Number(record.ctr) || (impressions ? clicks / impressions : 0),
        cpc: Number(record.cpc) || (clicks ? spend / clicks : 0),
        cpa: Number(record.cpa) || (conversions ? spend / conversions : 0),
        dataset,
      };
    })
    .filter((record) => record.date);
}

function metricDelta(rows, metric) {
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  if (dates.length < 4) return 0;
  const midpoint = Math.floor(dates.length / 2);
  const earlyDates = new Set(dates.slice(0, midpoint));
  const lateDates = new Set(dates.slice(midpoint));
  const early = summarize(rows.filter((row) => earlyDates.has(row.date)));
  const late = summarize(rows.filter((row) => lateDates.has(row.date)));
  const earlyValue = early[metric] || 0;
  const lateValue = late[metric] || 0;
  if (!earlyValue) return 0;
  return (lateValue - earlyValue) / Math.abs(earlyValue);
}

function bucketDate(dateValue, granularity) {
  const date = parseDate(dateValue);
  if (granularity === "month") {
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-01`;
  }
  if (granularity === "week") {
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    return toIsoDate(date);
  }
  return dateValue;
}

function buildTimeSeries(rows, granularity) {
  return [...groupBy(rows, (row) => bucketDate(row.date, granularity)).entries()]
    .map(([date, dayRows]) => ({ date, ...summarize(dayRows) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildCampaigns(rows) {
  return [...groupBy(rows, (row) => `${row.campaign_name}|${row.source_label}`).entries()]
    .map(([key, campaignRows]) => {
      const [campaign, platform] = key.split("|");
      const totals = summarize(campaignRows);
      return {
        campaign,
        platform,
        ...totals,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

function buildPlatforms(rows) {
  return [...groupBy(rows, (row) => row.source_label || "Other").entries()]
    .map(([platform, platformRows]) => ({ platform, ...summarize(platformRows) }))
    .sort((a, b) => b.spend - a.spend);
}

function csvFromRows(rows) {
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const body = rows.map((row) => CSV_HEADERS.map((header) => escape(row[header])).join(",")).join("\n");
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`${CSV_HEADERS.join(",")}\n${body}`)}`;
}

const KpiCard = memo(function KpiCard({ accent, delta, iconKey, label, value, suffix }) {
  const Icon = KPI_ICONS[iconKey] || Sparkles;
  const positiveIsGood = iconKey !== "cpa" && iconKey !== "cpc";
  const good = positiveIsGood ? delta >= 0 : delta <= 0;
  return (
    <section className="kpi-card">
      <div className="kpi-icon" style={{ background: accent }}>
        <Icon size={28} strokeWidth={2.3} />
      </div>
      <div className="kpi-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <p>
          vs first half of range
          <b className={good ? "delta-good" : "delta-bad"}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}%
          </b>
        </p>
      </div>
      {suffix ? <div className="kpi-suffix">{suffix}</div> : null}
    </section>
  );
});

const LineComboChart = memo(function LineComboChart({ data, granularity }) {
  const width = 620;
  const height = 330;
  const pad = { top: 28, right: 72, bottom: 44, left: 98 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxSpend = Math.max(...data.map((day) => day.spend), 1);
  const maxConversions = Math.max(...data.map((day) => day.conversions), 1);
  const x = (index) => pad.left + (index / Math.max(1, data.length - 1)) * innerW;
  const ySpend = (value) => pad.top + innerH - (value / maxSpend) * innerH;
  const yConversions = (value) => pad.top + innerH - (value / maxConversions) * innerH;
  const spendPoints = data.map((day, index) => `${x(index)},${ySpend(day.spend)}`).join(" ");
  const conversionPoints = data
    .map((day, index) => `${x(index)},${yConversions(day.conversions)}`)
    .join(" ");
  const labels = data.filter((_, index) => index % Math.ceil(data.length / 5) === 0);

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img">
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const y = pad.top + innerH - tick * innerH;
        return (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="grid-line" />
            <text x={pad.left - 14} y={y + 4} textAnchor="end" className="axis-label">
              {formatCurrency(maxSpend * tick).replace(".00", "")}
            </text>
            <text x={width - pad.right + 14} y={y + 4} className="axis-label">
              {formatNumber(maxConversions * tick)}
            </text>
          </g>
        );
      })}
      <text x={14} y={height / 2} className="axis-title" transform={`rotate(-90 14 ${height / 2})`}>
        Spend (USD)
      </text>
      <text
        x={width - 14}
        y={height / 2}
        className="axis-title conversions"
        transform={`rotate(90 ${width - 14} ${height / 2})`}
      >
        Conversions
      </text>
      <polyline points={spendPoints} fill="none" className="spend-line" pathLength="1" />
      <polyline points={conversionPoints} fill="none" className="conversion-line" pathLength="1" />
      {data.map((day, index) => (
        <g key={`${day.date}-${index}`}>
          <circle cx={x(index)} cy={ySpend(day.spend)} r="4" className="spend-dot" />
          <circle cx={x(index)} cy={yConversions(day.conversions)} r="3.5" className="conversion-dot" />
        </g>
      ))}
      {labels.map((day) => {
        const index = data.findIndex((item) => item.date === day.date);
        return (
          <text key={day.date} x={x(index)} y={height - 10} textAnchor="middle" className="axis-label">
            {labelBucket(day.date, granularity)}
          </text>
        );
      })}
    </svg>
  );
});

const DonutChart = memo(function DonutChart({ data }) {
  const total = data.reduce((sum, row) => sum + row.spend, 0) || 1;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut-layout">
      <svg className="donut" viewBox="0 0 150 150" role="img">
        <circle cx="75" cy="75" r={radius} className="donut-track" />
        {data.map((row) => {
          const share = row.spend / total;
          const dash = share * circumference;
          const segment = (
            <circle
              key={row.platform}
              cx="75"
              cy="75"
              r={radius}
              className="donut-segment"
              stroke={COLORS[row.platform] || COLORS.Other}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return segment;
        })}
        <circle cx="75" cy="75" r="32" fill="#fff" />
      </svg>
      <div className="donut-legend">
        {data.map((row) => (
          <div className="legend-row" key={row.platform}>
            <span className="legend-dot" style={{ background: COLORS[row.platform] || COLORS.Other }} />
            <span>{row.platform}</span>
            <b>{formatCurrency(row.spend)}</b>
            <em>{((row.spend / total) * 100).toFixed(1)}%</em>
          </div>
        ))}
        <div className="legend-row total">
          <span />
          <span>Total</span>
          <b>{formatCurrency(total)}</b>
          <em>100%</em>
        </div>
      </div>
    </div>
  );
});

const CpaBars = memo(function CpaBars({ campaigns }) {
  const ranked = campaigns
    .filter((campaign) => campaign.conversions > 0)
    .sort((a, b) => a.cpa - b.cpa)
    .slice(0, 9);
  const maxCpa = Math.max(...ranked.map((campaign) => campaign.cpa), 1);

  return (
    <div className="bar-list">
      {ranked.map((campaign) => (
        <div className="bar-row" key={`${campaign.campaign}-${campaign.platform}`}>
          <span>{campaign.campaign}</span>
          <div className="bar-track">
            <i style={{ width: `${Math.max(3, (campaign.cpa / maxCpa) * 100)}%` }} />
          </div>
          <b>{formatCurrency(campaign.cpa, 2)}</b>
        </div>
      ))}
      <div className="bar-axis">
        <span>$0</span>
        <span>{formatCurrency(maxCpa / 2)}</span>
        <span>{formatCurrency(maxCpa)}</span>
      </div>
    </div>
  );
});

const Takeaways = memo(function Takeaways({ summary, campaigns, platforms, deltas }) {
  const bestPlatform = platforms[0]?.platform ?? "top platform";
  const bestCpa = campaigns.filter((item) => item.conversions > 0).sort((a, b) => a.cpa - b.cpa)[0];
  const inefficient = campaigns.filter((item) => item.conversions > 0).sort((a, b) => b.cpa - a.cpa)[0];

  return (
    <section className="takeaways panel">
      <h2>Analyst Takeaways</h2>
      <div className="takeaway-grid">
        <div className="takeaway">
          <div className="takeaway-icon teal">
            <TrendingUp size={26} />
          </div>
          <p>
            Spend is <b>{deltas.spend >= 0 ? "up" : "down"} {Math.abs(deltas.spend * 100).toFixed(1)}%</b>
            {" "}and conversions are <b>{deltas.conversions >= 0 ? "up" : "down"}{" "}
            {Math.abs(deltas.conversions * 100).toFixed(1)}%</b> vs. the first half of the range.
          </p>
        </div>
        <div className="takeaway">
          <div className="takeaway-icon magenta">
            <Target size={26} />
          </div>
          <p>
            Best conversion efficiency is from <b>{bestCpa?.campaign ?? "available campaigns"}</b>
            {" "}at <b>{formatCurrency(bestCpa?.cpa ?? summary.cpa, 2)} CPA</b>.
          </p>
        </div>
        <div className="takeaway">
          <div className="takeaway-icon amber">
            <MousePointer2 size={26} />
          </div>
          <p>
            CTR is <b>{formatPercent(summary.ctr)}</b>. Reallocate budget toward {bestPlatform}
            {inefficient ? ` and inspect ${inefficient.campaign} for high CPA.` : "."}
          </p>
        </div>
      </div>
    </section>
  );
});

const Leaderboard = memo(function Leaderboard({ campaigns, page, rowsPerPage, onPageChange, onRowsPerPageChange }) {
  const totalPages = Math.max(1, Math.ceil(campaigns.length / rowsPerPage));
  const startIndex = (page - 1) * rowsPerPage;
  const rows = campaigns.slice(startIndex, startIndex + rowsPerPage);
  const visiblePages = [1, 2, 3, totalPages].filter(
    (item, index, items) => item <= totalPages && items.indexOf(item) === index,
  );

  return (
    <section className="leaderboard panel">
      <div className="panel-title-row">
        <h2>Campaign Leaderboard</h2>
        <div className="search-pill">
          <Search size={15} />
          <span>
            Showing {campaigns.length ? startIndex + 1 : 0} to {Math.min(startIndex + rowsPerPage, campaigns.length)} of{" "}
            {campaigns.length}
          </span>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Campaign</th>
              <th>Platform</th>
              <th>Spend (USD)</th>
              <th>Conversions</th>
              <th>CPA (USD)</th>
              <th>CTR</th>
              <th>CPC (USD)</th>
              <th>CVR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((campaign, index) => (
              <tr key={`${campaign.campaign}-${campaign.platform}`}>
                <td>{startIndex + index + 1}</td>
                <td>{campaign.campaign}</td>
                <td>{campaign.platform}</td>
                <td>{formatCurrency(campaign.spend)}</td>
                <td>{formatNumber(campaign.conversions)}</td>
                <td>{formatCurrency(campaign.cpa, 2)}</td>
                <td>{formatPercent(campaign.ctr)}</td>
                <td>{formatCurrency(campaign.cpc, 2)}</td>
                <td>{formatPercent(campaign.cvr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        {visiblePages.map((item, index) => (
          <React.Fragment key={item}>
            {index > 0 && item - visiblePages[index - 1] > 1 ? <span>...</span> : null}
            <button className={item === page ? "active" : ""} onClick={() => onPageChange(item)}>
              {item}
            </button>
          </React.Fragment>
        ))}
        <button
          aria-label="Next page"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <label>
          Rows per page:
          <select
            value={rowsPerPage}
            onChange={(event) => onRowsPerPageChange(Number(event.target.value))}
          >
            <option>10</option>
            <option>25</option>
            <option>50</option>
          </select>
        </label>
      </div>
    </section>
  );
});

const Sidebar = memo(function Sidebar({
  campaigns,
  csvHref,
  datasets,
  datasetId,
  dateRange,
  dragActive,
  filters,
  fileInputRef,
  onBrowseFiles,
  onDatasetChange,
  onDropFile,
  onDragState,
  onFilterChange,
  onUploadFile,
  platforms,
  setDateRange,
}) {
  const dataset = datasets[datasetId];
  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h3>DATA</h3>
        <label className="field-label">Dataset</label>
        <select value={datasetId} onChange={(event) => onDatasetChange(event.target.value)}>
          {Object.entries(datasets).map(([id, item]) => (
            <option value={id} key={id}>
              {item.label}
            </option>
          ))}
        </select>
        <h4>Upload CSV</h4>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="file-input" onChange={onUploadFile} />
        <div
          className={`upload-box ${dragActive ? "is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            onDragState(true);
          }}
          onDragEnter={() => onDragState(true)}
          onDragLeave={() => onDragState(false)}
          onDrop={onDropFile}
        >
          <FileUp size={26} />
          <strong>Drag & drop CSV here</strong>
          <span>or</span>
          <button type="button" onClick={onBrowseFiles}>
            Browse files
          </button>
        </div>
        <div className="file-valid">
          <CheckCircle2 size={18} />
          <div>
            <b>{dataset.sourceName}</b>
            <span>{dataset.uploaded}</span>
          </div>
        </div>
      </section>

      <section className="sidebar-section">
        <h3>FILTERS</h3>
        <label className="field-label">Date Range</label>
        <div className="date-range">
          <input
            type="date"
            value={dateRange.start}
            onChange={(event) => setDateRange((range) => ({ ...range, start: event.target.value }))}
          />
          <span>→</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(event) => setDateRange((range) => ({ ...range, end: event.target.value }))}
          />
        </div>
        <label className="field-label">Platform</label>
        <select value={filters.platform} onChange={(event) => onFilterChange("platform", event.target.value)}>
          <option>All Platforms</option>
          {platforms.map((platform) => (
            <option value={platform} key={platform}>
              {platform}
            </option>
          ))}
        </select>
        <label className="field-label">Campaign</label>
        <select value={filters.campaign} onChange={(event) => onFilterChange("campaign", event.target.value)}>
          <option>All Campaigns</option>
          {campaigns.map((campaign) => (
            <option value={campaign} key={campaign}>
              {campaign}
            </option>
          ))}
        </select>
        <label className="field-label">Source / Medium</label>
        <select value={filters.medium} onChange={(event) => onFilterChange("medium", event.target.value)}>
          <option>All</option>
          {MEDIUM_OPTIONS.map((medium) => (
            <option key={medium}>{medium}</option>
          ))}
        </select>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={filters.includeTest}
            onChange={(event) => onFilterChange("includeTest", event.target.checked)}
          />
          Include Test Campaigns
        </label>
        <a className="download-button" href={csvHref} download="filtered_campaign_daily.csv">
          <Download size={18} />
          Download Filtered CSV
        </a>
      </section>

      <details className="dictionary">
        <summary>
          <Database size={16} />
          Data Dictionary
        </summary>
        <p>Spend, clicks, impressions, conversions, CTR, CPC, CPA, and CVR are computed from the selected CSV/JSON.</p>
      </details>
      <p className="refresh-note">
        <RefreshCw size={14} />
        Last refreshed: {dataset.asOf}
      </p>
    </aside>
  );
});

export default function App() {
  const [datasetId, setDatasetId] = useState("portfolio");
  const [rows, setRows] = useState([]);
  const [uploadedRows, setUploadedRows] = useState([]);
  const [uploadedMeta, setUploadedMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [granularity, setGranularity] = useState("day");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const fileInputRef = useRef(null);
  const dataRequestRef = useRef(0);

  const datasets = useMemo(
    () => ({
      ...DATASETS,
      ...(uploadedMeta
        ? {
            uploaded: uploadedMeta,
          }
        : {}),
    }),
    [uploadedMeta],
  );

  const resetControlsForRows = useCallback((nextRows) => {
    const dates = [...new Set(nextRows.map((row) => row.date).filter(Boolean))].sort();
    setDateRange({ start: dates[0] ?? "", end: dates.at(-1) ?? "" });
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const loadDataset = useCallback(
    async (nextDatasetId) => {
      const requestId = dataRequestRef.current + 1;
      dataRequestRef.current = requestId;
      setLoading(true);
      if (nextDatasetId === "uploaded") {
        if (requestId !== dataRequestRef.current) return;
        setRows(uploadedRows);
        resetControlsForRows(uploadedRows);
        setLoading(false);
        return;
      }

      const response = await fetch(DATASETS[nextDatasetId].file);
      const records = await response.json();
      const parsed = normalizeRecords(records, nextDatasetId);
      if (requestId !== dataRequestRef.current) return;
      setRows(parsed);
      resetControlsForRows(parsed);
      setLoading(false);
    },
    [resetControlsForRows, uploadedRows],
  );

  useEffect(() => {
    loadDataset(datasetId);
  }, [datasetId, loadDataset]);

  const platforms = useMemo(
    () => [...new Set(rows.map((row) => row.source_label).filter(Boolean))].sort(),
    [rows],
  );
  const campaignOptions = useMemo(
    () => [...new Set(rows.map((row) => row.campaign_name).filter(Boolean))].sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (dateRange.start && row.date < dateRange.start) return false;
      if (dateRange.end && row.date > dateRange.end) return false;
      if (filters.platform !== "All Platforms" && row.source_label !== filters.platform) return false;
      if (filters.campaign !== "All Campaigns" && row.campaign_name !== filters.campaign) return false;
      if (filters.medium !== "All" && row.medium_label !== filters.medium) return false;
      if (!filters.includeTest && /test/i.test(row.campaign_name || "")) return false;
      return true;
    });
  }, [rows, dateRange, filters]);

  const daily = useMemo(() => buildTimeSeries(filteredRows, granularity), [filteredRows, granularity]);
  const campaigns = useMemo(() => buildCampaigns(filteredRows), [filteredRows]);
  const platformSpend = useMemo(() => buildPlatforms(filteredRows), [filteredRows]);
  const summary = useMemo(() => summarize(filteredRows), [filteredRows]);
  const csvHref = useMemo(() => csvFromRows(filteredRows), [filteredRows]);
  const deltas = useMemo(
    () => ({
      spend: metricDelta(filteredRows, "spend"),
      conversions: metricDelta(filteredRows, "conversions"),
      cpa: metricDelta(filteredRows, "cpa"),
      ctr: metricDelta(filteredRows, "ctr"),
      cpc: metricDelta(filteredRows, "cpc"),
    }),
    [filteredRows],
  );
  const dataset = datasets[datasetId] ?? DATASETS.portfolio;

  useEffect(() => {
    setPage(1);
  }, [filters, dateRange, datasetId, rowsPerPage, granularity]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(campaigns.length / rowsPerPage));
    if (page > totalPages) setPage(totalPages);
  }, [campaigns.length, page, rowsPerPage]);

  const onFilterChange = useCallback((key, value) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, [key]: value }));
    });
  }, []);

  const handleDatasetChange = useCallback((nextDatasetId) => {
    startTransition(() => {
      setDatasetId(nextDatasetId);
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDataset(datasetId);
    window.setTimeout(() => setRefreshing(false), 500);
  }, [datasetId, loadDataset]);

  const handleBrowseFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const ingestFile = useCallback(async (file) => {
    if (!file) return;
    const text = await file.text();
    const records = parseCsv(text);
    const parsed = normalizeRecords(records, "uploaded");
    if (!parsed.length) return;
    const dates = [...new Set(parsed.map((row) => row.date).filter(Boolean))].sort();
    const labelDateText = dates.at(-1) ? labelDate(dates.at(-1), true) : "Uploaded";
    startTransition(() => {
      setUploadedRows(parsed);
      setUploadedMeta({
        label: "Uploaded CSV",
        sourceName: file.name,
        file: "",
        csv: "",
        asOf: labelDateText,
        uploaded: `Uploaded ${new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`,
        realness: "User uploaded CSV",
      });
      setRows(parsed);
      resetControlsForRows(parsed);
      setDatasetId("uploaded");
    });
  }, [resetControlsForRows]);

  const handleUploadFile = useCallback((event) => {
    ingestFile(event.target.files?.[0]);
    event.target.value = "";
  }, [ingestFile]);

  const handleDropFile = useCallback((event) => {
    event.preventDefault();
    setDragActive(false);
    ingestFile(event.dataTransfer.files?.[0]);
  }, [ingestFile]);

  const handleGranularityChange = useCallback((nextGranularity) => {
    startTransition(() => setGranularity(nextGranularity));
  }, []);

  const handlePageChange = useCallback((nextPage) => {
    startTransition(() => setPage(Math.max(1, nextPage)));
  }, []);

  const handleRowsPerPageChange = useCallback((nextRowsPerPage) => {
    startTransition(() => {
      setRowsPerPage(nextRowsPerPage);
      setPage(1);
    });
  }, []);

  if (loading) {
    return (
      <main className="loading">
        <Database size={28} />
        Loading marketing data...
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="paramount-header-logo" aria-label="Paramount">
            <img className="paramount-mountain-logo" src="/paramount-mountain-logo.svg" alt="" />
            <img className="paramount-wordmark-logo" src="/paramount-wordmark-logo.svg" alt="Paramount" />
          </div>
          <div className="brand-divider" />
          <div>
            <h1>Marketing Data Ops</h1>
            <p>Unified Paid Media Analytics</p>
          </div>
        </div>
        <div className="topbar-meta">
          <div>
            <Database size={20} />
            <span>Source:</span>
            <b>{dataset.sourceName}</b>
          </div>
          <div>
            <CalendarDays size={19} />
            <span>Data as of:</span>
            <b>{dataset.asOf}</b>
          </div>
          <button className={refreshing ? "is-refreshing" : ""} aria-label="Refresh dashboard" onClick={handleRefresh}>
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <Sidebar
          campaigns={campaignOptions}
          csvHref={csvHref}
          datasets={datasets}
          datasetId={datasetId}
          dateRange={dateRange}
          dragActive={dragActive}
          fileInputRef={fileInputRef}
          filters={filters}
          onBrowseFiles={handleBrowseFiles}
          onDatasetChange={handleDatasetChange}
          onDragState={setDragActive}
          onDropFile={handleDropFile}
          onFilterChange={onFilterChange}
          onUploadFile={handleUploadFile}
          platforms={platforms}
          setDateRange={setDateRange}
        />
        <section className="content">
          <div className="dataset-note">
            <Settings2 size={16} />
            <span>{dataset.realness}</span>
            <b>{formatNumber(filteredRows.length)} rows</b>
            <b>{daysBetween(dateRange.start, dateRange.end)} days</b>
          </div>

          <div className="kpi-grid">
            <KpiCard
              accent="linear-gradient(135deg,#246bff,#1555df)"
              delta={deltas.spend}
              iconKey="spend"
              label="Total Spend"
              value={formatCurrency(summary.spend)}
            />
            <KpiCard
              accent="linear-gradient(135deg,#0db9af,#079b9a)"
              delta={deltas.conversions}
              iconKey="conversions"
              label="Conversions"
              value={formatNumber(summary.conversions)}
            />
            <KpiCard
              accent="linear-gradient(135deg,#e12a8a,#c91c71)"
              delta={deltas.cpa}
              iconKey="cpa"
              label="CPA"
              value={formatCurrency(summary.cpa, 2)}
            />
            <KpiCard
              accent="linear-gradient(135deg,#f5a300,#ef8400)"
              delta={deltas.ctr}
              iconKey="ctr"
              label="CTR"
              value={formatPercent(summary.ctr)}
            />
            <KpiCard
              accent="linear-gradient(135deg,#8057e8,#6338d2)"
              delta={deltas.cpc}
              iconKey="cpc"
              label="CPC"
              value={formatCurrency(summary.cpc, 2)}
            />
          </div>

          <section className="chart-grid">
            <article className="panel trend-panel">
              <div className="panel-title-row">
                <div>
                  <h2>Spend & Conversions Over Time</h2>
                  <div className="legend-inline">
                    <span><i className="blue" /> Spend</span>
                    <span><i className="teal" /> Conversions</span>
                  </div>
                </div>
                <div className="segmented">
                  {CHART_GRANULARITIES.map((item) => (
                    <button
                      className={granularity === item ? "active" : ""}
                      key={item}
                      onClick={() => handleGranularityChange(item)}
                      aria-pressed={granularity === item}
                    >
                      {item[0].toUpperCase() + item.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <LineComboChart data={daily} granularity={granularity} />
            </article>

            <article className="panel platform-panel">
              <h2>Spend by Platform</h2>
              <DonutChart data={platformSpend} />
            </article>

            <article className="panel cpa-panel">
              <h2>CPA by Campaign</h2>
              <CpaBars campaigns={campaigns} />
            </article>
          </section>

          <Takeaways summary={summary} campaigns={campaigns} platforms={platformSpend} deltas={deltas} />
          <Leaderboard
            campaigns={campaigns}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
          />
        </section>
      </div>
    </main>
  );
}
