import React, { useEffect, useMemo, useState } from "react";
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

function labelDate(value, withYear = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(parseDate(value));
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

function buildDaily(rows) {
  return [...groupBy(rows, (row) => row.date).entries()]
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
  const headers = [
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
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const body = rows.map((row) => headers.map((header) => escape(row[header])).join(",")).join("\n");
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`${headers.join(",")}\n${body}`)}`;
}

function KpiCard({ accent, delta, iconKey, label, value, suffix }) {
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
}

function LineComboChart({ data }) {
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
      <polyline points={spendPoints} fill="none" className="spend-line" />
      <polyline points={conversionPoints} fill="none" className="conversion-line" />
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
            {labelDate(day.date)}
          </text>
        );
      })}
    </svg>
  );
}

function DonutChart({ data }) {
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
}

function CpaBars({ campaigns }) {
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
}

function Takeaways({ summary, campaigns, platforms, deltas }) {
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
}

function Leaderboard({ campaigns }) {
  const rows = campaigns.slice(0, 10);
  return (
    <section className="leaderboard panel">
      <div className="panel-title-row">
        <h2>Campaign Leaderboard</h2>
        <div className="search-pill">
          <Search size={15} />
          <span>Showing top 10 of {campaigns.length}</span>
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
                <td>{index + 1}</td>
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
        <button aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <button className="active">1</button>
        <button>2</button>
        <button>3</button>
        <span>...</span>
        <button>10</button>
        <button aria-label="Next page">
          <ChevronRight size={16} />
        </button>
        <label>
          Rows per page:
          <select value="10" readOnly>
            <option>10</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function Sidebar({
  campaigns,
  csvHref,
  datasetId,
  dateRange,
  filters,
  onDatasetChange,
  onFilterChange,
  platforms,
  setDateRange,
}) {
  const dataset = DATASETS[datasetId];
  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h3>DATA</h3>
        <label className="field-label">Dataset</label>
        <select value={datasetId} onChange={(event) => onDatasetChange(event.target.value)}>
          {Object.entries(DATASETS).map(([id, item]) => (
            <option value={id} key={id}>
              {item.label}
            </option>
          ))}
        </select>
        <h4>Upload CSV</h4>
        <div className="upload-box">
          <FileUp size={26} />
          <strong>Drag & drop CSV here</strong>
          <span>or</span>
          <button>Browse files</button>
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
          <option>Paid Search</option>
          <option>Paid Social</option>
          <option>Paid Video</option>
          <option>Display</option>
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
}

export default function App() {
  const [datasetId, setDatasetId] = useState("portfolio");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [filters, setFilters] = useState({
    platform: "All Platforms",
    campaign: "All Campaigns",
    medium: "All",
    includeTest: false,
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(DATASETS[datasetId].file)
      .then((response) => response.json())
      .then((records) => {
        if (!active) return;
        const parsed = records.map((record) => ({
          ...record,
          spend: Number(record.spend) || 0,
          conversions: Number(record.conversions) || 0,
          impressions: Number(record.impressions) || 0,
          clicks: Number(record.clicks) || 0,
          ctr: Number(record.ctr) || 0,
          cpc: Number(record.cpc) || 0,
          cpa: Number(record.cpa) || 0,
        }));
        const dates = [...new Set(parsed.map((row) => row.date))].sort();
        setRows(parsed);
        setDateRange({ start: dates[0] ?? "", end: dates.at(-1) ?? "" });
        setFilters({
          platform: "All Platforms",
          campaign: "All Campaigns",
          medium: "All",
          includeTest: false,
        });
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [datasetId]);

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

  const daily = useMemo(() => buildDaily(filteredRows), [filteredRows]);
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
  const dataset = DATASETS[datasetId];

  const onFilterChange = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

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
          <button aria-label="Refresh dashboard">
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <Sidebar
          campaigns={campaignOptions}
          csvHref={csvHref}
          datasetId={datasetId}
          dateRange={dateRange}
          filters={filters}
          onDatasetChange={setDatasetId}
          onFilterChange={onFilterChange}
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
                  <button className="active">Day</button>
                  <button>Week</button>
                  <button>Month</button>
                </div>
              </div>
              <LineComboChart data={daily} />
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
          <Leaderboard campaigns={campaigns} />
        </section>
      </div>
    </main>
  );
}
