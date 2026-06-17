import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const NEW_USERS = [
  { email: 'nam@msivn.io.vn',  password: 'Nam@2026!',  full_name: 'Nam',  role: 'admin' },
  { email: 'lap@msivn.io.vn',  password: 'Lap@2026!',  full_name: 'Lập',  role: 'staff' },
  { email: 'linh@msivn.io.vn', password: 'Linh@2026!', full_name: 'Linh', role: 'staff' },
  { email: 'tam@msivn.io.vn',  password: 'Tam@2026!',  full_name: 'Tâm',  role: 'staff' }
];

async function inspectProfilesColumns() {
  console.log('── Bước 1: Đọc cấu trúc bảng profiles ──');
  const res = await fetch(`${SUPA_URL}/rest/v1/`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
  });
  const spec = await res.json();
  const def = spec.definitions?.profiles;
  if (!def) {
    console.log('Không lấy được OpenAPI spec cho bảng profiles, sẽ thử fallback bằng select *.');
    const { data, error } = await sb.from('profiles').select('*').limit(1);
    if (error) {
      console.log('Fallback cũng lỗi:', error.message);
      return null;
    }
    const cols = data?.length ? Object.keys(data[0]) : null;
    console.log('Cột lấy được từ fallback (select *):', cols ?? '(bảng đang trống, không xác định được cột qua cách này)');
    return cols;
  }
  const cols = Object.keys(def.properties);
  console.log('Các cột hiện có trong profiles:', cols.join(', '));
  return cols;
}

async function createAuthUser(user) {
  const { data, error } = await sb.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true
  });
  if (error) {
    console.log(`  ✗ Tạo Auth user ${user.email} lỗi: ${error.message}`);
    return null;
  }
  console.log(`  ✓ Tạo Auth user ${user.email} thành công — id=${data.user.id}`);
  return data.user.id;
}

async function upsertProfile(columns, id, user) {
  const row = { id };
  if (!columns || columns.includes('full_name')) row.full_name = user.full_name;
  if (!columns || columns.includes('role')) row.role = user.role;
  if (!columns || columns.includes('status')) row.status = 'active';

  const { error } = await sb.from('profiles').upsert(row, { onConflict: 'id' });
  if (error) {
    console.log(`  ✗ Upsert profile cho ${user.email} lỗi: ${error.message}`);
    return false;
  }
  console.log(`  ✓ Upsert profile cho ${user.email} thành công.`);
  return true;
}

async function main() {
  const columns = await inspectProfilesColumns();

  console.log('\n── Bước 2: Tạo Auth user + profile cho từng người ──');
  for (const user of NEW_USERS) {
    console.log(`\n${user.full_name} (${user.email}):`);
    const id = await createAuthUser(user);
    if (!id) continue;
    await upsertProfile(columns, id, user);
  }

  console.log('\nHoàn tất.');
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
