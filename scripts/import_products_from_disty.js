import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// 8 NPP — mỗi sheet trong file Excel là 1 NPP. FPT không còn là NPP riêng
// (chỉ là tên cũ của SPC — Synnex FPT), không xử lý ở đây.
function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function normalizeSheetName(name) {
  return stripAccents(name).toUpperCase().replace(/[^A-Z]/g, '');
}

// Tên sheet trong file thực tế có thể là "Mai Hoang"/"MH" — quy về đúng 1 mã NPP.
const SHEET_NAME_TO_DISTY = {
  DGW: 'DGW',
  SPC: 'SPC',
  KTC: 'KTC',
  NWH: 'NWH',
  AD: 'AD',
  PSD: 'PSD',
  MEKO: 'MEKO',
  MAIHOANG: 'MAI HOANG',
  MH: 'MAI HOANG'
};

function detectDistyFromSheetName(sheetName) {
  return SHEET_NAME_TO_DISTY[normalizeSheetName(sheetName)] || null;
}

function excelSerialToISODate(serial) {
  const utcMs = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(utcMs).toISOString().slice(0, 10);
}

function parseVNDate(str) {
  const m = String(str).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseAnyDate(cell) {
  if (cell == null || cell === '') return null;
  if (typeof cell === 'number') return excelSerialToISODate(cell);
  return parseVNDate(cell);
}

// Quét vài dòng đầu (trước khi data bắt đầu) để tìm ngày tuần của file —
// ưu tiên mẫu "... to DD.MM.YYYY" (cuối tuần), nếu không có thì lấy ngày
// thường gặp đầu tiên, hoặc số serial ngày của Excel (44000–55000 ~ 2020–2050).
function findWeekDate(rows, maxRow) {
  let found = null;
  for (let i = 0; i < Math.min(maxRow, rows.length); i++) {
    for (const cell of rows[i] || []) {
      if (cell == null || cell === '') continue;
      if (typeof cell === 'number') {
        if (cell > 44000 && cell < 55000) found = excelSerialToISODate(cell);
        continue;
      }
      const text = String(cell);
      const rangeMatch = text.match(/to\s+(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i);
      if (rangeMatch) { found = parseVNDate(rangeMatch[1]); continue; }
      const dateMatch = text.match(/\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}/);
      if (dateMatch) found = parseVNDate(dateMatch[0]);
    }
  }
  return found;
}

function isEmpty(v) {
  return v == null || String(v).trim() === '';
}

// "TOTAL"/"CODE" — dòng tổng cuối sheet (DGW) hoặc dòng chú giải cột chèn
// giữa header và data thật (SPC/MEKO), không phải SKU thật — áp dụng lọc
// này cho mọi NPP.
function isLegendRow(code, name) {
  const c = stripAccents(code).toUpperCase();
  const n = stripAccents(name).toUpperCase();
  return c === 'CODE' || c === 'TOTAL' || n === 'CODE' || n === 'TOTAL';
}

// ── Parser riêng từng NPP — trả về danh sách { disty_code, disty_name,
// lob, opening, sell_in, sell_out, closing, rowDate? } ──

function parseDGW(rows) {
  const out = [];
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    const code = row?.[0];
    if (isEmpty(code) || stripAccents(code).toUpperCase() === 'NAN') continue;
    if (isLegendRow(code, row[1])) continue;
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(row[1] ?? '').trim(),
      lob: isEmpty(row[6]) ? null : String(row[6]).trim(),
      opening: Number(row[2]) || 0,
      sell_in: Number(row[3]) || 0,
      sell_out: Number(row[4]) || 0,
      closing: Number(row[5]) || 0
    });
  }
  return out;
}

function parsePSD(rows) {
  const out = [];
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    const code = row?.[0];
    if (isEmpty(code) || isLegendRow(code, row[1])) continue;
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(row[1] ?? '').trim(),
      lob: null,
      opening: Number(row[2]) || 0,
      sell_in: Number(row[3]) || 0,
      sell_out: Number(row[4]) || 0,
      closing: Number(row[5]) || 0
    });
  }
  return out;
}

function parseKTC(rows) {
  const out = [];
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    const code = row?.[0];
    if (isEmpty(code) || isLegendRow(code, row[1])) continue;
    const hcmOpen = Number(row[2]) || 0;
    const hcmBuyIn = Number(row[3]) || 0;
    const hcmSellOut = Number(row[4]) || 0;
    const hcmClose = Number(row[5]) || 0;
    const hnOpen = Number(row[6]) || 0;
    const hnBuyIn = Number(row[7]) || 0;
    const hnSellOut = Number(row[8]) || 0;
    const hnClose = Number(row[9]) || 0;
    const totalClose = isEmpty(row[10]) ? hcmClose + hnClose : Number(row[10]);
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(row[1] ?? '').trim(),
      lob: null,
      opening: hcmOpen + hnOpen,
      sell_in: hcmBuyIn + hnBuyIn,
      sell_out: hcmSellOut + hnSellOut,
      closing: totalClose
    });
  }
  return out;
}

function parseMaiHoang(rows) {
  const out = [];
  for (let i = 8; i < rows.length; i++) {
    const row = rows[i];
    const code = row?.[0];
    if (isEmpty(code) || isLegendRow(code, row[1])) continue;
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(row[1] ?? '').trim(),
      lob: null,
      opening: Number(row[2]) || 0,
      sell_in: Number(row[6]) || 0,
      sell_out: Number(row[7]) || 0,
      closing: Number(row[8]) || 0
    });
  }
  return out;
}

function parseSPC(rows) {
  const out = [];
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    const code = row?.[0];
    const name = row?.[1];
    if (isEmpty(code) || isLegendRow(code, name)) continue;
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(name ?? '').trim(),
      lob: null,
      opening: Number(row[2]) || 0,
      sell_in: Number(row[6]) || 0,
      sell_out: Number(row[7]) || 0,
      closing: Number(row[8]) || 0
    });
  }
  return out;
}

function parseMEKO(rows) {
  const out = [];
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    const code = row?.[0];
    const name = row?.[1];
    if (isEmpty(code) || isLegendRow(code, name)) continue;
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(name ?? '').trim(),
      lob: null,
      opening: Number(row[2]) || 0,
      sell_in: Number(row[3]) || 0,
      sell_out: Number(row[4]) || 0,
      closing: Number(row[5]) || 0
    });
  }
  return out;
}

function parseNWH(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = row?.[2];
    if (isEmpty(code) || isLegendRow(code, row[1])) continue;
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(row[1] ?? '').trim(),
      lob: null,
      opening: 0,
      sell_in: 0,
      sell_out: 0,
      closing: Number(row[3]) || 0,
      rowDate: parseAnyDate(row[0])
    });
  }
  return out;
}

function parseAD(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = row?.[2];
    if (isEmpty(code) || isLegendRow(code, row[1])) continue;
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(row[1] ?? '').trim(),
      lob: null,
      opening: 0,
      sell_in: 0,
      sell_out: 0,
      closing: Number(row[3]) || 0
    });
  }
  return out;
}

// headerRows: số dòng đầu (0-indexed, loại trừ) cần quét để tìm ngày tuần —
// cũng là dòng mà data thật bắt đầu ngay sau đó.
const DISTY_RULES = {
  DGW: { parser: parseDGW, headerRows: 5 },
  PSD: { parser: parsePSD, headerRows: 6 },
  KTC: { parser: parseKTC, headerRows: 4 },
  'MAI HOANG': { parser: parseMaiHoang, headerRows: 8 },
  SPC: { parser: parseSPC, headerRows: 4 },
  MEKO: { parser: parseMEKO, headerRows: 5 },
  NWH: { parser: parseNWH, headerRows: 1, perRowDate: true },
  AD: { parser: parseAD, headerRows: 1 }
};

// Dedupe theo disty_code trong cùng 1 sheet (giữ dòng cuối) — tránh lỗi
// "ON CONFLICT DO UPDATE command cannot affect row a second time" khi file
// có 2 dòng cùng mã.
function dedupeByCode(items) {
  const map = new Map();
  for (const it of items) map.set(it.disty_code, it);
  return [...map.values()];
}

async function processSheet(disty, sheetName, rows) {
  const rule = DISTY_RULES[disty];
  const rawItems = rule.parser(rows);
  const items = dedupeByCode(rawItems);
  console.log(`\n── NPP ${disty} (sheet "${sheetName}"): đọc được ${items.length} dòng hợp lệ ──`);
  if (!items.length) return { disty, read: 0, mapped: 0, unmapped: 0 };

  let fallbackWeekDate = null;
  if (!rule.perRowDate) {
    const headerDate = findWeekDate(rows, rule.headerRows);
    fallbackWeekDate = headerDate || process.env.IMPORT_WEEK_DATE || new Date().toISOString().slice(0, 10);
    if (!headerDate) console.log(`  Không tìm thấy ngày trong header — dùng ${fallbackWeekDate}.`);
    else console.log(`  Ngày tuần đọc từ header: ${fallbackWeekDate}`);
  }

  // 1. Upsert product_disty_codes — KHÔNG set sku, để giữ mapping cũ
  // (nếu admin đã map) hoặc NULL nếu mã hoàn toàn mới (chờ admin map sau).
  const codeRows = items.map((it) => ({ disty, disty_code: it.disty_code, disty_name: it.disty_name }));
  const { error: codeErr } = await sb.from('product_disty_codes').upsert(codeRows, { onConflict: 'disty,disty_code' });
  if (codeErr) throw new Error(`[${disty}] Lỗi upsert product_disty_codes: ${codeErr.message}`);

  // 2. Tra lại sku đã map theo (disty, disty_code)
  const codes = items.map((it) => it.disty_code);
  const { data: mapRows, error: mapErr } = await sb
    .from('product_disty_codes')
    .select('disty_code, sku')
    .eq('disty', disty)
    .in('disty_code', codes);
  if (mapErr) throw new Error(`[${disty}] Lỗi đọc product_disty_codes: ${mapErr.message}`);
  const skuByCode = {};
  (mapRows || []).forEach((r) => { skuByCode[r.disty_code] = r.sku; });

  // 3. Upsert disty_inventory — sku=NULL nếu chưa map.
  const invRows = items.map((it) => ({
    sku: skuByCode[it.disty_code] || null,
    disty,
    week_date: it.rowDate || fallbackWeekDate,
    opening: it.opening,
    sell_in: it.sell_in,
    sell_out: it.sell_out,
    closing: it.closing
  }));
  const { error: invErr } = await sb.from('disty_inventory').upsert(invRows, { onConflict: 'sku,disty,week_date' });
  if (invErr) throw new Error(`[${disty}] Lỗi upsert disty_inventory: ${invErr.message}`);

  const mapped = items.filter((it) => skuByCode[it.disty_code]).length;
  const unmapped = items.length - mapped;
  console.log(`  ✓ Đã upsert ${codeRows.length} mã NPP, ${invRows.length} dòng tồn kho — map được ${mapped}, chưa map ${unmapped}.`);
  return { disty, read: items.length, mapped, unmapped };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Cách dùng: node scripts/import_products_from_disty.js <file.xlsx>');
    console.error('  (tuỳ chọn) đặt env IMPORT_WEEK_DATE=YYYY-MM-DD để dùng cho các NPP không có ngày trong file (vd. AD).');
    process.exit(1);
  }

  console.log(`── Đọc file: ${filePath} ──`);
  const wb = XLSX.readFile(filePath);

  const report = [];
  for (const sheetName of wb.SheetNames) {
    const disty = detectDistyFromSheetName(sheetName);
    if (!disty) {
      console.log(`\nBỏ qua sheet "${sheetName}" — không khớp với 8 NPP (DGW/KTC/MAI HOANG/NWH/SPC/AD/PSD/MEKO).`);
      continue;
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
    report.push(await processSheet(disty, sheetName, rows));
  }

  if (!report.length) {
    console.log('\nKhông có sheet nào khớp NPP nào để import.');
    return;
  }

  const totalRead = report.reduce((s, r) => s + r.read, 0);
  const totalMapped = report.reduce((s, r) => s + r.mapped, 0);
  const totalUnmapped = report.reduce((s, r) => s + r.unmapped, 0);

  console.log('\n══════════ BÁO CÁO IMPORT ══════════');
  report.forEach((r) => {
    console.log(`  ${r.disty.padEnd(10)} đọc ${String(r.read).padStart(4)} dòng — map được ${String(r.mapped).padStart(4)} — chưa map ${String(r.unmapped).padStart(4)}`);
  });
  console.log('  ────────────────────────────────────');
  console.log(`  TỔNG       đọc ${totalRead} dòng — map được ${totalMapped} — chưa map ${totalUnmapped}`);
  if (totalUnmapped > 0) {
    console.log(`\n  ${totalUnmapped} dòng chưa map được sku (đã lưu disty_code, sku=NULL) — cần admin map tay vào products_master.`);
  }
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
