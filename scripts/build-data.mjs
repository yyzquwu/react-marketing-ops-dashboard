import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "public", "data");
const airflowOutput = path.resolve(
  repoRoot,
  "..",
  "airflow-marketing-data-ops",
  "output",
  "unified_campaign_daily.csv",
);
const realRaw = path.join(dataDir, "raw_real_facebook_ads.csv");

const platformNames = {
  google_ads: "Google Ads",
  meta_ads: "Meta",
  microsoft_ads: "Microsoft Ads",
  other_ads: "Other",
  tiktok_ads: "TikTok",
  youtube_ads: "YouTube",
};

const mediumNames = {
  cpc: "Paid Search",
  paid_social: "Paid Social",
  paid_video: "Paid Video",
  display: "Display",
};

const portfolioCampaignNames = {
  C001: "Paramount+ Spring Promo",
  C002: "Top Gun: Maverick Push",
  C003: "Yellowstone S5 Launch",
  C004: "Star Trek: Strange New Worlds",
  C005: "Halo S2 Campaign",
  C006: "Teen Wolf: The Movie",
  C007: "PAW Patrol: The Mighty Movie",
  C008: "Transformers: Rise of the Beasts",
  C009: "Mission: Impossible - Dead Reckoning",
  C010: "iCarly (Reboot) Awareness",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
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
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
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
  return records.map((record) => ({
    ...Object.fromEntries(headers.map((header, index) => [header.trim(), record[index] ?? ""])),
    __cells: record,
  }));
}

function toCsv(records, headers) {
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [
    headers.join(","),
    ...records.map((record) => headers.map((header) => escape(record[header])).join(",")),
  ].join("\n");
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateFromDmy(value) {
  const [day, month, year] = value.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function round(value, decimals = 4) {
  const multiplier = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function normalizePortfolio(rows) {
  return rows.map((row) => {
    const campaignId = row.campaign_id;
    const impressions = asNumber(row.impressions);
    const clicks = asNumber(row.clicks);
    const spend = asNumber(row.spend);
    const conversions = asNumber(row.conversions);
    return {
      date: row.date,
      source: row.source,
      source_label: platformNames[row.source] ?? row.source,
      medium: row.medium,
      medium_label: mediumNames[row.medium] ?? row.medium,
      campaign_id: campaignId,
      campaign_name: portfolioCampaignNames[campaignId] ?? row.campaign_name ?? campaignId,
      impressions,
      clicks,
      spend: round(spend, 2),
      conversions,
      ctr: impressions ? round(clicks / impressions, 6) : 0,
      cpc: clicks ? round(spend / clicks, 4) : 0,
      cpa: conversions ? round(spend / conversions, 4) : 0,
      dataset: "portfolio",
    };
  });
}

function normalizeRealFacebook(rows) {
  const aggregate = new Map();

  for (const row of rows) {
    const campaignIdIsPresent = /^\d+$/.test(row.campaign_id);
    const campaignId = campaignIdIsPresent
      ? `FB-${row.campaign_id}`
      : `FB-unmapped-${row.campaign_id || "unknown"}-${row.fb_campaign_id || "unknown"}`;
    const campaignName = campaignIdIsPresent
      ? `Facebook Campaign ${row.campaign_id}`
      : `Unmapped Facebook Audience ${row.campaign_id || "Unknown"} ${row.fb_campaign_id || ""}`.trim();
    const age = campaignIdIsPresent ? row.age || "Unknown" : row.campaign_id || "Unknown";
    const gender = campaignIdIsPresent ? row.gender || "Unknown" : row.fb_campaign_id || "Unknown";
    const impressions = campaignIdIsPresent ? asNumber(row.impressions) : asNumber(row.interest2);
    const clicks = campaignIdIsPresent ? asNumber(row.clicks) : asNumber(row.interest3);
    const spend = campaignIdIsPresent ? asNumber(row.spent) : asNumber(row.impressions);
    const conversions = campaignIdIsPresent ? asNumber(row.approved_conversion) : asNumber(row.spent);
    const totalConversion = campaignIdIsPresent ? asNumber(row.total_conversion) : asNumber(row.clicks);

    const date = formatDateFromDmy(row.reporting_start);
    const key = [
      date,
      campaignId,
      campaignName,
      age,
      gender,
    ].join("|");
    const existing = aggregate.get(key) ?? {
      date,
      source: "meta_ads",
      source_label: "Meta",
      medium: "paid_social",
      medium_label: "Paid Social",
      campaign_id: campaignId,
      campaign_name: campaignName,
      segment: `${age} ${gender}`,
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      total_conversion: 0,
      dataset: "real_facebook_ads",
    };

    existing.impressions += impressions;
    existing.clicks += clicks;
    existing.spend += spend;
    existing.conversions += conversions;
    existing.total_conversion += totalConversion;
    aggregate.set(key, existing);
  }

  return [...aggregate.values()]
    .map((row) => ({
      ...row,
      spend: round(row.spend, 2),
      ctr: row.impressions ? round(row.clicks / row.impressions, 6) : 0,
      cpc: row.clicks ? round(row.spend / row.clicks, 4) : 0,
      cpa: row.conversions ? round(row.spend / row.conversions, 4) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.campaign_id.localeCompare(b.campaign_id));
}

async function writeDataset(name, records) {
  const headers = [
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
    "ctr",
    "cpc",
    "cpa",
    "dataset",
  ];

  const normalized = records.map((record) =>
    Object.fromEntries(headers.map((header) => [header, record[header] ?? ""])),
  );

  await writeFile(path.join(dataDir, `${name}.csv`), toCsv(normalized, headers));
  await writeFile(path.join(dataDir, `${name}.json`), JSON.stringify(normalized, null, 2));
}

async function main() {
  await mkdir(dataDir, { recursive: true });

  if (!existsSync(airflowOutput)) {
    throw new Error(`Missing Airflow output CSV: ${airflowOutput}`);
  }
  if (!existsSync(realRaw)) {
    throw new Error(`Missing real Facebook ads CSV: ${realRaw}`);
  }

  const portfolioRows = parseCsv(await readFile(airflowOutput, "utf8"));
  const realRows = parseCsv(await readFile(realRaw, "utf8"));

  await writeDataset("portfolio_campaign_daily", normalizePortfolio(portfolioRows));
  await writeDataset("real_facebook_ads_daily", normalizeRealFacebook(realRows));

  const manifest = {
    generated_at: new Date().toISOString(),
    datasets: [
      {
        id: "portfolio",
        label: "Portfolio multi-platform sample",
        source: "Generated by companion Airflow pipeline",
        csv: "/data/portfolio_campaign_daily.csv",
        json: "/data/portfolio_campaign_daily.json",
        rows: portfolioRows.length,
      },
      {
        id: "real_facebook_ads",
        label: "Real public Facebook ads",
        source: "Kaggle Facebook Ad Campaign dataset via public GitHub mirror",
        csv: "/data/real_facebook_ads_daily.csv",
        json: "/data/real_facebook_ads_daily.json",
        raw: "/data/raw_real_facebook_ads.csv",
        rows: realRows.length,
      },
    ],
  };
  await writeFile(path.join(dataDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Wrote ${manifest.datasets.length} datasets to ${dataDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
