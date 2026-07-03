-- ================================================================
-- Migration v12: disty_inventory — thêm disty_code, đổi unique constraint
-- Paste toàn bộ file này vào:
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql/new
-- Chạy một lần. Idempotent (IF NOT EXISTS / IF EXISTS đều an toàn).
-- ================================================================

-- 1. Thêm cột disty_code (nullable — các row cũ chưa có giá trị)
ALTER TABLE public.disty_inventory
  ADD COLUMN IF NOT EXISTS disty_code text;

-- 2. Xóa unique constraint cũ trên (sku, disty, week_date)
--    Postgres đặt tên tự động theo pattern: <table>_<cols>_key
ALTER TABLE public.disty_inventory
  DROP CONSTRAINT IF EXISTS disty_inventory_sku_disty_week_date_key;

-- 3. Unique constraint mới trên (disty_code, disty, week_date)
--    NULLS NOT DISTINCT (PG15+): hai row (NULL, 'DGW', '2026-06-21')
--    vẫn conflict nhau → không tích lũy rác nếu disty_code thiếu.
ALTER TABLE public.disty_inventory
  ADD CONSTRAINT disty_inventory_disty_code_disty_week_date_key
  UNIQUE NULLS NOT DISTINCT (disty_code, disty, week_date);

-- 4. Index tra cứu theo disty_code
CREATE INDEX IF NOT EXISTS idx_disty_inventory_disty_code
  ON public.disty_inventory (disty_code);

-- ================================================================
-- Kiểm tra: chạy SELECT sau khi migration thành công
-- ================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'disty_inventory'
-- ORDER BY ordinal_position;
