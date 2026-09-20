-- Budgets keyed on the target, not on the caller.
--
-- 0006 keyed every budget on the last X-Forwarded-For hop. Measured afterwards,
-- that fingerprint holds on /rest/v1/rpc -- 70 calls from one machine landed on a
-- single key and the limit engaged at 60 -- but NOT on /functions/v1, where the
-- Functions edge fronts requests from an AWS pool: the same 70 calls spread across
-- 11 keys (13.248.99.*, 99.82.172.*), none of them reaching the limit. A budget a
-- caller can rotate just by making requests is not a budget, so it cannot be the
-- only one.
--
-- The load-bearing key is now the thing under attack, which cannot be rotated: the
-- family code for roster lookups, (code, slot) for PINs and pushes. The fingerprint
-- stays as a second dimension because it does work on the RPC path.
--
-- On top, a GLOBAL bucket per operation bounds mass scraping even when the code and
-- the fingerprint both vary. A global bucket normally lets one attacker deny
-- everyone, so these count MISSES ONLY -- lookups that found nothing. Measured: 100
-- successful lookups of a real code never create the miss bucket at all, while a
-- walk of invented codes fills it. Enumeration is nearly all misses; a household is
-- nearly all hits.
--
-- Numbers. A busy household of 5 devices doing ~2 roster calls per app open, 6 opens
-- in 10 minutes, is ~60 lookups -- all hits, so the global budget stays untouched and
-- the per-code ceiling (200/hr) still has room. 300 misses per 10 minutes is reachable
-- only by someone walking codes that do not exist; at that rate the ~9.2M code space
-- takes over 50 years.

create or replace function sm_lookup_ok(p_op text, p_target text)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  if exists (select 1 from sm_rate where bucket = p_op||'_t'  and key = left(p_target,80)
              and n >= 200 and since > now() - interval '1 hour') then return false; end if;
  if exists (select 1 from sm_rate where bucket = p_op||'_ip' and key = left(sm_client(),80)
              and n >= 120 and since > now() - interval '1 hour') then return false; end if;
  if exists (select 1 from sm_rate where bucket = p_op||'_miss' and key = 'all'
              and n >= 300 and since > now() - interval '10 minutes') then return false; end if;
  perform sm_rate_ok(p_op||'_t',  p_target,    200, interval '1 hour');
  perform sm_rate_ok(p_op||'_ip', sm_client(), 120, interval '1 hour');
  return true;
end;
$function$;

create or replace function sm_lookup_miss(p_op text)
  returns void
  language sql
  security definer
  set search_path to 'public'
as $function$
  select sm_rate_ok(p_op||'_miss', 'all', 300, interval '10 minutes');
$function$;

revoke all on function sm_lookup_ok(text, text) from public, anon, authenticated;
revoke all on function sm_lookup_miss(text) from public, anon, authenticated;

-- The roster is the code-guessing oracle. The budget rides on the code itself, which
-- a guesser must change to learn anything -- and changing it is exactly what the
-- global miss bucket counts. Over budget still returns an empty roster, the same
-- answer a dead code gives, so there is still nothing to learn from being blocked.
create or replace function sm_family_roster(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare v_code text := sm_norm_code(p_code); v_out jsonb;
begin
  if not sm_lookup_ok('roster', v_code) then return '[]'::jsonb; end if;
  v_out := coalesce((select jsonb_agg(jsonb_build_object('slot', slot, 'name', name) order by slot)
                       from sm_players where family_code = v_code), '[]'::jsonb);
  if v_out = '[]'::jsonb then perform sm_lookup_miss('roster'); end if;
  return v_out;
end;
$function$;

-- PIN checks were already keyed on (family_code, slot) through sm_players.fails and
-- fail_at -- the player row itself, which a guesser cannot rotate. That stays. Added:
-- a global bucket of wrong PINs, so one bot spreading a guess across many families
-- is bounded even though each family's own counter stays low. Failures only, so a
-- household mistyping now and then never reaches it.
create or replace function sm_auth(p_code text, p_slot integer, p_pin text)
  returns text
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare r record; v_ip text := sm_client();
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin must be 4 digits' using errcode = '22023';
  end if;
  if exists (select 1 from sm_rate where bucket = 'pin_ip' and key = left(v_ip, 80)
              and n >= 30 and since > now() - interval '1 hour')
     or exists (select 1 from sm_rate where bucket = 'pin_all' and key = 'all'
                 and n >= 200 and since > now() - interval '10 minutes') then
    return 'locked';
  end if;
  select * into r from sm_players where family_code = p_code and slot = p_slot for update;
  if not found then
    perform sm_rate_ok('pin_ip', v_ip, 30, interval '1 hour');
    perform sm_rate_ok('pin_all', 'all', 200, interval '10 minutes');
    return 'pin';
  end if;
  if r.fails >= 10 and r.fail_at > now() - interval '15 minutes' then return 'locked'; end if;
  if r.pin_hash = extensions.crypt(p_pin, r.pin_hash) then
    if r.fails <> 0 then update sm_players set fails = 0, fail_at = null where family_code = p_code and slot = p_slot; end if;
    return 'ok';
  end if;
  perform sm_rate_ok('pin_ip', v_ip, 30, interval '1 hour');
  perform sm_rate_ok('pin_all', 'all', 200, interval '10 minutes');
  update sm_players
     set fails = case when fail_at is null or fail_at < now() - interval '15 minutes' then 1 else least(fails + 1, 100) end,
         fail_at = now()
   where family_code = p_code and slot = p_slot;
  return 'pin';
end;
$function$;

-- Pushes ride on (code, slot). A writer must already have passed that player's PIN
-- check, so the key cannot be rotated. 300/hr is far above a kid syncing after every
-- fight; the global ceiling only catches a flood.
create or replace function sm_push(p_code text, p_slot integer, p_pin text, p_progress jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare v_code text := sm_norm_code(p_code); v_auth text; v_when timestamptz;
begin
  perform sm_check_slot(p_slot);
  if p_progress is null or jsonb_typeof(p_progress) <> 'object' then
    raise exception 'progress must be an object' using errcode = '22023';
  end if;
  if octet_length(p_progress::text) > 262144 then
    raise exception 'progress too large' using errcode = '54000';
  end if;
  v_auth := sm_auth(v_code, p_slot, p_pin);
  if v_auth <> 'ok' then return jsonb_build_object('error', v_auth); end if;
  if not sm_rate_ok('push', v_code || ':' || p_slot, 300, interval '1 hour')
     or not sm_rate_ok('push_all', 'all', 3000, interval '10 minutes') then
    return jsonb_build_object('error', 'busy');
  end if;
  update sm_players set progress = p_progress, updated_at = now()
   where family_code = v_code and slot = p_slot
  returning updated_at into v_when;
  return jsonb_build_object('updated_at', v_when);
end;
$function$;

create or replace function sm_family_rate()
  returns void
  language plpgsql
  set search_path to 'public'
as $function$
begin
  if not sm_rate_ok('fam_ip', sm_client(), 12, interval '1 hour')
     or not sm_rate_ok('fam_all', 'all', 120, interval '10 minutes') then
    raise exception 'too many new families, try again in a few minutes' using errcode = '54000';
  end if;
end;
$function$;

grant execute on function sm_family_roster(text) to anon;
grant execute on function sm_push(text, integer, text, jsonb) to anon;
