-- =====================================================================
-- MIGRATION v18: An tai khoan ky thuat tuantu192005@gmail.com (Nguyen Van
-- Tu) khoi moi tai khoan khac, CHAN PHIA MAY CHU (RLS).
--
-- Da kiem tra truoc khi viet (xem file v18_check_before.sql + doc code that
-- trong index.html / functions/api/manage-account.js):
--   - Chi co 1 cho doc danh sach tai khoan tu DB: tab "Quan ly tai khoan"
--     (index.html ~dong 8798), va tab nay von CHI Nam thay. Moi o chon nhan
--     vien khac (ban giao KH, target, export CK) dung mang CO DINH EMPLOYEES
--     trong index.html -> von KHONG he co tai khoan ky thuat nay.
--   - KHONG cho nao join/embed profiles de lay ten; created_by/updated_by
--     chi duoc GHI, khong doc nguoc ra ten. => An dong profiles cua tai
--     khoan nay KHONG lam hong du lieu no tao, lich su, hay thong bao.
--   - tu@msivn.io.vn la email KHAC -> khong bi anh huong.
--
-- Cach chan: danh dau 1 cot is_technical cho dung tai khoan nay (theo
-- EMAIL), roi them policy RLS kieu RESTRICTIVE. Policy restrictive la "cong
-- AND" voi moi policy san co: dong ky thuat chi chinh no moi thay/sua/xoa
-- duoc; moi dong khac giu nguyen nhu cu, khong doi gi.
--
-- LUU Y: service role (ham functions/api/manage-account.js) BO QUA RLS ->
-- RLS mot minh khong chan duoc sua qua endpoint do. Vi vay con them 1 chot
-- o chinh file manage-account.js (chan sua/xoa tai khoan is_technical, tru
-- chinh no). Hai lop nay di cung nhau.
-- =====================================================================


-- ── 1. Them cot danh dau "tai khoan ky thuat" ───────────────────────
alter table public.profiles
  add column if not exists is_technical boolean not null default false;

-- Dat dau theo EMAIL (khong theo ten). Chi dung 1 tai khoan nay.
update public.profiles set is_technical = true
  where email = 'tuantu192005@gmail.com';

-- An toan: moi email khac phai la false (tranh dau nham dong nao do).
update public.profiles set is_technical = false
  where email is distinct from 'tuantu192005@gmail.com' and is_technical = true;


-- ── 2. (Yeu cau #2) Dam bao tai khoan ky thuat la admin dang hoat dong ─
-- Chi dong vao dung 1 dong theo email. Neu da dung thi update nay vo hai.
update public.profiles
  set role = 'admin', status = 'active'
  where email = 'tuantu192005@gmail.com';


-- ── 3. RLS restrictive: an + khoa dong tai khoan ky thuat ───────────
alter table public.profiles enable row level security;

-- SELECT: moi nguoi KHONG thay dong ky thuat, tru chinh no.
drop policy if exists "tech_hide_select" on public.profiles;
create policy "tech_hide_select" on public.profiles
  as restrictive for select
  using ( is_technical = false or id = auth.uid() );

-- UPDATE: khong ai sua duoc dong ky thuat (doi ten/email/vai tro/trang
-- thai...), tru chinh no. with_check chan ca viec gan is_technical sang
-- dong khac.
drop policy if exists "tech_block_update" on public.profiles;
create policy "tech_block_update" on public.profiles
  as restrictive for update
  using      ( is_technical = false or id = auth.uid() )
  with check ( is_technical = false or id = auth.uid() );

-- DELETE: khong ai xoa duoc dong ky thuat, tru chinh no.
drop policy if exists "tech_block_delete" on public.profiles;
create policy "tech_block_delete" on public.profiles
  as restrictive for delete
  using ( is_technical = false or id = auth.uid() );


-- =====================================================================
-- KIEM TRA SAU KHI CHAY (chay trong SQL Editor):
-- =====================================================================

-- 1) Dung 1 dong duoc dau ky thuat, va dung tai khoan can an:
-- select email, role, status, is_technical
-- from public.profiles where is_technical = true;
--   => phai chi ra 1 dong: tuantu192005@gmail.com / admin / active / true

-- 2) tu@msivn.io.vn KHONG bi dau (van hien binh thuong):
-- select email, is_technical from public.profiles where email = 'tu@msivn.io.vn';
--   => is_technical = false

-- 3) 3 policy moi da ton tai:
-- select policyname, permissive, cmd from pg_policies
-- where schemaname='public' and tablename='profiles'
--   and policyname in ('tech_hide_select','tech_block_update','tech_block_delete');

-- LUU Y: SQL Editor chay bang quyen postgres/service -> BO QUA RLS, nen o
-- day van thay het moi dong. Muon kiem tra dung viec "an", phai test tu app
-- sau khi dang nhap bang tung tai khoan (xem huong dan test kem theo).

-- =====================================================================
-- HET FILE
-- =====================================================================
