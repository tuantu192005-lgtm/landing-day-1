import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const TU_EMAIL = 'tuantu192005@gmail.com';
const QUARTER_LABEL = '2024 Q1';
const YEAR = 2024;
const QUARTER_NUM = 1;

const EXPECTED = {
  'CND-MB': 7872,
  'CND-MB (B Chipset)': 1940,
  'CND-MB (X,Z Chipset)': 266,
  'CND-PRO ( Cubi, DT & AIO )': 405,
  'CND-PRO MNT': 5735,
  'CND-GMNT': 970,
  'CND-GMNT ( QHD )': 80,
  'CND-PSU': 341,
  'CND-Chassis': 118,
  'CND-Liquid Cooler': 16,
  'GNP-VGA ( GT )': 140,
  'GNP-VGA ( GTX + RTX )': 1516,
  'GNP-Gaming Gears': 484,
  'SSD': 41
};

async function main() {
  const { data: profile, error: profileErr } = await sb
    .from('profiles').select('id, full_name').eq('email', TU_EMAIL).maybeSingle();
  if (profileErr || !profile) throw new Error(`Không tìm thấy profile cho ${TU_EMAIL}: ${profileErr?.message}`);
  console.log(`Tú = ${profile.id} (${profile.full_name})\n`);

  const { data: achievedRows, error: achievedErr } = await sb
    .from('v_kpi_achieved')
    .select('category, achieved_qty')
    .eq('assigned_to', profile.id)
    .eq('year', YEAR)
    .eq('quarter', QUARTER_NUM);
  if (achievedErr) throw new Error(`Query v_kpi_achieved lỗi: ${achievedErr.message}`);

  const achievedMap = {};
  achievedRows.forEach((r) => { achievedMap[r.category] = r.achieved_qty; });

  console.log('── Đối chiếu Achieved tính từ sellout_data vs số liệu kỳ vọng ──\n');
  let allMatch = true;
  for (const [category, expected] of Object.entries(EXPECTED)) {
    const actual = achievedMap[category] ?? 0;
    const ok = actual === expected;
    if (!ok) allMatch = false;
    console.log(`  ${ok ? '✓' : '✗'} ${category}: kỳ vọng=${expected}, thực tế=${actual}${ok ? '' : '  <-- KHÔNG KHỚP'}`);
  }

  const extraCategories = Object.keys(achievedMap).filter((c) => !(c in EXPECTED));
  if (extraCategories.length) {
    console.log('\n  Các category khác có dữ liệu nhưng không nằm trong danh sách kỳ vọng:');
    extraCategories.forEach((c) => console.log(`    - ${c}: ${achievedMap[c]}`));
  }

  console.log(`\n${allMatch ? '✓ TẤT CẢ KHỚP CHÍNH XÁC.' : '✗ CÓ HẠNG MỤC KHÔNG KHỚP — xem chi tiết phía trên.'}`);
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
