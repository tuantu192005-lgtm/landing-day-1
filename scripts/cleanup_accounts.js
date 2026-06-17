import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const NHANVIEN1_ID = 'f697a346-c1c7-4965-97ec-5f5c78e64f50';
const ORPHAN_PROFILE_ID = 'cd48efc4-e255-4387-85db-d735076ad575';
const REAL_TU_ID = 'dd9c1e4f-8eff-4122-9c33-a3e6f3498209';
const REAL_TU_EMAIL = 'tuantu192005@gmail.com';

const TABLES = ['orders', 'targets', 'sales_reports', 'sellout_data', 'tasks'];

async function countReferences(id) {
  const results = {};
  for (const table of TABLES) {
    const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('assigned_to', id);
    if (error) {
      results[table] = `lỗi: ${error.message}`;
    } else {
      results[table] = count;
    }
  }
  return results;
}

async function main() {
  console.log('── Bước 1: Kiểm tra tham chiếu của nhanvien1@msivn.io.vn ──');
  const refs = await countReferences(NHANVIEN1_ID);
  for (const [table, val] of Object.entries(refs)) {
    console.log(`  ${table}: ${val}`);
  }
  const hasRefs = Object.values(refs).some((v) => typeof v === 'number' && v > 0);

  if (hasRefs) {
    console.log('\n  ✗ Có dữ liệu tham chiếu — KHÔNG xoá. Báo lại để bạn quyết định tiếp.');
  } else {
    console.log('\n  ✓ Không có dữ liệu tham chiếu. Tiến hành xoá.');

    const { error: profileDelErr } = await sb.from('profiles').delete().eq('id', NHANVIEN1_ID);
    if (profileDelErr) console.log(`  ✗ Xoá profile lỗi: ${profileDelErr.message}`);
    else console.log('  ✓ Đã xoá dòng profile (nếu có).');

    const { error: authDelErr } = await sb.auth.admin.deleteUser(NHANVIEN1_ID);
    if (authDelErr) console.log(`  ✗ Xoá Auth user lỗi: ${authDelErr.message}`);
    else console.log('  ✓ Đã xoá Auth user nhanvien1@msivn.io.vn.');
  }

  console.log('\n── Bước 2: Xoá dòng profile rác id=' + ORPHAN_PROFILE_ID + ' ──');
  const orphanRefs = await countReferences(ORPHAN_PROFILE_ID);
  for (const [table, val] of Object.entries(orphanRefs)) {
    console.log(`  ${table}: ${val}`);
  }
  const orphanHasRefs = Object.values(orphanRefs).some((v) => typeof v === 'number' && v > 0);

  if (orphanHasRefs) {
    console.log('\n  ✗ Vẫn còn dữ liệu tham chiếu — KHÔNG xoá. Báo lại để bạn quyết định tiếp.');
  } else {
    const { error: delErr } = await sb.from('profiles').delete().eq('id', ORPHAN_PROFILE_ID);
    if (delErr) console.log(`  ✗ Xoá lỗi: ${delErr.message}`);
    else console.log('  ✓ Đã xoá dòng profile rác.');
  }

  console.log('\n── Bước 3: Cập nhật email cho profile thật id=' + REAL_TU_ID + ' ──');
  const { data: updated, error: updateErr } = await sb
    .from('profiles').update({ email: REAL_TU_EMAIL }).eq('id', REAL_TU_ID).select();
  if (updateErr) console.log(`  ✗ Update lỗi: ${updateErr.message}`);
  else console.log(`  ✓ Đã set email=${REAL_TU_EMAIL} cho profile ${REAL_TU_ID}.`, JSON.stringify(updated));

  console.log('\nHoàn tất.');
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
