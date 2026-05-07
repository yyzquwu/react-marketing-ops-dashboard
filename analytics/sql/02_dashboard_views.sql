drop view if exists platform_performance;
drop view if exists weekly_kpi_trends;
drop view if exists campaign_leaderboard;
drop view if exists country_performance;
drop view if exists campaign_type_performance;

create view platform_performance as
select
  source_label,
  round(sum(spend), 2) as spend,
  round(sum(revenue), 2) as revenue,
  cast(sum(conversions) as integer) as conversions,
  round(sum(spend) / nullif(sum(conversions), 0), 2) as cpa,
  round(sum(revenue) / nullif(sum(spend), 0), 2) as roas
from campaign_daily
group by source_label;

create view weekly_kpi_trends as
select
  strftime('%Y-W%W', date) as week,
  round(sum(spend), 2) as spend,
  round(sum(revenue), 2) as revenue,
  cast(sum(conversions) as integer) as conversions,
  round(sum(spend) / nullif(sum(conversions), 0), 2) as cpa,
  round(sum(revenue) / nullif(sum(spend), 0), 2) as roas
from campaign_daily
group by strftime('%Y-W%W', date)
order by week;

create view campaign_leaderboard as
select
  campaign_name,
  source_label,
  medium_label,
  round(sum(spend), 2) as spend,
  cast(sum(conversions) as integer) as conversions,
  round(sum(spend) / nullif(sum(conversions), 0), 2) as cpa,
  round(sum(revenue), 2) as revenue,
  round(sum(revenue) / nullif(sum(spend), 0), 2) as roas,
  round(sum(clicks) / nullif(sum(impressions), 0), 4) as ctr,
  round(sum(spend) / nullif(sum(clicks), 0), 2) as cpc
from campaign_daily
group by campaign_name, source_label, medium_label;

create view country_performance as
select
  segment as country,
  round(sum(spend), 2) as spend,
  round(sum(spend) / nullif(sum(conversions), 0), 2) as cpa,
  round(sum(revenue) / nullif(sum(spend), 0), 2) as roas
from campaign_daily
group by segment;

create view campaign_type_performance as
select
  medium_label as campaign_type,
  round(sum(spend), 2) as spend,
  round(sum(spend) / nullif(sum(conversions), 0), 2) as cpa,
  round(sum(revenue) / nullif(sum(spend), 0), 2) as roas
from campaign_daily
group by medium_label;
