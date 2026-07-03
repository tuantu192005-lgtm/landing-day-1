// Remap sku=NULL trong disty_inventory dựa vào disty_code → product_disty_codes.
// Chạy bất cứ lúc nào sau khi import Excel xong hoặc sau khi admin map thêm mã.
// node scripts/remap_disty_inventory_sku.js

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SERVICE_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // 1. Đếm tổng null-sku trước
  const { count: totalNull } = await sb
    .from('disty_inventory').select('*', { count: 'exact', head: true }).is('sku', null);
  console.log(`\ndisty_inventory: ${totalNull} dòng sku=null cần remap`);
  if (!totalNull) { console.log('Không có gì cần remap.'); return; }

  // 2. Load toàn bộ mapping từ product_disty_codes
  const { data: codeMap, error: codeErr } = await sb
    .from('product_disty_codes').select('disty, disty_code, sku').not('sku', 'is', null);
  if (codeErr) throw new Error('Lỗi đọc product_disty_codes: ' + codeErr.message);
  const lookup = new Map(codeMap.map(r => [`${r.disty}:${r.disty_code}`, r.sku]));
  console.log(`product_disty_codes: ${lookup.size} mã đã có sku`);

  // 3. Lấy tất cả dòng null-sku trong disty_inventory (có disty_code)
  const nullRows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('disty_inventory')
      .select('id, disty, disty_code').is('sku', null).not('disty_code', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error('Lỗi đọc disty_inventory: ' + error.message);
    if (!data?.length) break;
    nullRows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`  → ${nullRows.length} dòng có disty_code (có thể remap)`);

  const noCode = (totalNull || 0) - nullRows.length;
  if (noCode > 0) console.log(`  → ${noCode} dòng không có disty_code (không thể remap, cần xem lại)`);

  // 4. Remap theo batch
  let mapped = 0, notFound = 0;
  const notFoundSample = [];

  for (const row of nullRows) {
    const sku = lookup.get(`${row.disty}:${row.disty_code}`);
    if (!sku) {
      notFound++;
      if (notFoundSample.length < 5) notFoundSample.push(`${row.disty}:${row.disty_code}`);
      continue;
    }
    const { error } = await sb.from('disty_inventory').update({ sku }).eq('id', row.id);
    if (error) {
      console.error(`  Lỗi update ${row.id}: ${error.message}`);
    } else {
      mapped++;
    }
  }

  // 5. Báo kết quả
  console.log('\n=== Kết quả remap ===');
  console.log(`✓ Đã map được: ${mapped} dòng`);
  console.log(`✗ Không tìm thấy mã: ${notFound} dòng`);
  if (notFound > 0 && notFoundSample.length) {
    console.log(`  Mẫu không tìm thấy:`, notFoundSample);
  }
  if (noCode > 0) {
    console.log(`⚠ ${noCode} dòng thiếu disty_code — cần import lại để điền cột này.`);
  }

  const { count: remaining } = await sb
    .from('disty_inventory').select('*', { count: 'exact', head: true }).is('sku', null);
  console.log(`\n→ disty_inventory còn ${remaining} dòng sku=null sau remap.`);
}

main().catch(console.error);
