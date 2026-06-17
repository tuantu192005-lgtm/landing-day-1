import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const ANON_KEY = 'sb_publishable_TuxE4XIKNk3JBMplbPc_5w_IIIx78hm';
const SERVICE_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const admin = createClient(SUPA_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function clientFor() {
  return createClient(SUPA_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signIn(email, password) {
  const client = clientFor();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Đăng nhập ${email} lỗi: ${error.message}`);
  return { client, userId: data.user.id };
}

function report(label, error, data) {
  if (error) console.log(`  ✗ ${label}: LỖI — ${error.message}`);
  else console.log(`  ✓ ${label}: OK (${Array.isArray(data) ? data.length + ' dòng' : 'thành công'})`);
}

async function main() {
  console.log('── Chuẩn bị: tạo dữ liệu test bằng service key ──');

  const lap = await signIn('lap@msivn.io.vn', 'Lap@2026!');
  const linh = await signIn('linh@msivn.io.vn', 'Linh@2026!');
  const nam = await signIn('nam@msivn.io.vn', 'Nam@2026!');
  console.log(`  lap=${lap.userId}  linh=${linh.userId}  nam=${nam.userId}`);

  const { data: orderForLap, error: seedOrderErr } = await admin.from('orders').insert({
    sku: 'TEST-SKU', product_name: 'Test Product', qty: 1, unit_price: 1000,
    npp: 'DGW', assigned_to: lap.userId
  }).select().single();
  if (seedOrderErr) { console.log('Seed order lỗi:', seedOrderErr.message); return; }

  const { data: taskForLap, error: seedTaskErr } = await admin.from('tasks').insert({
    assigned_to: lap.userId, assigned_by: nam.userId, title: 'Test task gốc', status: 'todo'
  }).select().single();
  if (seedTaskErr) { console.log('Seed task lỗi:', seedTaskErr.message); return; }

  console.log('\n── Test STAFF (Lập) — orders/targets/sales_reports chỉ thấy của mình ──');
  {
    const { data, error } = await lap.client.from('orders').select('*').eq('id', orderForLap.id);
    report('Lập select đơn của chính mình', error, data);
  }
  {
    const { data, error } = await linh.client.from('orders').select('*').eq('id', orderForLap.id);
    report('Linh select đơn của Lập (kỳ vọng 0 dòng, không lỗi)', error, data);
    if (!error && data.length === 0) console.log('    → đúng kỳ vọng: bị RLS chặn, trả về rỗng.');
  }
  {
    const { error } = await lap.client.from('orders').insert({
      sku: 'TEST-SKU-2', product_name: 'Test 2', qty: 1, unit_price: 500, npp: 'SPC'
    });
    report('Lập insert đơn cho chính mình (assigned_to default auth.uid())', error);
  }
  {
    const { error } = await linh.client.from('orders').insert({
      sku: 'TEST-SKU-3', product_name: 'Test 3', qty: 1, unit_price: 500, npp: 'SPC', assigned_to: lap.userId
    });
    report('Linh insert đơn nhưng gán assigned_to cho Lập (kỳ vọng LỖI)', error);
  }

  console.log('\n── Test STAFF (Lập) — customers/distributors/inventory/products chỉ xem ──');
  {
    const { data, error } = await lap.client.from('customers').select('*').limit(3);
    report('Lập select customers', error, data);
  }
  {
    const { error } = await lap.client.from('customers').insert({
      code: 'TEST', full_name: 'Test KH', status: 'active'
    });
    report('Lập insert customers (kỳ vọng LỖI — chỉ được xem)', error);
  }

  console.log('\n── Test STAFF (Lập) — tasks: xem việc của mình, chỉ sửa được status ──');
  {
    const { data, error } = await lap.client.from('tasks').select('*').eq('id', taskForLap.id);
    report('Lập select task của mình', error, data);
  }
  {
    const { data, error } = await linh.client.from('tasks').select('*').eq('id', taskForLap.id);
    report('Linh select task của Lập (kỳ vọng 0 dòng)', error, data);
  }
  {
    const { error } = await lap.client.from('tasks').update({ title: 'Lập tự đổi tiêu đề' }).eq('id', taskForLap.id);
    report('Lập sửa title (kỳ vọng LỖI từ trigger)', error);
  }
  {
    const { error } = await lap.client.from('tasks').update({ status: 'in_progress' }).eq('id', taskForLap.id);
    report('Lập sửa status (kỳ vọng OK)', error);
  }

  console.log('\n── Test ADMIN (Nam) — toàn quyền ──');
  {
    const { data, error } = await nam.client.from('orders').select('*');
    report('Nam select tất cả orders', error, data);
  }
  {
    const { error } = await nam.client.from('tasks').update({ title: 'Admin sửa được' }).eq('id', taskForLap.id);
    report('Nam sửa title task của Lập (kỳ vọng OK)', error);
  }
  {
    const { error } = await nam.client.from('customers').insert({
      code: 'ADMINTEST', full_name: 'Admin tạo KH', status: 'active'
    });
    report('Nam insert customers (kỳ vọng OK)', error);
  }

  console.log('\n── Dọn dữ liệu test ──');
  await admin.from('orders').delete().in('sku', ['TEST-SKU', 'TEST-SKU-2', 'TEST-SKU-3']);
  await admin.from('tasks').delete().eq('id', taskForLap.id);
  await admin.from('customers').delete().in('code', ['TEST', 'ADMINTEST']);
  console.log('Đã xoá dữ liệu test. Hoàn tất.');
}

main().catch((err) => { console.error('Lỗi không mong muốn:', err); process.exit(1); });
