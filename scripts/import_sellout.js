import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const FILE_PATH = new URL('../data-imports/Data sellout Q1.2024.xlsx', import.meta.url);
const SHEET_NAME = 'Data';

const NAME_TO_EMAIL = {
  Tu: 'tuantu192005@gmail.com',
  Lap: 'lap@msivn.io.vn',
  Linh: 'linh@msivn.io.vn',
  Tam: 'tam@msivn.io.vn'
};

function excelSerialToISODate(serial) {
  const utcMs = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(utcMs).toISOString().slice(0, 10);
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
  console.log('── Bước 1: Map tên Sales sang profiles.id ──');
  const emailToId = await buildEmailToIdMap();
  const nameToId = {};
  for (const [name, email] of Object.entries(NAME_TO_EMAIL)) {
    nameToId[name] = emailToId[email] || null;
    console.log(`  ${name} → ${email} → ${nameToId[name] || 'KHÔNG TÌM THẤY id'}`);
  }

  console.log('\n── Bước 2: Đọc file Excel ──');
  const wb = XLSX.readFile(FILE_PATH);
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`Không tìm thấy sheet "${SHEET_NAME}"`);
  const rows = XLSX.utils.sheet_to_json(sheet, { raw: true });
  console.log(`  Đọc được ${rows.length} dòng từ sheet "${SHEET_NAME}".`);

  const toInsert = [];
  const skipped = [];
  for (const row of rows) {
    const salesName = row['Sales'];
    const assignedTo = nameToId[salesName];
    if (!assignedTo) {
      skipped.push(row);
      continue;
    }
    toInsert.push({
      sale_date: excelSerialToISODate(row['Date']),
      customer_name: row['Customer Name'] ?? null,
      assigned_to: assignedTo,
      lob: row['LOB'] ?? null,
      disty: row['Disty'] ?? null,
      model: row['Model'] ?? null,
      quantity: Number(row['Quantity']) || 0,
      platform: row['Platform'] ?? null,
      details_chipset: row['Details Chipset'] ?? null,
      form_factor: row['Form Factor'] ?? null
    });
  }

  console.log(`\n  Sẽ insert: ${toInsert.length} dòng. Bỏ qua (không map được Sales): ${skipped.length} dòng.`);
  if (skipped.length) {
    const names = [...new Set(skipped.map((r) => r['Sales']))];
    console.log('  Tên Sales không map được:', names.join(', '));
  }

  console.log('\n── Bước 3: Insert vào sellout_data theo batch ──');
  const BATCH = 500;
  let insertedTotal = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await sb.from('sellout_data').insert(batch);
    if (error) {
      console.log(`  ✗ Batch ${i}-${i + batch.length}: LỖI — ${error.message}`);
      continue;
    }
    insertedTotal += batch.length;
    console.log(`  ✓ Batch ${i}-${i + batch.length}: OK`);
  }

  console.log(`\nHoàn tất. Đã insert ${insertedTotal}/${toInsert.length} dòng vào sellout_data.`);
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
