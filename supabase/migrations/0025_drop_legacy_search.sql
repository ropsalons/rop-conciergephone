-- Remove the legacy 2-arg search_messages (defined in 0004). The 0024 five-arg version supersedes
-- it (adds sender/date/links filters) and is the only one the app calls; keeping both created an
-- unnecessary overload.
drop function if exists public.search_messages(text, integer);
