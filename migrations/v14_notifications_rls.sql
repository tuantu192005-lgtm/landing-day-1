-- =====================================================================
-- MIGRATION v14: RLS cho bang notifications
--
-- Phat hien khi lam chuong thong bao: notifications dang bat RLS nhung
-- KHONG co policy nao -- chan tuot:
--   1. INSERT tu trigger notify_on_submit()/notify_on_approval() (2 ham
--      nay khong khai bao SECURITY DEFINER nen chay voi quyen nguoi dang
--      thao tac, khong phai recipient) -- co the dang lam nut "Gui duyet"
--      / duyet / tu choi bi loi RLS ngay ca khi khong lien quan gi den
--      chuong CK.
--   2. SELECT/UPDATE tu chinh chu nhan thong bao (da test that: tam@
--      khong doc duoc thong bao cua chinh minh).
--
-- Chay trong Supabase SQL Editor, tung khoi mot.
-- =====================================================================

alter table notifications enable row level security;

-- Nguoi dang nhap chi doc duoc thong bao cua chinh minh
create policy own_notifications_select on notifications for select
using (recipient_id = auth.uid());

-- Nguoi dang nhap chi duoc danh dau da doc thong bao cua chinh minh,
-- khong doi duoc sang recipient_id khac
create policy own_notifications_update on notifications for update
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

-- Trigger insert notification chay voi quyen nguoi dang thao tac (nguoi
-- gui duyet / nguoi duyet), KHONG PHAI recipient -- vi vay phai cho phep
-- bat ky user active nao insert. An toan vi frontend khong bao gio goi
-- insert truc tiep vao notifications, chi trigger DB lam viec nay.
create policy authenticated_insert_notifications on notifications for insert
with check (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.status = 'active'
  )
);

-- =====================================================================
-- HET FILE — sau khi chay xong, test lai:
--   1. Sales bam "Gui duyet" mot chuong trinh CK -> khong con loi RLS,
--      Nam nhan duoc thong bao (chuong o header co so do).
--   2. Nam duyet/tu choi -> sales nhan duoc thong bao tuong ung.
-- =====================================================================
