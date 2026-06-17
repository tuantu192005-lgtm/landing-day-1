import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { z } from 'zod';

// ── Kết nối Supabase ────────────────────────────────────────
const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('./supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SUPA_KEY);

// ── MCP Server ──────────────────────────────────────────────
const server = new McpServer({ name: 'msi-sales-mcp', version: '1.0.0' });

// ════════════════════════════════════════════════════════════
// TOOL 1: check_inventory
// Dùng khi: hỏi hàng còn không, tồn kho warehouse nào, SKU nào còn
// Ví dụ: "RTX 5080 còn hàng DGW không?", "VGA nào đang tồn nhiều?"
// Bảng: inventory JOIN products
//   inventory.warehouse  = tên kho/NPP (DGW, SPC, ...)
//   inventory.stock_on_hand = số lượng thực tế
//   products.sku, products.name, products.category
// ════════════════════════════════════════════════════════════
server.tool(
  'check_inventory',
  'Kiểm tra tồn kho sản phẩm MSI theo SKU, kho (warehouse/NPP) hoặc danh mục. ' +
  'Gọi khi hỏi: còn hàng không, NPP/kho nào có hàng, số lượng tồn của SKU cụ thể.',
  {
    sku:       z.string().optional().describe('Mã sản phẩm, ví dụ: RTX5080, MAG274QRF'),
    warehouse: z.string().optional().describe('Tên kho hoặc NPP: DGW, SPC, KTC, NWH, MH, AD'),
    category:  z.string().optional().describe('Danh mục: vga, mainboard, lcd, psu, ssd, chassis, cooling')
  },
  async ({ sku, warehouse, category }) => {
    let query = sb
      .from('inventory')
      .select('stock_on_hand, safety_stock, warehouse, products(sku, name, category)');

    if (warehouse) query = query.ilike('warehouse', `%${warehouse}%`);

    const { data, error } = await query.order('stock_on_hand', { ascending: false });
    if (error) return { content: [{ type: 'text', text: `Lỗi: ${error.message}` }] };

    let rows = data ?? [];

    if (sku)      rows = rows.filter(r => r.products?.sku?.toLowerCase().includes(sku.toLowerCase()));
    if (category) rows = rows.filter(r => r.products?.category?.toLowerCase() === category.toLowerCase());

    if (!rows.length) return { content: [{ type: 'text', text: 'Không tìm thấy sản phẩm phù hợp.' }] };

    const lines = rows.map(r => {
      const qty = r.stock_on_hand ?? 0;
      const min = r.safety_stock ?? 0;
      const icon = qty === 0 ? '🔴 Hết' : qty <= min ? '🟡 Sắp hết' : '🟢 Còn';
      return `${icon} | ${r.warehouse} | ${r.products?.sku} — ${r.products?.name} | SL: ${qty}`;
    });

    return { content: [{ type: 'text', text: `Tồn kho (${rows.length} dòng):\n\n${lines.join('\n')}` }] };
  }
);

// ════════════════════════════════════════════════════════════
// TOOL 2: list_pending_orders
// Dùng khi: xem đơn hàng chưa xử lý, đơn của khách nào, đơn tháng này
// Ví dụ: "Team còn đơn nào pending không?", "Đơn qua DGW tuần này"
// Bảng: orders
//   status: pending | confirmed | shipped | done
//   store_name: tên cửa hàng (denorm từ customers)
// ════════════════════════════════════════════════════════════
server.tool(
  'list_pending_orders',
  'Liệt kê đơn hàng theo trạng thái, NPP hoặc khoảng thời gian. ' +
  'Gọi khi cần xem đơn chưa xử lý (pending), đang giao (shipped), ' +
  'tổng giá trị đơn, hoặc đơn đặt qua NPP cụ thể.',
  {
    status:    z.enum(['pending', 'confirmed', 'shipped', 'done']).optional()
                .describe('pending=chờ xử lý, confirmed=đã xác nhận, shipped=đang giao, done=hoàn tất'),
    npp:       z.string().optional().describe('Tên NPP: DGW, SPC, KTC, NWH, MH, AD'),
    from_date: z.string().optional().describe('Lọc từ ngày, định dạng YYYY-MM-DD')
  },
  async ({ status, npp, from_date }) => {
    let query = sb
      .from('orders')
      .select('id, store_name, sku, product_name, qty, unit_price, npp, status, order_date, note')
      .order('order_date', { ascending: false });

    if (status)    query = query.eq('status', status);
    if (npp)       query = query.eq('npp', npp.toUpperCase());
    if (from_date) query = query.gte('order_date', from_date);

    const { data, error } = await query.limit(50);
    if (error) return { content: [{ type: 'text', text: `Lỗi: ${error.message}` }] };
    if (!data?.length) return { content: [{ type: 'text', text: 'Không có đơn hàng phù hợp.' }] };

    const fmtVND = n => Number(n).toLocaleString('vi-VN') + 'đ';
    const icon = s => ({ pending: '🔴', confirmed: '🟡', shipped: '🚚', done: '✅' }[s] ?? '⚪');
    const total = data.reduce((s, r) => s + (r.qty ?? 0) * (r.unit_price ?? 0), 0);

    const lines = data.map(r =>
      `${icon(r.status)} #${r.id} | ${r.store_name} | ${r.sku} ×${r.qty} | ` +
      `${fmtVND((r.qty ?? 0) * (r.unit_price ?? 0))} | ${r.npp} | ${r.order_date}`
    );

    return { content: [{ type: 'text', text: `Đơn hàng (${data.length} đơn — tổng ${fmtVND(total)}):\n\n${lines.join('\n')}` }] };
  }
);

// ════════════════════════════════════════════════════════════
// TOOL 3: get_customer_status
// Dùng khi: xem danh sách khách, lọc theo vùng, trạng thái, tìm theo tên
// Ví dụ: "Khách ở Hà Nội hiện tại?", "Khách nào status inactive?"
// Bảng: customers
//   full_name, phone, company, city, region, status, updated_at
//   status: active | inactive (hoặc theo giá trị thực trong DB)
// ════════════════════════════════════════════════════════════
server.tool(
  'get_customer_status',
  'Xem danh sách và trạng thái khách hàng/đại lý. Gọi khi cần biết khách nào ' +
  'đang active, khách theo vùng/khu vực, hoặc tìm thông tin liên hệ của một đại lý.',
  {
    status:  z.string().optional().describe('Trạng thái khách: active, inactive, ...'),
    region:  z.string().optional().describe('Khu vực: Hà Nội, TP.HCM, Miền Trung, ...'),
    city:    z.string().optional().describe('Thành phố cụ thể'),
    search:  z.string().optional().describe('Tìm theo tên cửa hàng, công ty hoặc người liên hệ')
  },
  async ({ status, region, city, search }) => {
    let query = sb
      .from('customers')
      .select('full_name, phone, email, company, city, region, status, updated_at')
      .order('full_name');

    if (status) query = query.eq('status', status);
    if (region) query = query.ilike('region', `%${region}%`);
    if (city)   query = query.ilike('city', `%${city}%`);
    if (search) query = query.or(
      `full_name.ilike.%${search}%,company.ilike.%${search}%`
    );

    const { data, error } = await query.limit(50);
    if (error) return { content: [{ type: 'text', text: `Lỗi: ${error.message}` }] };
    if (!data?.length) return { content: [{ type: 'text', text: 'Không có khách hàng phù hợp.' }] };

    const lines = data.map(r =>
      `📌 ${r.full_name} | ${r.phone ?? '-'} | ${r.company ?? '-'} | ` +
      `${r.city ?? '-'}, ${r.region ?? '-'} | [${r.status}]`
    );

    return { content: [{ type: 'text', text: `Khách hàng (${data.length}):\n\n${lines.join('\n')}` }] };
  }
);

// ════════════════════════════════════════════════════════════
// TOOL 4: get_new_orders
// Dùng khi: xem đơn mới trong 24h, đơn pending chưa xử lý hôm nay
// Ví dụ: "Có đơn mới nào không?", "Đơn pending trong 24 giờ qua"
// Bảng: orders
//   created_at: thời điểm tạo đơn (timestamptz)
//   status = 'pending', lọc created_at >= now() - 24h
// ════════════════════════════════════════════════════════════
server.tool(
  'get_new_orders',
  'Lấy danh sách đơn hàng mới có status pending được tạo trong 24 giờ qua. ' +
  'Gọi khi hỏi: đơn mới hôm nay, có đơn nào chưa xử lý không, đơn pending gần nhất.',
  {},
  async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await sb
      .from('orders')
      .select('id, store_name, product_name, qty, created_at, npp, sku')
      .eq('status', 'pending')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return { content: [{ type: 'text', text: `Lỗi: ${error.message}` }] };
    if (!data?.length) return { content: [{ type: 'text', text: 'Không có đơn pending mới trong 24 giờ qua.' }] };

    const fmt = iso => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    const lines = data.map(r =>
      `🆕 #${r.id} | ${r.store_name ?? '-'} | ${r.sku} — ${r.product_name} | ` +
      `SL: ${r.qty} | NPP: ${r.npp} | ${fmt(r.created_at)}`
    );

    return { content: [{ type: 'text', text: `Đơn pending mới (${data.length} đơn):\n\n${lines.join('\n')}` }] };
  }
);

// ── Khởi động server ────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
