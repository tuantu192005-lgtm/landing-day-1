import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const BATCH = 400;

const LAPTOP_PATTERNS_LC = ['laptop', 'máy tính xách tay', 'notebook', 'xách tay'];
function isLaptopName(name) {
  const n = (name || '').toLowerCase();
  return LAPTOP_PATTERNS_LC.some(p => n.includes(p));
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function fetchAllUnmapped() {
  const PAGE = 1000;
  const allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('product_disty_codes')
      .select('id, disty, disty_code, disty_name')
      .is('sku', null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error('Lỗi đọc product_disty_codes: ' + error.message);
    if (!data || !data.length) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allRows;
}

async function main() {
  console.log('── Đọc product_disty_codes chưa map (sku IS NULL) ──');

  const unmapped = await fetchAllUnmapped();

  if (!unmapped.length) {
    console.log('Không có dòng nào chưa map sku — không cần sync.');
    return;
  }

  const validRows = unmapped.filter(r => r.disty_code && !isLaptopName(r.disty_name));
  const laptopSkipped = unmapped.filter(r => r.disty_code && isLaptopName(r.disty_name)).length;
  console.log(`Tìm thấy ${unmapped.length} dòng chưa map (${validRows.length} hợp lệ, bỏ qua ${laptopSkipped} Laptop).`);

  // Dedupe theo disty_code để tránh conflict "ON CONFLICT DO UPDATE ... affect row twice"
  const deduped = new Map();
  for (const r of validRows) {
    if (!deduped.has(r.disty_code)) deduped.set(r.disty_code, r);
  }

  const masterRows = [...deduped.values()].map(r => ({
    sku: String(r.disty_code).trim(),
    model_name: (r.disty_name || '').trim() || String(r.disty_code).trim(),
    lob: 'Unknown',
    sdp_price: 0,
    is_active: true
  }));

  console.log(`\n── Upsert ${masterRows.length} SKU tạm vào products_master (bỏ qua nếu đã có) ──`);

  for (const ch of chunk(masterRows, BATCH)) {
    // ignoreDuplicates: true → ON CONFLICT DO NOTHING — không ghi đè SKU admin đã tạo thật.
    const { error } = await sb.from('products_master').upsert(ch, { onConflict: 'sku', ignoreDuplicates: true });
    if (error) throw new Error('Lỗi upsert products_master: ' + error.message);
    process.stdout.write('.');
  }
  console.log(` done.`);

  // Cập nhật product_disty_codes: gán sku tạm = disty_code cho từng dòng chưa map.
  // Dùng upsert theo (disty, disty_code) để batch cả mảng trong 1 lần gọi.
  console.log(`\n── Cập nhật ${validRows.length} dòng product_disty_codes (gán sku tạm) ──`);

  const codeUpdateRows = validRows.map(r => ({
    id: r.id,
    disty: r.disty,
    disty_code: r.disty_code,
    disty_name: r.disty_name,
    sku: String(r.disty_code).trim()
  }));

  for (const ch of chunk(codeUpdateRows, BATCH)) {
    const { error } = await sb.from('product_disty_codes').upsert(ch, { onConflict: 'disty,disty_code' });
    if (error) throw new Error('Lỗi update product_disty_codes: ' + error.message);
    process.stdout.write('.');
  }
  console.log(` done.`);

  // Báo cáo theo NPP
  const byDisty = {};
  for (const r of validRows) byDisty[r.disty] = (byDisty[r.disty] || 0) + 1;

  console.log('\n══════════ BÁO CÁO SYNC ══════════');
  console.log(`Tổng SKU tạm đã tạo/map: ${masterRows.length} unique code (${validRows.length} dòng product_disty_codes đã gán sku)`);
  console.log('Theo NPP:');
  Object.entries(byDisty).sort().forEach(([disty, cnt]) => {
    console.log(`  ${disty.padEnd(12)} ${cnt} dòng`);
  });
  console.log('\nBước tiếp theo:');
  console.log('  1. Vào tab "Sản phẩm" — toàn bộ sản phẩm NPP đã hiện (lob=Unknown, sdp_price=0).');
  console.log('  2. Sửa từng SKU tạm → SKU chuẩn MSI, điền LOB đúng, điền giá SDP.');
  console.log('  3. Dùng nút "Gộp SKU" để gộp các dòng trùng từ nhiều NPP về 1 SKU chuẩn.');
}

main().catch(err => {
  console.error('\nLỗi không mong muốn:', err);
  process.exit(1);
});
