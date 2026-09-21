  window.addEventListener("error", function (ev) { recordFault(ev.message || (ev.error && ev.error.message)); });
  window.addEventListener("unhandledrejection", function (ev) { const r = ev.reason; recordFault(r && (r.message || r)); });
  window.addEventListener("shockmate:updated", noteUpdate);
  load(); bind(); hud(); selfTest();
  // First launch, or a ?family=CODE share link: the one-tap setup card. "Skip" is remembered.
  // With ?me=SLOT as well — which is what this phone wrote into its own URL the last time it joined,
  // and what a Home Screen icon kept — the code and the roster are already answered: one PIN screen.
  (function firstRun() {
    warnIfForgetful();
    const link = Y.codeFromSearch(location.search), slot = Y.slotFromSearch(location.search);
    if (link && fam().code === link && familyJoined()) return stampIdentity();
    if (link) return openFamily("first", link, slot);
    if (!Y.validCode(fam().code) && !fam().skipped) return openFamily("first");
    stampIdentity();
  })();
  restartLivePoller();
  // Back from the background: ask the server straight away rather than waiting out a poll.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if (LIVE.session) LIVE.session.poke();
    if (LIVE.poller) LIVE.poller.poke();
  });
  window.addEventListener("online", function () { if (LIVE.poller) LIVE.poller.poke(); if (LIVE.session) LIVE.session.poke(); });
  window.__shockmate = { state, startEncounter, nextEncounter, current, startSession, startDuel, startCamp, campOn, coachStyle, setDay, setSeats, syncNow, exportBackup, importBackup, openParent, gateKey, renderProgress, renderSettings, renderCollection, save, all: ALL, BUILD,
    startFlash, flashOn, flashAnswer, flashItems,
    openPregame, startGame, resumeGame, loadEngine, playing, kidMove, runReview, fightFromGame, playPool, gameFightsOf,
    openVersusPre, versusGo, startVersus, versusMove, versusOn, endVersus, versusFightNow, renderVersusCards,
    openFamily, openLive, liveInvite, liveAccept, liveResign, restartLivePoller, live: LIVE, fam: fam,
    engine: E, chess: function () { return CHESS; } };
})();
