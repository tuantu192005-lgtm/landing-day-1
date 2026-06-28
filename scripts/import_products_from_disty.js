import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Quy tắc layout từng NPP (0-indexed): header row + cột mã/tên/LOB.
// Tự nhận diện format bằng cách so khớp text ở đúng ô header dự kiến —
// không cần người dùng khai báo NPP nào, script tự đọc và xác định.
const DISTY_FORMAT_RULES = [
  { disty: 'DGW', headerRow: 3, skuCol: 0, nameCol: 1, lobCol: 6, skuHint: 'product code', nameHint: 'description' },
  { disty: 'SPC', headerRow: 2, skuCol: 0, nameCol: 1, lobCol: null, skuHint: 'internal code', nameHint: 'model name' },
  { disty: 'KTC', headerRow: 3, skuCol: 0, nameCol: 1, lobCol: null, skuHint: 'ma', nameHint: 'ten' },
  { disty: 'MH', headerRow: 6, skuCol: 0, nameCol: 1, lobCol: null, skuHint: 'model code', nameHint: 'ten' }
];

// Tên cột tồn kho có thể gặp trong header (so khớp không dấu/không hoa).
const INVENTORY_COL_HINTS = {
  opening: ['opening'],
  sell_in: ['sell-in', 'sell in', 'sellin'],
  sell_out: ['sell-out', 'sell out', 'sellout'],
  closing: ['closing']
};

function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function detectDistyFormat(rows) {
  for (const rule of DISTY_FORMAT_RULES) {
    const skuHeader = stripAccents(rows[rule.headerRow]?.[rule.skuCol] || '');
    const nameHeader = stripAccents(rows[rule.headerRow]?.[rule.nameCol] || '');
    if (skuHeader.includes(rule.skuHint) && nameHeader.includes(rule.nameHint)) return rule;
  }
  return null;
}

function findInventoryCols(headerRowArr) {
  const cols = {};
  (headerRowArr || []).forEach((cell, idx) => {
    const norm = stripAccents(cell || '');
    for (const [field, hints] of Object.entries(INVENTORY_COL_HINTS)) {
      if (hints.some((h) => norm.includes(h))) cols[field] = idx;
    }
  });
  return cols;
}

function parseDistyRows(rows, rule) {
  const out = [];
  const invCols = findInventoryCols(rows[rule.headerRow]);
  const hasInvCols = Object.keys(invCols).length > 0;
  for (let i = rule.headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[rule.skuCol] || !row[rule.nameCol]) continue;
    const item = {
      sku: String(row[rule.skuCol]).trim(),
      model_name: String(row[rule.nameCol]).trim(),
      lob: rule.lobCol !== null ? String(row[rule.lobCol] || '').trim() : ''
    };
    if (hasInvCols) {
      item.inventory = {
        opening: invCols.opening !== undefined ? Number(row[invCols.opening]) || 0 : 0,
        sell_in: invCols.sell_in !== undefined ? Number(row[invCols.sell_in]) || 0 : 0,
        sell_out: invCols.sell_out !== undefined ? Number(row[invCols.sell_out]) || 0 : 0,
        closing: invCols.closing !== undefined ? Number(row[invCols.closing]) || 0 : 0
      };
    }
    out.push(item);
  }
  return out;
}

async function main() {
  const filePath = process.argv[2];
  const weekDateArg = process.argv[3]; // optional — chỉ cần khi file có cột tồn kho

  if (!filePath) {
    console.error('Cách dùng: node scripts/import_products_from_disty.js <file.xlsx> [week_date YYYY-MM-DD]');
    process.exit(1);
  }

  console.log(`── Đọc file: ${filePath} ──`);
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  const rule = detectDistyFormat(rows);
  if (!rule) {
    console.error('Không nhận diện được format NPP (DGW/SPC/KTC/MH) của file này — kiểm tra lại header row.');
    process.exit(1);
  }
  console.log(`  Nhận diện: NPP ${rule.disty} (header ở dòng Excel ${rule.headerRow + 1})`);

  const items = parseDistyRows(rows, rule);
  console.log(`  Đọc được ${items.length} dòng có dữ liệu.`);
  if (!items.length) {
    console.log('Không có dòng nào để import.');
    return;
  }

  const hasInventory = items.some((it) => it.inventory);
  let weekDate = weekDateArg;
  if (hasInventory && !weekDate) {
    weekDate = new Date().toISOString().slice(0, 10);
    console.log(`  File có cột tồn kho nhưng không truyền week_date — dùng ngày hôm nay: ${weekDate}`);
  }

  // 1. products_master — products_master.lob NOT NULL, nhưng SPC/KTC/MH
  // không có cột LOB trong file. Giữ nguyên LOB cũ nếu sku đã tồn tại
  // (vd. đã import qua DGW trước đó), chỉ fallback 'UNKNOWN' khi sku
  // hoàn toàn mới — tránh ghi đè LOB đúng bằng rỗng/UNKNOWN.
  const skuList = [...new Set(items.map((it) => it.sku))];
  const { data: existingRows, error: existErr } = await sb.from('products_master').select('sku, lob').in('sku', skuList);
  if (existErr) throw existErr;
  const existingLobBySku = {};
  (existingRows || []).forEach((r) => { existingLobBySku[r.sku] = r.lob; });

  const masterRows = items.map((it) => ({
    sku: it.sku,
    model_name: it.model_name,
    lob: it.lob || existingLobBySku[it.sku] || 'UNKNOWN',
    updated_at: new Date().toISOString()
  }));

  console.log('\n── Upsert products_master ──');
  const { error: masterErr, data: masterData } = await sb
    .from('products_master')
    .upsert(masterRows, { onConflict: 'sku' })
    .select('sku');
  if (masterErr) throw masterErr;
  console.log(`  ✓ Đã upsert ${masterData.length} dòng products_master.`);

  // 2. product_disty_codes — mã của NPP trùng với sku coi như mã chuẩn vì
  // file không cho thông tin để map sang sku khác do hãng quy định.
  console.log('\n── Upsert product_disty_codes ──');
  const codeRows = items.map((it) => ({ sku: it.sku, disty: rule.disty, disty_code: it.sku, disty_name: it.model_name }));
  const { error: codeErr, data: codeData } = await sb
    .from('product_disty_codes')
    .upsert(codeRows, { onConflict: 'disty,disty_code' })
    .select('id');
  if (codeErr) throw codeErr;
  console.log(`  ✓ Đã upsert ${codeData.length} dòng product_disty_codes.`);

  // 3. disty_inventory — chỉ chạy nếu file có cột Opening/Sell-in/Sell-out/Closing.
  if (hasInventory) {
    console.log('\n── Upsert disty_inventory ──');
    const invRows = items.filter((it) => it.inventory).map((it) => ({
      sku: it.sku,
      disty: rule.disty,
      week_date: weekDate,
      opening: it.inventory.opening,
      sell_in: it.inventory.sell_in,
      sell_out: it.inventory.sell_out,
      closing: it.inventory.closing
    }));
    const { error: invErr, data: invData } = await sb
      .from('disty_inventory')
      .upsert(invRows, { onConflict: 'sku,disty,week_date' })
      .select('id');
    if (invErr) throw invErr;
    console.log(`  ✓ Đã upsert ${invData.length} dòng disty_inventory (week_date=${weekDate}).`);
  }

  console.log(`\nHoàn tất import NPP ${rule.disty}: ${items.length} sản phẩm.`);
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
