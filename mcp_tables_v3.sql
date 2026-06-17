-- ============================================================
-- Supabase tables v3 — MSI Sales Management
-- Chỉ tạo bảng còn thiếu + RLS policies
-- KHÔNG chạm vào cấu trúc các bảng đã có:
--   products, inventory, customers, distributors, profiles, sales_reports
--
-- Chạy trong SQL Editor:
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
-- ============================================================

-- ── Schema thực tế đang có ──────────────────────────────────
-- products  : id, sku, name, category, price, cost, distributor_id,
--             status, line, distributor_code, quantity, min_quantity
-- inventory : id, product_id(->products), warehouse, stock_on_hand,
--             reserved_stock, incoming_stock, safety_stock, last_checked_at, note
-- customers : id, code, full_name, email, phone, company,
--             address, city, region, status, created_at, updated_at
-- distributors: id, code, name, contact_name, email, phone, address, region, active

-- ── 1. Tạo bảng orders (chưa có) ────────────────────────────
create table if not exists public.orders (
  id           bigserial primary key,
  customer_id  bigint references public.customers(id),
  product_id   bigint references public.products(id),
  sku          text not null,
  product_name text not null,
  qty          integer not null default 1,
  unit_price   bigint not null default 0,
  npp          text not null,
  order_date   date default current_date,
  status       text not null default 'pending',
  note         text,
  store_name   text,
  created_at   timestamptz default now()
);

create index if not exists orders_status_idx   on public.orders(status);
create index if not exists orders_customer_idx on public.orders(customer_id);
create index if not exists orders_date_idx     on public.orders(order_date desc);

-- ── 2. RLS — tất cả bảng dùng bởi MCP ──────────────────────
alter table public.products      enable row level security;
alter table public.inventory     enable row level security;
alter table public.customers     enable row level security;
alter table public.distributors  enable row level security;
alter table public.orders        enable row level security;

-- Helper: kiểm tra user là admin hoặc lead đang active
-- (dùng chung cho tất cả policies bên dưới)

drop policy if exists "admin_select_products"     on public.products;
drop policy if exists "admin_select_inventory"    on public.inventory;
drop policy if exists "admin_select_customers"    on public.customers;
drop policy if exists "admin_select_distributors" on public.distributors;
drop policy if exists "admin_select_orders"       on public.orders;

create policy "admin_select_products" on public.products
  for select using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('admin','lead') and status = 'active')
  );

create policy "admin_select_inventory" on public.inventory
  for select using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('admin','lead') and status = 'active')
  );

create policy "admin_select_customers" on public.customers
  for select using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('admin','lead') and status = 'active')
  );

create policy "admin_select_distributors" on public.distributors
  for select using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('admin','lead') and status = 'active')
  );

create policy "admin_select_orders" on public.orders
  for select using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('admin','lead') and status = 'active')
  );
