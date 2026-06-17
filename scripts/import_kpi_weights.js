import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const FILE_PATH = new URL('../data-imports/KPI Q1.2024.xlsx', import.meta.url);
const SHEET_NAME = 'Official ver 1.0';

// Cùng quy tắc chuẩn hoá category đã dùng ở import_targets.js, để khớp
// đúng với category đã lưu trong bảng targets.
const CATEGORY_FIX = {
  'CND-MB ( B Chipset )': 'CND-MB (B Chipset)',
  'CND-MB ( X,Z Chipset )': 'CND-MB (X,Z Chipset)'
};

function normalizeCategory(raw) {
  const trimmed = String(raw).trim();
  return CATEGORY_FIX[trimmed] || trimmed;
}

async function main() {
  console.log('── Đọc cột D (Item Weight Point) và K (Y2023 Average) từ sheet "Official ver 1.0" ──');
  const wb = XLSX.readFile(FILE_PATH);
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`Không tìm thấy sheet "${SHEET_NAME}"`);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  const updates = [];
  let i = 10; // dòng đầu tiên có Item (0-indexed), tương ứng Excel row 11 — cùng quy ước với import_targets.js
  while (rows[i] && rows[i][2]) {
    const item = rows[i][2];
    const itemWeight = rows[i][3];   // cột D
    const y2023Avg = rows[i][10];    // cột K
    updates.push({
      category: normalizeCategory(item),
      item_weight: (itemWeight === undefined || itemWeight === null || itemWeight === '') ? null : Number(itemWeight),
      y2023_avg: (y2023Avg === undefined || y2023Avg === null || y2023Avg === '') ? null : Number(y2023Avg)
    });
    i += 1;
  }

  console.log(`  Đọc được ${updates.length} dòng Item:`);
  updates.forEach((u) => console.log(`    - ${u.category}: D=${u.item_weight ?? '(trống)'}, K=${u.y2023_avg ?? '(trống)'}`));

  console.log('\n── Update item_weight + y2023_avg vào bảng targets theo category ──');
  let updatedTotal = 0;
  for (const u of updates) {
    const { data, error } = await sb
      .from('targets')
      .update({ item_weight: u.item_weight, y2023_avg: u.y2023_avg })
      .eq('category', u.category)
      .select('id');
    if (error) {
      console.log(`  ✗ ${u.category}: LỖI — ${error.message}`);
      continue;
    }
    console.log(`  ✓ ${u.category}: đã update ${data.length} dòng`);
    updatedTotal += data.length;
  }

  console.log(`\nHoàn tất. Đã update ${updatedTotal} dòng targets.`);
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
