-- =====================================================================
-- MIGRATION v16: bang customer_targets + view canh bao vuot target
--
-- Xac nhan truoc khi viet (qua service key, khong doan):
--   - customers KHONG co cot assigned_to -- quyen phu trach khach hang
--     nam o bang customer_assignments (customer_id integer, sales_id uuid).
--   - targets.category co dung 16 gia tri that (liet ke duoi day).
--   - targets.parent_category la thuoc tinh CUA CATEGORY (on dinh, khong
--     doi theo assigned_to/quarter) -- dung lam nguon map ve family_key,
--     khong dinh nghia lai.
-- =====================================================================


-- ── 1. Bang customer_targets ────────────────────────────────────────
create table if not exists public.customer_targets (
  id           bigint generated always as identity primary key,
  customer_id  integer not null references public.customers(id),
  category     text not null check (category in (
                 'CND-Chassis', 'CND-GDT', 'CND-GMNT', 'CND-GMNT ( QHD )',
                 'CND-Liquid Cooler', 'CND-MB', 'CND-MB (B Chipset)',
                 'CND-MB (X,Z Chipset)', 'CND-PRO ( Cubi, DT & AIO )',
                 'CND-PRO MNT', 'CND-PSU', 'GNP-Gaming Gears',
                 'GNP-VGA ( GT )', 'GNP-VGA ( GTX + RTX )', 'Networking', 'SSD'
               )),
  target_month date not null check (extract(day from target_month) = 1),
  target_qty   numeric not null,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz default now()
);

create index if not exists customer_targets_customer_idx on public.customer_targets(customer_id);
create index if not exists customer_targets_created_by_idx on public.customer_targets(created_by);
create index if not exists customer_targets_month_idx on public.customer_targets(target_month);


-- ── 2. View v_customer_target_allocation ────────────────────────────
-- Gom theo (staff phu trach khach hang, quy suy tu target_month,
-- family_key = coalesce(parent_category, category)). family_key lay
-- tu chinh targets (khong dinh nghia lai mapping cha/con).
create or replace view public.v_customer_target_allocation
with (security_invoker = true) as
with cat_family as (
  select distinct category, coalesce(parent_category, category) as family_key
  from public.targets
),
allocated as (
  select
    ca.sales_id as staff_id,
    (extract(year from ct.target_month)::text || ' Q' || extract(quarter from ct.target_month)::text) as quarter,
    cf.family_key,
    sum(ct.target_qty) as allocated_qty
  from public.customer_targets ct
  join public.customer_assignments ca on ca.customer_id = ct.customer_id
  join cat_family cf on cf.category = ct.category
  group by ca.sales_id, quarter, cf.family_key
),
quota as (
  select
    t.assigned_to as staff_id,
    t.quarter,
    coalesce(t.parent_category, t.category) as family_key,
    sum(t.target_stretched) as quota_qty
  from public.targets t
  group by t.assigned_to, t.quarter, coalesce(t.parent_category, t.category)
)
select
  coalesce(a.staff_id, q.staff_id)   as staff_id,
  coalesce(a.quarter, q.quarter)     as quarter,
  coalesce(a.family_key, q.family_key) as family_key,
  coalesce(a.allocated_qty, 0)       as allocated_qty,
  coalesce(q.quota_qty, 0)           as quota_qty,
  coalesce(a.allocated_qty, 0) > coalesce(q.quota_qty, 0) as vuot_target
from allocated a
full outer join quota q
  on q.staff_id = a.staff_id
 and q.quarter = a.quarter
 and q.family_key = a.family_key;

-- Kiem tra nhanh sau khi tao (Egan tu chay):
-- select * from public.v_customer_target_allocation where vuot_target order by staff_id, quarter;


-- ── 3. RLS cho customer_targets ─────────────────────────────────────
-- Quyen theo KHACH HANG dang phu trach (customer_assignments.sales_id),
-- KHONG theo nguoi tao dong (created_by chi la field luu vet).
alter table public.customer_targets enable row level security;

drop policy if exists "admin_all_customer_targets" on public.customer_targets;
drop policy if exists "staff_select_own_customer_targets" on public.customer_targets;
drop policy if exists "staff_insert_own_customer_targets" on public.customer_targets;
drop policy if exists "staff_update_own_customer_targets" on public.customer_targets;
drop policy if exists "staff_delete_own_customer_targets" on public.customer_targets;

create policy "admin_all_customer_targets" on public.customer_targets
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "staff_select_own_customer_targets" on public.customer_targets
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
    and customer_id in (select customer_id from public.customer_assignments where sales_id = auth.uid())
  );

create policy "staff_insert_own_customer_targets" on public.customer_targets
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active')
    and customer_id in (select customer_id from public.customer_assignments where sales_id = auth.uid())
  );

create policy "staff_update_own_customer_targets" on public.customer_targets
  for update using (
    customer_id in (select customer_id from public.customer_assignments where sales_id = auth.uid())
  ) with check (
    customer_id in (select customer_id from public.customer_assignments where sales_id = auth.uid())
  );

create policy "staff_delete_own_customer_targets" on public.customer_targets
  for delete using (
    customer_id in (select customer_id from public.customer_assignments where sales_id = auth.uid())
  );


-- =====================================================================
-- HET FILE
-- =====================================================================
