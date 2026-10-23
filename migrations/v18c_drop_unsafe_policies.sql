-- =====================================================================
-- MIGRATION v18c: GO BO 2 policy khong an toan tren public.profiles.
--
-- ⚠️  FILE NAY CHI DE LUU LAI DUNG NHUNG GI DA CHAY TAY TREN SUPABASE.
--     KHONG CAN CHAY LAI (database hien tai da go 2 policy nay roi).
--
-- Da go (chay tay):
--   drop policy anon_insert      on public.profiles;
--   drop policy link_own_profile on public.profiles;
--
-- Vi sao go (lo hong):
--   - anon_insert: cho phep INSERT vao profiles ca khi CHUA dang nhap
--     (role anon) -> nguoi la co the tu them tai khoan/ho so.
--   - link_own_profile: cho phep nguoi dung tu GHI dong profiles cua minh
--     dua tren user_id = auth.uid(). Nhung user_id DANG TRONG HET nen dieu
--     kien so khop sai cach -> nhan vien co the tu sua dong cua minh, ke ca
--     doi role thanh 'admin' (leo thang quyen).
--
-- Sau khi go: tao tai khoan van chay dung qua endpoint
--   functions/api/manage-account.js (dung SERVICE ROLE KEY, bypass RLS),
--   nen KHONG can policy insert cho client. Doi ten/email/mat khau cung di
--   qua endpoint do. => Go 2 policy nay khong lam hong luong tao/sua tai
--   khoan hien tai.
-- =====================================================================


-- ── Da chay (ghi lai) ──────────────────────────────────────────────
drop policy if exists anon_insert      on public.profiles;
drop policy if exists link_own_profile on public.profiles;


-- =====================================================================
-- KIEM TRA SAU KHI GO (chi doc):
-- =====================================================================
-- select policyname, permissive, cmd, roles
-- from pg_policies
-- where schemaname = 'public' and tablename = 'profiles'
-- order by policyname;
--   => KHONG con 'anon_insert' va 'link_own_profile' trong danh sach.
--   => Con lai: admin_all, lead_own_team (qua ham SECURITY DEFINER o v18b),
--      va 3 policy restrictive tech_* (v18). Cac tai khoan van dang nhap
--      binh thuong; tao tai khoan moi van chay qua manage-account.js.


-- =====================================================================
-- KHOI PHUC (CHI KHI THAT SU CAN — DUONG NHIEN SE MO LAI LO HONG).
-- Hai policy nay von KHONG an toan; chi de lai day phong truong hop can
-- doi chieu. Dinh nghia goc CHINH XAC nen lay lai tu lich su/backup cua
-- Supabase (duoi day la dang gan dung theo mo ta, HAY KIEM TRA LAI truoc
-- khi dung). KHUYEN NGHI: khong khoi phuc; neu can client tu doc/sua ho so
-- cua minh thi viet policy moi dua tren id = auth.uid() (KHONG dung user_id
-- dang trong), va TUYET DOI khong cho client ghi cot role/status.
--
-- -- anon_insert (go roi — KHONG nen mo lai):
-- -- create policy anon_insert on public.profiles
-- --   for insert to anon
-- --   with check (true);
--
-- -- link_own_profile (go roi — KHONG nen mo lai nguyen trang):
-- -- create policy link_own_profile on public.profiles
-- --   for update to authenticated
-- --   using      (user_id = auth.uid())
-- --   with check (user_id = auth.uid());
-- --
-- -- Neu that su can cho nguoi dung tu sua ho so cua CHINH minh (an toan hon),
-- -- nen theo huong nay thay vi khoi phuc ban cu:
-- --   create policy self_update_profile on public.profiles
-- --     for update to authenticated
-- --     using      (id = auth.uid())
-- --     with check (id = auth.uid());
-- --   -- va chan ghi role/status bang trigger/kiem tra rieng, vi RLS khong
-- --   -- chan duoc viec sua tung cot cu the.
-- =====================================================================
-- HET FILE
-- =====================================================================
