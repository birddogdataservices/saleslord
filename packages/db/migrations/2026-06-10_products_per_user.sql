-- Migration: products move from shared (admin-managed) to per-user ownership.
-- Run once in the Supabase SQL editor.
--
-- Before: one shared products table — all reps read all rows, only admins write.
-- After:  each user owns their own products. Every existing shared product is
--         copied to every existing user so nobody loses working state, then the
--         original shared rows are removed.

begin;

-- 1. Add owner column (nullable during backfill)
alter table products add column user_id uuid references auth.users;

-- 2. Copy every existing shared product to every existing user
insert into products (user_id, name, description, value_props, competitors, created_at)
select r.user_id, p.name, p.description, p.value_props, p.competitors, p.created_at
from products p
cross join rep_profiles r
where p.user_id is null;

-- 3. Remove the original shared rows and lock the column down
delete from products where user_id is null;
alter table products alter column user_id set not null;

-- 4. Drop the admin-era ownership column and policies
alter table products drop column created_by;

drop policy "All users read products"  on products;
drop policy "Admins insert products"   on products;
drop policy "Admins update products"   on products;
drop policy "Admins delete products"   on products;

create policy "Users manage own products"
  on products for all using (auth.uid() = user_id);

-- 5. Replace the old index with a per-user one
drop index if exists products_created_at_idx;
create index on products (user_id, created_at asc);

commit;
