-- Migration: products move from shared (admin-managed) to per-user ownership.
-- Run once in the Supabase SQL editor. Safe to rerun — all steps are guarded.
--
-- Before: one shared products table — all reps read all rows, only admins write.
-- After:  each user owns their own products. Every existing shared product is
--         copied to every existing user so nobody loses working state, then the
--         original shared rows are removed.

begin;

-- 1. Add owner column (nullable during backfill)
alter table products add column if not exists user_id uuid references auth.users;

-- 2. Drop the admin-era ownership column BEFORE backfilling — it is not null,
--    and the copied rows don't carry it
alter table products drop column if exists created_by;

-- 3. Copy every existing shared product to every existing user
insert into products (user_id, name, description, value_props, competitors, created_at)
select r.user_id, p.name, p.description, p.value_props, p.competitors, p.created_at
from products p
cross join rep_profiles r
where p.user_id is null;

-- 4. Remove the original shared rows and lock the column down
delete from products where user_id is null;
alter table products alter column user_id set not null;

-- 5. Replace the admin-era policies with a per-user policy
drop policy if exists "All users read products"  on products;
drop policy if exists "Admins insert products"   on products;
drop policy if exists "Admins update products"   on products;
drop policy if exists "Admins delete products"   on products;
drop policy if exists "Users manage own products" on products;

create policy "Users manage own products"
  on products for all using (auth.uid() = user_id);

-- 6. Replace the old index with a per-user one
drop index if exists products_created_at_idx;
create index if not exists products_user_id_created_at_idx
  on products (user_id, created_at asc);

commit;
