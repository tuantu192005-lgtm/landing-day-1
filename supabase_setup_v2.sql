-- ============================================================
-- Supabase setup v2 — MSI Landing Day 1
-- Dùng khi bảng profiles đã tồn tại với cột: id, full_name, role, phone, created_at
-- Chạy trong Supabase SQL Editor: https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
-- ============================================================

-- 1. Thêm các cột còn thiếu vào bảng profiles đã có
alter table public.profiles
  add column if not exists user_id  uuid references auth.users(id) on delete cascade,
  add column if not exists email    text,
  add column if not exists team     text,
  add column if not exists status   text not null default 'pending';

-- Ràng buộc status (thêm sau vì ADD COLUMN IF NOT EXISTS không nhận CHECK inline trên PG cũ)
alter table public.profiles
  drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check check (status in ('active', 'pending', 'inactive'));

-- Ràng buộc role (phòng khi chưa có)
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'lead', 'staff'));

-- 2. Index để query nhanh theo user_id
create index if not exists profiles_user_id_idx on public.profiles(user_id);

-- 3. Row Level Security
alter table public.profiles enable row level security;

-- Xóa policy cũ nếu có (tránh xung đột khi chạy lại)
drop policy if exists "admin_all"      on public.profiles;
drop policy if exists "lead_own_team"  on public.profiles;
drop policy if exists "staff_own"      on public.profiles;
drop policy if exists "anon_insert"    on public.profiles;

-- Admin xem/sửa được tất cả
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

-- ============================================================
-- 4. Kích hoạt tài khoản sau khi admin tạo user trong Auth
--    Vào Auth > Users → copy UUID → chạy lệnh dưới:
--
-- update public.profiles
--   set status = 'active', user_id = '<uuid-từ-auth-users>'
--   where email = 'nhanvien@example.com';
-- ============================================================
