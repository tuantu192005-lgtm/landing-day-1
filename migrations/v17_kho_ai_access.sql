-- =====================================================================
-- MIGRATION v17: quyen xem "Kho tai lieu AI" (kho-ai, subdomain rieng,
-- dung chung Supabase nay, CHI DOC).
--
-- Xac nhan truoc khi viet (qua du lieu + code that, khong doan):
--   - profiles.id = auth.uid() (khong phai profiles.user_id -- cot nay la
--     tan du cu, index.html/manage-account.js deu doc/so sanh bang "id").
--   - Cach xac dinh "Nam" dang dung trong toan bo code (index.html,
--     functions/api/manage-account.js) la so sanh dung UUID co dinh
--     NAM_PROFILE_ID = '9158c797-c667-478f-92a7-4f5ac658c6d5', KHONG dung
--     role='admin' chung -- vi profiles dang co 2 tai khoan role='admin'
--     (Nam va Nguyen Van Tu), nhung man Quan ly tai khoan hien tai CHI
--     cho Nam dung. Dung dung lai UUID nay, khong tu dat cach moi.
--   - Policy "admin_all" cu tren public.profiles dung p.user_id = auth.uid(),
--     la co che cu (co the khong con dong bo voi id/auth.uid() hien tai).
--     De khong le thuoc vao policy cu nay, bang va ham moi o day tu kiem
--     tra quyen rieng, khong dua vao RLS cua bang profiles.
-- =====================================================================


-- ── 1. Bang kho_ai_access ────────────────────────────────────────────
-- 1 dong / 1 profile. Dung bang rieng (khong them cot vao profiles) vi
-- policy "admin_all" tren profiles cho MOI role='admin' ghi duoc moi dong
-- profiles -- neu luu bang cot trong profiles thi Tu (cung role='admin')
-- se tu sua duoc qua Supabase, sai yeu cau "chi Nam cap/thu hoi". Tach
-- bang rieng de dat RLS rieng, chi Nam moi UPDATE/INSERT duoc.
create table if not exists public.kho_ai_access (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  has_access  boolean not null default false,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);

-- Backfill: moi tai khoan dang co deu mac dinh CHUA co quyen.
insert into public.kho_ai_access (profile_id, has_access)
select id, false from public.profiles
on conflict (profile_id) do nothing;


-- ── 2. Trigger: tai khoan moi tao -> mac dinh CHUA co quyen ─────────
-- manage-account.js tao profile qua service role (bypass RLS), nen
-- trigger phai la SECURITY DEFINER de luon insert duoc, khong phu thuoc
-- quyen cua nguoi/role dang goi insert vao profiles.
create or replace function public.trg_kho_ai_access_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.kho_ai_access (profile_id, has_access)
  values (new.id, false)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists kho_ai_access_new_profile on public.profiles;
create trigger kho_ai_access_new_profile
  after insert on public.profiles
  for each row execute function public.trg_kho_ai_access_new_profile();


-- ── 3. RLS cho kho_ai_access ─────────────────────────────────────────
alter table public.kho_ai_access enable row level security;

drop policy if exists "self_select_kho_ai_access" on public.kho_ai_access;
drop policy if exists "nam_manage_kho_ai_access" on public.kho_ai_access;

-- Ai cung doc duoc dong cua chinh minh.
create policy "self_select_kho_ai_access" on public.kho_ai_access
  for select using (profile_id = auth.uid());

-- Chi Nam (dung UUID co dinh, giong het cach index.html / manage-account.js
-- dang xac dinh Nam) duoc doc toan bo + cap/thu hoi.
create policy "nam_manage_kho_ai_access" on public.kho_ai_access
  for all using (
    auth.uid() = '9158c797-c667-478f-92a7-4f5ac658c6d5'::uuid
  ) with check (
    auth.uid() = '9158c797-c667-478f-92a7-4f5ac658c6d5'::uuid
  );


-- ── 4. Ham co_quyen_kho_ai() -- trang kho-ai se goi ham nay ─────────
-- Admin (role='admin', status='active') mac dinh luon co quyen, khong
-- can bang. SECURITY DEFINER de ham tu kiem tra duoc ca 2 bang
-- (profiles + kho_ai_access) ma khong le thuoc RLS/policy cu cua
-- profiles (xem phan xac nhan o dau file).
create or replace function public.co_quyen_kho_ai()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and status = 'active'
    )
    or coalesce(
      (select has_access from public.kho_ai_access where profile_id = auth.uid()),
      false
    );
$$;

revoke all on function public.co_quyen_kho_ai() from public;
grant execute on function public.co_quyen_kho_ai() to authenticated;


-- =====================================================================
-- KIEM TRA SAU KHI CHAY (Nam tu chay, dang nhap bang tai khoan tuong ung
-- de test dung RLS theo tung vai):
-- =====================================================================

-- A. Dem so dong (phai bang so dong trong profiles, vi da backfill):
-- select count(*) from public.profiles;
-- select count(*) from public.kho_ai_access;

-- B. Xem lai policy vua tao:
-- select policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'kho_ai_access';

-- C. Thu goi ham (chay trong SQL Editor se la role postgres/service, khong
-- co auth.uid() -- de test dung theo tung tai khoan phai goi tu frontend
-- sau khi dang nhap, hoac dung Supabase SQL Editor "Run as" neu co):
-- select public.co_quyen_kho_ai();

-- D. Xem nhanh toan bo trang thai quyen (chi Nam doc duoc het nho RLS):
-- select p.full_name, p.role, p.status, k.has_access, k.updated_at
-- from public.profiles p
-- left join public.kho_ai_access k on k.profile_id = p.id
-- order by p.full_name;

-- =====================================================================
-- HET FILE
-- =====================================================================
