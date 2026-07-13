-- =====================================================================
-- MIGRATION v15: sellout_data.customer_id (FK -> customers) + view
--                v_sellout_categorized (sellout_data + cot category)
--
-- Boi canh: sellout_data hien lien ket khach hang bang text tu do
-- (customer_name), KHONG co FK. Da xac nhan qua service key truoc khi
-- viet file nay:
--   - sellout_data KHONG co cot customer_id/sku/category (test SELECT
--     bao loi "column does not exist" cho ca 3 cot).
--   - customers.id la kieu integer (vi du: 2).
--   - 73/73 ten khach phan biet trong sellout_data.customer_name khop
--     CHINH XAC (case-insensitive) voi customers.full_name.
--
-- Chay tung khoi mot trong Supabase SQL Editor. Cac cau SELECT o cuoi
-- moi khoi la de TU KIEM TRA ngay, khong bat buoc nhung nen chay.
-- =====================================================================


-- ── 1. Them cot customer_id (FK -> customers) ──────────────────────
alter table public.sellout_data
  add column if not exists customer_id integer references public.customers(id);

create index if not exists sellout_data_customer_id_idx
  on public.sellout_data(customer_id);


-- ── 2. Backfill customer_id bang match case-insensitive + trim ─────
-- (khop theo customer_name = full_name, khong phan biet hoa/thuong,
-- bo khoang trang dau/cuoi de phong sai lech nhap lieu)
update public.sellout_data sd
set customer_id = c.id
from public.customers c
where sd.customer_id is null
  and sd.customer_name is not null
  and upper(trim(sd.customer_name)) = upper(trim(c.full_name));

-- Kiem tra ngay: ky vong 0 dong (da xac nhan 73/73 khop truoc khi viet
-- migration nay). Neu > 0, xem cau SELECT thu 2 de biet ten khach nao
-- bi sot (co the do sai chinh ta / khoang trang la / dau cach kieu khac).
select count(*) as con_null_sau_backfill
from public.sellout_data
where customer_id is null;

select distinct customer_name
from public.sellout_data
where customer_id is null
order by customer_name;


-- ── 3. View v_sellout_categorized: sellout_data + cot category ─────
-- CASE WHEN lay NGUYEN VAN tu view v_kpi_achieved (mcp_tables_v5.sql,
-- dang dung song song cho v_kpi_full) -- KHONG viet lai tu dau de
-- tranh lech ket qua giua 2 view. Da doi chieu bang du lieu that: CASE
-- nay phu 100% cac gia tri lob dang co trong sellout_data (MB, DESKTOP,
-- MINIPC, G Monitor, Pro Monitor, PSU, CASE, COOLER, VGA, GG, SSD), chi
-- lob 'Others' (41 dong) roi vao nhanh else 'Chua phan loai'.
--
-- LUU Y: khong co cach doc truc tiep SQL text cua view v_kpi_achieved
-- dang chay tren Supabase qua REST API (pg_catalog/information_schema
-- khong duoc PostgREST expose, da xac nhan truoc do) -- CASE duoi day
-- copy tu file mcp_tables_v5.sql va kiem chung bang du lieu that (khop
-- 100% cac lob hien co), khong phai doc truc tiep dinh nghia view dang
-- chay. Neu muon chac tuyet doi, doi chieu them voi Database > Views >
-- v_kpi_achieved > Definition tren Supabase Dashboard truoc khi chay.
create or replace view public.v_sellout_categorized
with (security_invoker = true) as
select
  sd.*,
  case
    when sd.lob = 'MB' and sd.details_chipset ~* '^[AH]' then 'CND-MB'
    when sd.lob = 'MB' and sd.details_chipset ~* '^B' then 'CND-MB (B Chipset)'
    when sd.lob = 'MB' and sd.details_chipset ~* '^[XZ]' then 'CND-MB (X,Z Chipset)'
    when sd.lob in ('DESKTOP', 'MINIPC') then 'CND-PRO ( Cubi, DT & AIO )'
    when sd.lob = 'G Monitor' and (sd.details_chipset ilike '%Q%' or sd.model ilike '%Q%') then 'CND-GMNT ( QHD )'
    when sd.lob = 'Pro Monitor' then 'CND-PRO MNT'
    when sd.lob = 'G Monitor' then 'CND-GMNT'
    when sd.lob = 'PSU' then 'CND-PSU'
    when sd.lob = 'CASE' then 'CND-Chassis'
    when sd.lob = 'COOLER' then 'CND-Liquid Cooler'
    when sd.lob = 'VGA' and (sd.details_chipset || ' ' || sd.model) ilike '%GT%'
         and (sd.details_chipset || ' ' || sd.model) not ilike '%GTX%' then 'GNP-VGA ( GT )'
    when sd.lob = 'VGA' and ((sd.details_chipset || ' ' || sd.model) ilike '%GTX%'
         or (sd.details_chipset || ' ' || sd.model) ilike '%RTX%') then 'GNP-VGA ( GTX + RTX )'
    when sd.lob = 'GG' then 'GNP-Gaming Gears'
    when sd.lob = 'SSD' then 'SSD'
    else 'Chưa phân loại'
  end as category
from public.sellout_data sd;


-- ── 4. Kiem tra sau khi tao view ────────────────────────────────────
-- Ky vong: moi category la 1 trong 16 category that cua targets/v_kpi_full,
-- CONG THEM co the co dong 'Chua phan loai' (nhung lob khong khop nhanh
-- CASE nao, vi du 'Others') -- day la du lieu that su chua duoc gan
-- category chuan, khong phai loi.
select category, count(*) as so_dong, sum(quantity) as tong_so_luong
from public.v_sellout_categorized
group by category
order by category;


-- =====================================================================
-- HET FILE
-- =====================================================================
