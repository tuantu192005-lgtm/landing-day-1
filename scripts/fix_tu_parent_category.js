import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map((l) => l.trim()).find((l) => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SUPA_KEY);

// v_kpi_full tính target_e của hạng mục CON bằng target_stretched của hạng
// mục CHA (tra theo parent_category) × y2023_avg của chính dòng con. Toàn bộ
// 64 dòng của Tú (4 quý × 16 category) đang có parent_category = NULL ở MỌI
// dòng — kể cả các dòng con thật sự có cha (CND-MB (B Chipset), CND-MB
// (X,Z Chipset), CND-GMNT ( QHD ), GNP-VGA ( GTX + RTX )) — khiến view không
// tìm được cha, tính sai target_e cho các dòng này. Lập/Linh/Tâm vẫn đúng
// (đã kiểm tra: đúng 4 dòng con có parent_category mỗi quý) -> dùng Lập làm
// template chuẩn để backfill lại cho Tú.

const TU_ID = '2a4d4e1b-f197-4d89-9d61-82abc346bba2';
const TEMPLATE_ID = '80004214-c116-42e3-b511-36ebe488e51a'; // Lập
const EXPECTED_TU_NAME = 'Tú';
const EXPECTED_TEMPLATE_NAME = 'Lập';
const QUARTERS = ['2024 Q1', '2024 Q2', '2024 Q3', '2024 Q4'];

async function main() {
  const { data: tuProfile, error: tuErr } = await sb.from('profiles').select('id, full_name').eq('id', TU_ID).maybeSingle();
  if (tuErr) { console.error('Lỗi đọc profile Tú:', tuErr.message); process.exit(1); }
  if (!tuProfile || tuProfile.full_name !== EXPECTED_TU_NAME) {
    console.error(`CẢNH BÁO: id=${TU_ID} có full_name="${tuProfile?.full_name}", khác kỳ vọng "${EXPECTED_TU_NAME}" — dừng để an toàn.`);
    process.exit(1);
  }
  const { data: tplProfile, error: tplErr } = await sb.from('profiles').select('id, full_name').eq('id', TEMPLATE_ID).maybeSingle();
  if (tplErr) { console.error('Lỗi đọc profile Lập:', tplErr.message); process.exit(1); }
  if (!tplProfile || tplProfile.full_name !== EXPECTED_TEMPLATE_NAME) {
    console.error(`CẢNH BÁO: id=${TEMPLATE_ID} có full_name="${tplProfile?.full_name}", khác kỳ vọng "${EXPECTED_TEMPLATE_NAME}" — dừng để an toàn.`);
    process.exit(1);
  }
  console.log(`Xác nhận: Tú=${tuProfile.full_name}, template=${tplProfile.full_name}.\n`);

  console.log('========== BƯỚC 1: Lấy mapping parent_category chuẩn từ Lập (2024 Q1) ==========');
  const { data: tplRows, error: tplRowsErr } = await sb
    .from('targets').select('category, parent_category').eq('assigned_to', TEMPLATE_ID).eq('quarter', '2024 Q1');
  if (tplRowsErr) { console.error('Lỗi đọc template:', tplRowsErr.message); process.exit(1); }
  const parentByCategory = {};
  tplRows.forEach((r) => { parentByCategory[r.category] = r.parent_category; });
  Object.entries(parentByCategory).forEach(([cat, parent]) => console.log(`  ${cat} -> parent_category = ${parent === null ? 'NULL' : `"${parent}"`}`));

  console.log('\n========== BƯỚC 2: Cập nhật parent_category cho 64 dòng của Tú ==========');
  let updatedCount = 0;
  for (const quarter of QUARTERS) {
    const { data: tuRows, error: tuRowsErr } = await sb
      .from('targets').select('id, category, parent_category').eq('assigned_to', TU_ID).eq('quarter', quarter);
    if (tuRowsErr) { console.error(`Lỗi đọc Tú ${quarter}:`, tuRowsErr.message); process.exit(1); }

    for (const row of tuRows) {
      const correctParent = parentByCategory[row.category];
      if (correctParent === undefined) {
        console.warn(`  CẢNH BÁO: category "${row.category}" của Tú không có trong template Lập — bỏ qua.`);
        continue;
      }
      if (row.parent_category === correctParent) continue; // đã đúng, không cần update

      console.log(`  [${quarter}] ${row.category}: parent_category ${row.parent_category === null ? 'NULL' : `"${row.parent_category}"`} -> ${correctParent === null ? 'NULL' : `"${correctParent}"`}`);
      const { error: updErr } = await sb.from('targets').update({ parent_category: correctParent }).eq('id', row.id);
      if (updErr) { console.error(`  Lỗi update id=${row.id}:`, updErr.message); process.exit(1); }
      updatedCount++;
    }
  }
  console.log(`\n  Đã cập nhật ${updatedCount} dòng.`);

  console.log('\n========== BƯỚC 3: Verify Tú 2024 Q1 khớp đúng cấu trúc Lập ==========');
  const { data: finalRows, error: finalErr } = await sb
    .from('targets').select('category, parent_category').eq('assigned_to', TU_ID).eq('quarter', '2024 Q1').order('category');
  if (finalErr) { console.error('Lỗi verify:', finalErr.message); process.exit(1); }
  let allMatch = true;
  finalRows.forEach((r) => {
    const expected = parentByCategory[r.category];
    const match = r.parent_category === expected;
    if (!match) allMatch = false;
    console.log(`  ${r.category}: parent_category="${r.parent_category}" (kỳ vọng "${expected}") ${match ? 'OK' : 'SAI'}`);
  });
  console.log(`\n  KHỚP HOÀN TOÀN VỚI LẬP: ${allMatch ? 'ĐÚNG' : 'SAI — kiểm tra lại'}`);

  console.log('\n========== BƯỚC 4: Kiểm tra lại target_e của Tú sau khi sửa (qua v_kpi_full) ==========');
  const { data: viewRows, error: viewErr } = await sb
    .from('v_kpi_full').select('category, parent_category, target_e').eq('assigned_to', TU_ID).eq('quarter', '2024 Q1')
    .in('category', ['CND-MB (B Chipset)', 'CND-MB (X,Z Chipset)', 'CND-GMNT ( QHD )', 'GNP-VGA ( GTX + RTX )']).order('category');
  if (viewErr) { console.error('Lỗi đọc v_kpi_full:', viewErr.message); process.exit(1); }
  viewRows.forEach((r) => console.log(`  ${r.category} (cha=${r.parent_category}): target_e=${r.target_e}`));
}

main();
