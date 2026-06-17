import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const OLD_EMAIL = 'tuantu192005@gmail.com';
const NEW_USER = { email: 'tu@msivn.io.vn', password: 'Tu@2026!', full_name: 'Tú', role: 'staff' };

async function main() {
  console.log('── Bước 1: Tạo tài khoản tu@msivn.io.vn (staff) ──');
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: NEW_USER.email,
    password: NEW_USER.password,
    email_confirm: true
  });
  if (createErr) {
    console.log(`  ✗ Tạo Auth user lỗi: ${createErr.message}`);
    return;
  }
  const newId = created.user.id;
  console.log(`  ✓ Tạo Auth user thành công — id=${newId}`);

  const { error: profileErr } = await sb.from('profiles').upsert({
    id: newId, full_name: NEW_USER.full_name, role: NEW_USER.role, status: 'active'
  }, { onConflict: 'id' });
  if (profileErr) {
    console.log(`  ✗ Upsert profile lỗi: ${profileErr.message}`);
    return;
  }
  console.log(`  ✓ Upsert profile thành công.`);

  console.log('\n── Bước 2: Tìm id cũ của tuantu192005@gmail.com ──');
  const { data: oldProfile, error: oldErr } = await sb
    .from('profiles').select('id, full_name, role').eq('email', OLD_EMAIL).maybeSingle();
  if (oldErr || !oldProfile) {
    console.log(`  ✗ Không tìm thấy profile cho ${OLD_EMAIL}: ${oldErr?.message}`);
    return;
  }
  const oldId = oldProfile.id;
  console.log(`  ${OLD_EMAIL} → id cũ = ${oldId} (giữ nguyên, vẫn role=${oldProfile.role})`);

  console.log('\n── Bước 3: Chuyển assigned_to trong sellout_data + targets ──');
  const { data: selloutUpdated, error: selloutErr } = await sb
    .from('sellout_data').update({ assigned_to: newId }).eq('assigned_to', oldId).select('id');
  if (selloutErr) {
    console.log(`  ✗ Update sellout_data lỗi: ${selloutErr.message}`);
  } else {
    console.log(`  ✓ sellout_data: đã chuyển ${selloutUpdated.length} dòng sang assigned_to=${newId}`);
  }

  const { data: targetsUpdated, error: targetsErr } = await sb
    .from('targets').update({ assigned_to: newId }).eq('assigned_to', oldId).select('id');
  if (targetsErr) {
    console.log(`  ✗ Update targets lỗi: ${targetsErr.message}`);
  } else {
    console.log(`  ✓ targets: đã chuyển ${targetsUpdated.length} dòng sang assigned_to=${newId}`);
  }

  console.log('\nHoàn tất.');
  console.log(`Tóm tắt: tu@msivn.io.vn (staff) id=${newId} — đang nắm toàn bộ dữ liệu sellout/target của Tú.`);
  console.log(`${OLD_EMAIL} (admin) id=${oldId} — không còn dữ liệu sellout/target gắn trực tiếp.`);
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
