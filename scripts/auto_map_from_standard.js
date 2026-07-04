// auto_map_from_standard.js
// Đọc Model_chuẩn_MSI.xlsx → upsert products_master → map product_disty_codes + disty_inventory
// Chạy: node scripts/auto_map_from_standard.js

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import path from 'path';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SERVICE_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// ── normalizeModelName (replica chính xác từ index.html) ──────────────────
function normalizeModelName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  const prefixes = [
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
    'msi ', 'msı '
  ];
  for (const p of prefixes) { if (n.startsWith(p)) { n = n.slice(p.length); break; } }
  for (const s of [' - new', ' (new)']) { if (n.endsWith(s)) { n = n.slice(0, -s.length); break; } }
  n = n.replace(/\s*-\s*/g, '-');
  return n.trim().replace(/\s+/g, ' ');
}

// ── normalizeForMatch: mở rộng thêm viết tắt phổ biến của NPP ────────────
// Chỉ dùng khi so khớp tên — KHÔNG dùng để lưu normalized_name vào DB.
function normalizeForMatch(name) {
  let n = normalizeModelName(name);
  // WF6E trước WF để tránh "wf6e" bị thay thành "wifie" sai
  n = n.replace(/ wf6e\b/gi, ' wifi6e');
  n = n.replace(/ wf\b/gi, ' wifi');
  // Một số NPP (KTC) bỏ "geforce " hoặc "radeon " ở đầu
  if (n.startsWith('geforce ')) n = n.slice('geforce '.length);
  if (n.startsWith('radeon '))  n = n.slice('radeon '.length);
  return n.trim().replace(/\s+/g, ' ');
}

// ── Đọc và parse Excel ────────────────────────────────────────────────────
const EXCEL_PATH = path.resolve('D:/AI91/Data test/Model chuẩn MSI.xlsx');
const LOB_MAP = {
  LCD: 'MNT', Maiboard: 'MB', VGA: 'VGA',
  Chassis: 'CASE', PSU: 'PSU', Cooling: 'COOLER', SSD: 'SSD'
};
const SKIP_VALUES = new Set([
  'dgw','spc','ktc','nwh','mai hoang','ad','meko','psd',
  'model','air cooling','liquid cooling'
]);

function parseStandardModels(wb) {
  const seen = new Set();
  const models = [];
  for (const [sheetName, lob] of Object.entries(LOB_MAP)) {
    const ws = wb.Sheets[sheetName];
    if (!ws) { console.warn(`Sheet "${sheetName}" không tìm thấy`); continue; }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    for (const row of rows) {
      const raw = row[0];
      if (raw === null || raw === undefined) continue;
      const model = String(raw).trim();
      if (!model) continue;
      if (SKIP_VALUES.has(model.toLowerCase())) continue;
      const norm = normalizeModelName(model);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      models.push({ model_name: model, lob, normalized_name: norm });
    }
  }
  return models;
}

// ── Paginated load helper ─────────────────────────────────────────────────
async function loadAll(table, columns, filterFn = null) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(columns).range(from, from + 999);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`Lỗi load ${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  auto_map_from_standard.js');
  console.log('='.repeat(60));

  // 1. Parse Excel
  const wb = XLSX.readFile(EXCEL_PATH);
  const standardModels = parseStandardModels(wb);
  console.log(`\n[1] Đọc Excel: ${standardModels.length} model chuẩn (sau dedup)`);
  const byLob = {};
  for (const m of standardModels) { (byLob[m.lob] = byLob[m.lob] || []).push(m); }
  for (const [lob, arr] of Object.entries(byLob)) console.log(`    ${lob}: ${arr.length}`);

  // 2. Load toàn bộ products_master (paginated)
  console.log('\n[2] Load products_master...');
  const existingPM = await loadAll('products_master', 'sku, model_name, lob, normalized_name');
  console.log(`    → ${existingPM.length} sản phẩm hiện có`);
  const existingNormMap = new Map(existingPM.map(p => [p.normalized_name, p]));
  const existingSkuMap  = new Map(existingPM.map(p => [p.sku, p]));

  // Map normalizeForMatch → standard model (dùng để so khớp disty_name)
  // Key dùng viết tắt mở rộng (WF→WIFI, strip geforce) — khác normalized_name lưu DB
  const normToStd = new Map(standardModels.map(m => [normalizeForMatch(m.model_name), m]));

  // 3. Upsert products_master
  console.log('\n[3] Upsert products_master...');
  let pmInserted = 0, pmUpdated = 0, pmSkipped = 0;
  // migrations: old products_master rows that need SKU rename
  // key: old_sku, value: new_sku (standard model name)
  const skuMigrations = new Map();

  for (const m of standardModels) {
    const alreadyBySku  = existingSkuMap.get(m.model_name);
    const alreadyByNorm = existingNormMap.get(m.normalized_name);

    if (alreadyBySku) {
      // Standard SKU đã tồn tại: update lob nếu khác
      if (alreadyBySku.lob !== m.lob || alreadyBySku.model_name !== m.model_name) {
        const { error } = await sb.from('products_master')
          .update({ lob: m.lob, model_name: m.model_name, normalized_name: m.normalized_name })
          .eq('sku', m.model_name);
        if (error) console.error(`    UPDATE lỗi (${m.model_name}): ${error.message}`);
        else pmUpdated++;
      } else {
        pmSkipped++;
      }

    } else if (alreadyByNorm) {
      const old_sku = alreadyByNorm.sku;
      // Tồn tại sản phẩm với normalized khớp nhưng SKU cũ → INSERT standard SKU mới
      // Sau đó sẽ migrate FK references từ old_sku → new_sku
      console.log(`    [MIGRATE] "${old_sku}" → "${m.model_name}"`);
      const { error } = await sb.from('products_master').insert({
        sku: m.model_name,
        model_name: m.model_name,
        normalized_name: m.normalized_name,
        lob: m.lob,
        sdp_price: alreadyByNorm.sdp_price || 0,
        is_active: true
      });
      if (error) {
        console.error(`    INSERT MIGRATE lỗi (${m.model_name}): ${error.message}`);
      } else {
        pmInserted++;
        existingSkuMap.set(m.model_name, m);
        skuMigrations.set(old_sku, m.model_name);
      }

    } else {
      // Model mới hoàn toàn → INSERT
      const { error } = await sb.from('products_master').insert({
        sku: m.model_name,
        model_name: m.model_name,
        normalized_name: m.normalized_name,
        lob: m.lob,
        sdp_price: 0,
        is_active: true
      });
      if (error) {
        console.error(`    INSERT lỗi (${m.model_name}): ${error.message}`);
      } else {
        pmInserted++;
        existingSkuMap.set(m.model_name, m);
        existingNormMap.set(m.normalized_name, m);
      }
    }
  }
  console.log(`    → Mới tạo: ${pmInserted} | Cập nhật: ${pmUpdated} | Bỏ qua: ${pmSkipped} | MIGRATE: ${skuMigrations.size}`);

  // 4. Migrate old SKU references → new standard SKU
  if (skuMigrations.size > 0) {
    console.log('\n[4] Migrate FK references (old_sku → new_sku)...');
    let migCodes = 0, migInv = 0;
    for (const [old_sku, new_sku] of skuMigrations) {
      // product_disty_codes
      const { data: c1, error: e1 } = await sb.from('product_disty_codes')
        .update({ sku: new_sku }).eq('sku', old_sku).select('disty_code');
      if (e1) console.error(`    Lỗi migrate codes ${old_sku}: ${e1.message}`);
      else migCodes += c1?.length || 0;

      // disty_inventory
      const { data: i1, error: e2 } = await sb.from('disty_inventory')
        .update({ sku: new_sku }).eq('sku', old_sku).select('id');
      if (e2) console.error(`    Lỗi migrate inv ${old_sku}: ${e2.message}`);
      else migInv += i1?.length || 0;
    }
    console.log(`    → product_disty_codes: ${migCodes} row | disty_inventory: ${migInv} row`);

    // Xóa old products_master rows (chỉ nếu không còn FK references)
    console.log('    Xóa products_master rows cũ...');
    let pmDeleted = 0;
    for (const [old_sku] of skuMigrations) {
      const { error } = await sb.from('products_master').delete().eq('sku', old_sku);
      if (error) console.warn(`    Không xóa được "${old_sku}" (có thể còn FK ref): ${error.message}`);
      else pmDeleted++;
    }
    console.log(`    → Đã xóa: ${pmDeleted} products_master cũ`);
  } else {
    console.log('\n[4] Không có SKU nào cần migrate.');
  }

  // 5. Load toàn bộ product_disty_codes (paginated)
  console.log('\n[5] Load product_disty_codes...');
  const allCodes = await loadAll('product_disty_codes', 'disty, disty_code, disty_name, sku');
  console.log(`    → ${allCodes.length} mã NPP`);

  // 6. Match theo normalized disty_name → standard model
  console.log('\n[6] Map product_disty_codes theo tên...');
  let codesMatched = 0, codesAlreadyOk = 0, codesNoMatch = 0;
  const unmatchedSample = [];
  const codeUpdates = [];

  for (const code of allCodes) {
    if (!code.disty_name) { codesNoMatch++; continue; }
    // Dùng normalizeForMatch để mở rộng viết tắt (WF→WIFI, strip geforce...)
    const norm = normalizeForMatch(code.disty_name);

    // Exact match
    let matched = normToStd.get(norm);

    // Prefix match (disty_name có thêm specs sau tên model)
    if (!matched) {
      for (const [stdNorm, stdModel] of normToStd) {
        if (norm.startsWith(stdNorm + ' ') || norm.startsWith(stdNorm + '/')) {
          matched = stdModel;
          break;
        }
      }
    }

    if (matched) {
      const newSku = matched.model_name;
      if (code.sku === newSku) { codesAlreadyOk++; continue; }
      // Verify target SKU exists in products_master (đã insert ở bước 3)
      if (!existingSkuMap.has(newSku)) {
        console.warn(`    [WARN] Target SKU "${newSku}" chưa có trong products_master — bỏ qua`);
        codesNoMatch++;
        continue;
      }
      codeUpdates.push({ disty: code.disty, disty_code: code.disty_code, newSku });
      codesMatched++;
    } else {
      codesNoMatch++;
      if (unmatchedSample.length < 10) unmatchedSample.push(`${code.disty}:${code.disty_code} → "${code.disty_name}"`);
    }
  }
  console.log(`    → Match mới: ${codesMatched} | Đã đúng: ${codesAlreadyOk} | Không match: ${codesNoMatch}`);

  // 7. UPDATE product_disty_codes
  console.log('\n[7] UPDATE product_disty_codes...');
  let codesUpdated = 0;
  for (const u of codeUpdates) {
    const { error } = await sb.from('product_disty_codes')
      .update({ sku: u.newSku })
      .eq('disty', u.disty).eq('disty_code', u.disty_code);
    if (error) console.error(`    Lỗi update code ${u.disty}:${u.disty_code}: ${error.message}`);
    else codesUpdated++;
  }
  console.log(`    → Đã update: ${codesUpdated} mã NPP`);

  // 8. UPDATE disty_inventory theo disty_code
  console.log('\n[8] UPDATE disty_inventory...');
  let invUpdated = 0;
  for (const u of codeUpdates) {
    const { data, error } = await sb.from('disty_inventory')
      .update({ sku: u.newSku })
      .eq('disty', u.disty).eq('disty_code', u.disty_code)
      .select('id');
    if (error) console.error(`    Lỗi update inv ${u.disty}:${u.disty_code}: ${error.message}`);
    else invUpdated += (data?.length || 0);
  }
  console.log(`    → Đã update: ${invUpdated} dòng tồn kho`);

  // 9. Báo cáo tổng kết
  console.log('\n' + '='.repeat(60));
  console.log('  BÁO CÁO KẾT QUẢ');
  console.log('='.repeat(60));
  console.log(`  Tổng model chuẩn từ Excel     : ${standardModels.length}`);
  console.log(`  products_master mới tạo        : ${pmInserted}`);
  console.log(`  products_master cập nhật lob   : ${pmUpdated}`);
  console.log(`  SKU cũ được migrate            : ${skuMigrations.size}`);
  console.log(`  product_disty_codes mới map    : ${codesUpdated}`);
  console.log(`  disty_inventory dòng update    : ${invUpdated}`);

  // Model chuẩn chưa có disty_code nào trỏ vào
  const allUpdatedSkus = new Set(codeUpdates.map(u => u.newSku));
  const notMapped = standardModels.filter(m => !allUpdatedSkus.has(m.model_name));
  console.log(`\n  Model chuẩn chưa có disty_code: ${notMapped.length}`);
  if (notMapped.length <= 30) {
    notMapped.forEach(m => console.log(`    [${m.lob}] ${m.model_name}`));
  } else {
    notMapped.slice(0, 30).forEach(m => console.log(`    [${m.lob}] ${m.model_name}`));
    console.log(`    ... và ${notMapped.length - 30} model nữa`);
  }

  if (unmatchedSample.length) {
    console.log(`\n  Mẫu disty_code không match (10 đầu):`);
    unmatchedSample.forEach(s => console.log(`    ${s}`));
  }
}

main().catch(err => { console.error('\n[ERROR]', err.message); process.exit(1); });
