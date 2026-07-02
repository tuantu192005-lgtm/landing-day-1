import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Thứ tự ưu tiên: VGA > MB > MNT > PSU > CASE > COOLER > SSD > MINIPC > GG > SERVER
// Kiểm tra lowercase của model_name với lowercase pattern.
const LOB_RULES = [
  ['VGA',    ['rtx', 'gtx', 'gt ', 'radeon', 'geforce', 'vga']],
  ['MB',     ['h310','h410','h510','h610','b360','b460','b560','b660',
               'b760','b850','z390','z490','z590','z690','z790','z890',
               'x570','x670','x870','a320','a520','pro h','mag b','mpg z',
               'meg z','mainboard']],
  ['MNT',    ['mp','mag','msi g','monitor','màn hình','lcd',
               'mag 2','mag 3','pro mp','g27','g24','g32']],
  ['PSU',    ['psu','mag a','mpg a','meg a','gold','watt','power','nguồn']],
  ['CASE',   ['case','tower','mag forge','mpg gungnir','meg prospect','vỏ case']],
  ['COOLER', ['cooler','coreliquid','mag coreliquid','tản nhiệt','aio','cpu fan']],
  ['SSD',    ['ssd','spatium','datamag','nvme','m.2']],
  ['MINIPC', ['cubi','mini pc','minipc','nuc']],
  ['GG',     ['gaming gear','headset','mouse','keyboard','mousepad',
               'controller','vigor','clutch','force']],
  ['SERVER', ['server','máy chủ']],
];

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

async function fetchAllUnknown() {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('products_master')
      .select('sku, model_name')
      .eq('lob', 'Unknown')
      .range(from, from + PAGE - 1);
    if (error) throw new Error('Lỗi đọc products_master: ' + error.message);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function main() {
  console.log('── Đọc sản phẩm có lob=Unknown ──');
  const unknownProducts = await fetchAllUnknown();

  if (!unknownProducts.length) {
    console.log('Không có sản phẩm nào lob=Unknown — không cần classify.');
    return;
  }
  console.log(`Tìm thấy ${unknownProducts.length} sản phẩm lob=Unknown.`);

  // Phân loại từng sản phẩm
  const byLob = {};   // lob → [sku, ...]
  let keepUnknown = 0;
  for (const p of unknownProducts) {
    const lob = classifyLob(p.model_name);
    if (lob) {
      (byLob[lob] ||= []).push(p.sku);
    } else {
      keepUnknown++;
    }
  }

  const totalClassified = unknownProducts.length - keepUnknown;
  console.log(`\nNhận diện được: ${totalClassified} — Còn Unknown: ${keepUnknown}`);
  console.log('Theo LOB:');
  Object.entries(byLob).sort().forEach(([lob, skus]) => {
    console.log(`  ${lob.padEnd(8)} ${skus.length} sản phẩm`);
  });

  if (!totalClassified) {
    console.log('\nKhông có sản phẩm nào nhận diện được LOB.');
    return;
  }

  console.log('\n── Cập nhật lob vào products_master ──');
  for (const [lob, skus] of Object.entries(byLob)) {
    // Batch theo nhóm 400 để tránh URL quá dài
    for (let i = 0; i < skus.length; i += 400) {
      const batch = skus.slice(i, i + 400);
      const { error } = await sb.from('products_master').update({ lob }).in('sku', batch);
      if (error) throw new Error(`Lỗi update ${lob}: ${error.message}`);
      process.stdout.write('.');
    }
  }
  console.log(' done.\n');

  console.log('══════════ BÁO CÁO AUTO CLASSIFY ══════════');
  console.log(`Tổng đã cập nhật: ${totalClassified} sản phẩm`);
  Object.entries(byLob).sort().forEach(([lob, skus]) => {
    console.log(`  ${lob.padEnd(8)} → ${skus.length} sản phẩm`);
  });
  console.log(`  Còn Unknown  → ${keepUnknown} sản phẩm (không nhận diện được từ tên model)`);
  if (keepUnknown > 0) {
    console.log('\nCác sản phẩm còn Unknown cần admin cập nhật LOB thủ công trong tab Sản phẩm.');
  }
}

main().catch(err => {
  console.error('\nLỗi không mong muốn:', err);
  process.exit(1);
});
