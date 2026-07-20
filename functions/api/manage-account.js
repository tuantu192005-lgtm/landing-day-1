// Cloudflare Pages Function — POST /api/manage-account
//
// Endpoint duy nhat duoc phep dung SUPABASE SERVICE ROLE KEY (bien moi
// truong SUPABASE_SERVICE_ROLE_KEY, cau hinh trong Cloudflare Pages
// dashboard -> Settings -> Environment variables, KHONG commit vao repo).
// Key nay khong bao gio lo ra client — chi ham nay (chay tren server cua
// Cloudflare) doc duoc.
//
// Dung fetch() thuan (khong dung @supabase/supabase-js) de tranh moi rui ro
// tuong thich bundler/runtime tren Cloudflare Workers — chi goi thang REST/
// Auth Admin API cua Supabase qua HTTP.
//
// Bao mat: MOI request phai kem Authorization: Bearer <access_token> cua
// chinh nguoi dang dang nhap (session Supabase Auth binh thuong o frontend).
// Ham tu xac thuc token do (GET /auth/v1/user), roi kiem tra id co dung la
// Nam khong (NAM_PROFILE_ID). Khong tin bat ky thong tin "role" nao gui tu
// client — chi tin token that + id doi chieu voi DB.

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const ANON_KEY = 'sb_publishable_TuxE4XIKNk3JBMplbPc_5w_IIIx78hm';
const NAM_PROFILE_ID = '9158c797-c667-478f-92a7-4f5ac658c6d5';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getCallerId(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const res = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id || null;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function onRequestPost({ request, env }) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return json({ ok: false, error: 'Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY (Cloudflare Pages env var).' }, 500);
  }

  const callerId = await getCallerId(request.headers.get('Authorization'));
  if (!callerId) {
    return json({ ok: false, error: 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.' }, 401);
  }
  if (callerId !== NAM_PROFILE_ID) {
    return json({ ok: false, error: 'Bạn không có quyền quản lý tài khoản.' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Body không hợp lệ.' }, 400);
  }

  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  if (body.action === 'create') {
    const email = (body.email || '').trim();
    const password = body.password || '';
    const fullName = (body.full_name || '').trim();
    if (!isValidEmail(email)) return json({ ok: false, error: 'Email không hợp lệ.' }, 400);
    if (password.length < 6) return json({ ok: false, error: 'Mật khẩu phải từ 6 ký tự trở lên.' }, 400);
    if (!fullName) return json({ ok: false, error: 'Thiếu tên đăng nhập / tên hiển thị.' }, 400);

    const createRes = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    const createData = await createRes.json();
    if (!createRes.ok) {
      return json({ ok: false, error: 'Lỗi tạo tài khoản: ' + (createData?.msg || createData?.message || createRes.statusText) }, 400);
    }

    const profileRes = await fetch(`${SUPA_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ id: createData.id, email, full_name: fullName, role: 'staff', status: 'active' })
    });
    if (!profileRes.ok) {
      const profileErr = await profileRes.json().catch(() => ({}));
      // Rollback: da tao auth user nhung khong tao duoc profiles -> xoa lai
      // de khong bo lai tai khoan "mo côi" (dang nhap duoc nhung khong co
      // ho so, se bi chan o man dang nhap nhung van la rac trong auth.users).
      await fetch(`${SUPA_URL}/auth/v1/admin/users/${createData.id}`, { method: 'DELETE', headers: adminHeaders }).catch(() => {});
      return json({ ok: false, error: 'Lỗi tạo hồ sơ profiles (đã rollback tài khoản auth): ' + (profileErr?.message || profileRes.statusText) }, 400);
    }

    return json({ ok: true, id: createData.id });
  }

  if (body.action === 'update') {
    const targetId = body.target_id;
    if (!targetId) return json({ ok: false, error: 'Thiếu target_id.' }, 400);

    const email = body.email != null ? String(body.email).trim() : undefined;
    const password = body.password || undefined;
    const fullName = body.full_name != null ? String(body.full_name).trim() : undefined;

    if (email !== undefined && !isValidEmail(email)) return json({ ok: false, error: 'Email không hợp lệ.' }, 400);
    if (password !== undefined && password.length < 6) return json({ ok: false, error: 'Mật khẩu phải từ 6 ký tự trở lên.' }, 400);
    if (email === undefined && password === undefined && fullName === undefined) {
      return json({ ok: false, error: 'Không có thay đổi nào để lưu.' }, 400);
    }

    const authPayload = {};
    if (email !== undefined) authPayload.email = email;
    if (password !== undefined) authPayload.password = password;
    if (Object.keys(authPayload).length) {
      const updRes = await fetch(`${SUPA_URL}/auth/v1/admin/users/${targetId}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify(authPayload)
      });
      if (!updRes.ok) {
        const updErr = await updRes.json().catch(() => ({}));
        return json({ ok: false, error: 'Lỗi cập nhật đăng nhập: ' + (updErr?.msg || updErr?.message || updRes.statusText) }, 400);
      }
    }

    const profilePayload = {};
    if (email !== undefined) profilePayload.email = email;
    if (fullName !== undefined) profilePayload.full_name = fullName;
    if (Object.keys(profilePayload).length) {
      const profRes = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${targetId}`, {
        method: 'PATCH',
        headers: { ...adminHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(profilePayload)
      });
      if (!profRes.ok) {
        const profErr = await profRes.json().catch(() => ({}));
        return json({ ok: false, error: 'Đã đổi thông tin đăng nhập nhưng lỗi cập nhật hồ sơ: ' + (profErr?.message || profRes.statusText) }, 400);
      }
    }

    return json({ ok: true });
  }

  return json({ ok: false, error: 'action không hợp lệ.' }, 400);
}
