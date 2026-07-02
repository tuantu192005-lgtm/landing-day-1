import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { normalizeModelName } from './merge_duplicate_skus.js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const BATCH = 400;
const PAGE = 1000;

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

async function buildNormToSkuMap() {
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
  const map = new Map();
  for (const { sku, model_name } of all) {
    const norm = normalizeModelName(model_name);
    if (norm && !map.has(norm)) map.set(norm, sku);
  }
  return map;
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

  // ── PHẦN 4: Tìm sản phẩm đã có trong DB theo normalized_name ──
  console.log('\n── Xây dựng bảng normalized_name → sku từ products_master ──');
  const normToSku = await buildNormToSkuMap();
  console.log(`Đã load ${normToSku.size} normalized names.`);

  const matched = [];   // Có normalized match → chỉ cần link sku
  const unmatched = []; // Chưa có → cần tạo products_master mới

  for (const r of validRows) {
    const norm = normalizeModelName(r.disty_name);
    const existingSku = normToSku.get(norm);
    if (existingSku) matched.push({ ...r, resolvedSku: existingSku });
    else unmatched.push(r);
  }

  console.log(`Khớp tên có sẵn: ${matched.length} | Mới hoàn toàn: ${unmatched.length}`);

  // ── Bước A: Link product_disty_codes → sku hiện có (theo normalized_name) ──
  if (matched.length) {
    console.log(`\n── Gán sku cho ${matched.length} dòng khớp tên (chỉ khi sku IS NULL) ──`);

    // Group by resolvedSku để batch hiệu quả
    const byNewSku = new Map();
    for (const r of matched) {
      if (!byNewSku.has(r.resolvedSku)) byNewSku.set(r.resolvedSku, []);
      byNewSku.get(r.resolvedSku).push(r.id);
    }

    for (const [sku, ids] of byNewSku) {
      for (const batch of chunk(ids, BATCH)) {
        const { error } = await sb.from('product_disty_codes')
          .update({ sku })
          .in('id', batch)
          .is('sku', null); // Không ghi đè mapping admin đã set
        if (error) throw new Error('Lỗi update product_disty_codes: ' + error.message);
      }
      process.stdout.write('+');
    }
    console.log(' done.');
  }

  // ── Bước B: Tạo products_master mới cho sản phẩm chưa có ──
  if (!unmatched.length) {
    console.log('\nKhông có sản phẩm mới nào cần tạo products_master.');
  } else {
    // Dedupe theo disty_code
    const deduped = new Map();
    for (const r of unmatched) {
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
      const { error } = await sb.from('products_master').upsert(ch, { onConflict: 'sku', ignoreDuplicates: true });
      if (error) throw new Error('Lỗi upsert products_master: ' + error.message);
      process.stdout.write('.');
    }
    console.log(' done.');

    // Cập nhật product_disty_codes cho unmatched
    console.log(`\n── Cập nhật ${unmatched.length} dòng product_disty_codes (gán sku tạm) ──`);
    const codeUpdateRows = unmatched.map(r => ({
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
    console.log(' done.');
  }

  // Báo cáo theo NPP
  const byDisty = {};
  for (const r of validRows) byDisty[r.disty] = (byDisty[r.disty] || 0) + 1;

  console.log('\n══════════ BÁO CÁO SYNC ══════════');
  console.log(`Khớp tên có sẵn (linked): ${matched.length}`);
  console.log(`Tạo SKU tạm mới:          ${unmatched.length}`);
  console.log('Theo NPP:');
  Object.entries(byDisty).sort().forEach(([disty, cnt]) => {
    console.log(`  ${disty.padEnd(12)} ${cnt} dòng`);
  });
}

main().catch(err => {
  console.error('\nLỗi không mong muốn:', err);
  process.exit(1);
});
