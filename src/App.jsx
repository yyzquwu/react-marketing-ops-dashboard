import React, { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Database,
  Download,
  FileUp,
  BarChart3,
  MousePointer2,
  Percent,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
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
  global_ads_performance: {
    label: "Kaggle global ads performance",
    sourceName: "GlobalAdsPerformance_GoogleMetaTikTok.csv",
    file: "/data/global_ads_performance_daily.json",
    csv: "/data/global_ads_performance_daily.csv",
    asOf: "Dec 31, 2024",
    uploaded: "Kaggle CC0 public dataset",
    realness: "Kaggle public multi-platform ads dataset",
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
  spend: DollarSign,
  conversions: Users,
  cpa: Target,
  ctr: Percent,
  cpc: MousePointer2,
  revenue: BarChart3,
  roas: TrendingUp,
};

const DEFAULT_FILTERS = Object.freeze({
  platform: "All Platforms",
  campaign: "All Campaigns",
  country: "All Countries",
  industry: "All Industries",
  medium: "All Types",
  includeTest: false,
});

const CHART_GRANULARITIES = ["day", "week", "month"];

const MEDIUM_LABELS = {
  cpc: "Paid Search",
  paid_search: "Paid Search",
  search: "Paid Search",
  paid_social: "Paid Social",
  social: "Paid Social",
  paid_video: "Paid Video",
  video: "Paid Video",
  display: "Display",
  uploaded: "Uploaded",
};

const SOURCE_MEDIUM_LABELS = {
  google_ads: "Paid Search",
  "Google Ads": "Paid Search",
  meta: "Paid Social",
  meta_ads: "Paid Social",
  Meta: "Paid Social",
  microsoft_ads: "Paid Search",
  "Microsoft Ads": "Paid Search",
  other: "Display",
  Other: "Display",
  tiktok: "Paid Social",
  tiktok_ads: "Paid Social",
  TikTok: "Paid Social",
  youtube: "Paid Video",
  YouTube: "Paid Video",
};

const TEST_CAMPAIGN_PATTERN = /(^|[^a-z])test([^a-z]|$)/i;

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
  "revenue",
  "ctr",
  "cpc",
  "cpa",
  "roas",
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

function formatCompactNumber(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1000000) {
    const rounded = number / 1000000;
    return `${rounded >= 10 ? Math.round(rounded) : rounded.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (Math.abs(number) >= 1000) return `${Math.round(number / 1000)}K`;
  return formatNumber(number);
}

function formatCompactCurrency(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1000000) {
    const rounded = number / 1000000;
    return `$${rounded >= 10 ? Math.round(rounded) : rounded.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (Math.abs(number) >= 1000) return `$${Math.round(number / 1000)}K`;
  return formatCurrency(number);
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
    return labelDate(value);
  }
  return labelDate(value);
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((parseDate(end) - parseDate(start)) / 86400000) + 1);
}

function niceAxisMax(value) {
  const number = Number(value) || 1;
  const exponent = Math.floor(Math.log10(number));
  const base = 10 ** exponent;
  const normalized = number / base;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * base;
}

function summarize(rows) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.spend += Number(row.spend) || 0;
      acc.conversions += Number(row.conversions) || 0;
      acc.revenue += Number(row.revenue) || 0;
      acc.impressions += Number(row.impressions) || 0;
      acc.clicks += Number(row.clicks) || 0;
      return acc;
    },
    { spend: 0, conversions: 0, revenue: 0, impressions: 0, clicks: 0 },
  );

  return {
    ...totals,
    cpa: totals.conversions ? totals.spend / totals.conversions : 0,
    ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
    cpc: totals.clicks ? totals.spend / totals.clicks : 0,
    cvr: totals.clicks ? totals.conversions / totals.clicks : 0,
    roas: totals.spend ? totals.revenue / totals.spend : 0,
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
      const revenue = Number(record.revenue ?? record.Revenue) || 0;
      const source = record.source || record.source_label || "uploaded";
      const sourceLabel = record.source_label || record.platform || record.source || "Uploaded";
      const rawMedium = record.medium || record.medium_label || "";
      const mediumKey = String(rawMedium).trim().toLowerCase();
      const sourceMediumLabel = SOURCE_MEDIUM_LABELS[source] || SOURCE_MEDIUM_LABELS[sourceLabel] || "";
      const mediumLabel =
        record.medium_label ||
        (rawMedium ? MEDIUM_LABELS[mediumKey] || rawMedium : "") ||
        sourceMediumLabel ||
        "Uploaded";
      const medium = rawMedium || mediumLabel.toLowerCase().replace(/\s+/g, "_");
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
        revenue,
        total_conversion: Number(record.total_conversion) || conversions,
        ctr: Number(record.ctr) || (impressions ? clicks / impressions : 0),
        cpc: Number(record.cpc) || (clicks ? spend / clicks : 0),
        cpa: Number(record.cpa) || (conversions ? spend / conversions : 0),
        roas: Number(record.roas) || (spend ? revenue / spend : 0),
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

function getAvailableGranularities(rows) {
  if (!rows.length) return ["day"];
  return CHART_GRANULARITIES.filter((item) => {
    if (item === "day") return true;
    return new Set(rows.map((row) => bucketDate(row.date, item))).size > 1;
  });
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

function buildBreakdown(rows, keyFn, labelKey = "label") {
  return [...groupBy(rows, keyFn).entries()]
    .map(([label, groupRows]) => ({
      [labelKey]: label || "Unknown",
      ...summarize(groupRows),
      rows: groupRows.length,
    }))
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
  const [tooltip, setTooltip] = useState(null);
  const width = 760;
  const height = 350;
  const pad = { top: 24, right: 62, bottom: 44, left: 84 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxSpend = niceAxisMax(Math.max(...data.map((day) => day.spend), 1));
  const maxConversions = niceAxisMax(Math.max(...data.map((day) => day.conversions), 1));
  const svgCenterY = height / 2;
  const x = (index) => pad.left + (index / Math.max(1, data.length - 1)) * innerW;
  const ySpend = (value) => pad.top + innerH - (value / maxSpend) * innerH;
  const yConversions = (value) => pad.top + innerH - (value / maxConversions) * innerH;
  const spendPoints = data.map((day, index) => `${x(index)},${ySpend(day.spend)}`).join(" ");
  const conversionPoints = data
    .map((day, index) => `${x(index)},${yConversions(day.conversions)}`)
    .join(" ");
  const labelStep = Math.max(1, Math.ceil(data.length / 7));
  const dotStep = data.length > 180 ? 14 : data.length > 90 ? 7 : data.length > 45 ? 3 : 1;
  const labelIndexes = data.reduce((indexes, _, index) => {
    if (index % labelStep === 0) indexes.push(index);
    return indexes;
  }, []);
  const lastIndex = data.length - 1;
  if (lastIndex > 0 && lastIndex - labelIndexes.at(-1) >= Math.ceil(labelStep * 0.75)) {
    labelIndexes.push(lastIndex);
  }
  const labels = labelIndexes.map((index) => ({ ...data[index], index }));
  const showTooltip = (event, day, index) => {
    const bounds = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    const xPosition = x(index);
    const yPosition = Math.min(ySpend(day.spend), yConversions(day.conversions));
    setTooltip({
      date: labelBucket(day.date, granularity),
      spend: day.spend,
      conversions: day.conversions,
      x: (xPosition / width) * bounds.width,
      y: (yPosition / height) * bounds.height,
    });
  };

  return (
    <div className="trend-chart-wrap" onMouseLeave={() => setTooltip(null)}>
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" preserveAspectRatio="xMidYMid meet">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = pad.top + innerH - tick * innerH;
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="grid-line" />
              <text x={pad.left - 16} y={y + 4} textAnchor="end" className="axis-label">
                {formatCompactCurrency(maxSpend * tick)}
              </text>
              <text x={width - pad.right + 16} y={y + 4} className="axis-label">
                {formatCompactNumber(maxConversions * tick)}
              </text>
            </g>
          );
        })}
        <text x={10} y={svgCenterY} className="axis-title" transform={`rotate(-90 10 ${svgCenterY})`}>
          Spend (USD)
        </text>
        <text
          x={width - 12}
          y={svgCenterY}
          className="axis-title conversions"
          transform={`rotate(-90 ${width - 12} ${svgCenterY})`}
        >
          Conversions
        </text>
        <polyline points={spendPoints} fill="none" className="spend-line" pathLength="1" />
        <polyline points={conversionPoints} fill="none" className="conversion-line" pathLength="1" />
        {data.map((day, index) => {
          const showDot = dotStep === 1 || index % dotStep === 0 || index === data.length - 1;
          return (
            <g
              className="trend-hover-target"
              key={`${day.date}-${index}`}
              onMouseMove={(event) => showTooltip(event, day, index)}
              onFocus={(event) => showTooltip(event, day, index)}
              onBlur={() => setTooltip(null)}
              tabIndex="0"
            >
              <line x1={x(index)} x2={x(index)} y1={pad.top} y2={height - pad.bottom} className="trend-hover-line" />
              <circle cx={x(index)} cy={ySpend(day.spend)} r="4" className={showDot ? "spend-dot" : "spend-dot trend-dot-muted"} />
              <circle cx={x(index)} cy={yConversions(day.conversions)} r="3.5" className={showDot ? "conversion-dot" : "conversion-dot trend-dot-muted"} />
              <circle cx={x(index)} cy={ySpend(day.spend)} r="12" className="trend-hit-dot" />
              <circle cx={x(index)} cy={yConversions(day.conversions)} r="12" className="trend-hit-dot" />
            </g>
          );
        })}
        {labels.map((day) => {
          const index = day.index;
          return (
            <text key={day.date} x={x(index)} y={height - 10} textAnchor="middle" className="axis-label">
              {labelBucket(day.date, granularity)}
            </text>
          );
        })}
      </svg>
      {tooltip ? (
        <div className="trend-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <strong>{tooltip.date}</strong>
          <span><i className="blue" /> Spend: {formatCurrency(tooltip.spend)}</span>
          <span><i className="teal" /> Conversions: {formatNumber(tooltip.conversions)}</span>
        </div>
      ) : null}
    </div>
  );
});

const RevenueTrendChart = memo(function RevenueTrendChart({ data }) {
  const width = 760;
  const height = 220;
  const pad = { top: 22, right: 40, bottom: 36, left: 84 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxValue = niceAxisMax(Math.max(...data.flatMap((day) => [day.spend, day.revenue]), 1));
  const x = (index) => pad.left + (index / Math.max(1, data.length - 1)) * innerW;
  const y = (value) => pad.top + innerH - (value / maxValue) * innerH;
  const spendPoints = data.map((day, index) => `${x(index)},${y(day.spend)}`).join(" ");
  const revenuePoints = data.map((day, index) => `${x(index)},${y(day.revenue)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(data.length / 6));
  const labels = data
    .map((day, index) => ({ ...day, index }))
    .filter((_, index) => index % labelStep === 0 || index === data.length - 1);

  return (
    <svg className="mini-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((tick) => {
        const tickY = pad.top + innerH - tick * innerH;
        return (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={tickY} y2={tickY} className="grid-line" />
            <text x={pad.left - 14} y={tickY + 4} textAnchor="end" className="axis-label">
              {formatCompactCurrency(maxValue * tick)}
            </text>
          </g>
        );
      })}
      <polyline points={spendPoints} fill="none" className="spend-line" pathLength="1" />
      <polyline points={revenuePoints} fill="none" className="revenue-line" pathLength="1" />
      {labels.map((day) => (
        <text key={day.date} x={x(day.index)} y={height - 8} textAnchor="middle" className="axis-label">
          {labelBucket(day.date, "month")}
        </text>
      ))}
    </svg>
  );
});

const BreakdownTable = memo(function BreakdownTable({ title, rows, labelHeader }) {
  return (
    <section className="breakdown-card panel">
      <h2>{title}</h2>
      <div className="breakdown-table">
        <div className="breakdown-head">
          <span>{labelHeader}</span>
          <span>Spend</span>
          <span>CPA</span>
          <span>ROAS</span>
        </div>
        {rows.slice(0, 6).map((row) => (
          <div className="breakdown-row" key={row.label}>
            <span>{row.label}</span>
            <b>{formatCurrency(row.spend)}</b>
            <b>{formatCurrency(row.cpa, 2)}</b>
            <b>{row.roas.toFixed(2)}x</b>
          </div>
        ))}
      </div>
    </section>
  );
});

const EfficiencyQuadrant = memo(function EfficiencyQuadrant({ campaigns }) {
  const candidates = campaigns
    .filter((campaign) => campaign.spend > 0 && campaign.conversions > 0 && campaign.revenue > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 36);
  const width = 760;
  const height = 260;
  const pad = { top: 20, right: 28, bottom: 44, left: 68 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxCpa = niceAxisMax(Math.max(...candidates.map((campaign) => campaign.cpa), 1));
  const maxRoas = niceAxisMax(Math.max(...candidates.map((campaign) => campaign.roas), 1));
  const maxSpend = Math.max(...candidates.map((campaign) => campaign.spend), 1);
  const x = (value) => pad.left + (value / maxCpa) * innerW;
  const y = (value) => pad.top + innerH - (value / maxRoas) * innerH;

  return (
    <section className="quadrant panel">
      <div className="panel-title-row">
        <h2>Efficiency Quadrant</h2>
        <span className="chart-note">Bubble size = spend, color = platform</span>
      </div>
      <svg className="quadrant-chart" viewBox={`0 0 ${width} ${height}`} role="img" preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((tick) => {
          const gridY = pad.top + innerH - tick * innerH;
          const gridX = pad.left + tick * innerW;
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={gridY} y2={gridY} className="grid-line" />
              <line x1={gridX} x2={gridX} y1={pad.top} y2={height - pad.bottom} className="grid-line faint" />
              <text x={pad.left - 12} y={gridY + 4} textAnchor="end" className="axis-label">{(maxRoas * tick).toFixed(1)}x</text>
              <text x={gridX} y={height - 15} textAnchor="middle" className="axis-label">{formatCurrency(maxCpa * tick, 0)}</text>
            </g>
          );
        })}
        <text x={18} y={height / 2} className="axis-title" transform={`rotate(-90 18 ${height / 2})`}>ROAS</text>
        <text x={width / 2} y={height - 2} className="axis-title">CPA</text>
        {candidates.map((campaign) => (
          <circle
            className="quadrant-dot"
            cx={x(campaign.cpa)}
            cy={y(campaign.roas)}
            fill={COLORS[campaign.platform] || COLORS.Other}
            key={`${campaign.campaign}-${campaign.platform}`}
            r={5 + Math.sqrt(campaign.spend / maxSpend) * 12}
          >
            <title>{`${campaign.campaign} (${campaign.platform})\nCPA ${formatCurrency(campaign.cpa, 2)} | ROAS ${campaign.roas.toFixed(2)}x | Spend ${formatCurrency(campaign.spend)}`}</title>
          </circle>
        ))}
      </svg>
    </section>
  );
});

const DonutChart = memo(function DonutChart({ data, onPlatformSelect, selectedPlatform }) {
  const [tooltip, setTooltip] = useState(null);
  const total = data.reduce((sum, row) => sum + row.spend, 0) || 1;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const showTooltip = (event, row) => {
    const bounds = event.currentTarget.closest(".donut-layout").getBoundingClientRect();
    const share = row.spend / total;
    setTooltip({
      platform: row.platform,
      spend: row.spend,
      share,
      x: event.clientX - bounds.left + 12,
      y: event.clientY - bounds.top + 12,
    });
  };

  return (
    <div className="donut-layout" onMouseLeave={() => setTooltip(null)}>
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
              onMouseMove={(event) => showTooltip(event, row)}
              onFocus={(event) => showTooltip(event, row)}
              onBlur={() => setTooltip(null)}
              onClick={() => onPlatformSelect(row.platform)}
              tabIndex="0"
              role="button"
              aria-label={`Filter to ${row.platform}`}
              data-active={selectedPlatform === row.platform}
            >
              <title>{`${row.platform}: ${formatCurrency(row.spend)} (${((row.spend / total) * 100).toFixed(1)}%)`}</title>
            </circle>
          );
          offset += dash;
          return segment;
        })}
        <circle cx="75" cy="75" r="32" fill="#fff" />
      </svg>
      <div className="donut-legend">
        {data.map((row) => (
          <button
            className="legend-row legend-action"
            data-active={selectedPlatform === row.platform}
            key={row.platform}
            onClick={() => onPlatformSelect(row.platform)}
          >
            <span className="legend-dot" style={{ background: COLORS[row.platform] || COLORS.Other }} />
            <span>{row.platform}</span>
            <b>{formatCurrency(row.spend)}</b>
            <em>{((row.spend / total) * 100).toFixed(1)}%</em>
          </button>
        ))}
        <div className="legend-row total">
          <span />
          <span>Total</span>
          <b>{formatCurrency(total)}</b>
          <em>100%</em>
        </div>
      </div>
      {tooltip ? (
        <div className="donut-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <strong>{tooltip.platform}</strong>
          <span>{formatCurrency(tooltip.spend)}</span>
          <em>{formatPercent(tooltip.share, 1)} of spend</em>
        </div>
      ) : null}
    </div>
  );
});

const CpaBars = memo(function CpaBars({ campaigns, onCampaignSelect, selectedCampaignKey }) {
  const conversionThreshold = Math.max(1, campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0) * 0.0025);
  const ranked = campaigns
    .filter((campaign) => campaign.conversions > 0)
    .filter((campaign) => campaign.conversions >= conversionThreshold || campaigns.length <= 20)
    .sort((a, b) => a.cpa - b.cpa)
    .slice(0, 9);
  const maxCpa = Math.max(...ranked.map((campaign) => campaign.cpa), 1);

  return (
    <div className="bar-list">
      {ranked.map((campaign) => (
        <button
          className="bar-row bar-action"
          data-active={selectedCampaignKey === `${campaign.campaign}|${campaign.platform}`}
          key={`${campaign.campaign}-${campaign.platform}`}
          onClick={() => onCampaignSelect(campaign)}
        >
          <span>{campaign.campaign}</span>
          <div className="bar-track">
            <i style={{ width: `${Math.max(3, (campaign.cpa / maxCpa) * 100)}%` }} />
          </div>
          <b>{formatCurrency(campaign.cpa, 2)}</b>
        </button>
      ))}
      <div className="bar-axis">
        <span />
        <div>
          <span>$0</span>
          <span>{formatCurrency(maxCpa / 2)}</span>
          <span>{formatCurrency(maxCpa)}</span>
        </div>
        <span />
      </div>
      <p className="bar-footnote">
        Ranked by lowest CPA among campaigns with at least {formatNumber(conversionThreshold)} conversions.
      </p>
    </div>
  );
});

const OpportunityPanel = memo(function OpportunityPanel({ campaigns, summary }) {
  const viable = campaigns.filter((campaign) => campaign.conversions > 0);
  const scale = viable
    .filter((campaign) => campaign.roas >= summary.roas * 1.15 && campaign.spend <= summary.spend * 0.04)
    .sort((a, b) => b.roas - a.roas)[0];
  const inspect = viable
    .filter((campaign) => campaign.roas < summary.roas * 0.75 && campaign.spend >= summary.spend * 0.025)
    .sort((a, b) => b.spend - a.spend)[0];
  const creative = viable
    .filter((campaign) => campaign.cpa <= summary.cpa && campaign.roas < summary.roas)
    .sort((a, b) => b.clicks - a.clicks)[0];
  const opportunities = [
    scale
      ? {
          label: "Scale efficient spend",
          value: scale.campaign,
          detail: `${scale.platform} is at ${scale.roas.toFixed(2)}x ROAS with only ${formatCurrency(scale.spend)} spend.`,
        }
      : null,
    inspect
      ? {
          label: "Inspect high CPA",
          value: inspect.campaign,
          detail: `${formatCurrency(inspect.spend)} spend is returning ${inspect.roas.toFixed(2)}x ROAS, below the filtered average.`,
        }
      : null,
    creative
      ? {
          label: "Check conversion quality",
          value: creative.campaign,
          detail: `${formatCurrency(creative.cpa, 2)} CPA is efficient, but ${creative.roas.toFixed(2)}x ROAS trails the filtered average.`,
        }
      : null,
  ].filter(Boolean);

  return (
    <section className="opportunity-panel panel">
      <h2>Budget Opportunities</h2>
      <div className="opportunity-grid">
        {opportunities.length ? opportunities.map((item) => (
          <div className="opportunity-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </div>
        )) : (
          <div className="opportunity-card">
            <span>No major reallocations flagged</span>
            <strong>Current mix is balanced</strong>
            <p>Filtered campaigns are clustered close to the average CPA and conversion profile.</p>
          </div>
        )}
      </div>
    </section>
  );
});

const CampaignDrilldown = memo(function CampaignDrilldown({ campaign, rows, onClose }) {
  if (!campaign) return null;
  const dailyRows = buildTimeSeries(rows, "day");
  const lastDay = dailyRows.at(-1);
  const firstDay = dailyRows[0];

  return (
    <section className="drilldown panel">
      <div className="panel-title-row">
        <div>
          <h2>Campaign Drilldown</h2>
          <p>{campaign.campaign}</p>
        </div>
        <button className="text-button" onClick={onClose}>Clear</button>
      </div>
      <div className="drilldown-meta">
        <span className="platform-chip">
          <i style={{ background: COLORS[campaign.platform] || COLORS.Other }} />
          {campaign.platform}
        </span>
        <span>{formatNumber(rows.length)} daily rows</span>
        <span>{firstDay && lastDay ? `${labelDate(firstDay.date)} - ${labelDate(lastDay.date)}` : "No dates"}</span>
      </div>
      <div className="drilldown-kpis">
        <div><span>Spend</span><strong>{formatCurrency(campaign.spend)}</strong></div>
        <div><span>Conversions</span><strong>{formatNumber(campaign.conversions)}</strong></div>
        <div><span>CPA</span><strong>{formatCurrency(campaign.cpa, 2)}</strong></div>
        <div><span>CTR</span><strong>{formatPercent(campaign.ctr)}</strong></div>
        <div><span>CPC</span><strong>{formatCurrency(campaign.cpc, 2)}</strong></div>
      </div>
      <div className="drilldown-note">
        Latest day: {lastDay ? `${labelDate(lastDay.date)} with ${formatCurrency(lastDay.spend)} spend and ${formatNumber(lastDay.conversions)} conversions.` : "No daily activity."}
      </div>
    </section>
  );
});

const Takeaways = memo(function Takeaways({ summary, campaigns, platforms, deltas }) {
  const bestPlatform = platforms[0]?.platform ?? "top platform";
  const conversionThreshold = Math.max(1, campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0) * 0.0025);
  const bestCpa = campaigns
    .filter((item) => item.conversions >= conversionThreshold || campaigns.length <= 20)
    .sort((a, b) => a.cpa - b.cpa)[0];
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

const Leaderboard = memo(function Leaderboard({
  campaigns,
  onCampaignSelect,
  page,
  rowsPerPage,
  selectedCampaignKey,
  onPageChange,
  onRowsPerPageChange,
}) {
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
              <th className="col-rank">Rank</th>
              <th>Campaign</th>
              <th className="col-center">Platform</th>
              <th className="col-number">Spend (USD)</th>
              <th className="col-number">Conversions</th>
              <th className="col-number">CPA (USD)</th>
              <th className="col-number">Revenue</th>
              <th className="col-number">ROAS</th>
              <th className="col-number">CTR</th>
              <th className="col-number">CPC (USD)</th>
              <th className="col-number">CVR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((campaign, index) => (
              <tr
                data-active={selectedCampaignKey === `${campaign.campaign}|${campaign.platform}`}
                key={`${campaign.campaign}-${campaign.platform}`}
                onClick={() => onCampaignSelect(campaign)}
              >
                <td className="col-rank">{startIndex + index + 1}</td>
                <td>{campaign.campaign}</td>
                <td className="col-center">{campaign.platform}</td>
                <td className="col-number">{formatCurrency(campaign.spend)}</td>
                <td className="col-number">{formatNumber(campaign.conversions)}</td>
                <td className="col-number">{formatCurrency(campaign.cpa, 2)}</td>
                <td className="col-number">{formatCurrency(campaign.revenue)}</td>
                <td className="col-number">{campaign.roas.toFixed(2)}x</td>
                <td className="col-number">{formatPercent(campaign.ctr)}</td>
                <td className="col-number">{formatCurrency(campaign.cpc, 2)}</td>
                <td className="col-number">{formatPercent(campaign.cvr)}</td>
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
  countryOptions,
  industryOptions,
  mediumOptions,
  platforms,
  setDateRange,
  testCampaignCount,
}) {
  const dataset = datasets[datasetId];
  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h3>DATA</h3>
        <label className="field-label">Dataset</label>
        <select className="dataset-select" value={datasetId} onChange={(event) => onDatasetChange(event.target.value)}>
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
        <label className="field-label">Country</label>
        <select value={filters.country} onChange={(event) => onFilterChange("country", event.target.value)}>
          <option>All Countries</option>
          {countryOptions.map((country) => (
            <option value={country} key={country}>
              {country}
            </option>
          ))}
        </select>
        <label className="field-label">Industry</label>
        <select value={filters.industry} onChange={(event) => onFilterChange("industry", event.target.value)}>
          <option>All Industries</option>
          {industryOptions.map((industry) => (
            <option value={industry} key={industry}>
              {industry}
            </option>
          ))}
        </select>
        <label className="field-label">Campaign Type</label>
        <select value={filters.medium} onChange={(event) => onFilterChange("medium", event.target.value)}>
          <option>All Types</option>
          {mediumOptions.map((medium) => (
            <option key={medium}>{medium}</option>
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
        <label className="checkbox-row">
          <input
            type="checkbox"
            disabled={!testCampaignCount}
            checked={testCampaignCount > 0 && filters.includeTest}
            onChange={(event) => onFilterChange("includeTest", event.target.checked)}
          />
          {testCampaignCount ? `Include Test Campaigns (${formatNumber(testCampaignCount)} rows)` : "No Test Campaigns Detected"}
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
  const [datasetId, setDatasetId] = useState("global_ads_performance");
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
  const [selectedCampaignKey, setSelectedCampaignKey] = useState("");
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
    setSelectedCampaignKey("");
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
  const countryOptions = useMemo(
    () => [...new Set(rows.map((row) => row.segment).filter(Boolean))].sort(),
    [rows],
  );
  const industryOptions = useMemo(
    () => [...new Set(rows.map((row) => row.campaign_name?.split(" ")?.[0]).filter(Boolean))].sort(),
    [rows],
  );
  const mediumOptions = useMemo(
    () => [...new Set(rows.map((row) => row.medium_label).filter(Boolean))].sort(),
    [rows],
  );
  const testCampaignCount = useMemo(
    () => rows.filter((row) => TEST_CAMPAIGN_PATTERN.test(row.campaign_name || "")).length,
    [rows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (dateRange.start && row.date < dateRange.start) return false;
      if (dateRange.end && row.date > dateRange.end) return false;
      if (filters.platform !== "All Platforms" && row.source_label !== filters.platform) return false;
      if (filters.campaign !== "All Campaigns" && row.campaign_name !== filters.campaign) return false;
      if (filters.country !== "All Countries" && row.segment !== filters.country) return false;
      if (filters.industry !== "All Industries" && row.campaign_name?.split(" ")?.[0] !== filters.industry) return false;
      if (filters.medium !== "All Types" && filters.medium !== "All" && row.medium_label !== filters.medium) return false;
      if (!filters.includeTest && TEST_CAMPAIGN_PATTERN.test(row.campaign_name || "")) return false;
      return true;
    });
  }, [rows, dateRange, filters]);

  const availableGranularities = useMemo(() => getAvailableGranularities(filteredRows), [filteredRows]);
  const daily = useMemo(() => buildTimeSeries(filteredRows, granularity), [filteredRows, granularity]);
  const monthly = useMemo(() => buildTimeSeries(filteredRows, "month"), [filteredRows]);
  const campaigns = useMemo(() => buildCampaigns(filteredRows), [filteredRows]);
  const platformSpend = useMemo(() => buildPlatforms(filteredRows), [filteredRows]);
  const countryBreakdown = useMemo(
    () => buildBreakdown(filteredRows, (row) => row.segment || "Unknown"),
    [filteredRows],
  );
  const industryBreakdown = useMemo(
    () => buildBreakdown(filteredRows, (row) => row.campaign_name?.split(" ")?.[0] || "Unknown"),
    [filteredRows],
  );
  const typeBreakdown = useMemo(
    () => buildBreakdown(filteredRows, (row) => row.medium_label || "Unknown"),
    [filteredRows],
  );
  const summary = useMemo(() => summarize(filteredRows), [filteredRows]);
  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => `${campaign.campaign}|${campaign.platform}` === selectedCampaignKey) ?? null,
    [campaigns, selectedCampaignKey],
  );
  const selectedCampaignRows = useMemo(() => {
    if (!selectedCampaign) return [];
    return filteredRows.filter(
      (row) =>
        row.campaign_name === selectedCampaign.campaign &&
        row.source_label === selectedCampaign.platform,
    );
  }, [filteredRows, selectedCampaign]);
  const csvHref = useMemo(() => csvFromRows(filteredRows), [filteredRows]);
  const deltas = useMemo(
    () => ({
      spend: metricDelta(filteredRows, "spend"),
      conversions: metricDelta(filteredRows, "conversions"),
      cpa: metricDelta(filteredRows, "cpa"),
      ctr: metricDelta(filteredRows, "ctr"),
      cpc: metricDelta(filteredRows, "cpc"),
      revenue: metricDelta(filteredRows, "revenue"),
      roas: metricDelta(filteredRows, "roas"),
    }),
    [filteredRows],
  );
  const dataset = datasets[datasetId] ?? DATASETS.portfolio;

  useEffect(() => {
    if (filters.medium !== "All Types" && filters.medium !== "All" && !mediumOptions.includes(filters.medium)) {
      setFilters((current) => ({ ...current, medium: "All Types" }));
    }
  }, [filters.medium, mediumOptions]);

  useEffect(() => {
    if (filters.country === "All Countries" || countryOptions.includes(filters.country)) return;
    setFilters((current) => ({ ...current, country: "All Countries" }));
  }, [countryOptions, filters.country]);

  useEffect(() => {
    if (filters.industry === "All Industries" || industryOptions.includes(filters.industry)) return;
    setFilters((current) => ({ ...current, industry: "All Industries" }));
  }, [industryOptions, filters.industry]);

  useEffect(() => {
    if (availableGranularities.includes(granularity)) return;
    setGranularity(availableGranularities[0] ?? "day");
  }, [availableGranularities, granularity]);

  useEffect(() => {
    if (!availableGranularities.includes("week")) return;
    if (daysBetween(dateRange.start, dateRange.end) <= 90) return;
    setGranularity((current) => (current === "day" ? "week" : current));
  }, [availableGranularities, dateRange]);

  useEffect(() => {
    setPage(1);
  }, [filters, dateRange, datasetId, rowsPerPage, granularity]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(campaigns.length / rowsPerPage));
    if (page > totalPages) setPage(totalPages);
  }, [campaigns.length, page, rowsPerPage]);

  useEffect(() => {
    if (!selectedCampaignKey) return;
    if (campaigns.some((campaign) => `${campaign.campaign}|${campaign.platform}` === selectedCampaignKey)) return;
    setSelectedCampaignKey("");
  }, [campaigns, selectedCampaignKey]);

  const onFilterChange = useCallback((key, value) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, [key]: value }));
    });
  }, []);

  const handlePlatformSelect = useCallback((platform) => {
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        platform: current.platform === platform ? "All Platforms" : platform,
      }));
      setSelectedCampaignKey("");
    });
  }, []);

  const handleCampaignSelect = useCallback((campaign) => {
    startTransition(() => {
      setSelectedCampaignKey(`${campaign.campaign}|${campaign.platform}`);
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
          <label className="topbar-control">
            <span>Dataset:</span>
            <select value={datasetId} onChange={(event) => handleDatasetChange(event.target.value)}>
              {Object.entries(datasets).map(([id, item]) => (
                <option value={id} key={id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="topbar-control date-control">
            <CalendarDays size={17} />
            <input
              type="date"
              value={dateRange.start}
              onChange={(event) => setDateRange((range) => ({ ...range, start: event.target.value }))}
            />
            <span>-</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(event) => setDateRange((range) => ({ ...range, end: event.target.value }))}
            />
          </label>
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
          countryOptions={countryOptions}
          industryOptions={industryOptions}
          onBrowseFiles={handleBrowseFiles}
          onDatasetChange={handleDatasetChange}
          onDragState={setDragActive}
          onDropFile={handleDropFile}
          onFilterChange={onFilterChange}
          onUploadFile={handleUploadFile}
          mediumOptions={mediumOptions}
          platforms={platforms}
          setDateRange={setDateRange}
          testCampaignCount={testCampaignCount}
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
              <KpiCard
                accent="linear-gradient(135deg,#14b8a6,#0f766e)"
                delta={deltas.revenue}
                iconKey="revenue"
                label="Revenue"
                value={formatCurrency(summary.revenue)}
              />
              <KpiCard
                accent="linear-gradient(135deg,#f43f5e,#b91c1c)"
                delta={deltas.roas}
                iconKey="roas"
                label="ROAS"
                value={`${summary.roas.toFixed(2)}x`}
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
                    {availableGranularities.map((item) => (
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
                <DonutChart
                  data={platformSpend}
                  onPlatformSelect={handlePlatformSelect}
                  selectedPlatform={filters.platform}
                />
              </article>

              <article className="panel cpa-panel">
                <h2>CPA by Campaign</h2>
                <CpaBars
                  campaigns={campaigns}
                  onCampaignSelect={handleCampaignSelect}
                  selectedCampaignKey={selectedCampaignKey}
                />
              </article>
          </section>

          <section className="analytics-grid">
            <article className="revenue-panel panel">
              <div className="panel-title-row">
                <div>
                  <h2>Spend vs Revenue Over Time</h2>
                  <div className="legend-inline">
                    <span><i className="blue" /> Spend</span>
                    <span><i className="green" /> Revenue</span>
                  </div>
                </div>
                <span className="chart-note">Monthly view</span>
              </div>
              <RevenueTrendChart data={monthly} />
            </article>
            <EfficiencyQuadrant campaigns={campaigns} />
            <OpportunityPanel campaigns={campaigns} summary={summary} />
          </section>

          <section className="breakdown-grid">
            <BreakdownTable title="Performance by Country" rows={countryBreakdown} labelHeader="Country" />
            <BreakdownTable title="Performance by Industry" rows={industryBreakdown} labelHeader="Industry" />
            <BreakdownTable title="Performance by Campaign Type" rows={typeBreakdown} labelHeader="Type" />
          </section>

          <CampaignDrilldown
            campaign={selectedCampaign}
            rows={selectedCampaignRows}
            onClose={() => setSelectedCampaignKey("")}
          />
          <Takeaways summary={summary} campaigns={campaigns} platforms={platformSpend} deltas={deltas} />
          <Leaderboard
            campaigns={campaigns}
            onCampaignSelect={handleCampaignSelect}
            page={page}
            rowsPerPage={rowsPerPage}
            selectedCampaignKey={selectedCampaignKey}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
          />
        </section>
      </div>
    </main>
  );
}
