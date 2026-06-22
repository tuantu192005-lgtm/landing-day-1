import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import XLSX from 'xlsx';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map((l) => l.trim()).find((l) => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SUPA_KEY);

const EMPLOYEES = [
  { id: '2a4d4e1b-f197-4d89-9d61-82abc346bba2', name: 'Tú' },
  { id: '80004214-c116-42e3-b511-36ebe488e51a', name: 'Lập' },
  { id: 'c21deac8-e2ab-4d11-8269-dada620941b6', name: 'Linh' },
  { id: '8ad49887-563a-44aa-bdcc-46a69734b402', name: 'Tâm' }
];

function normalizeNameForMatch(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .trim().toLowerCase();
}
const nameLookup = {};
EMPLOYEES.forEach((e) => { nameLookup[normalizeNameForMatch(e.name)] = e.id; });
const idToName = Object.fromEntries(EMPLOYEES.map((e) => [e.id, e.name]));

function excelSerialToISODate(serial) {
  if (!serial) return null;
  const utcMs = Date.UTC(1899, 11, 30) + Math.round(Number(serial)) * 86400000;
  return new Date(utcMs).toISOString().slice(0, 10);
}

function rowKey(r) {
  return [r.sale_date, r.customer_name, r.lob, r.disty, r.model, r.quantity, r.platform, r.details_chipset, r.form_factor]
    .map((v) => (v === null || v === undefined ? '' : String(v).trim())).join('|');
}

// Supabase/PostgREST giới hạn cứng 1000 dòng/request (db-max-rows) bất kể
// .range() xin nhiều hơn — phải phân trang lặp lại để lấy đủ toàn bộ dữ liệu.
const PAGE_SIZE = 1000;
async function fetchAllPages(queryFactory) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}

console.log('1) Phân bố sellout_data hiện tại theo assigned_to:');
const { data: allRows, error: allErr } = await fetchAllPages((from, to) =>
  sb.from('sellout_data').select('assigned_to').order('id', { ascending: true }).range(from, to)
);
if (allErr) { console.error('Lỗi:', allErr.message); process.exit(1); }
const countByEmp = {};
(allRows || []).forEach((r) => { countByEmp[r.assigned_to] = (countByEmp[r.assigned_to] || 0) + 1; });
Object.entries(countByEmp).forEach(([id, count]) => {
  console.log(`   ${idToName[id] || id}: ${count} dòng`);
});
console.log(`   Tổng: ${(allRows || []).length} dòng\n`);

const files = ['data-imports/Data sellout Q1.2024.xlsx', 'data-imports/Data sellout Q1.2024 - test.xlsx'];

for (const file of files) {
  console.log(`2) Đối chiếu file: ${file}`);
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets['Data'];
  const fileRows = XLSX.utils.sheet_to_json(sheet, { raw: true });

  const expected = [];
  let unmapped = 0;
  fileRows.forEach((row) => {
    const saleDate = excelSerialToISODate(row['Date']);
    if (!saleDate) return;
    const empId = nameLookup[normalizeNameForMatch(row['Sales'])];
    if (!empId) { unmapped += 1; return; }
    expected.push({
      key: rowKey({
        sale_date: saleDate, customer_name: row['Customer Name'] ?? null, lob: row['LOB'] ?? null,
        disty: row['Disty'] ?? null, model: row['Model'] ?? null, quantity: Number(row['Quantity']) || 0,
        platform: row['Platform'] ?? null, details_chipset: row['Details Chipset'] ?? null, form_factor: row['Form Factor'] ?? null
      }),
      expectedEmpId: empId,
      expectedName: idToName[empId],
      sale_date: saleDate
    });
  });

  const dates = [...new Set(expected.map((e) => e.sale_date))];
  const { data: dbRows, error } = await fetchAllPages((from, to) =>
    sb.from('sellout_data')
      .select('sale_date, customer_name, lob, disty, model, quantity, platform, details_chipset, form_factor, assigned_to')
      .in('sale_date', dates)
      .order('id', { ascending: true })
      .range(from, to)
  );
  if (error) { console.error('   Lỗi query DB:', error.message); continue; }

  const dbByKey = {};
  (dbRows || []).forEach((r) => {
    const k = rowKey(r);
    (dbByKey[k] = dbByKey[k] || []).push(r.assigned_to);
  });

  let mismatchCount = 0;
  let notFoundCount = 0;
  const examples = [];
  expected.forEach((e) => {
    const dbAssigned = dbByKey[e.key];
    if (!dbAssigned || !dbAssigned.length) { notFoundCount += 1; return; }
    if (!dbAssigned.includes(e.expectedEmpId)) {
      mismatchCount += 1;
      if (examples.length < 10) {
        examples.push(`      ${e.sale_date} | kỳ vọng=${e.expectedName} | DB hiện có=${dbAssigned.map((id) => idToName[id] || id).join(',')}`);
      }
    }
  });

  console.log(`   File có ${fileRows.length} dòng, ${expected.length} dòng map được người, ${unmapped} dòng không map được tên.`);
  console.log(`   Khớp được với DB theo key tự nhiên: ${expected.length - notFoundCount}/${expected.length} (không tìm thấy trong DB: ${notFoundCount}).`);
  console.log(`   => Số dòng LỆCH assigned_to (DB không có đúng người kỳ vọng): ${mismatchCount}`);
  if (examples.length) {
    console.log('   Ví dụ:');
    examples.forEach((line) => console.log(line));
  }
  console.log('');
}

console.log('Lưu ý: script này CHỈ ĐỌC (không update gì). Nếu có lệch và muốn sửa, cần xác nhận trước khi viết script UPDATE riêng.');
