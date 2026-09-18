// Shockmate's own Supabase project. The publishable key is public on purpose: every table is RLS-on
// with no policies and no grants, so the key can do nothing except call the sm_* functions, and each
// of those checks the family code and the kid's PIN (hashed server-side) before touching a row.
// See supabase/migrations/0002_shockmate_family.sql and 0003_live_games.sql.
window.SHOCKMATE_SYNC = {
  url: "https://dmcslbqmlogmtsibiyzq.supabase.co",
  key: "sb_publishable_YXu7CBN6Tg_GGvA11GjVZQ_6PAhGk1E",
};
// The Yomple household (yomple.com and its apps). Shockmate reads a household's kids by code from it
// and registers a code it mints; its anon key is public by design: every table there is closed and
// each yomple_* function checks its input (see the yomple repo, yomple-shared-implementation.md).
window.SHOCKMATE_YOMPLE = {
  url: "https://digcgqltrlmhgmzgmvwc.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZ2NncWx0cmxtaGdtemdtdndjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1ODY4NjEsImV4cCI6MjA4OTE2Mjg2MX0.suxy0jXsIJqrJYbQuCc54sHbN5miCICxLUdOc9gUTkY",
};
// Developer override, never shown in the UI: localStorage "shockmate-dev-sync" = {"url": ..., "key": ...}.
try {
  const dev = JSON.parse(localStorage.getItem("shockmate-dev-sync") || "null");
  if (dev && dev.url && dev.key) window.SHOCKMATE_SYNC = { url: String(dev.url), key: String(dev.key) };
} catch (e) {}
