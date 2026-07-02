import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

export function normalizeModelName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  // Remove prefixes — longest first to prevent partial matches
  const prefixes = [
    'màn hình lcd msi ', 'mainboard msi ', 'bo mạch chủ ',
    'màn hình msi ', 'main msi ', 'vga msi ', 'lcd msi ',
    'màn hình ', 'mainboard ', 'main ', 'msi ', 'msı '
  ];
  for (const p of prefixes) {
    if (n.startsWith(p)) { n = n.slice(p.length); break; }
  }
  // Remove suffixes
  for (const s of [' - new', ' (new)']) {
    if (n.endsWith(s)) { n = n.slice(0, -s.length); break; }
  }
  // Remove spaces around hyphens: 'H610M -E' → 'H610M-E'
  n = n.replace(/\s*-\s*/g, '-');
  // Collapse multiple spaces
  return n.trim().replace(/\s+/g, ' ');
}

const PAGE = 1000;

async function fetchAllProducts() {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('products_master')
      .select('sku, model_name, lob')
      .range(from, from + PAGE - 1);
    if (error) throw new Error('Lỗi đọc products_master: ' + error.message);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function pickRepresentative(group) {
  // Prefer non-Unknown lob, then shortest SKU
  const nonUnknown = group.filter(p => p.lob !== 'Unknown' && p.lob !== 'SERVER');
  const pool = nonUnknown.length ? nonUnknown : group;
  return pool.reduce((a, b) => a.sku.length <= b.sku.length ? a : b);
}

async function mergeInventory(oldSku, newSku) {
  // Get existing (disty, week_date) pairs for newSku to detect conflicts
  const { data: existing, error: e1 } = await sb
    .from('disty_inventory')
    .select('disty, week_date')
    .eq('sku', newSku);
  if (e1) throw new Error(`[inv] đọc newSku ${newSku}: ` + e1.message);

  // Delete conflicting oldSku rows (same disty+week_date already exists in newSku)
  if (existing && existing.length) {
    for (const { disty, week_date } of existing) {
      const { error: e2 } = await sb.from('disty_inventory')
        .delete()
        .eq('sku', oldSku)
        .eq('disty', disty)
        .eq('week_date', week_date);
      if (e2) throw new Error(`[inv] delete conflict ${oldSku} (${disty},${week_date}): ` + e2.message);
    }
  }

  // Update remaining oldSku rows to newSku
  const { error: e3 } = await sb.from('disty_inventory')
    .update({ sku: newSku })
    .eq('sku', oldSku);
  if (e3) throw new Error(`[inv] update ${oldSku}→${newSku}: ` + e3.message);
}

async function mergeDistyCode(oldSku, newSku) {
  const { error } = await sb.from('product_disty_codes')
    .update({ sku: newSku })
    .eq('sku', oldSku);
  if (error) throw new Error(`[code] update ${oldSku}→${newSku}: ` + error.message);
}

async function main() {
  const allProducts = await fetchAllProducts();
  const beforeCount = allProducts.length;
  console.log(`Tổng sản phẩm hiện tại: ${beforeCount}`);

  // Group by normalized_name
  const groups = new Map();
  for (const p of allProducts) {
    const norm = normalizeModelName(p.model_name);
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(p);
  }

  const dupGroups = [...groups.entries()]
    .filter(([, g]) => g.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  const totalDuplicateRows = dupGroups.reduce((s, [, g]) => s + g.length - 1, 0);
  console.log(`Nhóm trùng lặp: ${dupGroups.length} nhóm — sẽ xoá ${totalDuplicateRows} dòng thừa`);

  console.log('\nTop 10 nhóm trùng lặp:');
  for (const [norm, group] of dupGroups.slice(0, 10)) {
    const rep = pickRepresentative(group);
    console.log(`  [${group.length}] "${(norm || '(trống)').slice(0, 55)}"`);
    console.log(`    → đại diện: ${rep.sku} (${rep.lob})`);
    group.filter(p => p.sku !== rep.sku).forEach(p =>
      console.log(`    x xoá: ${p.sku} (${p.lob})`)
    );
  }
  if (dupGroups.length > 10) console.log(`  ... và ${dupGroups.length - 10} nhóm khác`);

  console.log('\nBắt đầu gộp...');
  let merged = 0;
  for (const [, group] of dupGroups) {
    const rep = pickRepresentative(group);
    const toRemove = group.filter(p => p.sku !== rep.sku);

    for (const p of toRemove) {
      await mergeInventory(p.sku, rep.sku);
      await mergeDistyCode(p.sku, rep.sku);
    }

    // Delete extra products_master rows (CASCADE will clean product_programs)
    const { error } = await sb.from('products_master')
      .delete()
      .in('sku', toRemove.map(p => p.sku));
    if (error) throw new Error('Lỗi xoá products_master: ' + error.message);

    merged += toRemove.length;
    process.stdout.write('.');
  }

  // ── Cập nhật cột normalized_name cho tất cả sản phẩm còn lại ──
  console.log('\nCập nhật normalized_name trong DB...');
  const afterProducts = await fetchAllProducts();
  const byNorm = new Map();
  for (const p of afterProducts) {
    const norm = normalizeModelName(p.model_name);
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push(p.sku);
  }
  let updCount = 0;
  let normColMissing = false;
  for (const [norm, skus] of byNorm) {
    for (let i = 0; i < skus.length; i += 400) {
      const batch = skus.slice(i, i + 400);
      const { error } = await sb.from('products_master')
        .update({ normalized_name: norm })
        .in('sku', batch);
      if (error) {
        if (error.message.includes('normalized_name')) {
          normColMissing = true;
          break;
        }
        throw new Error(`Lỗi update normalized_name: ` + error.message);
      }
    }
    if (normColMissing) break;
    updCount += skus.length;
    process.stdout.write('u');
  }
  if (normColMissing) {
    console.log('\n⚠  Cột normalized_name chưa tồn tại trong DB.');
    console.log('   → Vào Supabase Dashboard → Settings → API → click "Reload" để refresh schema cache,');
    console.log('     sau đó chạy lại script này.');
  } else {
    console.log(` done. Đã cập nhật ${updCount} dòng (${byNorm.size} giá trị norm phân biệt).`);
  }

  console.log('\n════════ BÁO CÁO CUỐI ════════');
  console.log(`Trước: ${beforeCount} sản phẩm`);
  console.log(`Sau:   ${beforeCount - merged} sản phẩm`);
  console.log(`Giảm:  ${merged} dòng trùng lặp đã gộp`);
  console.log(`normalized_name: cập nhật ${updCount} dòng`);
}

main().catch(err => {
  console.error('\nLỗi không mong muốn:', err);
  process.exit(1);
});
