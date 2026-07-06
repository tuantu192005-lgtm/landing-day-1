// normalize_model_names.js — Chuẩn hóa model_name của SKU tạm về format MSI chuẩn
// node scripts/normalize_model_names.js

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { normalizeModelName } from './merge_duplicate_skus.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SERVICE_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function isTempSku(sku) {
  if (!sku) return false;
  return /^\d/.test(sku) || /^(VGMR|SVGAMSI|MAMB|MAMH|MAKTC|MAMON|CASMS)/i.test(sku);
}

// Prefixes to strip — preserves original case after stripping so we can capitalize afterwards
const STRIP_PREFIXES = [
  '(vga card) msi ', '(vga card) ',
  '(main board) msi ', '(main board) ',
  '(mainboard) msi ', '(mainboard) ',
  'tấm mạch in đã lắp ráp msi ', 'tấm mạch in đã lắp ráp ',
  'tấm mạch in msi ',
  'bảng mạch chính msi ', 'bảng mạch chính ',
  'nguồn máy tính msi ', 'nguồn máy tính ',
  'cạc màn hình msi ', 'cạc màn hình ',
  'cạc đồ họa msi ', 'cạc đồ họa ',
  'card màn hình msi ', 'card màn hình ',
  'card đồ họa msi ', 'card đồ họa ',
  'màn hình gaming msi ',
  'màn hình lcd msi ', 'màn hình msi ', 'lcd msi ',
  'mainboard msi ', 'main msi ', 'vga msi ',
  'bo mạch chủ msi ', 'bo mạch chủ ', 'màn hình ', 'mainboard ', 'main ',
  'nguồn msi ', 'vỏ case msi ', 'tản nhiệt msi ', 'ổ cứng msi ',
];

function cleanModelName(raw) {
  if (!raw) return raw;
  const orig = raw.trim();

  // PC/Laptop system descriptions from DGW — leave unchanged (they're not component model names)
  if (/^\(PC\)\s/i.test(orig) || /^\(Laptop\)\s/i.test(orig)) return orig;

  const lower = orig.toLowerCase();
  let stripped = orig;
  for (const p of STRIP_PREFIXES) {
    if (lower.startsWith(p)) {
      stripped = orig.slice(p.length);
      break;
    }
  }

  // Strip any remaining "MSI " prefix
  const sl = stripped.toLowerCase();
  if (sl.startsWith('msi ') || sl.startsWith('msı ')) stripped = stripped.slice(4);

  // Uppercase all, then restore brand prefix casing (MSI format: GeForce/Radeon + ALL CAPS)
  let result = stripped.toUpperCase();
  if (result.startsWith('GEFORCE ')) result = 'GeForce ' + result.slice(8);
  else if (result.startsWith('RADEON ')) result = 'Radeon ' + result.slice(7);

  return result.trim().replace(/\s+/g, ' ');
}

async function fetchAll() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('products_master')
      .select('sku, model_name').range(from, from + 999);
    if (error) throw new Error('Lỗi đọc products_master: ' + error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

async function main() {
  console.log('── Đọc products_master ──');
  const all = await fetchAll();
  console.log(`Tổng: ${all.length} sản phẩm`);

  const tempRows = all.filter(p => isTempSku(p.sku));
  console.log(`SKU tạm nhận diện: ${tempRows.length} (VGMR/SVGAMSI/MAMB/MAMH/MAKTC/MAMON/CASMS/digit)`);

  // Tính các thay đổi cần thiết
  const toUpdate = [];
  for (const p of tempRows) {
    const newModel = cleanModelName(p.model_name);
    if (newModel !== p.model_name) {
      toUpdate.push({
        sku: p.sku,
        old: p.model_name,
        model_name: newModel,
        normalized_name: normalizeModelName(newModel),
      });
    }
  }

  console.log(`\nCần chuẩn hóa model_name: ${toUpdate.length} / ${tempRows.length}`);

  if (toUpdate.length > 0) {
    console.log('\n── 10 thay đổi đầu ──');
    for (const r of toUpdate.slice(0, 10)) {
      console.log(`  ${r.sku}:`);
      console.log(`    cũ:  "${r.old}"`);
      console.log(`    mới: "${r.model_name}"`);
    }
    if (toUpdate.length > 10) console.log(`  ... và ${toUpdate.length - 10} thay đổi khác`);

    console.log(`\n── Đang update ${toUpdate.length} dòng ──`);
    let done = 0;
    for (const r of toUpdate) {
      const { error } = await sb.from('products_master')
        .update({ model_name: r.model_name, normalized_name: r.normalized_name })
        .eq('sku', r.sku);
      if (error) throw new Error(`Lỗi update ${r.sku}: ` + error.message);
      done++;
      if (done % 50 === 0) process.stdout.write('.');
    }
    console.log(` done.`);
  }

  console.log('\n════════ BÁO CÁO normalize ════════');
  console.log(`Tổng SKU tạm:          ${tempRows.length}`);
  console.log(`Đã chuẩn hóa tên:      ${toUpdate.length}`);
  console.log(`Không đổi (đã chuẩn):  ${tempRows.length - toUpdate.length}`);

  console.log('\n── Đang chạy merge_duplicate_skus.js ──\n');
  execSync('node scripts/merge_duplicate_skus.js', { stdio: 'inherit', cwd: ROOT });
}

main().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
