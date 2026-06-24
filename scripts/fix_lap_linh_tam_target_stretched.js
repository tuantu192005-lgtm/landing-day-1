import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map((l) => l.trim()).find((l) => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SUPA_KEY);

// Cùng lỗi đã sửa cho Tú: các dòng Q2-Q4/2024 được tạo qua màn "Nhập Target
// Theo Quý" (trước khi sửa code) bị hardcode target_stretched=0,
// item_weight/y2023_avg/parent_category=null — khiến v_kpi_full tính
// target_f/target_e/Hit Rate ra 0/null dù target_qty có số thật.
// Khác với Tú (phải mượn template của Lập vì Q1 gốc của Tú đã bị xoá),
// Lập/Linh/Tâm vẫn còn Q1 ĐÚNG nguyên vẹn — dùng chính Q1 của từng người
// làm template, không mượn người khác.
const PEOPLE = [
  { id: '80004214-c116-42e3-b511-36ebe488e51a', expectedName: 'Lập' },
  { id: 'c21deac8-e2ab-4d11-8269-dada620941b6', expectedName: 'Linh' },
  { id: '8ad49887-563a-44aa-bdcc-46a69734b402', expectedName: 'Tâm' }
];
const BROKEN_QUARTERS = ['2024 Q2', '2024 Q3', '2024 Q4'];

async function main() {
  for (const person of PEOPLE) {
    const { data: profile, error: profileErr } = await sb
      .from('profiles').select('id, full_name').eq('id', person.id).maybeSingle();
    if (profileErr) { console.error('Lỗi đọc profile:', profileErr.message); process.exit(1); }
    if (!profile || profile.full_name !== person.expectedName) {
      console.error(`CẢNH BÁO: id=${person.id} có full_name="${profile?.full_name}", khác kỳ vọng "${person.expectedName}" — bỏ qua người này để an toàn.`);
      continue;
    }

    console.log(`\n========== ${profile.full_name} ==========`);

    console.log('-- BƯỚC 1: lấy template Q1 (đã đúng, dùng làm nguồn item_weight/y2023_avg/parent_category) --');
    const { data: q1Rows, error: q1Err } = await sb
      .from('targets')
      .select('category, item_weight, y2023_avg, parent_category')
      .eq('assigned_to', person.id)
      .eq('quarter', '2024 Q1');
    if (q1Err) { console.error('Lỗi đọc Q1:', q1Err.message); process.exit(1); }
    const q1ByCategory = {};
    q1Rows.forEach((r) => { q1ByCategory[r.category] = r; });
    console.log(`   Lấy được template cho ${q1Rows.length} category từ Q1.`);

    console.log('-- BƯỚC 2: lấy các dòng Q2-Q4 hiện có --');
    const { data: brokenRows, error: rowsErr } = await sb
      .from('targets')
      .select('id, quarter, category, target_qty, target_stretched, item_weight, y2023_avg, parent_category')
      .eq('assigned_to', person.id)
      .in('quarter', BROKEN_QUARTERS)
      .order('quarter')
      .order('category');
    if (rowsErr) { console.error('Lỗi đọc Q2-Q4:', rowsErr.message); process.exit(1); }
    console.log(`   Tổng số dòng Q2-Q4: ${brokenRows.length}`);

    console.log('-- BƯỚC 3: cập nhật từng dòng --');
    let updatedCount = 0;
    for (const row of brokenRows) {
      const tpl = q1ByCategory[row.category];
      const newStretched = row.target_qty; // giữ đúng số người đó đã nhập
      const newWeight = tpl ? tpl.item_weight : row.item_weight;
      const newAvg = tpl ? tpl.y2023_avg : row.y2023_avg;
      const newParent = tpl ? tpl.parent_category : row.parent_category;

      console.log(`   [${row.quarter}] ${row.category}: target_stretched ${row.target_stretched} -> ${newStretched}, item_weight ${row.item_weight} -> ${newWeight}, y2023_avg ${row.y2023_avg} -> ${newAvg}`);

      const { error: updErr } = await sb
        .from('targets')
        .update({ target_stretched: newStretched, item_weight: newWeight, y2023_avg: newAvg, parent_category: newParent })
        .eq('id', row.id);
      if (updErr) { console.error(`   Lỗi update id=${row.id}:`, updErr.message); process.exit(1); }
      updatedCount++;
    }
    console.log(`   Đã cập nhật ${updatedCount} dòng cho ${profile.full_name}.`);
  }

  console.log('\n========== VERIFY SAU KHI SỬA (tất cả người, quarter != 2024 Q1) ==========');
  const { data: allProfiles } = await sb.from('profiles').select('id, full_name');
  const nameById = {}; allProfiles.forEach((p) => { nameById[p.id] = p.full_name; });

  const allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('targets')
      .select('assigned_to, quarter, target_qty, target_stretched, item_weight')
      .neq('quarter', '2024 Q1')
      .range(from, from + 999);
    if (error) { console.error('Lỗi verify:', error.message); process.exit(1); }
    if (!data.length) break;
    allRows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const grouped = {};
  allRows.forEach((r) => {
    const name = nameById[r.assigned_to] || r.assigned_to;
    const key = `${name}__${r.quarter}`;
    grouped[key] = grouped[key] || { name, quarter: r.quarter, qty: 0, stretched: 0, hasWeight: 0 };
    grouped[key].qty += (r.target_qty || 0);
    grouped[key].stretched += (r.target_stretched || 0);
    if (r.item_weight !== null && r.item_weight !== 0) grouped[key].hasWeight++;
  });

  Object.values(grouped)
    .sort((a, b) => a.name.localeCompare(b.name) || a.quarter.localeCompare(b.quarter))
    .forEach((g) => {
      const match = g.qty === g.stretched ? 'KHỚP' : 'LỆCH';
      console.log(`  ${g.name} | ${g.quarter} | qty=${g.qty} | stretched=${g.stretched} (${match}) | has_weight=${g.hasWeight}`);
    });
}

main();
