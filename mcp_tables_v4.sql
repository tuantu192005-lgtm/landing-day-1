-- ============================================================
-- Supabase RLS v4 — Gán dữ liệu theo nhân viên + bảng tasks
-- Chạy trong SQL Editor:
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
--
-- Cấu trúc thật đã kiểm tra qua REST API (OpenAPI spec) trước khi viết file này:
--   profiles      : id, full_name, role, phone, created_at, user_id, email, team, status
--   orders        : id, customer_id, product_id, sku, product_name, qty, unit_price,
--                   npp, order_date, status, note, store_name, created_at
--   sales_reports : id, user_id, report_date, revenue, notes, created_at
--   customers     : id, code, full_name, email, phone, company, address, city,
--                   region, status, created_at, updated_at
--   distributors  : id, code, name, contact_name, email, phone, address, region,
--                   active, created_at, updated_at
--   inventory     : id, product_id, warehouse, stock_on_hand, reserved_stock,
--                   incoming_stock, safety_stock, last_checked_at, note
--   products      : id, sku, name, category, description, price, cost,
--                   distributor_id, status, created_at, updated_at, line,
--                   distributor_code, quantity, min_quantity
--   targets       : KHÔNG TỒN TẠI trước khi chạy file này — tạo mới ở bước 1
--                   (trước đó chỉ là mock data DB_TARGETS trong admin/index.html)
--
-- LƯU Ý: profiles.id chính là auth.users.id (đã xác nhận khi tạo 4 tài khoản
-- nam/lap/linh/tam trước đó — không dùng cột user_id để map).
--
-- LƯU Ý 2: sales_reports đã có cột user_id cùng mục đích sở hữu dòng, nhưng
-- theo yêu cầu vẫn thêm cột assigned_to riêng — các policy mới dùng thống
-- nhất assigned_to cho cả 3 bảng orders/targets/sales_reports.
--
-- LƯU Ý 3: các policy "admin_select_*"/"admin_read_*" tạo từ mcp_tables.sql,
-- v2, v3 (cho phép role in ('admin','lead') SELECT) KHÔNG bị xoá ở đây —
-- chỉ thêm policy mới bên cạnh.
-- ============================================================


-- ── 1. Tạo bảng targets (chưa có) ──────────────────────────
create table if not exists public.targets (
  id          bigserial primary key,
  rep         text not null,
  category    text not null,
  month       text not null,            -- format 'YYYY-MM'
  target_qty  integer not null default 0,
  actual_qty  integer not null default 0,
  note        text,
  created_at  timestamptz default now()
);


-- ── 2. Thêm cột assigned_to vào orders / targets / sales_reports ──
alter table public.orders        add column if not exists assigned_to uuid references public.profiles(id) default auth.uid();
alter table public.targets       add column if not exists assigned_to uuid references public.profiles(id) default auth.uid();
alter table public.sales_reports add column if not exists assigned_to uuid references public.profiles(id) default auth.uid();

create index if not exists orders_assigned_idx        on public.orders(assigned_to);
create index if not exists targets_assigned_idx       on public.targets(assigned_to);
create index if not exists sales_reports_assigned_idx on public.sales_reports(assigned_to);


-- ── 3. Bật RLS cho các bảng cần thiết ───────────────────────
alter table public.orders        enable row level security;
alter table public.targets       enable row level security;
alter table public.sales_reports enable row level security;
alter table public.customers     enable row level security;
alter table public.distributors  enable row level security;
alter table public.inventory     enable row level security;
alter table public.products      enable row level security;


-- ── 4. Policy: admin — toàn quyền (select/insert/update/delete) trên cả 7 bảng ──

drop policy if exists "admin_all_orders"        on public.orders;
drop policy if exists "admin_all_targets"       on public.targets;
drop policy if exists "admin_all_sales_reports" on public.sales_reports;
drop policy if exists "admin_all_customers"     on public.customers;
drop policy if exists "admin_all_distributors"  on public.distributors;
drop policy if exists "admin_all_inventory"     on public.inventory;
drop policy if exists "admin_all_products"      on public.products;

create policy "admin_all_orders" on public.orders
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "admin_all_targets" on public.targets
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "admin_all_sales_reports" on public.sales_reports
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "admin_all_customers" on public.customers
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "admin_all_distributors" on public.distributors
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "admin_all_inventory" on public.inventory
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "admin_all_products" on public.products
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );


-- ── 5. Policy: staff — chỉ dòng của mình trên orders/targets/sales_reports ──

drop policy if exists "staff_select_own_orders" on public.orders;
drop policy if exists "staff_insert_own_orders" on public.orders;
drop policy if exists "staff_update_own_orders" on public.orders;

create policy "staff_select_own_orders" on public.orders
  for select using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_insert_own_orders" on public.orders
  for insert with check (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_update_own_orders" on public.orders
  for update using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  ) with check (
    assigned_to = auth.uid()
  );

drop policy if exists "staff_select_own_targets" on public.targets;
drop policy if exists "staff_insert_own_targets" on public.targets;
drop policy if exists "staff_update_own_targets" on public.targets;

create policy "staff_select_own_targets" on public.targets
  for select using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_insert_own_targets" on public.targets
  for insert with check (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_update_own_targets" on public.targets
  for update using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  ) with check (
    assigned_to = auth.uid()
  );

drop policy if exists "staff_select_own_sales_reports" on public.sales_reports;
drop policy if exists "staff_insert_own_sales_reports" on public.sales_reports;
drop policy if exists "staff_update_own_sales_reports" on public.sales_reports;

create policy "staff_select_own_sales_reports" on public.sales_reports
  for select using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_insert_own_sales_reports" on public.sales_reports
  for insert with check (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_update_own_sales_reports" on public.sales_reports
  for update using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  ) with check (
    assigned_to = auth.uid()
  );


-- ── 6. Policy: staff — chỉ xem (select) trên dữ liệu chung cả team dùng ──

drop policy if exists "staff_read_customers"    on public.customers;
drop policy if exists "staff_read_distributors" on public.distributors;
drop policy if exists "staff_read_inventory"    on public.inventory;
drop policy if exists "staff_read_products"     on public.products;

create policy "staff_read_customers" on public.customers
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_read_distributors" on public.distributors
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_read_inventory" on public.inventory
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

create policy "staff_read_products" on public.products
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );


-- ============================================================
-- VIỆC 2 — Bảng tasks (giao nhiệm vụ)
-- ============================================================

create table if not exists public.tasks (
  id          bigserial primary key,
  assigned_to uuid references public.profiles(id) not null,
  assigned_by uuid references public.profiles(id) default auth.uid(),
  title       text not null,
  description text,
  due_date    date,
  status      text not null default 'todo' check (status in ('todo','in_progress','done')),
  created_at  timestamptz default now()
);

create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to);

alter table public.tasks enable row level security;

drop policy if exists "admin_all_tasks"           on public.tasks;
drop policy if exists "staff_select_own_tasks"    on public.tasks;
drop policy if exists "staff_update_status_tasks" on public.tasks;

create policy "admin_all_tasks" on public.tasks
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "staff_select_own_tasks" on public.tasks
  for select using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  );

-- Staff được UPDATE dòng của mình, nhưng RLS không giới hạn theo CỘT —
-- nên thêm trigger chặn nếu staff cố sửa title/description/due_date/assigned_to/assigned_by.
create policy "staff_update_status_tasks" on public.tasks
  for update using (
    assigned_to = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
  ) with check (
    assigned_to = auth.uid()
  );

create or replace function public.tasks_staff_only_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'staff' and status = 'active'
  ) then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.due_date is distinct from old.due_date
       or new.assigned_to is distinct from old.assigned_to
       or new.assigned_by is distinct from old.assigned_by
    then
      raise exception 'Nhân viên chỉ được sửa cột status, không được sửa các trường khác.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_staff_only_status on public.tasks;
create trigger trg_tasks_staff_only_status
  before update on public.tasks
  for each row execute function public.tasks_staff_only_status_change();
