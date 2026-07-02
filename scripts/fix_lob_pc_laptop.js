import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const LAPTOP_PATTERNS = ['laptop', 'máy tính xách tay', 'notebook', 'xách tay'];

// LOB không được ghi đè bởi GDT/MINIPC/DESKTOP
const EXCLUDE_LOBS = new Set(['MB','VGA','MNT','PSU','CASE','COOLER','SSD','GG']);

const GDT_PATTERNS     = ['(pc)', 'máy chủ', 'server', 'g4101', 's2205'];
const MINIPC_PATTERNS  = ['(mini server)', '(minipc)', 'cubi', 'mini pc'];
const DESKTOP_PATTERNS = ['(desktop)', '(dt)', '(aio)'];

function isLaptop(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return LAPTOP_PATTERNS.some(p => n.includes(p));
}

function classifyPc(name, currentLob) {
  if (EXCLUDE_LOBS.has(currentLob)) return null;
  const n = (name || '').toLowerCase();
  if (GDT_PATTERNS.some(p => n.includes(p)))     return 'GDT';
  if (MINIPC_PATTERNS.some(p => n.includes(p)))  return 'MINIPC';
  if (DESKTOP_PATTERNS.some(p => n.includes(p))) return 'DESKTOP';
  return null;
}

const PAGE = 1000;

async function fetchAll(filters = {}) {
  const all = [];
  let from = 0;
  while (true) {
    let q = sb.from('products_master').select('sku, model_name, lob').range(from, from + PAGE - 1);
    if (filters.lob) q = q.eq('lob', filters.lob);
    const { data, error } = await q;
    if (error) throw new Error('Lỗi đọc products_master: ' + error.message);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function batchDelete(skus) {
  for (let i = 0; i < skus.length; i += 200) {
    const batch = skus.slice(i, i + 200);
    const { error } = await sb.from('products_master').delete().in('sku', batch);
    if (error) throw new Error('Lỗi xoá: ' + error.message);
    process.stdout.write('x');
  }
}

async function batchUpdate(skus, lob) {
  for (let i = 0; i < skus.length; i += 400) {
    const batch = skus.slice(i, i + 400);
    const { error } = await sb.from('products_master').update({ lob, is_active: true }).in('sku', batch);
    if (error) throw new Error(`Lỗi update ${lob}: ` + error.message);
    process.stdout.write('.');
  }
}

async function main() {
  console.log('══ Phase 1: Xoá Laptop/Notebook khỏi products_master ══');
  const allProducts = await fetchAll();
  console.log(`Đọc được ${allProducts.length} sản phẩm.`);

  const laptopSkus = allProducts.filter(p => isLaptop(p.model_name)).map(p => p.sku);
  console.log(`Phát hiện ${laptopSkus.length} sản phẩm Laptop/Notebook cần xoá.`);

  if (laptopSkus.length) {
    await batchDelete(laptopSkus);
    console.log(` done.\n${laptopSkus.length} dòng đã xoá (CASCADE: product_disty_codes + disty_inventory + product_programs).`);
  }

  console.log('\n══ Phase 2: Phân loại GDT / MINIPC / DESKTOP ══');
  // Fetch lại sau khi đã xoá laptop
  const remaining = allProducts.filter(p => !laptopSkus.includes(p.sku));

  const toUpdate = { GDT: [], MINIPC: [], DESKTOP: [] };
  for (const p of remaining) {
    const newLob = classifyPc(p.model_name, p.lob);
    if (newLob) toUpdate[newLob].push(p.sku);
  }

  for (const [lob, skus] of Object.entries(toUpdate)) {
    if (!skus.length) { console.log(`  ${lob}: 0 sản phẩm.`); continue; }
    console.log(`  Cập nhật ${skus.length} sản phẩm → ${lob}...`);
    await batchUpdate(skus, lob);
    console.log(' done.');
  }

  console.log('\n══════════ BÁO CÁO ══════════');
  console.log(`Phase 1 — Đã xoá: ${laptopSkus.length} Laptop/Notebook`);
  console.log(`Phase 2 — Đã cập nhật:`);
  for (const [lob, skus] of Object.entries(toUpdate)) {
    if (skus.length) console.log(`  ${lob.padEnd(8)} → ${skus.length} sản phẩm (is_active=true)`);
  }
}

main().catch(err => {
  console.error('\nLỗi không mong muốn:', err);
  process.exit(1);
});
