-- ============================================================
-- Supabase tables cho MCP server — MSI Sales Management
-- Chạy trong SQL Editor: https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
-- ============================================================

-- 1. Tồn kho
create table if not exists public.inventory (
  id           uuid primary key default gen_random_uuid(),
  sku          text not null,
  product_name text not null,
  npp          text not null,   -- DGW | SPC | KTC | NWH | MH | AD
  category     text,            -- VGA | Mainboard | LCD | PSU | SSD | Case | Cooling
  qty          integer not null default 0,
  updated_at   timestamptz default now()
);

create index if not exists inventory_sku_idx on public.inventory(sku);
create index if not exists inventory_npp_idx on public.inventory(npp);

-- 2. Đơn hàng
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  customer_name  text not null,
  rep_name       text not null,
  npp            text not null,
  items_summary  text,          -- mô tả ngắn: "10x RTX5060Ti, 5x MAG274QRF"
  items          jsonb,         -- chi tiết: [{sku, qty, unit_price}]
  total          bigint not null default 0,
  status         text not null default 'pending',  -- pending | processing | done
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists orders_status_idx  on public.orders(status);
create index if not exists orders_rep_idx     on public.orders(rep_name);
create index if not exists orders_created_idx on public.orders(created_at desc);

-- 3. Khách hàng
create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  contact         text,         -- số điện thoại hoặc email
  area            text,         -- khu vực: TP.HCM, Miền Bắc, Miền Trung...
  rep_name        text,         -- nhân viên phụ trách
  follow_status   text not null default 'new',  -- new | follow | active
  last_contact_at timestamptz,
  note            text,
  created_at      timestamptz default now()
);

create index if not exists customers_rep_idx    on public.customers(rep_name);
create index if not exists customers_follow_idx on public.customers(follow_status);

-- ============================================================
-- RLS: service role key (dùng trong MCP server) tự động bypass
-- Nếu muốn admin web cũng đọc được, thêm policy sau:
-- ============================================================
alter table public.inventory enable row level security;
alter table public.orders    enable row level security;
alter table public.customers enable row level security;

create policy "admin_read_inventory" on public.inventory
  for select using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin','lead') and p.status = 'active')
  );

create policy "admin_read_orders" on public.orders
  for select using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin','lead') and p.status = 'active')
  );

create policy "admin_read_customers" on public.customers
  for select using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin','lead') and p.status = 'active')
  );
