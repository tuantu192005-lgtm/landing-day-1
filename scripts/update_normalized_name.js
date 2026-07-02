import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { normalizeModelName } from './merge_duplicate_skus.js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const PAGE = 1000;
const BATCH = 100;

async function fetchAll() {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('products_master')
      .select('sku, model_name')
      .range(from, from + PAGE - 1);
    if (error) throw new Error('Lỗi đọc products_master: ' + error.message);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function main() {
  console.log('── Đọc products_master ──');
  const rows = await fetchAll();
  console.log(`Tổng: ${rows.length} sản phẩm`);

  // Group by normalized_name để batch update hiệu quả
  const byNorm = new Map();
  for (const { sku, model_name } of rows) {
    const norm = normalizeModelName(model_name);
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push(sku);
  }

  console.log(`\n── Cập nhật normalized_name (${byNorm.size} giá trị phân biệt, batch ${BATCH}) ──`);
  let updated = 0;

  for (const [norm, skus] of byNorm) {
    for (let i = 0; i < skus.length; i += BATCH) {
      const batch = skus.slice(i, i + BATCH);
      const { error } = await sb
        .from('products_master')
        .update({ normalized_name: norm })
        .in('sku', batch);
      if (error) throw new Error(`Lỗi update (norm="${norm.slice(0, 40)}"): ` + error.message);
      updated += batch.length;
    }
    process.stdout.write('.');
  }

  console.log(`\n\n── XONG ──`);
  console.log(`Đã cập nhật: ${updated} / ${rows.length} dòng`);
}

main().catch(err => {
  console.error('\nLỗi:', err.message);
  process.exit(1);
});
