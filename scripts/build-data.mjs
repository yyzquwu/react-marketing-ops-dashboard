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
const globalAdsRaw = path.join(dataDir, "raw_global_ads_performance_dataset.csv");

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

const portfolioCampaignCpaTargets = {
  C001: 38.21,
  C002: 45.67,
  C003: 52.18,
  C004: 59.34,
  C005: 63.89,
  C006: 68.41,
  C007: 71.02,
  C008: 78.55,
  C009: 83.19,
  C010: 97.26,
};

const sourceMediumNames = {
  google_ads: "Paid Search",
  meta_ads: "Paid Social",
  microsoft_ads: "Paid Search",
  other_ads: "Display",
  tiktok_ads: "Paid Social",
  youtube_ads: "Paid Video",
};

const globalPlatformSources = {
  "Google Ads": "google_ads",
  "Meta Ads": "meta_ads",
  "TikTok Ads": "tiktok_ads",
};

const globalPlatformLabels = {
  "Google Ads": "Google Ads",
  "Meta Ads": "Meta",
  "TikTok Ads": "TikTok",
};

const globalCampaignMediums = {
  Search: "Paid Search",
  Display: "Display",
  Video: "Paid Video",
  Shopping: "Paid Shopping",
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

function hashText(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 100000;
  }
  return hash;
}

function portfolioCpaTarget(campaignId, campaignName, source) {
  if (portfolioCampaignCpaTargets[campaignId]) return portfolioCampaignCpaTargets[campaignId];
  const sourceFactor = {
    google_ads: -8,
    meta_ads: -14,
    microsoft_ads: -2,
    other_ads: 18,
    tiktok_ads: 6,
    youtube_ads: 12,
  }[source] ?? 0;
  const hashFactor = hashText(`${campaignName}|${source}`) % 42;
  return 48 + sourceFactor + hashFactor * 1.35;
}

function normalizePortfolio(rows) {
  return rows.map((row) => {
    const campaignId = row.campaign_id;
    const campaignName = portfolioCampaignNames[campaignId] ?? row.campaign_name ?? campaignId;
    const sourceLabel = platformNames[row.source] ?? row.source;
    const mediumLabel = mediumNames[row.medium] ?? sourceMediumNames[row.source] ?? row.medium;
    const impressions = asNumber(row.impressions);
    const clicks = asNumber(row.clicks);
    const spend = asNumber(row.spend);
    const targetCpa = portfolioCpaTarget(campaignId, campaignName, row.source);
    const conversions = Math.max(1, Math.round(spend / targetCpa));
    return {
      date: row.date,
      source: row.source,
      source_label: sourceLabel,
      medium: row.medium || mediumLabel.toLowerCase().replace(/\s+/g, "_"),
      medium_label: mediumLabel,
      campaign_id: campaignId,
      campaign_name: campaignName,
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

function normalizeGlobalAds(rows) {
  return rows
    .map((row, index) => {
      const platform = row.platform || "Other";
      const campaignType = row.campaign_type || "Campaign";
      const industry = row.industry || "General";
      const country = row.country || "Global";
      const source = globalPlatformSources[platform] ?? platform.toLowerCase().replace(/\s+/g, "_");
      const sourceLabel = globalPlatformLabels[platform] ?? platform.replace(/\s+Ads$/, "");
      const mediumLabel = globalCampaignMediums[campaignType] ?? campaignType;
      const impressions = asNumber(row.impressions);
      const clicks = asNumber(row.clicks);
      const spend = asNumber(row.ad_spend);
      const conversions = asNumber(row.conversions);
      const campaignName = `${industry} ${campaignType} ${country}`;

      return {
        date: row.date,
        source,
        source_label: sourceLabel,
        medium: mediumLabel.toLowerCase().replace(/\s+/g, "_"),
        medium_label: mediumLabel,
        campaign_id: `GA-${String(index + 1).padStart(5, "0")}`,
        campaign_name: campaignName,
        segment: country,
        impressions,
        clicks,
        spend: round(spend, 2),
        conversions,
        total_conversion: conversions,
        ctr: impressions ? round(clicks / impressions, 6) : 0,
        cpc: clicks ? round(spend / clicks, 4) : 0,
        cpa: conversions ? round(spend / conversions, 4) : 0,
        dataset: "global_ads_performance",
      };
    })
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
  if (!existsSync(globalAdsRaw)) {
    throw new Error(`Missing Kaggle global ads CSV: ${globalAdsRaw}`);
  }

  const portfolioRows = parseCsv(await readFile(airflowOutput, "utf8"));
  const realRows = parseCsv(await readFile(realRaw, "utf8"));
  const globalAdsRows = parseCsv(await readFile(globalAdsRaw, "utf8"));

  await writeDataset("portfolio_campaign_daily", normalizePortfolio(portfolioRows));
  await writeDataset("real_facebook_ads_daily", normalizeRealFacebook(realRows));
  await writeDataset("global_ads_performance_daily", normalizeGlobalAds(globalAdsRows));

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
      {
        id: "global_ads_performance",
        label: "Kaggle global ads performance",
        source: "Kaggle Global Ads Performance: Google, Meta, TikTok",
        csv: "/data/global_ads_performance_daily.csv",
        json: "/data/global_ads_performance_daily.json",
        raw: "/data/raw_global_ads_performance_dataset.csv",
        rows: globalAdsRows.length,
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
