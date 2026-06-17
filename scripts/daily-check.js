import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Config ───────────────────────────────────────────────────
const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(join(ROOT, 'supabase_service_key.txt'), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));
const RESEND_KEY = readFileSync(join(ROOT, 'resend_config.txt'), 'utf8').trim();

const sb = createClient(SUPA_URL, SUPA_KEY);
const resend = new Resend(RESEND_KEY);

const TO_EMAIL = 'tuantu192005@gmail.com';
const fmtVND = n => Number(n).toLocaleString('vi-VN') + 'đ';
const fmtDT  = iso => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const now    = () => new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

// ── 1. Đơn hàng mới 24h qua (pending) ───────────────────────
async function getNewOrders() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('orders')
    .select('id, store_name, sku, product_name, qty, unit_price, npp, created_at')
    .eq('status', 'pending')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`orders: ${error.message}`);
  return data ?? [];
}

// ── 2. Sản phẩm sắp hết hàng (tồn < 10) ────────────────────
async function getLowStock() {
  const { data, error } = await sb
    .from('inventory')
    .select('warehouse, stock_on_hand, safety_stock, products(sku, name, category)')
    .lt('stock_on_hand', 10)
    .order('stock_on_hand', { ascending: true });

  if (error) throw new Error(`inventory: ${error.message}`);
  return data ?? [];
}

// ── 3. Đại lý chưa cập nhật trạng thái tuần này ─────────────
async function getStaleCustomers() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('customers')
    .select('full_name, phone, company, city, region, status, updated_at')
    .lt('updated_at', oneWeekAgo)
    .eq('status', 'active')
    .order('updated_at', { ascending: true })
    .limit(20);

  if (error) throw new Error(`customers: ${error.message}`);
  return data ?? [];
}

// ── Build HTML email ─────────────────────────────────────────
function buildEmail(orders, lowStock, staleCustomers) {
  const totalValue = orders.reduce((s, r) => s + (r.qty ?? 0) * (r.unit_price ?? 0), 0);

  const orderRows = orders.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:#888;padding:12px">Không có đơn pending mới</td></tr>'
    : orders.map(r => `
        <tr>
          <td style="padding:8px 12px">#${r.id}</td>
          <td style="padding:8px 12px">${r.store_name ?? '-'}</td>
          <td style="padding:8px 12px">${r.sku} — ${r.product_name}</td>
          <td style="padding:8px 12px;text-align:center">${r.qty}</td>
          <td style="padding:8px 12px">${r.npp} | ${fmtDT(r.created_at)}</td>
        </tr>`).join('');

  const stockRows = lowStock.length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:#888;padding:12px">Tất cả sản phẩm còn hàng đủ</td></tr>'
    : lowStock.map(r => {
        const qty = r.stock_on_hand ?? 0;
        const color = qty === 0 ? '#dc2626' : '#d97706';
        const label = qty === 0 ? 'Hết hàng' : 'Sắp hết';
        return `
        <tr>
          <td style="padding:8px 12px">${r.products?.sku ?? '-'}</td>
          <td style="padding:8px 12px">${r.products?.name ?? '-'}</td>
          <td style="padding:8px 12px">${r.warehouse}</td>
          <td style="padding:8px 12px;text-align:center">
            <span style="color:${color};font-weight:bold">${qty} — ${label}</span>
          </td>
        </tr>`;
      }).join('');

  const customerRows = staleCustomers.length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:#888;padding:12px">Tất cả đại lý đã được cập nhật tuần này</td></tr>'
    : staleCustomers.map(r => `
        <tr>
          <td style="padding:8px 12px">${r.full_name}</td>
          <td style="padding:8px 12px">${r.company ?? '-'}</td>
          <td style="padding:8px 12px">${r.city ?? '-'}, ${r.region ?? '-'}</td>
          <td style="padding:8px 12px;color:#d97706">${r.updated_at ? fmtDT(r.updated_at) : 'Chưa có'}</td>
        </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
  <div style="max-width:700px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f,#c41e3a);padding:28px 32px">
      <h1 style="margin:0;color:#fff;font-size:22px">🖥️ MSI Sales — Báo Cáo Buổi Sáng</h1>
      <p style="margin:6px 0 0;color:#e0e0e0;font-size:14px">Cập nhật lúc ${now()}</p>
    </div>

    <!-- Summary cards -->
    <div style="display:flex;gap:0;border-bottom:1px solid #e5e7eb">
      <div style="flex:1;padding:20px 24px;text-align:center;border-right:1px solid #e5e7eb">
        <div style="font-size:32px;font-weight:bold;color:#1e3a5f">${orders.length}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">Đơn pending mới</div>
      </div>
      <div style="flex:1;padding:20px 24px;text-align:center;border-right:1px solid #e5e7eb">
        <div style="font-size:32px;font-weight:bold;color:#c41e3a">${lowStock.length}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">SKU sắp hết hàng</div>
      </div>
      <div style="flex:1;padding:20px 24px;text-align:center">
        <div style="font-size:32px;font-weight:bold;color:#d97706">${staleCustomers.length}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">Đại lý chưa cập nhật</div>
      </div>
    </div>

    <div style="padding:28px 32px">

      <!-- Section 1: Orders -->
      <h2 style="margin:0 0 12px;font-size:16px;color:#1e3a5f;border-left:4px solid #c41e3a;padding-left:10px">
        📦 Đơn hàng Pending — 24h qua (${orders.length} đơn · Tổng: ${fmtVND(totalValue)})
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:28px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">ID</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Cửa hàng</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Sản phẩm</th>
            <th style="padding:10px 12px;text-align:center;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">SL</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">NPP · Thời gian</th>
          </tr>
        </thead>
        <tbody>${orderRows}</tbody>
      </table>

      <!-- Section 2: Low stock -->
      <h2 style="margin:0 0 12px;font-size:16px;color:#1e3a5f;border-left:4px solid #d97706;padding-left:10px">
        ⚠️ Tồn kho dưới 10 (${lowStock.length} SKU)
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:28px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">SKU</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Sản phẩm</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Kho</th>
            <th style="padding:10px 12px;text-align:center;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Tình trạng</th>
          </tr>
        </thead>
        <tbody>${stockRows}</tbody>
      </table>

      <!-- Section 3: Stale customers -->
      <h2 style="margin:0 0 12px;font-size:16px;color:#1e3a5f;border-left:4px solid #6b7280;padding-left:10px">
        👥 Đại lý chưa cập nhật tuần này (${staleCustomers.length} đại lý)
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:8px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Tên</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Công ty</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Khu vực</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Cập nhật lần cuối</th>
          </tr>
        </thead>
        <tbody>${customerRows}</tbody>
      </table>

    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">MSI Sales Management · Báo cáo tự động · ${new Date().toLocaleDateString('vi-VN')}</p>
    </div>

  </div>
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('🔄 Đang thu thập dữ liệu từ Supabase...\n');

  const [orders, lowStock, staleCustomers] = await Promise.all([
    getNewOrders(),
    getLowStock(),
    getStaleCustomers(),
  ]);

  console.log(`📦 Đơn pending mới (24h):   ${orders.length} đơn`);
  console.log(`⚠️  SKU sắp hết hàng:        ${lowStock.length} SKU`);
  console.log(`👥 Đại lý chưa cập nhật:    ${staleCustomers.length} đại lý\n`);

  if (lowStock.length > 0) {
    console.log('--- Tồn kho thấp ---');
    lowStock.forEach(r =>
      console.log(`  ${r.products?.sku} | ${r.warehouse} | SL: ${r.stock_on_hand}`)
    );
    console.log('');
  }

  console.log('📧 Đang gửi email báo cáo...');

  const html = buildEmail(orders, lowStock, staleCustomers);
  const totalOrders = orders.reduce((s, r) => s + (r.qty ?? 0) * (r.unit_price ?? 0), 0);
  const subject = `[MSI Sales] Báo cáo sáng ${new Date().toLocaleDateString('vi-VN')} — ${orders.length} đơn mới · ${lowStock.length} SKU sắp hết`;

  const { data, error } = await resend.emails.send({
    from: 'MSI Sales <onboarding@resend.dev>',
    to: [TO_EMAIL],
    subject,
    html,
  });

  if (error) {
    console.error('❌ Lỗi gửi email:', error);
    process.exit(1);
  }

  console.log(`✅ Email đã gửi thành công!`);
  console.log(`   ID: ${data.id}`);
  console.log(`   Đến: ${TO_EMAIL}`);
  console.log(`   Subject: ${subject}`);
}

main().catch(err => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
