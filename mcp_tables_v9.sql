-- ============================================================
-- Supabase v9 — Bảng annual_staff_targets (phân bổ target năm
-- toàn team xuống từng nhân viên, theo hạng mục)
-- Chạy trong SQL Editor (DDL không chạy được qua REST API):
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
-- ============================================================

create table if not exists public.annual_staff_targets (
  id          uuid default gen_random_uuid() primary key,
  year        integer not null,
  category    text not null,
  assigned_to uuid references public.profiles(id),
  target_qty  numeric not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(year, category, assigned_to)
);

alter table public.annual_staff_targets enable row level security;

drop policy if exists "admin_all" on public.annual_staff_targets;
drop policy if exists "staff_view_own" on public.annual_staff_targets;

create policy "admin_all" on public.annual_staff_targets
  for all using (
    exists (select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active')
  )
  with check (
    exists (select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "staff_view_own" on public.annual_staff_targets
  for select using (assigned_to = auth.uid());
