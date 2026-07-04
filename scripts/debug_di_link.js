// debug_di_link.js — chẩn đoán link Sản phẩm → Disty Inventory
// node scripts/debug_di_link.js
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SERVICE_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // 1. disty_inventory: có bao nhiêu row, tuần nào, sku mẫu
  const { data: wkData } = await sb.from('disty_inventory')
    .select('week_date').order('week_date', { ascending: false }).limit(200);
  const weeks = [...new Set((wkData || []).map(r => r.week_date))];
  const latestWeek = weeks[0];
  console.log('\n=== disty_inventory ===');
  console.log('Các tuần có data:', weeks);
  console.log('latestWeek:', latestWeek);

  const { count: totalRows } = await sb.from('disty_inventory')
    .select('*', { count: 'exact', head: true }).eq('week_date', latestWeek);
  console.log(`Tổng rows week ${latestWeek}:`, totalRows);

  // 2. Mẫu 10 dòng disty_inventory
  const { data: sample } = await sb.from('disty_inventory')
    .select('sku, disty, closing').eq('week_date', latestWeek).limit(10);
  console.log('\nSample 10 dòng disty_inventory:');
  for (const r of sample || []) console.log(`  sku="${r.sku}" | disty=${r.disty} | closing=${r.closing}`);

  // 3. Unique SKUs trong disty_inventory (tuần mới nhất)
  const { data: allDI } = await sb.from('disty_inventory')
    .select('sku').eq('week_date', latestWeek).limit(2000);
  const skusInDI = [...new Set((allDI || []).map(r => r.sku).filter(Boolean))];
  const nullCount = (allDI || []).filter(r => !r.sku).length;
  console.log(`\nUnique SKUs in DI (${latestWeek}): ${skusInDI.length} | sku=null: ${nullCount}`);
  console.log('Mẫu skus:', skusInDI.slice(0, 5));

  // 4. Các SKU đó có trong products_master không?
  let pmFound = 0;
  const pmNormMap = {};
  for (let i = 0; i < skusInDI.length; i += 500) {
    const { data } = await sb.from('products_master')
      .select('sku, model_name, normalized_name').in('sku', skusInDI.slice(i, i + 500));
    for (const p of data || []) {
      pmFound++;
      pmNormMap[p.sku] = p.normalized_name;
    }
  }
  console.log(`\nSKU trong DI khớp products_master: ${pmFound}/${skusInDI.length}`);
  if (pmFound < skusInDI.length) {
    const missing = skusInDI.filter(s => !pmNormMap[s]);
    console.log(`Không tìm thấy trong PM: ${missing.length} SKU — mẫu:`, missing.slice(0, 5));
  }

  // 5. Giả lập điều xảy ra khi user xem sản phẩm VGA (RTX 5090)
  const testSkus = [
    'GeForce RTX 5090 32G VENTUS 3X OC',
    'PRO B760M-E',
    'MAG 245F X24',
  ];
  console.log('\n=== Giả lập openProductDetail ===');
  for (const sku of testSkus) {
    const { data: pm } = await sb.from('products_master').select('*').eq('sku', sku).maybeSingle();
    if (!pm) { console.log(`  [${sku}] → KHÔNG TỒN TẠI trong products_master`); continue; }
    const norm = pm.normalized_name;
    console.log(`  [${sku}]`);
    console.log(`    → currentProductData.normalized_name = "${norm}"`);
    console.log(`    → _diFilterNorm sẽ = "${norm}"`);

    // Kiểm tra _diAllRows có row nào với normalized_name này không
    const { data: diRows } = await sb.from('disty_inventory')
      .select('sku, disty, closing').eq('week_date', latestWeek).limit(2000);
    const skusForNorm = skusInDI.filter(s => pmNormMap[s] === norm);
    const matchRows = (diRows || []).filter(r => r.sku && pmNormMap[r.sku] === norm);
    console.log(`    → SKU trong PM có normalized="${norm}": [${skusForNorm.join(', ')}]`);
    console.log(`    → DI rows khớp filter (r.normalized_name===_diFilterNorm): ${matchRows.length}`);
  }

  // 6. SQL query gốc
  console.log('\n=== Query: disty_inventory JOIN products_master ===');
  const { data: joined } = await sb.from('disty_inventory')
    .select('sku, disty, closing, products_master(model_name, normalized_name)')
    .eq('week_date', latestWeek).limit(10);
  for (const r of joined || []) {
    const pm = r.products_master;
    console.log(`  sku="${r.sku}" | model="${pm?.model_name ?? 'NULL'}" | norm="${pm?.normalized_name ?? 'NULL'}"`);
  }
}

main().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
