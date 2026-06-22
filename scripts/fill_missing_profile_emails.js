import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map((l) => l.trim()).find((l) => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SUPA_KEY);

// Cập nhật theo đúng id đã verify (không dùng full_name làm điều kiện,
// tránh nhầm nếu sau này có người trùng tên).
const UPDATES = [
  { id: '80004214-c116-42e3-b511-36ebe488e51a', expectedName: 'Lập', email: 'lap@msivn.io.vn' },
  { id: 'c21deac8-e2ab-4d11-8269-dada620941b6', expectedName: 'Linh', email: 'linh@msivn.io.vn' },
  { id: '8ad49887-563a-44aa-bdcc-46a69734b402', expectedName: 'Tâm', email: 'tam@msivn.io.vn' }
];

for (const u of UPDATES) {
  const { data: before, error: beforeErr } = await sb
    .from('profiles').select('id, full_name, email').eq('id', u.id).maybeSingle();
  if (beforeErr) { console.error(`Lỗi đọc ${u.id}:`, beforeErr.message); continue; }
  if (!before) { console.error(`Không tìm thấy profile id=${u.id}, bỏ qua.`); continue; }
  if (before.full_name !== u.expectedName) {
    console.error(`CẢNH BÁO: id=${u.id} có full_name="${before.full_name}", khác kỳ vọng "${u.expectedName}" — bỏ qua để an toàn.`);
    continue;
  }

  const { data: updated, error } = await sb
    .from('profiles')
    .update({ email: u.email })
    .eq('id', u.id)
    .select('id, full_name, email');

  if (error) { console.error(`Lỗi update ${u.expectedName} (${u.id}):`, error.message); continue; }
  console.log(`${u.expectedName} (${u.id}): email "${before.email}" -> "${updated?.[0]?.email}"`);
}
