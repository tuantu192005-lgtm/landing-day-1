-- =====================================================================
-- KIEM TRA (chi doc, KHONG thay doi gi). Chay tung khoi trong SQL Editor.
-- Muc dich: soat toan bo policy + ham de tim 2 loai van de:
--   (a) Cho nao con dung user_id = auth.uid()  -> SE KHONG BAO GIO KHOP
--       vi cot user_id dang trong het.
--   (b) Policy TREN profiles ma tu doc lai profiles KHONG qua ham
--       SECURITY DEFINER -> nguy co lap vo han (giong loi vua gap).
-- =====================================================================


-- ── 1. TAT CA policy cua moi bang trong schema public ──────────────
select schemaname, tablename, policyname, permissive, cmd,
       qual        as "using_expr",
       with_check  as "check_expr"
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ── 2. (a) Policy con dung user_id (nghi ngo chet quyen) ───────────
select tablename, policyname, cmd, qual as "using_expr", with_check as "check_expr"
from pg_policies
where schemaname = 'public'
  and (coalesce(qual,'') ilike '%user_id%' or coalesce(with_check,'') ilike '%user_id%')
order by tablename, policyname;
--   => Ly tuong: KHONG con dong nao (ngoai ham la_admin/team_lead_cua_toi
--      la cach dung dung vi chung ktra CA id LAN user_id). Neu co policy
--      nao chi dung user_id = auth.uid() -> can sua sang id (xem muc 6).


-- ── 3. (b) Policy co nhac den bang profiles trong than ─────────────
-- Neu dong nao co tablename = 'profiles' VA than (using/check) chua mot
-- cau "from profiles" TRUC TIEP (khong phai goi ham la_admin() /
-- team_lead_cua_toi() / co_quyen_kho_ai()) -> do la nguy co lap vo han.
select tablename, policyname, cmd, qual as "using_expr", with_check as "check_expr"
from pg_policies
where schemaname = 'public'
  and (coalesce(qual,'') ilike '%profiles%' or coalesce(with_check,'') ilike '%profiles%')
order by tablename, policyname;


-- ── 4. TAT CA ham trong public + co phai SECURITY DEFINER khong ────
select p.proname                              as ham,
       p.prosecdef                            as security_definer,
       pg_get_function_identity_arguments(p.oid) as tham_so
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;


-- ── 5. Ham nao co nhac den user_id (de ra soat tay) ────────────────
select p.proname as ham, p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) as dinh_nghia
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and pg_get_functiondef(p.oid) ilike '%user_id%'
order by p.proname;


-- ── 6. Rieng ham co_quyen_kho_ai() (trang kho-ai goi) ──────────────
-- Can xem: dung id = auth.uid() (DUNG) hay user_id = auth.uid() (SAI, se
-- chet quyen). Ban v17 goc dung id = auth.uid() nen DUNG; chay de xac nhan
-- lai sau cac lan sua tay:
select pg_get_functiondef('public.co_quyen_kho_ai()'::regprocedure) as co_quyen_kho_ai;
-- Ky vong: co "id = auth.uid()" va "kho_ai_access.profile_id = auth.uid()",
-- KHONG co "user_id". La SECURITY DEFINER nen khong gay lap du co doc profiles.


-- =====================================================================
-- NEU MUC 2 RA MOT POLICY CHI DUNG user_id = auth.uid() -> MAU SUA:
-- (vi du policy ten X tren bang Y, truoc dung "user_id = auth.uid()")
--   -- Cach 1 (an toan ca 2 chieu, giong la_admin): doi thanh
--   --   (id = auth.uid() or user_id = auth.uid())
--   -- Cach 2 (neu bang Y co cot id = auth.uid() truc tiep): dung id = auth.uid()
-- KHONG tu chay — bao anh ket qua muc 2/3 truoc roi moi sua dung cho.
-- =====================================================================
