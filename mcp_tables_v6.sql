-- ============================================================
-- Supabase v6 — Hoàn thiện công thức KPI đầy đủ D-K cho targets
-- Chạy trong SQL Editor:
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
--
-- File này chỉ chứa phần DDL (ALTER TABLE / CREATE VIEW) — không thể
-- chạy qua REST API (PostgREST không hỗ trợ DDL), nên cần paste vào
-- SQL Editor và Run thủ công, giống cách đã làm với v4.sql/v5.sql.
--
-- Sau khi chạy xong file này, phần cập nhật item_weight (D) và
-- y2023_avg (K) thật từ "KPI Q1.2024.xlsx" sẽ được làm bằng 1 script
-- Node riêng (DML thường, chạy được qua REST API với service key).
-- ============================================================


-- ── 1. Thêm 3 cột mới vào targets ───────────────────────────
alter table public.targets add column if not exists item_weight     numeric;
alter table public.targets add column if not exists y2023_avg       numeric;
alter table public.targets add column if not exists parent_category text;


-- ── 2. Gán parent_category cho các category dùng chung Target gốc (F)
--      của 1 category khác — đúng theo cấu trúc sheet "Official ver 1.0"
--      (các dòng con không có cột F riêng, dùng F của dòng cha) ──────

update public.targets set parent_category = 'CND-MB'
  where category = 'CND-MB (B Chipset)';

update public.targets set parent_category = 'CND-MB'
  where category = 'CND-MB (X,Z Chipset)';

update public.targets set parent_category = 'CND-GMNT'
  where category = 'CND-GMNT ( QHD )';

update public.targets set parent_category = 'GNP-VGA ( GT )'
  where category = 'GNP-VGA ( GTX + RTX )';

-- Tất cả category còn lại: parent_category = NULL (mặc định khi ADD COLUMN,
-- nhưng update lại rõ ràng ở đây để idempotent nếu chạy lại file này).
update public.targets set parent_category = null
  where category not in (
    'CND-MB (B Chipset)',
    'CND-MB (X,Z Chipset)',
    'CND-GMNT ( QHD )',
    'GNP-VGA ( GTX + RTX )'
  );


-- ── 3. View v_kpi_full — tính đầy đủ E, G, H, I, J theo công thức ───
-- (giữ nguyên v_kpi_achieved cũ, không xoá — view này chỉ thêm mới)
--
-- f_effective = target_stretched (F) của parent_category nếu có,
--               ngược lại của chính dòng đó (self-join targets).
-- target_e    = f_effective * y2023_avg                         (E)
-- achieved_g  = từ v_kpi_achieved, join theo assigned_to+quarter+category (G)
-- hit_rate_h  = achieved_g / target_e, NULL nếu target_e NULL hoặc 0   (H)
-- final_score_i / target_score_j: SUM theo "gốc nhóm" = coalesce(parent_category, category),
--   chỉ hiện ở dòng gốc (parent_category IS NULL), dòng con luôn NULL.   (I, J)

create or replace view public.v_kpi_full
with (security_invoker = true) as
with achieved as (
  select
    assigned_to,
    (year::text || ' Q' || quarter::text) as quarter,
    category,
    achieved_qty
  from public.v_kpi_achieved
),
base as (
  select
    t.id,
    t.assigned_to,
    t.quarter,
    t.category,
    t.parent_category,
    t.item_weight,
    t.target_stretched,
    t.y2023_avg,
    coalesce(a.achieved_qty, 0) as achieved_g,
    coalesce(parent.target_stretched, t.target_stretched) as f_effective
  from public.targets t
  left join achieved a
    on a.assigned_to = t.assigned_to
   and a.quarter      = t.quarter
   and a.category     = t.category
  left join public.targets parent
    on parent.assigned_to = t.assigned_to
   and parent.quarter      = t.quarter
   and parent.category     = t.parent_category
),
calc as (
  select
    b.*,
    (b.f_effective * b.y2023_avg) as target_e
  from base b
),
calc2 as (
  select
    c.*,
    case
      when c.target_e is null or c.target_e = 0 then null
      else c.achieved_g / c.target_e
    end as hit_rate_h
  from calc c
),
family as (
  select
    assigned_to,
    quarter,
    coalesce(parent_category, category) as family_key,
    sum(achieved_g * coalesce(item_weight, 0))             as family_i,
    sum(coalesce(item_weight, 0) * coalesce(target_e, 0))   as family_j
  from calc2
  group by assigned_to, quarter, coalesce(parent_category, category)
)
select
  c.id,
  c.assigned_to,
  c.quarter,
  c.category,
  c.parent_category,
  c.item_weight                                                as item_weight,
  c.target_stretched                                           as target_f,
  c.y2023_avg                                                  as y2023_avg,
  c.target_e                                                   as target_e,
  c.achieved_g                                                 as achieved_g,
  c.hit_rate_h                                                 as hit_rate_h,
  case when c.parent_category is null then f.family_i else null end as final_score_i,
  case when c.parent_category is null then f.family_j else null end as target_score_j
from calc2 c
left join family f
  on f.assigned_to = c.assigned_to
 and f.quarter      = c.quarter
 and f.family_key    = coalesce(c.parent_category, c.category);
