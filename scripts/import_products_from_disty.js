import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// ── Normalize helpers (mirrors index.html) ───────────────────────────────
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
    'vỏ máy tính msi ', 'vỏ case msi ',
    'nguồn msi ',
    'tản nhiệt cpu msi ', 'tản nhiệt msi ',
    'ổ cứng ssd msi ', 'ổ cứng msi ',
    'bộ nhớ msi ',
    'cạc màn hình msi ', 'cạc màn hình ',
    'cạc đồ họa msi ', 'cạc đồ họa ',
    'card màn hình msi ', 'card màn hình ',
    'card đồ họa msi ', 'card đồ họa ',
    'màn hình gaming msi ',
    '(lcd) msi ', '(lcd) ',
    'màn hình lcd msi ', 'màn hình lcd ', 'màn hình msi ', 'lcd msi ', 'lcd ',
    'mainboard msi ', 'main msi ', 'vga msi ',
    'bo mạch chủ msi ', 'bo mạch chủ ', 'màn hình ', 'mainboard ', 'main ',
    'msi ', 'msı '
  ];
  for (const p of prefixes) { if (n.startsWith(p)) { n = n.slice(p.length); break; } }
  for (const s of [' - new', ' (new)']) { if (n.endsWith(s)) { n = n.slice(0, -s.length); break; } }
  n = n.replace(/\s*\(model:[^)]+\)\s*[\d.]*\s*inch\b/i, '');
  n = n.replace(/\s*[\d.]+['''"]+$/, '');
  n = n.replace(/\s*\/\d+[''"]?\s*inch.*/i, '');
  n = n.replace(/\s*-\s*/g, '-');
  return n.trim().replace(/\s+/g, ' ');
}

function tsMatchKey(norm) {
  let n = (norm || '').toLowerCase().trim();
  if (n.startsWith('geforce ')) n = n.slice(8);
  if (n.startsWith('radeon '))  n = n.slice(7);
  return n;
}

function computeCleanSkuName(distyName) {
  if (!distyName) return '';
  const orig = distyName.trim();
  if (/^\((PC|LAPTOP|MINI PC)\)\s/i.test(orig)) return orig.toUpperCase().replace(/\b(PC|LAPTOP|MINI PC)\b/, m => m);
  const lower = orig.toLowerCase();
  const prefixes = [
    '(vga card) msi ', '(vga card) ',
    '(main board) msi ', '(main board) ',
    '(mainboard) msi ', '(mainboard) ',
    'tấm mạch in đã lắp ráp msi ', 'tấm mạch in đã lắp ráp ',
    'tấm mạch in msi ',
    'bảng mạch chính msi ', 'bảng mạch chính ',
    'nguồn máy tính msi ', 'nguồn máy tính ',
    'vỏ máy tính msi ', 'vỏ case msi ',
    'nguồn msi ',
    'tản nhiệt cpu msi ', 'tản nhiệt msi ',
    'ổ cứng ssd msi ', 'ổ cứng msi ',
    'bộ nhớ msi ',
    'cạc màn hình msi ', 'cạc màn hình ',
    'cạc đồ họa msi ', 'cạc đồ họa ',
    'card màn hình msi ', 'card màn hình ',
    'card đồ họa msi ', 'card đồ họa ',
    'màn hình gaming msi ',
    'màn hình lcd msi ', 'màn hình msi ', 'lcd msi ',
    'mainboard msi ', 'main msi ', 'vga msi ',
    'bo mạch chủ msi ', 'bo mạch chủ ', 'màn hình ', 'mainboard ', 'main ',
  ];
  let stripped = orig;
  for (const p of prefixes) {
    if (lower.startsWith(p)) { stripped = orig.slice(p.length); break; }
  }
  const sl = stripped.toLowerCase();
  if (sl.startsWith('msi ') || sl.startsWith('msı ')) stripped = stripped.slice(4);
  let result = stripped.toUpperCase();
  if (result.startsWith('GEFORCE ')) result = 'GeForce ' + result.slice(8);
  else if (result.startsWith('RADEON ')) result = 'Radeon ' + result.slice(7);
  return result.trim().replace(/\s+/g, ' ');
}

function mapDistyLob(lob) {
  if (!lob) return 'Unknown';
  const l = lob.toLowerCase().trim();
  if (l === 'vga' || l.includes('vga') || l.includes('graphic')) return 'VGA';
  if (l === 'mb' || l.includes('mainboard') || l.includes('main board') || l.includes('motherboard') || l === 'maiboard') return 'MB';
  if (l === 'lcd' || l.includes('lcd') || l.includes('monitor') || l.includes('display') || l === 'mnt') return 'MNT';
  if (l === 'case' || l === 'chassis' || l.includes('case') || l.includes('chassis')) return 'CASE';
  if (l === 'psu' || l.includes('psu') || l.includes('power')) return 'PSU';
  if (l === 'ssd' || l.includes('ssd') || l.includes('storage') || l.includes('spatium')) return 'SSD';
  if (l === 'cooler' || l.includes('cool') || l.includes('fan') || l.includes('liquid')) return 'COOLER';
  return 'Unknown';
}

function inferLobFromName(name) {
  const n = (name || '').toLowerCase();
  if (/\b(geforce|radeon|rtx|gtx|rx\s+\d)/.test(n)) return 'VGA';
  if (/\b[zxbh]\d{3,4}\b/.test(n) || /\b(motherboard|mainboard)\b/.test(n)) return 'MB';
  if (/\b(lcd|monitor|optix|mag g\d|qhd|ips|va\s+panel)\b/.test(n)) return 'MNT';
  if (/\b(forge|velox|gungnir|vampiric|pano m\d|airflow)\b/.test(n)) return 'CASE';
  if (/\b(spatium|nvme)\b/.test(n)) return 'SSD';
  if (/\b(coreliquid|aircooler|fan\b|cooling)\b/.test(n)) return 'COOLER';
  if (/\b(mpe|meg ai|mag a\d{3,}p)\b/.test(n)) return 'PSU';
  return 'Unknown';
}

async function loadNormKeyMap() {
  const map = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('products_master').select('sku, normalized_name').range(from, from + 999);
    if (error) throw new Error('Lỗi load normKeyMap: ' + error.message);
    if (!data?.length) break;
    for (const { sku, normalized_name } of data) {
      const k = tsMatchKey(normalized_name);
      if (k && !map.has(k)) map.set(k, sku);
    }
    if (data.length < 1000) break;
  }
  return map;
}

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

// Dòng chú giải cột ở SPC nằm ngay trong cột LOB (vd. ["LOB","CODE","TOTAL",...])
// — kiểm tra riêng cột LOB vì cột này đứng trước Internal Code/Model Name.
function isLegendLobValue(v) {
  if (isEmpty(v)) return true;
  const s = stripAccents(v).toUpperCase();
  return s === 'LOB' || s === 'CODE' || s === 'TOTAL' || s === 'NAN';
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
      opening: Math.round(Number(row[2])) || 0,
      sell_in: Math.round(Number(row[3])) || 0,
      sell_out: Math.round(Number(row[4])) || 0,
      closing: Math.round(Number(row[5])) || 0
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
      opening: Math.round(Number(row[2])) || 0,
      sell_in: Math.round(Number(row[3])) || 0,
      sell_out: Math.round(Number(row[4])) || 0,
      closing: Math.round(Number(row[5])) || 0
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
    const hcmOpen = Math.round(Number(row[2])) || 0;
    const hcmBuyIn = Math.round(Number(row[3])) || 0;
    const hcmSellOut = Math.round(Number(row[4])) || 0;
    const hcmClose = Math.round(Number(row[5])) || 0;
    const hnOpen = Math.round(Number(row[6])) || 0;
    const hnBuyIn = Math.round(Number(row[7])) || 0;
    const hnSellOut = Math.round(Number(row[8])) || 0;
    const hnClose = Math.round(Number(row[9])) || 0;
    const totalClose = isEmpty(row[10]) ? hcmClose + hnClose : Math.round(Number(row[10]));
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
      opening: Math.round(Number(row[2])) || 0,
      sell_in: Math.round(Number(row[6])) || 0,
      sell_out: Math.round(Number(row[7])) || 0,
      closing: Math.round(Number(row[8])) || 0
    });
  }
  return out;
}

function parseSPC(rows) {
  const out = [];
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    const lob = row?.[0];
    const code = row?.[1];
    const name = row?.[2];
    if (isEmpty(code) || isLegendLobValue(lob)) continue;
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(name ?? '').trim(),
      lob: String(lob).trim(),
      opening: Math.round(Number(row[3])) || 0,
      sell_in: Math.round(Number(row[7])) || 0,
      sell_out: Math.round(Number(row[8])) || 0,
      closing: Math.round(Number(row[9])) || 0
    });
  }
  return out;
}

function parseMEKO(rows) {
  const out = [];
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    const lob = row?.[0];
    const code = row?.[1];
    const name = row?.[2];
    if (isEmpty(lob) || isEmpty(code)) continue;
    out.push({
      disty_code: String(code).trim(),
      disty_name: String(name ?? '').trim(),
      lob: String(lob).trim(),
      opening: Math.round(Number(row[3])) || 0,
      sell_in: Math.round(Number(row[4])) || 0,
      sell_out: Math.round(Number(row[5])) || 0,
      closing: Math.round(Number(row[6])) || 0
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
      closing: Math.round(Number(row[3])) || 0,
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
      closing: Math.round(Number(row[3])) || 0
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

const LAPTOP_PATTERNS_LC = ['laptop', 'máy tính xách tay', 'notebook', 'xách tay'];
function isLaptopItem(it) {
  const n = (it.disty_name || '').toLowerCase();
  return LAPTOP_PATTERNS_LC.some(p => n.includes(p));
}

async function processSheet(disty, sheetName, rows, normKeyMap) {
  const rule = DISTY_RULES[disty];
  const rawItems = rule.parser(rows).filter(it => !isLaptopItem(it));
  const items = dedupeByCode(rawItems);
  console.log(`\n── NPP ${disty} (sheet "${sheetName}"): đọc được ${items.length} dòng hợp lệ ──`);
  if (!items.length) return { disty, read: 0, mapped: 0, unmapped: 0, newProds: 0 };

  let fallbackWeekDate = null;
  if (!rule.perRowDate) {
    const headerDate = findWeekDate(rows, rule.headerRows);
    fallbackWeekDate = headerDate || process.env.IMPORT_WEEK_DATE || new Date().toISOString().slice(0, 10);
    if (!headerDate) console.log(`  Không tìm thấy ngày trong header — dùng ${fallbackWeekDate}.`);
    else console.log(`  Ngày tuần đọc từ header: ${fallbackWeekDate}`);
  }

  // 1. Resolve SKU for each item: lookup normKeyMap, or create new products_master row
  const skuByCode = {};
  const newPmRows = [];
  for (const it of items) {
    const matchKey = tsMatchKey(normalizeModelName(it.disty_name));
    let sku = normKeyMap.get(matchKey) || null;
    if (!sku) {
      const cleanName = computeCleanSkuName(it.disty_name);
      if (cleanName) {
        sku = cleanName;
        const norm = normalizeModelName(cleanName);
        const normKey = tsMatchKey(norm);
        if (!normKeyMap.has(normKey)) {
          const lob = it.lob ? mapDistyLob(it.lob) : inferLobFromName(cleanName);
          newPmRows.push({ sku: cleanName, model_name: cleanName, normalized_name: norm, lob, is_active: true });
          normKeyMap.set(normKey, cleanName);
        }
      }
    }
    skuByCode[it.disty_code] = sku;
  }

  // 2. INSERT new products_master rows FIRST — FK constraint requires these to exist before product_disty_codes
  if (newPmRows.length) {
    const { error } = await sb.from('products_master').upsert(newPmRows, { onConflict: 'sku' });
    if (error) throw new Error(`[${disty}] Lỗi tạo products_master mới: ${error.message}`);
    console.log(`  Đã tạo ${newPmRows.length} sản phẩm mới trong products_master`);
  }

  // 3. Upsert product_disty_codes WITH sku set immediately
  const codeRows = items.map(it => ({
    disty, disty_code: it.disty_code, disty_name: it.disty_name,
    sku: skuByCode[it.disty_code] || null
  }));
  const { error: codeErr } = await sb.from('product_disty_codes').upsert(codeRows, { onConflict: 'disty,disty_code' });
  if (codeErr) throw new Error(`[${disty}] Lỗi upsert product_disty_codes: ${codeErr.message}`);

  // 4. Upsert disty_inventory WITH sku
  const invRows = items.map(it => ({
    disty_code: it.disty_code,
    sku: skuByCode[it.disty_code] || null,
    disty,
    week_date: it.rowDate || fallbackWeekDate,
    opening: it.opening, sell_in: it.sell_in, sell_out: it.sell_out, closing: it.closing
  }));
  const { error: invErr } = await sb.from('disty_inventory').upsert(invRows, { onConflict: 'disty_code,disty,week_date' });
  if (invErr) throw new Error(`[${disty}] Lỗi upsert disty_inventory: ${invErr.message}`);

  const mapped = items.filter(it => skuByCode[it.disty_code]).length;
  const unmapped = items.length - mapped;
  console.log(`  ✓ ${codeRows.length} mã NPP, ${invRows.length} tồn kho — map ${mapped} SKU cũ, ${newPmRows.length} SKU mới tạo, ${unmapped - newPmRows.length} chưa có SKU.`);
  return { disty, read: items.length, mapped, unmapped, newProds: newPmRows.length };
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

  console.log('── Load products_master normKeyMap ──');
  const normKeyMap = await loadNormKeyMap();
  console.log(`  Loaded ${normKeyMap.size} entries.\n`);

  const report = [];
  for (const sheetName of wb.SheetNames) {
    const disty = detectDistyFromSheetName(sheetName);
    if (!disty) {
      console.log(`\nBỏ qua sheet "${sheetName}" — không khớp với 8 NPP (DGW/KTC/MAI HOANG/NWH/SPC/AD/PSD/MEKO).`);
      continue;
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
    report.push(await processSheet(disty, sheetName, rows, normKeyMap));
  }

  if (!report.length) {
    console.log('\nKhông có sheet nào khớp NPP nào để import.');
    return;
  }

  const totalRead = report.reduce((s, r) => s + r.read, 0);
  const totalMapped = report.reduce((s, r) => s + r.mapped, 0);
  const totalNew = report.reduce((s, r) => s + (r.newProds || 0), 0);
  const totalUnmapped = report.reduce((s, r) => s + r.unmapped, 0) - totalNew;

  console.log('\n══════════ BÁO CÁO IMPORT ══════════');
  report.forEach((r) => {
    console.log(`  ${r.disty.padEnd(10)} đọc ${String(r.read).padStart(4)} — map ${String(r.mapped).padStart(4)} — mới ${String(r.newProds || 0).padStart(3)} — chưa có SKU ${String(Math.max(0, r.unmapped - (r.newProds || 0))).padStart(3)}`);
  });
  console.log('  ──────────────────────────────────────────');
  console.log(`  TỔNG       đọc ${totalRead} — map ${totalMapped} — mới tạo ${totalNew} — chưa có SKU ${totalUnmapped}`);
  if (totalUnmapped > 0) {
    console.log(`\n  ${totalUnmapped} dòng không tạo được SKU (disty_name rỗng hoặc không hợp lệ).`);
  }
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
