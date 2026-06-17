import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const KEEP_EMAILS = new Set([
  'tuantu192005@gmail.com',
  'nam@msivn.io.vn',
  'tu@msivn.io.vn',
  'lap@msivn.io.vn',
  'linh@msivn.io.vn',
  'tam@msivn.io.vn'
]);

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
  const allUsers = await listAllUsers();
  console.log(`Tổng số user trong Auth: ${allUsers.length}\n`);

  console.log('── Nhóm cần giữ (6 người) ──');
  for (const email of KEEP_EMAILS) {
    const user = allUsers.find((u) => u.email === email);
    console.log(`  ${user ? '✓' : '✗ KHÔNG THẤY'} ${email}${user ? ' (id=' + user.id + ')' : ''}`);
  }

  const extras = allUsers.filter((u) => !KEEP_EMAILS.has(u.email));

  console.log(`\n── Account THỪA — chưa xoá, chờ xác nhận (${extras.length}) ──`);
  if (!extras.length) {
    console.log('  Không có account thừa nào.');
  } else {
    extras.forEach((u) => {
      console.log(`  - ${u.email || '(không có email)'} | id=${u.id} | created_at=${u.created_at}`);
    });
  }
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
