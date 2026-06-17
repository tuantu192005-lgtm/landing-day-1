-- ============================================================
-- Supabase setup — MSI Landing Day 1
-- Chạy trong Supabase SQL Editor: https://supabase.com/dashboard
-- ============================================================

-- 1. Bảng profiles (liên kết với auth.users)
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null,
  phone       text,
  role        text not null default 'staff' check (role in ('admin', 'lead', 'staff')),
  team        text,
  status      text not null default 'pending' check (status in ('active', 'pending', 'inactive')),
  created_at  timestamptz default now()
);

-- Index để query nhanh theo user_id
create index if not exists profiles_user_id_idx on public.profiles(user_id);

-- 2. Row Level Security
alter table public.profiles enable row level security;

-- Admin xem được tất cả
create policy "admin_all" on public.profiles
  for all using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin' and p.status = 'active'
    )
  );

-- Lead xem được profile trong team mình
create policy "lead_own_team" on public.profiles
  for select using (
    team = (
      select p.team from public.profiles p
      where p.user_id = auth.uid() and p.role = 'lead' and p.status = 'active'
      limit 1
    )
  );

-- Nhân viên chỉ xem profile của chính mình
create policy "staff_own" on public.profiles
  for select using (user_id = auth.uid());

-- Cho phép insert từ anonymous (form đăng ký chưa có user_id)
create policy "anon_insert" on public.profiles
  for insert with check (user_id is null);

-- 3. Kích hoạt tài khoản: admin chạy lệnh này sau khi tạo user trong Auth
-- update public.profiles set status = 'active', user_id = '<auth-user-uuid>' where email = 'nv@example.com';
