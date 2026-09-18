-- Shockmate family sync, on Shockmate's own Supabase project (dmcslbqmlogmtsibiyzq).
--
-- The publishable key is baked into the public page, so this schema is built to be safe with the
-- key in anyone's hands:
--   * every table has RLS on and NO policies, and anon/authenticated hold no privileges on it;
--   * the only way in is the security definer functions below (search_path pinned to public);
--   * each one validates its inputs (code shape, slot, PIN shape, name length, payload size);
--   * PINs are stored as bcrypt hashes (pgcrypto crypt/gen_salt('bf')) and never returned;
--   * ten wrong PINs in fifteen minutes lock that player for fifteen minutes. A wrong PIN is
--     reported as {"error":"pin"} rather than raised, so the failure counter actually commits;
--   * family creation is capped at two kids per call and at a global rate per ten minutes.
-- The family code is 8 characters from a 31-letter alphabet without 0/O/1/I/L (31^8, about 8.5e11),
-- so it is not guessable, and it is the thing a family shares. PINs gate each kid's own row.

create table if not exists public.sm_families (
  code       text primary key check (code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  name       text not null check (char_length(name) between 1 and 32),
  created_at timestamptz not null default now()
);

create table if not exists public.sm_players (
  family_code text not null references public.sm_families(code) on delete cascade,
  slot        smallint not null check (slot between 0 and 1),
  name        text not null check (char_length(name) between 1 and 16),
  pin_hash    text not null,
  progress    jsonb not null default '{}'::jsonb,
  fails       smallint not null default 0,
  fail_at     timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (family_code, slot)
);

alter table public.sm_families enable row level security;
alter table public.sm_players  enable row level security;
revoke all on public.sm_families from anon, authenticated;
revoke all on public.sm_players  from anon, authenticated;

-- ---------- helpers (not callable by anon) ----------

create or replace function public.sm_norm_code(p_code text)
returns text language plpgsql immutable set search_path = public as $$
declare v text;
begin
  v := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v !~ '^[A-HJKMNP-Z2-9]{8}$' then
    raise exception 'bad family code' using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function public.sm_check_slot(p_slot int)
returns void language plpgsql immutable set search_path = public as $$
begin
  if p_slot is null or p_slot not in (0, 1) then
    raise exception 'bad slot' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.sm_clean_name(p_name text)
returns text language plpgsql immutable set search_path = public as $$
declare v text;
begin
  v := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]<>]', '', 'g'));
  if char_length(v) < 1 or char_length(v) > 16 then
    raise exception 'name must be 1 to 16 characters' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- 'ok', 'pin' (wrong or no such player) or 'locked'. Counts failures; resets them on success.
create or replace function public.sm_auth(p_code text, p_slot int, p_pin text)
returns text language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin must be 4 digits' using errcode = '22023';
  end if;
  select * into r from sm_players where family_code = p_code and slot = p_slot for update;
  if not found then return 'pin'; end if;
  if r.fails >= 10 and r.fail_at > now() - interval '15 minutes' then return 'locked'; end if;
  if r.pin_hash = extensions.crypt(p_pin, r.pin_hash) then
    if r.fails <> 0 then update sm_players set fails = 0, fail_at = null where family_code = p_code and slot = p_slot; end if;
    return 'ok';
  end if;
  update sm_players
     set fails = case when fail_at is null or fail_at < now() - interval '15 minutes' then 1 else least(fails + 1, 100) end,
         fail_at = now()
   where family_code = p_code and slot = p_slot;
  return 'pin';
end;
$$;

-- ---------- the RPCs ----------

-- A new family: 1 or 2 kids, each [{name, pin}]. Returns {code}.
create or replace function public.sm_family_create(p_name text, p_kids jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_bytes bytea; v_try int := 0; v_i int; v_kid jsonb; v_pin text; v_fam text;
begin
  if p_kids is null or jsonb_typeof(p_kids) <> 'array' or jsonb_array_length(p_kids) not between 1 and 2 then
    raise exception 'one or two kids' using errcode = '22023';
  end if;
  if (select count(*) from sm_families where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too many new families, try again in a few minutes' using errcode = '54000';
  end if;
  for v_i in 0 .. jsonb_array_length(p_kids) - 1 loop
    v_kid := p_kids -> v_i;
    if jsonb_typeof(v_kid) <> 'object' then raise exception 'bad kid' using errcode = '22023'; end if;
    perform sm_clean_name(v_kid ->> 'name');
    if coalesce(v_kid ->> 'pin', '') !~ '^[0-9]{4}$' then
      raise exception 'pin must be 4 digits' using errcode = '22023';
    end if;
  end loop;
  v_fam := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]<>]', '', 'g'));
  if v_fam = '' then v_fam := 'Family'; end if;
  v_fam := left(v_fam, 32);

  loop
    v_try := v_try + 1;
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for v_i in 0 .. 7 loop
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, v_i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from sm_families where code = v_code);
    if v_try > 20 then raise exception 'could not make a code' using errcode = '54000'; end if;
  end loop;

  insert into sm_families (code, name) values (v_code, v_fam);
  for v_i in 0 .. jsonb_array_length(p_kids) - 1 loop
    v_kid := p_kids -> v_i;
    v_pin := v_kid ->> 'pin';
    insert into sm_players (family_code, slot, name, pin_hash)
         values (v_code, v_i, sm_clean_name(v_kid ->> 'name'), extensions.crypt(v_pin, extensions.gen_salt('bf', 8)));
  end loop;
  return jsonb_build_object('code', v_code);
end;
$$;

-- Who is in this family: [{slot, name}] — never a PIN, never progress.
create or replace function public.sm_family_roster(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('slot', slot, 'name', name) order by slot)
                     from sm_players where family_code = v_code), '[]'::jsonb);
end;
$$;

create or replace function public.sm_pull(p_code text, p_slot int, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_auth text;
begin
  perform sm_check_slot(p_slot);
  v_auth := sm_auth(v_code, p_slot, p_pin);
  if v_auth <> 'ok' then return jsonb_build_object('error', v_auth); end if;
  return (select progress from sm_players where family_code = v_code and slot = p_slot);
end;
$$;

create or replace function public.sm_push(p_code text, p_slot int, p_pin text, p_progress jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  update sm_players set progress = p_progress, updated_at = now()
   where family_code = v_code and slot = p_slot
  returning updated_at into v_when;
  return jsonb_build_object('updated_at', v_when);
end;
$$;

create or replace function public.sm_rename(p_code text, p_slot int, p_pin text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_auth text; v_name text;
begin
  perform sm_check_slot(p_slot);
  v_name := sm_clean_name(p_name);
  v_auth := sm_auth(v_code, p_slot, p_pin);
  if v_auth <> 'ok' then return jsonb_build_object('error', v_auth); end if;
  update sm_players set name = v_name where family_code = v_code and slot = p_slot;
  return jsonb_build_object('name', v_name);
end;
$$;

-- Nothing is executable by default; the five RPCs are granted to anon only (the app has no signed-in
-- users, so `authenticated` gets nothing). Helpers stay private.
revoke all on function public.sm_norm_code(text) from public, anon, authenticated;
revoke all on function public.sm_check_slot(int) from public, anon, authenticated;
revoke all on function public.sm_clean_name(text) from public, anon, authenticated;
revoke all on function public.sm_auth(text, int, text) from public, anon, authenticated;
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
