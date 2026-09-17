// Optional. Leave blank and enter the API details once per device in parent settings —
// that keeps the anon key out of this public repo. The sibling kid-app tables carry open
// SELECT/UPDATE policies, so a published key would expose every family's rows there.
// Shockmate's own table is closed: access goes through chess_roster / chess_pull / chess_push,
// which require the family code and check the PIN (supabase/migrations/0001_chess_players.sql).
window.SHOCKMATE_SYNC = { url: "", anonKey: "" };
