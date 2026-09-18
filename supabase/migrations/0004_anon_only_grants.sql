-- Applied to project dmcslbqmlogmtsibiyzq as "0002_0003_anon_only_grants" (version 20260918183143).
-- Brings the applied grants in line with the final 0002/0003 files: RPCs executable by anon only.
revoke all on function public.sm_family_create(text, jsonb) from public, authenticated;
revoke all on function public.sm_family_roster(text) from public, authenticated;
revoke all on function public.sm_pull(text, int, text) from public, authenticated;
revoke all on function public.sm_push(text, int, text, jsonb) from public, authenticated;
revoke all on function public.sm_rename(text, int, text, text) from public, authenticated;
grant execute on function public.sm_family_create(text, jsonb) to anon;
grant execute on function public.sm_family_roster(text) to anon;
grant execute on function public.sm_pull(text, int, text) to anon;
grant execute on function public.sm_push(text, int, text, jsonb) to anon;
grant execute on function public.sm_rename(text, int, text, text) to anon;
revoke all on function public.sm_live_invite(text, int, text, int, int) from public, authenticated;
revoke all on function public.sm_live_list(text, int, text) from public, authenticated;
revoke all on function public.sm_live_accept(uuid, text, int, text) from public, authenticated;
revoke all on function public.sm_live_move(uuid, text, int, text, int, text, text) from public, authenticated;
revoke all on function public.sm_live_get(uuid, text, int, text) from public, authenticated;
revoke all on function public.sm_live_end(uuid, text, int, text, text) from public, authenticated;
grant execute on function public.sm_live_invite(text, int, text, int, int) to anon;
grant execute on function public.sm_live_list(text, int, text) to anon;
grant execute on function public.sm_live_accept(uuid, text, int, text) to anon;
grant execute on function public.sm_live_move(uuid, text, int, text, int, text, text) to anon;
grant execute on function public.sm_live_get(uuid, text, int, text) to anon;
grant execute on function public.sm_live_end(uuid, text, int, text, text) to anon;
