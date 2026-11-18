-- Staff roles, step 1 of 2. Run this ALONE first, then run 018b in a separate run.
-- (Postgres cannot use a new enum value in the same transaction that adds it.)
alter type user_role add value if not exists 'nurse';
alter type user_role add value if not exists 'receptionist';
