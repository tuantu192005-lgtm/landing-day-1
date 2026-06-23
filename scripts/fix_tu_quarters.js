import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map((l) => l.trim()).find((l) => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SUPA_KEY);

const TU_ID = '2a4d4e1b-f197-4d89-9d61-82abc346bba2';
const EXPECTED_NAME = 'Tú';

function fmt(n) {
  return Math.round(n || 0).toLocaleString('vi-VN');
}

async function main() {
  const { data: profile, error: profileErr } = await sb
    .from('profiles').select('id, full_name').eq('id', TU_ID).maybeSingle();
  if (profileErr) { console.error('Lỗi đọc profile:', profileErr.message); process.exit(1); }
  if (!profile || profile.full_name !== EXPECTED_NAME) {
    console.error(`CẢNH BÁO: id=${TU_ID} có full_name="${profile?.full_name}", khác kỳ vọng "${EXPECTED_NAME}" — dừng để an toàn.`);
    process.exit(1);
  }
  console.log(`Xác nhận id ${TU_ID} = "${profile.full_name}". Tiếp tục.\n`);

  // ── BƯỚC 1: in toàn bộ targets hiện có của Tú ───────────────────
  console.log('========== BƯỚC 1: TOÀN BỘ DÒNG targets CỦA TÚ (trước khi sửa) ==========');
  const { data: allRows, error: allErr } = await sb
    .from('targets')
    .select('id, quarter, category, target_qty')
    .eq('assigned_to', TU_ID)
    .order('quarter')
    .order('category');
  if (allErr) { console.error('Lỗi đọc targets:', allErr.message); process.exit(1); }

  const byQuarter = {};
  allRows.forEach((r) => {
    byQuarter[r.quarter] = byQuarter[r.quarter] || [];
    byQuarter[r.quarter].push(r);
  });
  Object.keys(byQuarter).sort().forEach((q) => {
    const rows = byQuarter[q];
    const sum = rows.reduce((s, r) => s + (r.target_qty || 0), 0);
    console.log(`  ${q}: ${rows.length} dòng, SUM(target_qty) = ${fmt(sum)}`);
    rows.forEach((r) => console.log(`     - [${r.category}] target_qty=${r.target_qty}`));
  });
  console.log('');

  // ── BƯỚC 2: với mỗi quý 1..4 — nếu "2024 Qn" đã tồn tại thì xoá
  // trước, sau đó UPDATE "2026 Qn" -> "2024 Qn" ────────────────────
  console.log('========== BƯỚC 2: CHUYỂN 2026 Qx -> 2024 Qx ==========');
  for (let q = 1; q <= 4; q++) {
    const oldQuarter = `2024 Q${q}`;
    const wrongQuarter = `2026 Q${q}`;
    const oldRows = byQuarter[oldQuarter] || [];
    const wrongRows = byQuarter[wrongQuarter] || [];

    console.log(`\n-- Quý ${q} --`);
    if (!wrongRows.length) {
      console.log(`  Không có dòng nào ở "${wrongQuarter}" — bỏ qua quý này.`);
      continue;
    }

    if (oldRows.length) {
      console.log(`  Sẽ XOÁ ${oldRows.length} dòng cũ ở "${oldQuarter}" (SUM=${fmt(oldRows.reduce((s, r) => s + (r.target_qty || 0), 0))}):`);
      oldRows.forEach((r) => console.log(`     - id=${r.id} [${r.category}] target_qty=${r.target_qty}`));
      const { error: delErr } = await sb
        .from('targets')
        .delete()
        .eq('assigned_to', TU_ID)
        .eq('quarter', oldQuarter);
      if (delErr) { console.error(`  Lỗi xoá ${oldQuarter}:`, delErr.message); process.exit(1); }
      console.log(`  Đã xoá xong ${oldRows.length} dòng "${oldQuarter}".`);
    } else {
      console.log(`  Không có dòng cũ ở "${oldQuarter}" — không cần xoá.`);
    }

    console.log(`  Sẽ UPDATE ${wrongRows.length} dòng "${wrongQuarter}" -> quarter="${oldQuarter}" (SUM=${fmt(wrongRows.reduce((s, r) => s + (r.target_qty || 0), 0))}).`);
    const { error: updErr } = await sb
      .from('targets')
      .update({ quarter: oldQuarter })
      .eq('assigned_to', TU_ID)
      .eq('quarter', wrongQuarter);
    if (updErr) { console.error(`  Lỗi update ${wrongQuarter} -> ${oldQuarter}:`, updErr.message); process.exit(1); }
    console.log(`  Đã chuyển xong "${wrongQuarter}" -> "${oldQuarter}".`);
  }

  // ── BƯỚC 3: verify lại ──────────────────────────────────────────
  console.log('\n========== BƯỚC 3: VERIFY SAU KHI SỬA ==========');
  const { data: finalRows, error: finalErr } = await sb
    .from('targets')
    .select('quarter, target_qty')
    .eq('assigned_to', TU_ID)
    .order('quarter');
  if (finalErr) { console.error('Lỗi verify:', finalErr.message); process.exit(1); }

  const finalByQuarter = {};
  finalRows.forEach((r) => {
    finalByQuarter[r.quarter] = finalByQuarter[r.quarter] || { count: 0, sum: 0 };
    finalByQuarter[r.quarter].count++;
    finalByQuarter[r.quarter].sum += (r.target_qty || 0);
  });
  let grandTotal = 0;
  Object.keys(finalByQuarter).sort().forEach((q) => {
    const { count, sum } = finalByQuarter[q];
    grandTotal += sum;
    console.log(`  ${q}: COUNT=${count}, SUM(target_qty)=${fmt(sum)}`);
  });
  console.log(`  TỔNG CỘNG TẤT CẢ QUÝ: ${fmt(grandTotal)}`);

  const quarters2024 = ['2024 Q1', '2024 Q2', '2024 Q3', '2024 Q4'];
  const allFourPresent = quarters2024.every((q) => finalByQuarter[q]?.count === 16);
  const noStray2026 = !Object.keys(finalByQuarter).some((q) => q.startsWith('2026'));
  console.log(`\n  Đủ 4 quý 2024, mỗi quý 16 dòng: ${allFourPresent ? 'ĐÚNG' : 'SAI — kiểm tra lại'}`);
  console.log(`  Không còn dòng "2026 Qx" nào sót lại: ${noStray2026 ? 'ĐÚNG' : 'SAI — kiểm tra lại'}`);
}

main();
