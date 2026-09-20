-- Throttling for the guessable secrets.
--
-- Shockmate's only doors are a 10-word + 4-character family code (about 9.2M codes)
-- and a 4-digit PIN. Both are small enough to grind, so every door now spends from a
-- budget that refills by itself. Nothing here can lock a kid out for good: a window
-- simply expires, and the row is forgotten a day later.
--
-- Deliberately unchanged: every function keeps its existing return shape, so the
-- clients that call them keep working. Over-budget looks like "nothing found"
-- (sm_family_roster) or reuses the 'locked' error the client already explains.

create table if not exists sm_rate (
  bucket text        not null,
  key    text        not null,
  n      integer     not null default 0,
  since  timestamptz not null default now(),
  primary key (bucket, key)
);
alter table sm_rate enable row level security;   -- no policies and no grants: RPC-only
revoke all on sm_rate from anon, authenticated;
create index if not exists sm_rate_since on sm_rate (since);

-- A coarse caller fingerprint: the address Supabase's edge appended to
-- X-Forwarded-For. The LAST entry is the one the edge wrote; earlier entries are
-- whatever the caller sent and can be invented, so they are ignored. Direct SQL
-- has no request headers and is not throttled.
create or replace function sm_client()
  returns text
  language sql
  stable
  set search_path to 'public'
as $function$
  select coalesce(
    nullif(btrim(regexp_replace(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      '^.*,', '')), ''),
    'local');
$function$;

-- Spends one unit from (bucket, key) and says whether the call may go ahead.
-- A fixed window that restarts once it has aged out, so a blocked caller always
-- recovers on its own and no attempt is ever remembered for longer than a day.
create or replace function sm_rate_ok(p_bucket text, p_key text, p_limit integer, p_window interval)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare v_n integer;
begin
  if p_key is null or p_key = '' then return true; end if;
  insert into sm_rate (bucket, key, n, since)
       values (p_bucket, left(p_key, 80), 1, now())
  on conflict (bucket, key) do update
     set n     = case when sm_rate.since < now() - p_window then 1 else sm_rate.n + 1 end,
         since = case when sm_rate.since < now() - p_window then now() else sm_rate.since end
  returning n into v_n;
  -- Opportunistic sweep, so an attack cannot grow the table without bound.
  if random() < 0.002 then
    delete from sm_rate where since < now() - interval '1 day';
  end if;
  return v_n <= p_limit;
end;
$function$;

revoke all on function sm_client() from public, anon, authenticated;
revoke all on function sm_rate_ok(text, text, integer, interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Family-code guessing. The roster is the one thing a bare code opens, so it is
-- the oracle an attacker would grind. A caller gets 60 lookups an hour, and any
-- one code answers 200 an hour however many callers ask. Over budget returns an
-- empty roster -- identical to a code that does not exist, which also removes
-- the "this code is real" signal.
create or replace function sm_family_roster(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare v_code text := sm_norm_code(p_code);
begin
  if not sm_rate_ok('roster_ip', sm_client(), 60, interval '1 hour')
     or not sm_rate_ok('roster_code', v_code, 200, interval '1 hour') then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('slot', slot, 'name', name) order by slot)
                     from sm_players where family_code = v_code), '[]'::jsonb);
end;
$function$;

-- ---------------------------------------------------------------------------
-- PIN guessing. The per-player counter (10 wrong in 15 minutes) already stops a
-- grind against one kid; it cannot see a bot working through many families at
-- once. A second budget counts wrong PINs per caller: 30 an hour, after which
-- every PIN check answers 'locked' until the hour turns over. A kid who knows
-- their PIN never spends from it, because only failures count.
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
  -- Read, never spend: a caller already over budget is told so without the check
  -- being counted again, so the hour still turns over from its first failure.
  if exists (select 1 from sm_rate
              where bucket = 'pin_ip' and key = left(v_ip, 80)
                and n >= 30 and since > now() - interval '1 hour') then
    return 'locked';
  end if;
  select * into r from sm_players where family_code = p_code and slot = p_slot for update;
  if not found then
    perform sm_rate_ok('pin_ip', v_ip, 30, interval '1 hour');
    return 'pin';
  end if;
  if r.fails >= 10 and r.fail_at > now() - interval '15 minutes' then return 'locked'; end if;
  if r.pin_hash = extensions.crypt(p_pin, r.pin_hash) then
    if r.fails <> 0 then update sm_players set fails = 0, fail_at = null where family_code = p_code and slot = p_slot; end if;
    return 'ok';
  end if;
  perform sm_rate_ok('pin_ip', v_ip, 30, interval '1 hour');
  update sm_players
     set fails = case when fail_at is null or fail_at < now() - interval '15 minutes' then 1 else least(fails + 1, 100) end,
         fail_at = now()
   where family_code = p_code and slot = p_slot;
  return 'pin';
end;
$function$;

-- ---------------------------------------------------------------------------
-- Making families. The old ceiling was global -- 30 in ten minutes across every
-- household on earth -- so one bot could stop every real family from signing up.
-- The budget is now per caller (12 an hour), with a global ceiling left high
-- enough that it only ever catches a genuine flood.
create or replace function sm_family_rate()
  returns void
  language plpgsql
  set search_path to 'public'
as $function$
begin
  if not sm_rate_ok('fam_ip', sm_client(), 12, interval '1 hour') then
    raise exception 'too many new families, try again in a few minutes' using errcode = '54000';
  end if;
  if (select count(*) from sm_families where created_at > now() - interval '10 minutes') >= 300 then
    raise exception 'too many new families, try again in a few minutes' using errcode = '54000';
  end if;
end;
$function$;

grant execute on function sm_family_roster(text) to anon;
