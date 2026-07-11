-- =====================================================================
-- MIGRATION v13: product_programs.disty text -> text[] (chon nhieu NPP)
-- Ly do: 1 chuong trinh CK cho 1 khach hang co the ap dung cho nhieu NPP
-- cung luc (vi du VTCom duoc CK nay du mua qua SPC, KTC hay DGW), Hero/
-- Extra 1-4 luon giong nhau bat ke NPP nao, khong can tach nhieu dong.
--
-- AN TOAN: bang product_programs hien dang co 0 dong (da xac nhan qua
-- service key truoc khi viet migration nay) -- khong co du lieu cu can
-- convert, USING clause duoi day chi de dung neu sau nay bang co du lieu.
-- =====================================================================

alter table product_programs
  alter column disty type text[]
  using case when disty is null or disty = '' then null else array[disty] end;

-- =====================================================================
-- HET FILE
-- =====================================================================
