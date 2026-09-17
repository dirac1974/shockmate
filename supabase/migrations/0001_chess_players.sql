-- Shockmate progress, on the same family login as the other kid apps.
--
-- Identity lives in hop_families / hop_players, exactly as garden_players, bloom_players,
-- star_players and field_players use it: one family_code per household, one lowercase
-- username plus a 4-digit pin per child. This table only adds chess progress; it never
-- writes to hop_* and stores no second copy of the pin.
--
-- Access differs from the older sibling tables on purpose. Those carry blanket
-- "SELECT true / UPDATE true" policies, so the anon key can read every family's rows, pins
-- included. Here the table is closed to anon and the three functions below are the only way
-- in: each requires the family code, the roster call never returns a pin, and pull/push
-- verify the pin against hop_players before touching anything.

create table if not exists public.chess_players (
  family_code  text not null check (char_length(family_code) between 6 and 32),
  username     text not null check (char_length(username) between 3 and 15),
  display_name text,
  avatar       text,
  progress     jsonb not null default '{}'::jsonb,
  fun          jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (family_code, username)
);

alter table public.chess_players enable row level security;
revoke all on public.chess_players from anon, authenticated;

-- Who is in this family? Names and avatars only, so a child can pick themselves from a list.
create or replace function public.chess_roster(p_code text)
returns table (username text, display_name text, avatar text)
language plpgsql security definer set search_path = public as $$
begin
  if p_code is null or char_length(p_code) < 6 then
    raise exception 'family code too short';
  end if;
  return query
    select h.username, coalesce(h.display_name, h.username), h.avatar
      from hop_players h
     where h.family_code = upper(p_code)
     order by h.username;
end;
$$;

create or replace function public.chess_pull(p_code text, p_username text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_data jsonb;
begin
  if p_code is null or char_length(p_code) < 6 then
    raise exception 'family code too short';
  end if;
  select true into v_ok
    from hop_players h
   where h.family_code = upper(p_code) and h.username = lower(p_username) and h.pin = p_pin;
  if not coalesce(v_ok, false) then
    raise exception 'wrong code, name or pin';
  end if;
  select c.progress into v_data
    from chess_players c
   where c.family_code = upper(p_code) and c.username = lower(p_username);
  return coalesce(v_data, '{}'::jsonb);
end;
$$;

create or replace function public.chess_push(p_code text, p_username text, p_pin text, p_progress jsonb)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_name text; v_avatar text; v_when timestamptz;
begin
  if p_code is null or char_length(p_code) < 6 then
    raise exception 'family code too short';
  end if;
  if p_progress is null or jsonb_typeof(p_progress) <> 'object' then
    raise exception 'progress must be an object';
  end if;
  if pg_column_size(p_progress) > 131072 then          -- far above a real profile
    raise exception 'progress too large';
  end if;

  select coalesce(h.display_name, h.username), h.avatar into v_name, v_avatar
    from hop_players h
   where h.family_code = upper(p_code) and h.username = lower(p_username) and h.pin = p_pin;
  if v_name is null then
    raise exception 'wrong code, name or pin';
  end if;

  insert into chess_players (family_code, username, display_name, avatar, progress, updated_at)
       values (upper(p_code), lower(p_username), v_name, v_avatar, p_progress, now())
  on conflict (family_code, username)
    do update set progress = excluded.progress, display_name = excluded.display_name,
                  avatar = excluded.avatar, updated_at = now()
  returning updated_at into v_when;

  return v_when;
end;
$$;

revoke all on function public.chess_roster(text) from public;
revoke all on function public.chess_pull(text, text, text) from public;
revoke all on function public.chess_push(text, text, text, jsonb) from public;
grant execute on function public.chess_roster(text) to anon, authenticated;
grant execute on function public.chess_pull(text, text, text) to anon, authenticated;
grant execute on function public.chess_push(text, text, text, jsonb) to anon, authenticated;
