-- ============================================================
-- Supabase tables v2 — MSI Sales Management
-- Cấu trúc khớp 100% với DB_INVENTORY / DB_ORDERS / DB_CUSTOMERS
-- trong admin/index.html
--
-- Chạy trong SQL Editor:
-- https://supabase.com/dashboard/project/ojmzgewuuoaqffnhcild/sql
-- ============================================================

-- ── 1. INVENTORY ────────────────────────────────────────────
-- Tồn kho theo SKU × NPP (mỗi dòng = 1 sản phẩm tại 1 NPP)
create table if not exists public.inventory (
  id           bigint primary key,
  sku          text not null,
  product_name text not null,
  category     text,           -- vga | mainboard | lcd | psu | ssd | chassis | cooling
  npp          text not null,  -- DGW | SPC | KTC | NWH | MH | AD
  qty          integer not null default 0,
  min_qty      integer not null default 5,
  updated_at   timestamptz default now()
);

-- Thêm cột thiếu nếu bảng đã tồn tại
alter table public.inventory add column if not exists category     text;
alter table public.inventory add column if not exists min_qty      integer not null default 5;
alter table public.inventory add column if not exists product_name text;
alter table public.inventory add column if not exists npp          text;
alter table public.inventory add column if not exists updated_at   timestamptz default now();

create index if not exists inventory_sku_idx      on public.inventory(sku);
create index if not exists inventory_npp_idx      on public.inventory(npp);
create index if not exists inventory_category_idx on public.inventory(category);

-- ── 2. CUSTOMERS ─────────────────────────────────────────────
-- Đại lý / cửa hàng
create table if not exists public.customers (
  id           bigint primary key,
  store_name   text not null,
  contact      text,           -- tên người liên hệ
  phone        text,
  address      text,
  city         text,
  npp          text,           -- NPP chính của đại lý
  rep          text,           -- tên nhân viên phụ trách
  tier         text default 'bronze',  -- gold | silver | bronze
  follow       text default 'new',     -- new | follow | active
  created_at   timestamptz default now()
);

alter table public.customers add column if not exists contact    text;
alter table public.customers add column if not exists phone      text;
alter table public.customers add column if not exists address    text;
alter table public.customers add column if not exists city       text;
alter table public.customers add column if not exists npp        text;
alter table public.customers add column if not exists rep        text;
alter table public.customers add column if not exists tier       text default 'bronze';
alter table public.customers add column if not exists follow     text default 'new';

create index if not exists customers_rep_idx    on public.customers(rep);
create index if not exists customers_follow_idx on public.customers(follow);
create index if not exists customers_city_idx   on public.customers(city);

-- ── 3. ORDERS ─────────────────────────────────────────────────
-- Đơn hàng (1 đơn = 1 dòng sản phẩm)
create table if not exists public.orders (
  id           bigint primary key,
  customer_id  bigint references public.customers(id),
  sku          text not null,
  product_name text not null,
  qty          integer not null default 1,
  unit_price   bigint not null default 0,  -- VNĐ
  npp          text not null,
  order_date   date default current_date,
  status       text not null default 'pending',  -- pending | confirmed | shipped | done
  note         text,
  store_name   text   -- denorm từ customers.store_name để query nhanh
);

alter table public.orders add column if not exists product_name text;
alter table public.orders add column if not exists qty          integer default 1;
alter table public.orders add column if not exists unit_price   bigint default 0;
alter table public.orders add column if not exists order_date   date default current_date;
alter table public.orders add column if not exists store_name   text;
alter table public.orders add column if not exists note         text;

create index if not exists orders_status_idx     on public.orders(status);
create index if not exists orders_customer_idx   on public.orders(customer_id);
create index if not exists orders_sku_idx        on public.orders(sku);
create index if not exists orders_date_idx       on public.orders(order_date desc);

-- ── 4. RLS ────────────────────────────────────────────────────
-- service_role key (MCP server) tự bypass RLS
-- policies dưới đây cho phép admin/lead đọc từ web app

alter table public.inventory enable row level security;
alter table public.customers enable row level security;
alter table public.orders    enable row level security;

drop policy if exists "admin_read_inventory" on public.inventory;
drop policy if exists "admin_read_customers" on public.customers;
drop policy if exists "admin_read_orders"    on public.orders;

create policy "admin_read_inventory" on public.inventory
  for select using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'lead')
              and p.status = 'active')
  );

create policy "admin_read_customers" on public.customers
  for select using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'lead')
              and p.status = 'active')
  );

create policy "admin_read_orders" on public.orders
  for select using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'lead')
              and p.status = 'active')
  );

-- ── 5. SEED DATA (từ admin/index.html) ────────────────────────
-- Bỏ comment khối INSERT bên dưới để nạp dữ liệu mẫu

/*
insert into public.customers (id,store_name,contact,phone,address,city,npp,rep,tier) values
(1,'Phong Vũ HCM','Anh Minh','0901234001','240 Võ Văn Tần, Q3','TP.HCM','DGW','Tú','gold'),
(2,'Gearvn Hà Nội','Chị Lan','0901234002','45 Lý Thường Kiệt, HK','Hà Nội','KTC','Tú','gold'),
(3,'An Phát HCM','Anh Hùng','0901234003','120 Hoàng Diệu 2, Thủ Đức','TP.HCM','MH','Tú','silver'),
(4,'CellphoneS','Anh Trường','0901234004','74 Cách Mạng Tháng 8, Q10','TP.HCM','SPC','Tú','silver'),
(5,'HanoiComputer','Chị Hoa','0901234005','100 Bà Triệu, Hai Bà Trưng','Hà Nội','KTC','Tú','silver'),
(6,'XGear Đà Nẵng','Anh Bình','0901234006','34 Lê Duẩn, Hải Châu','Đà Nẵng','NWH','Tú','bronze'),
(7,'Techzone Cần Thơ','Anh Thoại','0901234007','56 Trần Hưng Đạo, NK','Cần Thơ','AD','Tú','bronze'),
(8,'GAM3GEAR','Anh Khoa','0901234008','350 Ung Văn Khiêm, BT','TP.HCM','DGW','Tú','silver'),
(9,'Nguyễn Kim','Chị Thu','0901234009','63 Trần Hưng Đạo, Q1','TP.HCM','DGW','Tú','gold'),
(10,'Long Châu Computer','Anh Long','0901234010','10 Đinh Tiên Hoàng, Q1','TP.HCM','SPC','Tú','bronze')
on conflict (id) do nothing;

insert into public.inventory (id,sku,product_name,category,npp,qty,min_qty) values
(1,'RTX-5090-SUPRIM-X-32G','RTX 5090 SUPRIM X','vga','DGW',2,1),
(2,'RTX5080-GAMINGXTRIO-16G','RTX 5080 GAMING X TRIO','vga','DGW',5,3),
(3,'RTX5080-GAMINGXTRIO-16G','RTX 5080 GAMING X TRIO','vga','SPC',3,3),
(4,'RTX5080-GAMINGXTRIO-16G','RTX 5080 GAMING X TRIO','vga','MH',4,3),
(5,'RTX5060TI-GAMINGXTRIO-16G','RTX 5060 Ti GAMING X','vga','DGW',18,5),
(6,'RTX5060TI-GAMINGXTRIO-16G','RTX 5060 Ti GAMING X','vga','SPC',12,5),
(7,'RTX5060TI-GAMINGXTRIO-16G','RTX 5060 Ti GAMING X','vga','KTC',8,5),
(8,'RX9070-GAMINGXTRIO-16G','RX 9070 GAMING X TRIO','vga','DGW',10,5),
(9,'RX9070-GAMINGXTRIO-16G','RX 9070 GAMING X TRIO','vga','SPC',7,5),
(10,'MAG-B860-TOMAHAWK-WIFI','MAG B860 TOMAHAWK WIFI','mainboard','DGW',25,10),
(11,'MAG-B860-TOMAHAWK-WIFI','MAG B860 TOMAHAWK WIFI','mainboard','SPC',20,10),
(12,'MAG-B860-TOMAHAWK-WIFI','MAG B860 TOMAHAWK WIFI','mainboard','KTC',15,10),
(13,'PRO-B850-P-WIFI','PRO B850-P WIFI','mainboard','DGW',30,10),
(14,'PRO-B850-P-WIFI','PRO B850-P WIFI','mainboard','SPC',22,10),
(15,'PRO-H610M-E-DDR4','PRO H610M-E DDR4','mainboard','DGW',40,15),
(16,'PRO-H610M-E-DDR4','PRO H610M-E DDR4','mainboard','SPC',35,15),
(17,'PRO-H610M-E-DDR4','PRO H610M-E DDR4','mainboard','KTC',28,15),
(18,'MPG321URX-QDOLED','MPG 321URX QD-OLED','lcd','DGW',3,2),
(19,'MPG321URX-QDOLED','MPG 321URX QD-OLED','lcd','MH',2,2),
(20,'MAG274QRF-QD','MAG 274QRF-QD','lcd','DGW',14,5),
(21,'MAG274QRF-QD','MAG 274QRF-QD','lcd','SPC',10,5),
(22,'MAG272C4PF','MAG 272C4PF','lcd','DGW',20,5),
(23,'MAG-A850G-PCIE5','MAG A850G PCIE5','psu','DGW',22,8),
(24,'MAG-A850G-PCIE5','MAG A850G PCIE5','psu','SPC',18,8),
(25,'MAG-A750GL-PCIE5','MAG A750GL PCIE5','psu','DGW',25,8),
(26,'MAG-A650BN','MAG A650BN','psu','DGW',30,10),
(27,'SPATIUM-M480-PRO-1TB','M480 PRO 1TB','ssd','DGW',50,15),
(28,'SPATIUM-M480-PRO-1TB','M480 PRO 1TB','ssd','SPC',40,15),
(29,'SPATIUM-M480-PRO-1TB','M480 PRO 1TB','ssd','KTC',30,15),
(30,'SPATIUM-M370-1TB','M370 1TB','ssd','DGW',60,15),
(31,'MAG-CORELIQUID-E240','CORELIQUID E240','cooling','DGW',15,5),
(32,'MAG-CORELIQUID-240R-V2','CORELIQUID 240R V2','cooling','DGW',20,5),
(33,'MAG-FORGE-320R-AIRFLOW','FORGE 320R AIRFLOW','chassis','DGW',18,5),
(34,'MAG-FORGE-320R-AIRFLOW','FORGE 320R AIRFLOW','chassis','SPC',12,5),
(35,'MAG-FORGE-111R','FORGE 111R','chassis','DGW',25,8)
on conflict (id) do nothing;
*/
