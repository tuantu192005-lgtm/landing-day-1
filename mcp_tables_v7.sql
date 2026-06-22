-- ============================================================
-- Supabase v7 — Thêm cột invoice_number cho sellout_data
-- Chạy trong SQL Editor (DDL không chạy được qua REST API):
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
-- ============================================================

-- Cột nullable — file Excel hiện tại CHƯA có cột Invoice/Số HĐ, nên để
-- trống được. Khi file Excel có cột Invoice/Số HĐ thì code (index.html)
-- sẽ tự map giá trị đó vào đây lúc import.
alter table public.sellout_data add column if not exists invoice_number text;

-- CHƯA bật unique constraint vội (vì invoice_number còn rỗng/không bắt buộc
-- ở giai đoạn này). Sau khi file Excel có cột Invoice ổn định và admin đã
-- import lại đầy đủ kèm invoice_number cho mọi dòng, bật dòng dưới đây để
-- Postgres tự chặn trùng theo (assigned_to, invoice_number) ở tầng DB,
-- không cần dò trùng bằng tay trong code nữa:
--
-- create unique index if not exists sellout_data_assigned_invoice_uniq
--   on public.sellout_data (assigned_to, invoice_number)
--   where invoice_number is not null;
