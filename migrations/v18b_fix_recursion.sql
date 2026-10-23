-- =====================================================================
-- MIGRATION v18b: SUA LOI "infinite recursion detected in policy for
-- relation profiles" sau khi chay v18.
--
-- ⚠️  FILE NAY CHI DE LUU LAI DUNG NHUNG GI DA CHAY TAY TREN SUPABASE.
--     KHONG CAN CHAY LAI (database hien tai da o dung trang thai nay).
--     Neu chay lai cung an toan (create or replace / drop if exists).
--
-- Boi canh:
--   - Sau khi chay v18, moi tai khoan khong dang nhap duoc, bao loi
--     "infinite recursion detected in policy for relation profiles".
--   - Nguyen nhan: 2 policy CU tren profiles (admin_all, lead_own_team)
--     tu chay SELECT lai chinh bang profiles ngay trong than policy ->
--     policy goi lai chinh no -> lap vo han.
--   - Phat hien them: cot profiles.user_id DANG TRONG HET. He thong nhan
--     dien nguoi dung bang cot id (= auth.uid()). Hai policy cu dung
--     p.user_id = auth.uid() nen von KHONG BAO GIO khop (= chet quyen).
--
-- Cach sua (da chay): chuyen phan "tu doc profiles" vao HAM SECURITY
-- DEFINER. Than ham SECURITY DEFINER KHONG bi ap RLS cua bang profiles
-- nua -> cat duoc vong lap. Ham van kiem tra ca id LAN user_id de phong
-- sau nay user_id co du lieu (yeu cau: KHONG doi cach nhan dien, KHONG
-- xoa cot user_id).
-- =====================================================================


-- ── 1. Ham kiem tra admin (SECURITY DEFINER -> khong gay lap) ───────
create or replace function public.la_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where (id = auth.uid() or user_id = auth.uid())
      and role = 'admin'
      and status = 'active'
  );
$$;

revoke all on function public.la_admin() from public;
grant execute on function public.la_admin() to authenticated;


-- ── 2. Ham lay team ma nguoi dang nhap lam lead (SECURITY DEFINER) ──
create or replace function public.team_lead_cua_toi()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select team from public.profiles
  where (id = auth.uid() or user_id = auth.uid())
    and role = 'lead'
    and status = 'active'
  limit 1;
$$;

revoke all on function public.team_lead_cua_toi() from public;
grant execute on function public.team_lead_cua_toi() to authenticated;


-- ── 3. Viet lai 2 policy cu, goi HAM thay vi tu doc profiles ────────
alter table public.profiles enable row level security;

drop policy if exists admin_all on public.profiles;
create policy admin_all on public.profiles
  for all
  using      (public.la_admin())
  with check (public.la_admin());

drop policy if exists lead_own_team on public.profiles;
create policy lead_own_team on public.profiles
  for select
  using (team = public.team_lead_cua_toi());


-- ── 4. 3 policy restrictive cua v18 van giu nguyen ──────────────────
-- (tech_hide_select / tech_block_update / tech_block_delete — dieu kien
--  is_technical = false or id = auth.uid(). KHONG tu doc lai profiles,
--  chi doc cot cua chinh dong dang xet nen KHONG gay lap.)
-- Ghi lai o day cho du, chay lai cung vo hai:
drop policy if exists "tech_hide_select" on public.profiles;
create policy "tech_hide_select" on public.profiles
  as restrictive for select
  using ( is_technical = false or id = auth.uid() );

drop policy if exists "tech_block_update" on public.profiles;
create policy "tech_block_update" on public.profiles
  as restrictive for update
  using      ( is_technical = false or id = auth.uid() )
  with check ( is_technical = false or id = auth.uid() );

drop policy if exists "tech_block_delete" on public.profiles;
create policy "tech_block_delete" on public.profiles
  as restrictive for delete
  using ( is_technical = false or id = auth.uid() );


-- =====================================================================
-- KIEM TRA SAU KHI CHAY (da xac nhan tay):
-- =====================================================================
-- - Nam dang nhap duoc, la admin, thay 5 tai khoan, KHONG thay
--   tuantu192005@gmail.com.
-- - Kiem tra nhanh:
--   select proname, prosecdef from pg_proc
--   where proname in ('la_admin','team_lead_cua_toi') and pronamespace='public'::regnamespace;
--     => prosecdef = true (SECURITY DEFINER) ca 2.
--   select policyname, permissive, cmd from pg_policies
--   where schemaname='public' and tablename='profiles' order by policyname;
--
-- LUU Y: ham van ktra (id = auth.uid() OR user_id = auth.uid()) -> hom nay
-- user_id trong nen chi nhanh id khop; khong doi cach nhan dien, khong
-- xoa cot user_id (dung yeu cau).
-- =====================================================================
-- HET FILE
-- =====================================================================
