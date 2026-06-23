-- ============================================================
-- Supabase v8 — Bảng annual_targets (target năm toàn team)
-- Chạy trong SQL Editor (DDL không chạy được qua REST API):
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
-- ============================================================

create table if not exists public.annual_targets (
  id          uuid default gen_random_uuid() primary key,
  year        integer not null,
  category    text not null,
  target_qty  numeric not null default 0,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(year, category)
);

alter table public.annual_targets enable row level security;

drop policy if exists "admin_all_annual_targets" on public.annual_targets;
drop policy if exists "staff_view_annual_targets" on public.annual_targets;

create policy "admin_all_annual_targets" on public.annual_targets
  for all using (
    exists (select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active')
  )
  with check (
    exists (select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active')
  );

create policy "staff_view_annual_targets" on public.annual_targets
  for select using (
    exists (select 1 from public.profiles
    where id = auth.uid() and status = 'active')
  );
