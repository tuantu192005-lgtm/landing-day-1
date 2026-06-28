-- ============================================================
-- Supabase v11 — Menu Sản phẩm: 4 bảng products_master,
-- product_disty_codes, product_programs, disty_inventory
-- Chạy trong SQL Editor (DDL không chạy được qua REST API):
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
-- ============================================================

-- Bảng sản phẩm chuẩn
create table if not exists public.products_master (
  sku         text primary key,
  model_name  text not null,
  lob         text not null,
  sdp_price   numeric default 0,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Mapping mã NPP → mã chuẩn
create table if not exists public.product_disty_codes (
  id          uuid default gen_random_uuid() primary key,
  sku         text references public.products_master(sku) on delete cascade,
  disty       text not null,
  disty_code  text,
  disty_name  text,
  unique(disty, disty_code)
);

-- Chương trình giá theo SKU × quý × NPP/đại lý
create table if not exists public.product_programs (
  id            uuid default gen_random_uuid() primary key,
  sku           text references public.products_master(sku) on delete cascade,
  quarter       text not null,
  disty         text,
  customer_name text,
  assigned_to   uuid references public.profiles(id),
  hero          numeric default 0,
  extra_1       numeric default 0,
  extra_2       numeric default 0,
  extra_3       numeric default 0,
  extra_4       numeric default 0,
  note          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Tồn kho NPP theo tuần
create table if not exists public.disty_inventory (
  id          uuid default gen_random_uuid() primary key,
  sku         text references public.products_master(sku) on delete cascade,
  disty       text not null,
  week_date   date not null,
  opening     int default 0,
  sell_in     int default 0,
  sell_out    int default 0,
  closing     int default 0,
  unique(sku, disty, week_date)
);

-- Index cho các cột tra cứu/filter nhiều (tìm kiếm, lọc theo SKU/quý/NPP)
create index if not exists idx_products_master_lob on public.products_master(lob);
create index if not exists idx_products_master_model_name on public.products_master(model_name);
create index if not exists idx_product_disty_codes_sku on public.product_disty_codes(sku);
create index if not exists idx_product_programs_sku_quarter on public.product_programs(sku, quarter);
create index if not exists idx_product_programs_assigned_to on public.product_programs(assigned_to);
create index if not exists idx_disty_inventory_sku on public.disty_inventory(sku);
create index if not exists idx_disty_inventory_disty_week on public.disty_inventory(disty, week_date);

-- ── RLS: admin full, staff chỉ xem (product_programs: staff xem theo
-- assigned_to, giống category_ratios/annual_targets ở các bảng trước) ──

alter table public.products_master enable row level security;
drop policy if exists "admin_all" on public.products_master;
drop policy if exists "staff_view" on public.products_master;
create policy "admin_all" on public.products_master for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role='admin' and status='active'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role='admin' and status='active'));
create policy "staff_view" on public.products_master for select
  using (exists (select 1 from public.profiles where id = auth.uid() and status='active'));

alter table public.product_disty_codes enable row level security;
drop policy if exists "admin_all" on public.product_disty_codes;
drop policy if exists "staff_view" on public.product_disty_codes;
create policy "admin_all" on public.product_disty_codes for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role='admin' and status='active'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role='admin' and status='active'));
create policy "staff_view" on public.product_disty_codes for select
  using (exists (select 1 from public.profiles where id = auth.uid() and status='active'));

alter table public.product_programs enable row level security;
drop policy if exists "admin_all" on public.product_programs;
drop policy if exists "staff_view_own" on public.product_programs;
create policy "admin_all" on public.product_programs for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role='admin' and status='active'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role='admin' and status='active'));
create policy "staff_view_own" on public.product_programs for select
  using (assigned_to = auth.uid() or assigned_to is null);

alter table public.disty_inventory enable row level security;
drop policy if exists "admin_all" on public.disty_inventory;
drop policy if exists "staff_view" on public.disty_inventory;
create policy "admin_all" on public.disty_inventory for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role='admin' and status='active'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role='admin' and status='active'));
create policy "staff_view" on public.disty_inventory for select
  using (exists (select 1 from public.profiles where id = auth.uid() and status='active'));
