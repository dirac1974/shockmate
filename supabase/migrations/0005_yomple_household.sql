-- One household, one code. Shockmate's family key becomes the Yomple household code (WORD-XXXX,
-- e.g. MAPLE-K7Q2) that every other Yomple app already shares, instead of an 8-character code of its
-- own. sm_families was empty when this ran, so nothing is migrated.
--
-- Trust model, unchanged in shape: the household code is the secret (as in every Yomple app), and
-- each kid's own Shockmate PIN (bcrypt, never returned) protects his slot. The client checks the code
-- against Yomple (yomple_family_players) before it adopts it here; this project cannot reach Yomple's.
-- Same access pattern as 0002-0004: RLS on, no policies, no grants, SECURITY DEFINER RPCs for anon only.

alter table public.sm_families drop constraint if exists sm_families_code_check;
alter table public.sm_families add constraint sm_families_code_check
  check (code ~ '^(OAK|MAPLE|PINE|CEDAR|ELM|BIRCH|WILLOW|ASPEN|LAUREL|HOLLY)-[2-9A-HJKMNP-Z]{4}$');

-- Forgiving on the way in ("maple k7q2", "MAPLEK7Q2", "maple-k7q2"), strict on the way out.
create or replace function public.sm_norm_code(p_code text)
returns text language plpgsql immutable set search_path = public as $$
declare v text; m text[];
begin
  v := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  m := regexp_match(v, '^(OAK|MAPLE|PINE|CEDAR|ELM|BIRCH|WILLOW|ASPEN|LAUREL|HOLLY)([2-9A-HJKMNP-Z]{4})$');
  if m is null then
    raise exception 'bad family code' using errcode = '22023';
  end if;
  return m[1] || '-' || m[2];
end;
$$;

-- The rate cap every family-making path shares.
create or replace function public.sm_family_rate()
returns void language plpgsql stable set search_path = public as $$
begin
  if (select count(*) from sm_families where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too many new families, try again in a few minutes' using errcode = '54000';
  end if;
end;
$$;

-- A new family under a code the client minted (and registers with Yomple). 1 or 2 kids, each
-- {name, pin}. Returns {code}, or {"error":"taken"} when the code is already a Shockmate family.
drop function if exists public.sm_family_create(text, jsonb);
create or replace function public.sm_family_create(p_code text, p_name text, p_kids jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_i int; v_kid jsonb; v_fam text;
begin
  if p_kids is null or jsonb_typeof(p_kids) <> 'array' or jsonb_array_length(p_kids) not between 1 and 2 then
    raise exception 'one or two kids' using errcode = '22023';
  end if;
  for v_i in 0 .. jsonb_array_length(p_kids) - 1 loop
    v_kid := p_kids -> v_i;
    if jsonb_typeof(v_kid) <> 'object' then raise exception 'bad kid' using errcode = '22023'; end if;
    perform sm_clean_name(v_kid ->> 'name');
    if coalesce(v_kid ->> 'pin', '') !~ '^[0-9]{4}$' then
      raise exception 'pin must be 4 digits' using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(p_kids) = 2
     and lower(sm_clean_name(p_kids -> 0 ->> 'name')) = lower(sm_clean_name(p_kids -> 1 ->> 'name')) then
    raise exception 'two kids need two names' using errcode = '22023';
  end if;
  perform sm_family_rate();
  v_fam := left(coalesce(nullif(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]<>]', '', 'g')), ''), 'Family'), 32);

  insert into sm_families (code, name) values (v_code, v_fam) on conflict (code) do nothing;
  if not found then return jsonb_build_object('error', 'taken'); end if;
  for v_i in 0 .. jsonb_array_length(p_kids) - 1 loop
    v_kid := p_kids -> v_i;
    insert into sm_players (family_code, slot, name, pin_hash)
         values (v_code, v_i, sm_clean_name(v_kid ->> 'name'),
                 extensions.crypt(v_kid ->> 'pin', extensions.gen_salt('bf', 8)));
  end loop;
  return jsonb_build_object('code', v_code);
end;
$$;

-- A kid from an existing household claims a Shockmate slot with a new PIN. Creates the family row
-- when this is the household's first Shockmate player. Returns {code, slot, name}, or
-- {"error":"taken"} when that slot already has a player, {"error":"name"} when his sibling already
-- has that name here. Two slots per family, as before.
create or replace function public.sm_family_adopt(p_code text, p_slot int, p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_name text := sm_clean_name(p_name);
begin
  perform sm_check_slot(p_slot);
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin must be 4 digits' using errcode = '22023';
  end if;
  if not exists (select 1 from sm_families where code = v_code) then
    perform sm_family_rate();
    insert into sm_families (code, name) values (v_code, 'Family') on conflict (code) do nothing;
  end if;
  perform 1 from sm_families where code = v_code for update;
  if exists (select 1 from sm_players where family_code = v_code and slot = p_slot) then
    return jsonb_build_object('error', 'taken');
  end if;
  if exists (select 1 from sm_players where family_code = v_code and lower(name) = lower(v_name)) then
    return jsonb_build_object('error', 'name');
  end if;
  insert into sm_players (family_code, slot, name, pin_hash)
       values (v_code, p_slot, v_name, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)));
  return jsonb_build_object('code', v_code, 'slot', p_slot, 'name', v_name);
end;
$$;

revoke all on function public.sm_norm_code(text) from public, anon, authenticated;
revoke all on function public.sm_family_rate() from public, anon, authenticated;
revoke all on function public.sm_family_create(text, text, jsonb) from public, authenticated;
revoke all on function public.sm_family_adopt(text, int, text, text) from public, authenticated;
grant execute on function public.sm_family_create(text, text, jsonb) to anon;
grant execute on function public.sm_family_adopt(text, int, text, text) to anon;
