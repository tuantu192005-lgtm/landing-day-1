-- ============================================================
-- Supabase v5 — Sellout data + Targets (quarter) + KPI achieved view
-- Chạy trong SQL Editor:
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
--
-- File này TỰ ĐỦ — không phụ thuộc việc mcp_tables_v4.sql đã chạy hay chưa
-- (targets được tạo lại bằng "create table if not exists" với đầy đủ cột
--  cần cho v5; nếu v4 đã chạy trước thì chỉ các ALTER ADD COLUMN có tác dụng).
-- ============================================================


-- ── 1. Bảng targets — đảm bảo tồn tại + đủ cột cho KPI theo quý ──
create table if not exists public.targets (
  id          bigserial primary key,
  rep         text,
  category    text not null,
  month       text,                     -- 'YYYY-MM' (dùng ở bản cũ, vẫn giữ)
  quarter     text,                     -- 'YYYY QN', ví dụ '2024 Q1'
  target_qty  integer not null default 0,
  target_stretched integer,             -- có thể NULL nếu không có target đẩy mạnh
  actual_qty  integer not null default 0,
  note        text,
  assigned_to uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz default now()
);

alter table public.targets add column if not exists quarter          text;
alter table public.targets add column if not exists target_stretched integer;
alter table public.targets add column if not exists assigned_to      uuid references public.profiles(id) default auth.uid();

create index if not exists targets_assigned_idx on public.targets(assigned_to);

-- Unique key để upsert theo (assigned_to, quarter, category)
alter table public.targets drop constraint if exists targets_assigned_quarter_category_key;
alter table public.targets add constraint targets_assigned_quarter_category_key
  unique (assigned_to, quarter, category);


-- ── 2. Bảng sellout_data (mới) ──────────────────────────────
create table if not exists public.sellout_data (
  id               bigserial primary key,
  sale_date        date,
  customer_name    text,
  assigned_to      uuid references public.profiles(id),
  lob              text,
  disty            text,
  model            text,
  quantity         integer,
  platform         text,
  details_chipset  text,
  form_factor      text,
  created_at       timestamptz default now()
);

create index if not exists sellout_assigned_idx   on public.sellout_data(assigned_to);
create index if not exists sellout_sale_date_idx  on public.sellout_data(sale_date);
create index if not exists sellout_lob_idx        on public.sellout_data(lob);

-- RLS cho sellout_data — theo đúng pattern admin full / staff chỉ dòng của mình
-- đã áp dụng cho orders/targets/sales_reports (mcp_tables_v4.sql). KHÔNG được
-- yêu cầu rõ trong việc này — thêm để nhất quán bảo mật, báo lại để bạn rà soát.
alter table public.sellout_data enable row level security;

drop policy if exists "admin_all_sellout_data"        on public.sellout_data;
drop policy if exists "staff_select_own_sellout_data"  on public.sellout_data;
drop policy if exists "staff_insert_own_sellout_data"  on public.sellout_data;
drop policy if exists "staff_update_own_sellout_data"  on public.sellout_data;

create policy "admin_all_sellout_data" on public.sellout_data
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "staff_select_own_sellout_data" on public.sellout_data
  for select using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_insert_own_sellout_data" on public.sellout_data
  for insert with check (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_update_own_sellout_data" on public.sellout_data
  for update using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  ) with check (
    assigned_to = auth.uid()
  );


-- ── 3. View v_kpi_achieved ───────────────────────────────────
-- security_invoker: view áp dụng RLS theo người đang query, không theo
-- quyền của người tạo view (best practice Supabase cho view trên bảng có RLS).
create or replace view public.v_kpi_achieved
with (security_invoker = true) as
select
  assigned_to,
  extract(year from sale_date)::int    as year,
  extract(quarter from sale_date)::int as quarter,
  case
    when lob = 'MB' and details_chipset ~* '^[AH]' then 'CND-MB'
    when lob = 'MB' and details_chipset ~* '^B' then 'CND-MB (B Chipset)'
    when lob = 'MB' and details_chipset ~* '^[XZ]' then 'CND-MB (X,Z Chipset)'
    when lob in ('DESKTOP','MINIPC') then 'CND-PRO ( Cubi, DT & AIO )'
    when lob = 'G Monitor' and (details_chipset ilike '%Q%' or model ilike '%Q%') then 'CND-GMNT ( QHD )'
    when lob = 'Pro Monitor' then 'CND-PRO MNT'
    when lob = 'G Monitor' then 'CND-GMNT'
    when lob = 'PSU' then 'CND-PSU'
    when lob = 'CASE' then 'CND-Chassis'
    when lob = 'COOLER' then 'CND-Liquid Cooler'
    when lob = 'VGA' and (details_chipset || ' ' || model) ilike '%GT%'
         and (details_chipset || ' ' || model) not ilike '%GTX%' then 'GNP-VGA ( GT )'
    when lob = 'VGA' and ((details_chipset || ' ' || model) ilike '%GTX%'
         or (details_chipset || ' ' || model) ilike '%RTX%') then 'GNP-VGA ( GTX + RTX )'
    when lob = 'GG' then 'GNP-Gaming Gears'
    when lob = 'SSD' then 'SSD'
    else 'Chưa phân loại'
  end as category,
  sum(quantity) as achieved_qty
from public.sellout_data
group by assigned_to, year, quarter, category;
