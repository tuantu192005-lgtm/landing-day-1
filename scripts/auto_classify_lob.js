import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const LAPTOP_PATTERNS = ['laptop', 'máy tính xách tay', 'notebook', 'xách tay'];

// Thứ tự ưu tiên: VGA > MB > PSU > CASE > DESKTOP > COOLER > MNT > SSD > MINIPC > GDT > GG > SERVER
// DESKTOP trước COOLER: '(aio)' desktop không bị 'aio' của cooler bắt nhầm.
// MINIPC trước GDT: '(mini server)' không bị 'server' của GDT bắt nhầm.
// GDT đã bao gồm 'server'/'máy chủ' → thay thế SERVER cho hàng hóa thực tế.
const LOB_RULES = [
  ['VGA',     ['rtx', 'gtx', 'gt ', 'radeon', 'geforce', 'vga']],
  ['MB',      ['h310','h410','h510','h610','b360','b460','b560','b660',
                'b760','b850','z390','z490','z590','z690','z790','z890',
                'x570','x670','x870','a320','a520','pro h','mag b','mpg z',
                'meg z','mainboard']],
  ['PSU',     ['mag a','mpg a','meg a','mag gf','mpg gf','mag gm',
                'gold','watt','power','nguồn','psu']],
  ['CASE',    ['mag forge','mag pano','mpg gungnir','meg prospect','case','tower','vỏ']],
  ['DESKTOP', ['(desktop)','(dt)','(aio)']],
  ['COOLER',  ['mag coreliquid','mag core','coreliquid','coreflow',
                'cooler','tản nhiệt','aio','cpu fan']],
  ['MNT',     ['mp2','mag 2','mag 3','mag 4','g274','g275','g27q',
                'g24','g32','pro mp','monitor','màn hình','lcd']],
  ['SSD',     ['ssd','spatium','datamag','nvme','m.2']],
  ['MINIPC',  ['(mini server)','(minipc)','cubi','mini pc','minipc','nuc']],
  ['GDT',     ['(pc)','máy chủ','server','g4101','s2205']],
  ['GG',      ['gaming gear','headset','mouse','keyboard','mousepad',
                'controller','vigor','clutch','force']],
  ['SERVER',  ['máy chủ cũ']],
];

function isLaptop(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return LAPTOP_PATTERNS.some(p => n.includes(p));
}

function classifyLob(modelName) {
  if (!modelName) return null;
  const name = modelName.toLowerCase();
  for (const [lob, patterns] of LOB_RULES) {
    for (const p of patterns) {
      if (name.includes(p)) return lob;
    }
  }
  return null;
}

const PAGE = 1000;

async function fetchByLob(lob) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('products_master')
      .select('sku, model_name')
      .eq('lob', lob)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Lỗi đọc products_master (lob=${lob}): ${error.message}`);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function batchUpdate(byLob) {
  for (const [lob, skus] of Object.entries(byLob)) {
    for (let i = 0; i < skus.length; i += 400) {
      const batch = skus.slice(i, i + 400);
      const { error } = await sb.from('products_master').update({ lob }).in('sku', batch);
      if (error) throw new Error(`Lỗi update ${lob}: ${error.message}`);
      process.stdout.write('.');
    }
  }
}

async function batchDelete(skus) {
  for (let i = 0; i < skus.length; i += 200) {
    const batch = skus.slice(i, i + 200);
    const { error } = await sb.from('products_master').delete().in('sku', batch);
    if (error) throw new Error('Lỗi xoá: ' + error.message);
    process.stdout.write('x');
  }
}

async function main() {
  // ── Phase 0: Xoá Laptop/Notebook trong Unknown ──
  console.log('══ Phase 0: Xoá Laptop/Notebook khỏi Unknown ══');
  const unknownForLaptop = await fetchByLob('Unknown');
  const laptopSkus = unknownForLaptop.filter(p => isLaptop(p.model_name)).map(p => p.sku);
  if (laptopSkus.length) {
    await batchDelete(laptopSkus);
    console.log(` done. Đã xoá ${laptopSkus.length} Laptop/Notebook.`);
  } else {
    console.log('Không có Laptop/Notebook nào trong Unknown.');
  }

  // ── Phase 1: Classify sản phẩm có lob=Unknown ──
  console.log('\n══ Phase 1: Classify sản phẩm lob=Unknown ══');
  // Fetch lại (Phase 0 đã xoá một số)
  const unknownProducts = (await fetchByLob('Unknown')).filter(p => !isLaptop(p.model_name));

  if (!unknownProducts.length) {
    console.log('Không có sản phẩm nào lob=Unknown.');
  } else {
    console.log(`Tìm thấy ${unknownProducts.length} sản phẩm lob=Unknown.`);
    const byLob = {};
    let keepUnknown = 0;
    for (const p of unknownProducts) {
      const lob = classifyLob(p.model_name);
      if (lob) (byLob[lob] ||= []).push(p.sku);
      else keepUnknown++;
    }
    const totalClassified = unknownProducts.length - keepUnknown;
    if (totalClassified) {
      console.log(`Nhận diện được: ${totalClassified} — Còn Unknown: ${keepUnknown}`);
      await batchUpdate(byLob);
      console.log(' done.');
      Object.entries(byLob).sort().forEach(([lob, skus]) =>
        console.log(`  ${lob.padEnd(8)} → ${skus.length} sản phẩm`)
      );
    } else {
      console.log('Không có sản phẩm nào nhận diện được từ tên model.');
    }
    if (keepUnknown > 0) {
      console.log(`  Unknown còn lại: ${keepUnknown} (cần phân loại thủ công)`);
    }
  }

  // ── Phase 2: Sửa sản phẩm bị phân loại nhầm thành MNT ──
  console.log('\n══ Phase 2: Kiểm tra và sửa sản phẩm MNT bị phân loại sai ══');
  const mntProducts = await fetchByLob('MNT');
  console.log(`Kiểm tra ${mntProducts.length} sản phẩm hiện là MNT...`);

  const toFix = {};
  for (const p of mntProducts) {
    const newLob = classifyLob(p.model_name);
    if (newLob && newLob !== 'MNT') {
      (toFix[newLob] ||= []).push(p.sku);
    }
  }

  const totalFixed = Object.values(toFix).reduce((s, a) => s + a.length, 0);
  if (!totalFixed) {
    console.log('Không phát hiện sản phẩm MNT nào bị phân loại sai.');
  } else {
    console.log(`Phát hiện ${totalFixed} sản phẩm MNT cần sửa lại:`);
    Object.entries(toFix).sort().forEach(([lob, skus]) =>
      console.log(`  MNT → ${lob.padEnd(8)} ${skus.length} sản phẩm`)
    );
    await batchUpdate(toFix);
    console.log(' done.');
  }

  // ── Báo cáo tổng ──
  console.log('\n══════════ BÁO CÁO ══════════');
  console.log(`Phase 0 — Laptop xoá: ${laptopSkus.length}`);
  console.log(`Phase 1 — Unknown đã classify: ${unknownProducts.length}`);
  console.log(`Phase 2 — MNT sai đã sửa: ${totalFixed}`);
  if (totalFixed) {
    Object.entries(toFix).sort().forEach(([lob, skus]) =>
      console.log(`  ${skus.length} sản phẩm MNT → ${lob}`)
    );
  }
}

main().catch(err => {
  console.error('\nLỗi không mong muốn:', err);
  process.exit(1);
});
