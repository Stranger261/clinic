-- Slice 2: let a signed-in user read ONLY their own profile row.
-- There is deliberately no insert/update policy, so nobody can change their own role.
create policy "Users can read their own profile"
  on profiles for select
  to authenticated
  using (id = (select auth.uid()));
