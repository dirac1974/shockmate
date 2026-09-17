/* Lesson days. A day is a themed set that mixes packs, so nobody dead-ends inside one pack.
   Every fight belongs to exactly one day; the six days cover all 23. Bosses close days 1, 2 and 4. */
(function (root) {
  const DAYS = [
    { n: 1, title: "Free Lunch?", blurb: "Glitch leaves food lying around. One plate is poison.", ids: ["01", "09", "o7", "04"] },
    { n: 2, title: "Two Throats", blurb: "One piece, two targets. He only gets to save one.", ids: ["02", "03", "o2", "12"] },
    { n: 3, title: "Straight Lines", blurb: "Pin him, skewer him, and open the hidden laser.", ids: ["05", "06", "07", "11"] },
    { n: 4, title: "Locked Doors", blurb: "His own pieces shut him in. Knock politely.", ids: ["o1", "g2", "10", "08"] },
    { n: 5, title: "Count First", blurb: "He offers a trade. Count the guards before you take.", ids: ["o3", "o4", "o6", "g3"] },
    { n: 6, title: "Finish It", blurb: "A won game is not won until it is finished.", ids: ["g4", "g1", "g5"] },
  ];

  function dayByNumber(n) { return DAYS.filter((d) => d.n === n)[0] || DAYS[0]; }
  function fightsForDay(all, n) {
    const day = dayByNumber(n), by = {};
    (all || []).forEach((e) => { by[e.id] = e; });
    return day.ids.map((id) => by[id]).filter(Boolean);
  }
  function dayProgress(stats, n) {
    const earned = (stats && stats.cardsEarned) || {}, day = dayByNumber(n);
    const done = day.ids.filter((id) => earned[id]).length;
    return { day: day.n, title: day.title, done: done, total: day.ids.length, complete: done >= day.ids.length };
  }
  // The day he should be on: the first he has not finished, or the last once everything is done.
  function currentDay(stats) {
    for (let i = 0; i < DAYS.length; i++) { if (!dayProgress(stats, DAYS[i].n).complete) return DAYS[i].n; }
    return DAYS[DAYS.length - 1].n;
  }
  function nextDay(n) { return n >= DAYS.length ? null : n + 1; }
  function daysComplete(stats) { return DAYS.filter((d) => dayProgress(stats, d.n).complete).length; }
  // A day is open once the one before it is finished, so the order teaches but nothing is ever locked away for long.
  function dayUnlocked(stats, n) { return n <= 1 || dayProgress(stats, n - 1).complete; }

  const api = { DAYS, dayByNumber, fightsForDay, dayProgress, currentDay, nextDay, daysComplete, dayUnlocked };
  root.ShockmateDays = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
