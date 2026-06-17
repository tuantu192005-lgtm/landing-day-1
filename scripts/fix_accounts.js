import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const TARGET_USERS = {
  'nam@msivn.io.vn':  'Nam@2026!',
  'lap@msivn.io.vn':  'Lap@2026!',
  'linh@msivn.io.vn': 'Linh@2026!',
  'tam@msivn.io.vn':  'Tam@2026!'
};

async function listAllUsers() {
  let page = 1;
  const perPage = 200;
  const all = [];
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers lỗi: ${error.message}`);
    all.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return all;
}

async function main() {
  console.log('── Bước 1: Lấy danh sách user qua listUsers() ──');
  const allUsers = await listAllUsers();

  const emails = Object.keys(TARGET_USERS);
  const found = {};
  for (const email of emails) {
    const user = allUsers.find((u) => u.email === email);
    found[email] = user || null;
    console.log(`  ${user ? '✓' : '✗'} ${email} → ${user ? 'id=' + user.id : 'KHÔNG TÌM THẤY'}`);
  }

  console.log('\n── Bước 2: Cập nhật password + email_confirm cho từng người ──');
  for (const email of emails) {
    const user = found[email];
    if (!user) {
      console.log(`\n${email}: BỎ QUA — không tìm thấy user trong Auth.`);
      continue;
    }

    console.log(`\n${email} (id=${user.id}):`);
    const { data, error } = await sb.auth.admin.updateUserById(user.id, {
      password: TARGET_USERS[email],
      email_confirm: true
    });

    if (error) {
      console.log(`  ✗ Cập nhật lỗi: ${error.message}`);
      continue;
    }

    console.log(`  ✓ Cập nhật thành công — email_confirmed_at=${data.user.email_confirmed_at}, password đã đặt lại.`);
  }

  console.log('\nHoàn tất.');
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
