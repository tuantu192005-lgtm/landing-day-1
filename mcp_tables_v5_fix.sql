-- Fix: target_qty/target_stretched cần chứa số thập phân (KPI "Target sell through"
-- là giá trị trọng số, không phải số nguyên đơn vị) — đổi từ integer sang numeric.
alter table public.targets alter column target_qty type numeric;
alter table public.targets alter column target_stretched type numeric;
