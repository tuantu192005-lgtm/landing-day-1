import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const FILE_PATH = new URL('../data-imports/KPI Q1.2024.xlsx', import.meta.url);
const SHEET_NAME = 'Official ver 1.0';

const NAME_TO_EMAIL = {
  Tu: 'tuantu192005@gmail.com',
  Lap: 'lap@msivn.io.vn',
  Linh: 'linh@msivn.io.vn',
  Tam: 'tam@msivn.io.vn'
};

// Item text trong Excel có spacing khác literal category trong v_kpi_achieved
// cho đúng 2 mục này — chuẩn hoá để JOIN sau này khớp chính xác.
const CATEGORY_FIX = {
  'CND-MB ( B Chipset )': 'CND-MB (B Chipset)',
  'CND-MB ( X,Z Chipset )': 'CND-MB (X,Z Chipset)'
};

function normalizeCategory(raw) {
  const trimmed = String(raw).trim();
  return CATEGORY_FIX[trimmed] || trimmed;
}

async function buildEmailToIdMap() {
  const { data, error } = await sb.from('profiles').select('id, email');
  if (error) throw new Error(`Đọc profiles lỗi: ${error.message}`);
  const map = {};
  for (const row of data) {
    if (row.email) map[row.email] = row.id;
  }
  return map;
}

async function main() {
  console.log('── Bước 1: Đọc Name (B5) + Period (B6) ──');
  const wb = XLSX.readFile(FILE_PATH);
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`Không tìm thấy sheet "${SHEET_NAME}"`);

  const name = sheet['B5'] ? sheet['B5'].v : null;
  const quarter = sheet['B6'] ? sheet['B6'].v : null;
  console.log(`  Name = ${name}, Period (quarter) = ${quarter}`);

  const emailToId = await buildEmailToIdMap();
  const email = NAME_TO_EMAIL[name];
  const assignedTo = email ? emailToId[email] : null;
  if (!assignedTo) throw new Error(`Không map được Name "${name}" sang profiles.id`);
  console.log(`  ${name} → ${email} → ${assignedTo}`);

  console.log('\n── Bước 2: Đọc các dòng Item (cột C) ──');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  const targetRows = [];
  let i = 10; // dòng đầu tiên có Item (0-indexed, tương ứng Excel row 11)
  while (rows[i] && rows[i][2]) {
    const item = rows[i][2];
    const targetQty = rows[i][4];
    const targetStretched = rows[i][5];
    targetRows.push({
      assigned_to: assignedTo,
      quarter: String(quarter),
      category: normalizeCategory(item),
      target_qty: Number(targetQty) || 0,
      target_stretched: (targetStretched === undefined || targetStretched === null || targetStretched === '')
        ? null
        : Number(targetStretched)
    });
    i += 1;
  }

  console.log(`  Đọc được ${targetRows.length} dòng Item:`);
  targetRows.forEach((r) => console.log(`    - ${r.category}: target=${r.target_qty}, stretched=${r.target_stretched ?? '(trống)'}`));

  console.log('\n── Bước 3: Upsert vào bảng targets ──');
  const { data, error } = await sb
    .from('targets')
    .upsert(targetRows, { onConflict: 'assigned_to,quarter,category' })
    .select();

  if (error) {
    console.log(`  ✗ Upsert lỗi: ${error.message}`);
    return;
  }
  console.log(`  ✓ Upsert thành công ${data.length} dòng.`);

  console.log('\nHoàn tất.');
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
