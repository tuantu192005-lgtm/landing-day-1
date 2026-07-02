import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
const SUPA_URL = 'https://ojmzgewuuoaqffnhcild.supabase.co';
const SUPA_KEY = readFileSync(new URL('../supabase_service_key.txt', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('sb_'));
const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

console.log('=== Query 1: products_master ILIKE %H610M%E%DDR4% ===');
const { data: q1, error: e1 } = await sb.from('products_master')
  .select('sku, model_name, normalized_name, lob')
  .ilike('model_name', '%H610M%E%DDR4%')
  .order('normalized_name');
if (e1) { console.error('LỖI:', e1.message); }
else {
  console.log(`Tìm thấy ${q1.length} dòng:`);
  q1.forEach(r => {
    console.log(`  SKU:   "${r.sku}"`);
    console.log(`  LOB:   ${r.lob}`);
    console.log(`  model: "${r.model_name}"`);
    console.log(`  norm:  "${r.normalized_name}"`);
    console.log();
  });
}

console.log('=== Query 2: product_disty_codes disty=DGW ILIKE %H610M% ===');
const { data: q2, error: e2 } = await sb.from('product_disty_codes')
  .select('disty, disty_code, disty_name, sku')
  .eq('disty', 'DGW')
  .ilike('disty_name', '%H610M%');
if (e2) { console.error('LỖI:', e2.message); }
else {
  console.log(`Tìm thấy ${q2.length} dòng:`);
  q2.forEach(r =>
    console.log(`  code: ${String(r.disty_code).padEnd(15)} sku: ${String(r.sku).padEnd(22)} name: "${r.disty_name}"`)
  );
}
