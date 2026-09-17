// Fill these in to switch on cross-device sync, then redeploy. Empty values are fine:
// the app hides the sync controls and the backup file keeps working.
// The anon key is designed to be public — the table is closed to it and the two RPC
// functions require the family code (see supabase/migrations/0001_shockmate_sync.sql).
window.SHOCKMATE_SYNC = {
  url: "",      // e.g. "https://abcdefgh.supabase.co"
  anonKey: ""   // the project's anon/publishable key
};
