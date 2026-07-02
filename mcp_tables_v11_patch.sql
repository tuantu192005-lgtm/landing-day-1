-- Patch v11: Thêm cột normalized_name vào products_master
-- Paste vào Supabase SQL Editor và chạy TRƯỚC khi chạy merge_duplicate_skus.js lần sau

ALTER TABLE products_master
  ADD COLUMN IF NOT EXISTS normalized_name TEXT;

UPDATE products_master
SET normalized_name = lower(trim(model_name))
WHERE normalized_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_normalized
  ON products_master(normalized_name);
