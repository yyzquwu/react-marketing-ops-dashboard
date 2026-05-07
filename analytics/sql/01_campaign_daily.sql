drop table if exists campaign_daily;

create table campaign_daily as
select
  date,
  case platform
    when 'Google Ads' then 'google_ads'
    when 'Meta Ads' then 'meta_ads'
    when 'TikTok Ads' then 'tiktok_ads'
    else lower(replace(platform, ' ', '_'))
  end as source,
  case platform
    when 'Meta Ads' then 'Meta'
    when 'TikTok Ads' then 'TikTok'
    else platform
  end as source_label,
  lower(replace(
    case campaign_type
      when 'Search' then 'Paid Search'
      when 'Display' then 'Display'
      when 'Video' then 'Paid Video'
      when 'Shopping' then 'Paid Shopping'
      else campaign_type
    end,
    ' ',
    '_'
  )) as medium,
  case campaign_type
    when 'Search' then 'Paid Search'
    when 'Display' then 'Display'
    when 'Video' then 'Paid Video'
    when 'Shopping' then 'Paid Shopping'
    else campaign_type
  end as medium_label,
  'GA-' || substr('00000' || cast(row_id as text), -5, 5) as campaign_id,
  industry || ' ' || campaign_type || ' ' || country as campaign_name,
  country as segment,
  cast(impressions as integer) as impressions,
  cast(clicks as integer) as clicks,
  round(ad_spend, 2) as spend,
  cast(conversions as integer) as conversions,
  cast(conversions as integer) as total_conversion,
  round(revenue, 2) as revenue,
  round(clicks / nullif(impressions, 0), 6) as ctr,
  round(ad_spend / nullif(clicks, 0), 4) as cpc,
  round(ad_spend / nullif(conversions, 0), 4) as cpa,
  round(revenue / nullif(ad_spend, 0), 4) as roas,
  'global_ads_performance' as dataset
from raw_global_ads
order by date, row_id;
