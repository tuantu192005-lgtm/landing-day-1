-- =====================================================================
-- KIEM TRA TRUOC KHI CHAY v18 (chi doc, khong thay doi gi).
-- Chay tung khoi trong Supabase SQL Editor, chup/ dan ket qua lai.
-- Muc dich: xac nhan dung TRUOC khi dong chan tai khoan ky thuat.
-- =====================================================================

-- A. Cau truc bang profiles (co nhung cot gi, da co is_technical chua):
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- B. 3 tai khoan can quan tam, TRA THEO EMAIL (khong theo ten).
--    - tuantu192005@gmail.com  = tai khoan ky thuat (Nguyen Van Tu)  -> can AN
--    - tu@msivn.io.vn          = Tu nhan vien that                   -> PHAI HIEN
--    - nam@msivn.io.vn         = Nam (admin quan ly)                 -> binh thuong
select id, email, full_name, role, status
from public.profiles
where email in ('tuantu192005@gmail.com', 'tu@msivn.io.vn', 'nam@msivn.io.vn')
order by email;

-- C. Cac policy RLS hien co tren profiles (de biet dang cho ai doc/ghi gi):
select policyname, permissive, cmd, qual as "using", with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;

-- D. RLS da bat tren profiles chua:
select relname, relrowsecurity as rls_on
from pg_class
where oid = 'public.profiles'::regclass;

-- E. (Yeu cau #2) Tai khoan ky thuat hien co phai admin dang hoat dong khong?
--    Neu dong nay role khac 'admin' hoac status khac 'active' => v18 se sua lai.
select id, email, role, status,
       (role = 'admin' and status = 'active') as la_admin_cao_nhat
from public.profiles
where email = 'tuantu192005@gmail.com';
