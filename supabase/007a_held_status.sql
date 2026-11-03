-- Slice 6b, step 1 of 2. Run this ALONE first, then run 007b in a separate run.
-- (Postgres cannot use a new enum value in the same transaction that adds it.)
alter type slot_status add value if not exists 'held';
