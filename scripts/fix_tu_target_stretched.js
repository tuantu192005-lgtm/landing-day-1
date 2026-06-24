import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map((l) => l.trim()).find((l) => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SUPA_KEY);

const TU_ID = '2a4d4e1b-f197-4d89-9d61-82abc346bba2';
const TEMPLATE_ID = '80004214-c116-42e3-b511-36ebe488e51a'; // Lập — dùng làm nguồn item_weight/y2023_avg
const EXPECTED_TU_NAME = 'Tú';
const EXPECTED_TEMPLATE_NAME = 'Lập';

// Bug: màn "Nhập Target Theo Quý" tạo dòng mới nhưng hardcode
// target_stretched=0, item_weight=null, y2023_avg=null — v_kpi_full tính
// target_f/target_e trực tiếp từ target_stretched (không fallback về
// target_qty) nên Hit Rate/Achieve Rate của Tú ra 0/null dù target_qty có
// số thật. Script này backfill lại 1 lần cho 64 dòng hiện có của Tú:
//   - target_stretched = target_qty (đúng số Tú đã nhập qua grid)
//   - item_weight/y2023_avg = copy từ Lập theo từng category (đã verify
//     các nhân viên dùng CHUNG đúng 1 bảng trọng số/y2023_avg theo category,
//     không phải số riêng từng người).

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
  console.log(`Xác nhận: Tú=${tuProfile.full_name}, nguồn template=${tplProfile.full_name}. Tiếp tục.\n`);

  console.log('========== BƯỚC 1: TRẠNG THÁI TRƯỚC KHI SỬA (Tú) ==========');
  const { data: tuRows, error: rowsErr } = await sb
    .from('targets')
    .select('id, quarter, category, target_qty, target_stretched, item_weight, y2023_avg')
    .eq('assigned_to', TU_ID)
    .order('quarter')
    .order('category');
  if (rowsErr) { console.error('Lỗi đọc targets của Tú:', rowsErr.message); process.exit(1); }
  console.log(`  Tổng số dòng: ${tuRows.length}`);
  const brokenRows = tuRows.filter((r) => (r.target_stretched || 0) === 0 || r.item_weight === null);
  console.log(`  Số dòng cần backfill (target_stretched=0 hoặc item_weight=null): ${brokenRows.length}`);

  console.log('\n========== BƯỚC 2: LẤY TEMPLATE item_weight/y2023_avg TỪ LẬP ==========');
  const { data: tplRows, error: tplRowsErr } = await sb
    .from('targets')
    .select('category, item_weight, y2023_avg')
    .eq('assigned_to', TEMPLATE_ID)
    .eq('quarter', '2024 Q1');
  if (tplRowsErr) { console.error('Lỗi đọc template Lập:', tplRowsErr.message); process.exit(1); }
  const tplByCategory = {};
  tplRows.forEach((r) => { tplByCategory[r.category] = r; });
  console.log(`  Lấy được template cho ${tplRows.length} category.`);

  console.log('\n========== BƯỚC 3: CẬP NHẬT TỪNG DÒNG ==========');
  let updatedCount = 0;
  for (const row of brokenRows) {
    const tpl = tplByCategory[row.category];
    const newStretched = row.target_qty; // giữ đúng số Tú đã nhập
    const newWeight = row.item_weight ?? (tpl ? tpl.item_weight : null);
    const newAvg = row.y2023_avg ?? (tpl ? tpl.y2023_avg : null);

    console.log(`  [${row.quarter}] ${row.category}: target_stretched ${row.target_stretched} -> ${newStretched}, item_weight ${row.item_weight} -> ${newWeight}, y2023_avg ${row.y2023_avg} -> ${newAvg}`);

    const { error: updErr } = await sb
      .from('targets')
      .update({ target_stretched: newStretched, item_weight: newWeight, y2023_avg: newAvg })
      .eq('id', row.id);
    if (updErr) { console.error(`  Lỗi update id=${row.id}:`, updErr.message); process.exit(1); }
    updatedCount++;
  }
  console.log(`\n  Đã cập nhật ${updatedCount} dòng.`);

  console.log('\n========== BƯỚC 4: VERIFY SAU KHI SỬA ==========');
  const { data: finalRows, error: finalErr } = await sb
    .from('targets')
    .select('quarter, target_qty, target_stretched, item_weight')
    .eq('assigned_to', TU_ID)
    .order('quarter');
  if (finalErr) { console.error('Lỗi verify:', finalErr.message); process.exit(1); }
  const stillBroken = finalRows.filter((r) => (r.target_stretched || 0) === 0 && (r.target_qty || 0) !== 0);
  console.log(`  Số dòng còn target_stretched=0 dù target_qty>0: ${stillBroken.length}`);

  const { data: viewRows, error: viewErr } = await sb
    .from('v_kpi_full')
    .select('quarter, category, target_f, target_e')
    .eq('assigned_to', TU_ID)
    .eq('quarter', '2024 Q1')
    .order('category')
    .limit(5);
  if (viewErr) { console.error('Lỗi đọc v_kpi_full:', viewErr.message); process.exit(1); }
  console.log('  v_kpi_full 2024 Q1 (5 dòng mẫu, kỳ vọng target_f/target_e khác 0/null):');
  viewRows.forEach((r) => console.log(`     [${r.category}] target_f=${r.target_f}, target_e=${r.target_e}`));
}

main();
