-- Two-phone versus: the two kids of one family play each other, one phone each.
--
-- The server only ORDERS moves. It checks that the caller is a player in the game (code + slot +
-- PIN, through sm_auth), that it is that slot's turn by ply parity and colour, and that the ply is
-- exactly the next one (optimistic concurrency: a phone that is behind gets {"error":"ply"} and
-- resyncs). Legality is checked by chess.js on both phones; a phone that receives a move it cannot
-- play ignores it and resyncs. A game with no move for 60 minutes is over ('expired'), whenever it
-- is next looked at. Same access pattern as 0002: RLS on, no policies, no grants, definer RPCs only.

create table if not exists public.sm_live_games (
  id           uuid primary key default gen_random_uuid(),
  family_code  text not null references public.sm_families(code) on delete cascade,
  white_slot   smallint not null check (white_slot between 0 and 1),
  black_slot   smallint not null check (black_slot between 0 and 1),
  inviter_slot smallint not null check (inviter_slot between 0 and 1),
  fen          text check (fen is null or char_length(fen) <= 100),
  moves        jsonb not null default '[]'::jsonb,
  status       text not null default 'invited' check (status in ('invited', 'active', 'over')),
  result       text check (result is null or result in
                 ('resign', 'abandon', 'declined', 'replaced', 'expired', 'mate', 'stalemate', 'repetition', 'fifty', 'material')),
  ended_by     smallint check (ended_by is null or ended_by between 0 and 1),
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  check (white_slot <> black_slot)
);
create index if not exists sm_live_games_family on public.sm_live_games (family_code, status, updated_at desc);

alter table public.sm_live_games enable row level security;
revoke all on public.sm_live_games from anon, authenticated;

-- The shape both phones read. Expiry is applied on read, so a stale row never looks alive.
create or replace function public.sm_live_json(g public.sm_live_games)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', g.id, 'white_slot', g.white_slot, 'black_slot', g.black_slot, 'inviter_slot', g.inviter_slot,
    'fen', g.fen, 'moves', g.moves, 'ply', jsonb_array_length(g.moves),
    'status', case when g.status <> 'over' and g.updated_at < now() - interval '60 minutes' then 'over' else g.status end,
    'result', case when g.status <> 'over' and g.updated_at < now() - interval '60 minutes' then 'expired' else g.result end,
    'ended_by', g.ended_by, 'updated_at', g.updated_at, 'created_at', g.created_at);
$$;

-- Loads a game for a caller who has already passed sm_auth, closing it first if it has expired.
create or replace function public.sm_live_load(p_id uuid, p_code text, p_slot int)
returns public.sm_live_games language plpgsql security definer set search_path = public as $$
declare g public.sm_live_games;
begin
  select * into g from sm_live_games where id = p_id and family_code = p_code for update;
  if not found or (g.white_slot <> p_slot and g.black_slot <> p_slot) then
    raise exception 'no such game' using errcode = 'P0002';
  end if;
  if g.status <> 'over' and g.updated_at < now() - interval '60 minutes' then
    update sm_live_games set status = 'over', result = 'expired' where id = g.id returning * into g;
  end if;
  return g;
end;
$$;

create or replace function public.sm_live_invite(p_code text, p_slot int, p_pin text, p_opponent_slot int, p_white_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_auth text; v_id uuid;
begin
  perform sm_check_slot(p_slot); perform sm_check_slot(p_opponent_slot); perform sm_check_slot(p_white_slot);
  if p_opponent_slot = p_slot then raise exception 'you cannot play yourself' using errcode = '22023'; end if;
  if p_white_slot not in (p_slot, p_opponent_slot) then raise exception 'bad colours' using errcode = '22023'; end if;
  v_auth := sm_auth(v_code, p_slot, p_pin);
  if v_auth <> 'ok' then return jsonb_build_object('error', v_auth); end if;
  if not exists (select 1 from sm_players where family_code = v_code and slot = p_opponent_slot) then
    raise exception 'no such opponent' using errcode = '22023';
  end if;
  -- One open game per family: a fresh invite replaces anything still open. Old rows are swept here.
  update sm_live_games set status = 'over', result = 'replaced', ended_by = p_slot, updated_at = now()
   where family_code = v_code and status <> 'over';
  delete from sm_live_games where family_code = v_code and updated_at < now() - interval '2 days';
  insert into sm_live_games (family_code, white_slot, black_slot, inviter_slot)
       values (v_code, p_white_slot, case when p_white_slot = p_slot then p_opponent_slot else p_slot end, p_slot)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- Open games involving this slot: invites and active games moved within the last hour.
create or replace function public.sm_live_list(p_code text, p_slot int, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_auth text;
begin
  perform sm_check_slot(p_slot);
  v_auth := sm_auth(v_code, p_slot, p_pin);
  if v_auth <> 'ok' then return jsonb_build_object('error', v_auth); end if;
  return coalesce((select jsonb_agg(sm_live_json(g) order by g.updated_at desc)
                     from sm_live_games g
                    where g.family_code = v_code and g.status <> 'over'
                      and (g.white_slot = p_slot or g.black_slot = p_slot)
                      and g.updated_at > now() - interval '60 minutes'), '[]'::jsonb);
end;
$$;

create or replace function public.sm_live_accept(p_id uuid, p_code text, p_slot int, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_auth text; g public.sm_live_games;
begin
  perform sm_check_slot(p_slot);
  v_auth := sm_auth(v_code, p_slot, p_pin);
  if v_auth <> 'ok' then return jsonb_build_object('error', v_auth); end if;
  g := sm_live_load(p_id, v_code, p_slot);
  if g.inviter_slot = p_slot then return jsonb_build_object('error', 'same'); end if;
  if g.status = 'invited' then
    update sm_live_games set status = 'active', updated_at = now() where id = g.id returning * into g;
  end if;
  return sm_live_json(g);
end;
$$;

create or replace function public.sm_live_move(p_id uuid, p_code text, p_slot int, p_pin text, p_ply int, p_uci text, p_fen text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_auth text; g public.sm_live_games; v_n int;
begin
  perform sm_check_slot(p_slot);
  if p_uci is null or p_uci !~ '^[a-h][1-8][a-h][1-8][qrbn]?$' then raise exception 'bad move' using errcode = '22023'; end if;
  if p_ply is null or p_ply < 0 or p_ply >= 600 then raise exception 'bad ply' using errcode = '22023'; end if;
  if p_fen is not null and (char_length(p_fen) > 100 or p_fen !~ '^[1-8pnbrqkPNBRQK/]+ [wb] ') then
    raise exception 'bad fen' using errcode = '22023';
  end if;
  v_auth := sm_auth(v_code, p_slot, p_pin);
  if v_auth <> 'ok' then return jsonb_build_object('error', v_auth); end if;
  g := sm_live_load(p_id, v_code, p_slot);
  if g.status <> 'active' then return jsonb_build_object('error', 'over', 'game', sm_live_json(g)); end if;
  v_n := jsonb_array_length(g.moves);
  if p_ply <> v_n then return jsonb_build_object('error', 'ply', 'game', sm_live_json(g)); end if;
  if (case when v_n % 2 = 0 then g.white_slot else g.black_slot end) <> p_slot then
    return jsonb_build_object('error', 'turn', 'game', sm_live_json(g));
  end if;
  update sm_live_games set moves = moves || to_jsonb(p_uci), fen = coalesce(p_fen, fen), updated_at = now()
   where id = g.id returning * into g;
  return sm_live_json(g);
end;
$$;

create or replace function public.sm_live_get(p_id uuid, p_code text, p_slot int, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_auth text;
begin
  perform sm_check_slot(p_slot);
  v_auth := sm_auth(v_code, p_slot, p_pin);
  if v_auth <> 'ok' then return jsonb_build_object('error', v_auth); end if;
  return sm_live_json(sm_live_load(p_id, v_code, p_slot));
end;
$$;

-- Resign, abandon, decline, or the result both boards agree on (mate and the draws). Idempotent:
-- ending a game that is already over returns it unchanged.
create or replace function public.sm_live_end(p_id uuid, p_code text, p_slot int, p_pin text, p_result text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := sm_norm_code(p_code); v_auth text; g public.sm_live_games;
begin
  perform sm_check_slot(p_slot);
  if p_result is null or p_result not in ('resign', 'abandon', 'declined', 'mate', 'stalemate', 'repetition', 'fifty', 'material') then
    raise exception 'bad result' using errcode = '22023';
  end if;
  v_auth := sm_auth(v_code, p_slot, p_pin);
  if v_auth <> 'ok' then return jsonb_build_object('error', v_auth); end if;
  g := sm_live_load(p_id, v_code, p_slot);
  if g.status <> 'over' then
    update sm_live_games set status = 'over', result = p_result, ended_by = p_slot, updated_at = now()
     where id = g.id returning * into g;
  end if;
  return sm_live_json(g);
end;
$$;

revoke all on function public.sm_live_json(public.sm_live_games) from public, anon, authenticated;
revoke all on function public.sm_live_load(uuid, text, int) from public, anon, authenticated;
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
