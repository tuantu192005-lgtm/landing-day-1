-- ============================================================
-- Supabase v10 — Bảng category_ratios (tỉ lệ K phân bổ hạng mục
-- con theo năm) + migrate y2023_avg hiện có vào bảng này
-- Chạy trong SQL Editor (DDL không chạy được qua REST API):
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
-- ============================================================

create table public.category_ratios (
  id uuid default gen_random_uuid() primary key,
  year integer not null,
  category text not null,
  ratio numeric not null default 1,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(year, category)
);

alter table public.category_ratios enable row level security;

create policy "admin_all" on public.category_ratios
  for all using (
    exists (select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active')
  )
  with check (
    exists (select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "staff_view" on public.category_ratios
  for select using (
    exists (select 1 from public.profiles
    where id = auth.uid() and status = 'active')
  );

-- Migrate data y2023_avg hiện có vào category_ratios năm 2024:
insert into category_ratios (year, category, ratio)
select distinct 2024, category, coalesce(y2023_avg, 1)
from targets
where y2023_avg is not null and y2023_avg != 1
  and parent_category is not null  -- chỉ lấy hạng mục con có K ≠ 1
union
-- Thêm K cho hạng mục cha có K ≠ 1 (CND-MB=0.735, CND-GMNT=0.894, GNP-VGA GT=0.17)
select distinct 2024, category, coalesce(y2023_avg, 1)
from targets
where y2023_avg is not null and y2023_avg != 1
  and parent_category is null
on conflict (year, category) do nothing;
