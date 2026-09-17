-- Shockmate progress sync.
--
-- Security model: the anon key ships in a public page, so the table itself is closed to anon
-- (RLS on, no policies) and all access goes through two security-definer functions that require
-- the family code. The code is the only secret — 12 characters from a 32-symbol alphabet, about
-- 60 bits, generated on the device. Nothing here identifies a child: the payload holds counters,
-- card ids and whatever display name the parent typed, which is why the app warns against real
-- full names.

create table if not exists public.shockmate_progress (
  family_code text     not null check (char_length(family_code) between 8 and 32),
  slot        smallint not null check (slot in (0, 1)),
  data        jsonb    not null,
  updated_at  timestamptz not null default now(),
  primary key (family_code, slot)
);

alter table public.shockmate_progress enable row level security;
revoke all on public.shockmate_progress from anon, authenticated;

create or replace function public.shockmate_pull(p_code text, p_slot smallint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_data jsonb;
begin
  if p_code is null or char_length(p_code) < 8 then
    raise exception 'family code too short';
  end if;
  select data into v_data
    from shockmate_progress
   where family_code = p_code and slot = p_slot;
  return coalesce(v_data, '{}'::jsonb);
end;
$$;

create or replace function public.shockmate_push(p_code text, p_slot smallint, p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_when timestamptz;
begin
  if p_code is null or char_length(p_code) < 8 then
    raise exception 'family code too short';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'payload must be an object';
  end if;
  if pg_column_size(p_data) > 131072 then          -- 128 kB is far above a real profile
    raise exception 'payload too large';
  end if;

  insert into shockmate_progress (family_code, slot, data, updated_at)
       values (p_code, p_slot, p_data, now())
  on conflict (family_code, slot)
    do update set data = excluded.data, updated_at = now()
  returning updated_at into v_when;

  return v_when;
end;
$$;

revoke all on function public.shockmate_pull(text, smallint) from public;
revoke all on function public.shockmate_push(text, smallint, jsonb) from public;
grant execute on function public.shockmate_pull(text, smallint) to anon, authenticated;
grant execute on function public.shockmate_push(text, smallint, jsonb) to anon, authenticated;
