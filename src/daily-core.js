// Crude Awakening core logic (no DOM): dates, schedule, scoring, leaderboards, streaks.
const LAUNCH = "2026-11-12";
const QTIME = 20000;
// Difficulty mixes (d: 1 easy, 2 medium, 3 hard, 0 specialist). Organisers pick one in settings.
const MIXES = {
  standard: [1,1,2,1,2,2,1,2,3,3],
  hard:     [2,2,3,2,3,2,3,3,3,3],
  expert:   [2,3,3,0,3,3,0,3,3,0]
};
let PATTERN = MIXES.standard;
let MIXNAME = "standard";
function setMix(name){ MIXNAME = MIXES[name] ? name : "standard"; PATTERN = MIXES[MIXNAME]; }
// Which mix applied on each day: [[fromKey, mixName], ...]; the schedule replays it so past days never shift.
let MIXHIST = [];
function setMixHistory(h, fallback){ MIXHIST = Array.isArray(h) && h.length ? h.slice().sort((a, b) => a[0] < b[0] ? -1 : 1) : [[LAUNCH, fallback || "standard"]]; SCHED.sig = ""; }
function mixOn(key){ let m = "standard"; MIXHIST.forEach(x => { if (x[0] <= key && MIXES[x[1]]) m = x[1]; }); return m; }
// Pinned sets (schedule/{day} overrides), shared with the scheduler so they are never reused.
let OVERRIDES = {};
function setOverrides(map){ OVERRIDES = map || {}; SCHED.sig = ""; }
const QCAT = {};
const SCHED = {sig: "", upto: "", days: {}};

function londonParts(d) {
  const f = new Intl.DateTimeFormat("en-GB", {timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"});
  const o = {}; f.formatToParts(d || new Date()).forEach(p => { o[p.type] = p.value; });
  return {y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second};
}
function todayKey(d) { const p = londonParts(d); return p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0"); }
function keyToUTC(k) { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); }
function addDays(k, n) { const t = new Date(keyToUTC(k) + n * 864e5); return t.toISOString().slice(0, 10); }
function dayNum(k) { return Math.round((keyToUTC(k) - keyToUTC(LAUNCH)) / 864e5) + 1; }
function secsToMidnight(d) { const p = londonParts(d); return 86400 - (p.h * 3600 + p.mi * 60 + p.s); }

// well-mixed hash so near-identical ids (cs-ben10, cs-ben11…) don't sit next to each other
function mixh(str){ let h = hash(str); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Base pool order is fixed; each extra batch is appended in (added, id) order so existing days never change.
function pools(DB, batches) {
  const p = {0: [], 1: [], 2: [], 3: []};
  const live = id => typeof qRetired !== "function" || !qRetired(id);
  DB.forEach(q => { QCAT[q[0]] = q[2]; if (p[q[1]] && live(q[0])) p[q[1]].push(q[0]); });
  for (const d in p) p[d].sort((a, b) => mixh("ca|" + a) - mixh("ca|" + b));
  const seen = new Set(DB.map(q => q[0]));
  (batches || []).slice().sort((a, b) => (a.added + a.id < b.added + b.id ? -1 : 1)).forEach(bt => {
    const add = {0: [], 1: [], 2: [], 3: []};
    (bt.items || []).forEach(it => { const d = it[1]; QCAT[it[0]] = it[2]; if (d >= 0 && d <= 3 && !seen.has(it[0]) && live(it[0])) { seen.add(it[0]); add[d].push(it[0]); } });
    for (const d in add) { add[d].sort((a, b) => mixh("ca|" + a) - mixh("ca|" + b)); p[d] = p[d].concat(add[d]); }
  });
  return p;
}
// No-repeat schedule: replay every day from launch, taking the next unused questions for that day's mix,
// skipping anything already served or pinned, and spreading categories within a set.
function buildSchedule(P, upto){
  const served = new Set(); Object.keys(OVERRIDES).forEach(k => { const o = OVERRIDES[k]; if (o && Array.isArray(o.ids)) o.ids.forEach(id => served.add(id)); });
  const days = {};
  for (let k = LAUNCH; k <= upto; k = addDays(k, 1)) {
    const o = OVERRIDES[k];
    if (o && Array.isArray(o.ids) && o.ids.length === 10) { days[k] = o.ids.slice(); continue; }
    const ids = [], cats = {};
    MIXES[mixOn(k)].forEach(lv => {
      const order = {0: [0, 3, 2, 1], 1: [1, 2, 3, 0], 2: [2, 3, 1, 0], 3: [3, 2, 1, 0]}[lv];
      let pick = null;
      for (const l of order) { // nearest level with unused questions before ever repeating
        const L = P[l] || []; let first = null, look = 0;
        for (let i = 0; i < L.length && look < 25; i++) {
          const id = L[i]; if (served.has(id) || ids.includes(id)) continue;
          look++; if (first === null) first = id;
          if (!cats[QCAT[id]]) { pick = id; break; }
        }
        pick = pick || first; if (pick) break;
      }
      if (!pick) { // everything used: fall back to the least recently scheduled
        const L = P[lv] && P[lv].length ? P[lv] : P[3];
        const recent = new Set(Object.keys(days).slice(-60).flatMap(d => days[d]));
        pick = L.find(id => !recent.has(id) && !ids.includes(id)) || L.find(id => !ids.includes(id));
      }
      ids.push(pick); served.add(pick); cats[QCAT[pick]] = (cats[QCAT[pick]] || 0) + 1;
    });
    days[k] = ids;
  }
  return days;
}
function defaultIds(DB, key, P) {
  P = P || pools(DB);
  if (key < LAUNCH) key = LAUNCH;
  const sig = [P[0].length, P[1].length, P[2].length, P[3].length, P[1][0], P[2][0], JSON.stringify(MIXHIST), Object.keys(OVERRIDES).sort().map(k => k + (OVERRIDES[k] && OVERRIDES[k].ids || []).join(",")).join(";")].join("|");
  if (SCHED.sig !== sig || SCHED.upto < key) {
    const upto = addDays(key > SCHED.upto || SCHED.sig !== sig ? key : SCHED.upto, 60);
    SCHED.days = buildSchedule(P, upto); SCHED.upto = upto; SCHED.sig = sig;
  }
  return SCHED.days[key].slice();
}
function orders(key) {
  const r = rng(hash("ord|" + key));
  const pos = shuffle([0,1,2,3,0,1,2,3, Math.floor(r() * 4), Math.floor(r() * 4)], r);
  return pos.map(p => { const w = shuffle([1,2,3], r); const o = []; for (let k = 0, x = 0; k < 4; k++) o.push(k === p ? 0 : w[x++]); return o; });
}
// override: {ids:[10]} from schedule/{key}
function daySet(DB, key, override, P) {
  const ids = override && Array.isArray(override.ids) && override.ids.length === 10 ? override.ids : defaultIds(DB, key, P);
  const ord = orders(key);
  return ids.map((id, i) => ({id, order: ord[i]}));
}

function points(ok, ms, streak) {
  if (!ok) return {p: 0, b: 0};
  const base = Math.round(500 + 500 * Math.max(0, 1 - ms / QTIME));
  const b = streak >= 2 ? Math.min(100 * (streak - 1), 400) : 0;
  return {p: base + b, b};
}
function tally(a) { let sc = 0, n = 0, ms = 0; (a || []).forEach(x => { sc += x.p || 0; if (x.ok) n++; ms += x.ms || 0; }); return {sc, n, ms}; }

// Streak with one free missed day ("freeze") per ISO week.
function isoWeek(k) { const t = new Date(keyToUTC(k)); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const fy = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return t.getUTCFullYear() + "-" + Math.round(((t - fy) / 864e5 - 3 + ((fy.getUTCDay() + 6) % 7)) / 7 + 1); }
function streak(days, today) {
  const played = k => days && days[k] && days[k].done;
  let k = played(today) ? today : addDays(today, -1);
  if (!played(k)) { // allow a freeze on yesterday if the day before was played
    const k2 = addDays(today, -2);
    if (!played(k2)) return 0;
  }
  let n = 0; const frozen = {}; let guard = 0;
  while (guard++ < 4000) {
    if (played(k)) { n++; k = addDays(k, -1); continue; }
    const wk = isoWeek(k);
    if (!frozen[wk] && played(addDays(k, -1)) && k !== today) { frozen[wk] = true; k = addDays(k, -1); continue; }
    break;
  }
  return n;
}

// players: [{id, name, dept, days}]
function boards(players, today) {
  const week = Array.from({length: 7}, (_, i) => addDays(today, -i));
  const rows = players.map(p => {
    const d = p.days || {};
    const t = d[today] && d[today].done ? tally(d[today].a) : null;
    let wk = 0, wkPlayed = 0; week.forEach(k => { if (d[k] && d[k].done) { wk += tally(d[k].a).sc; wkPlayed++; } });
    let tot = 0, played = 0, best = 0; Object.keys(d).forEach(k => { if (d[k] && d[k].done) { const s = tally(d[k].a).sc; tot += s; played++; best = Math.max(best, s); } });
    return {id: p.id, name: p.name || "Player", dept: p.dept || "Other", today: t, inProgress: !!(d[today] && !d[today].done), week: wk, weekPlayed: wkPlayed, avg: played ? Math.round(tot / played) : 0, played, best, streak: streak(d, today)};
  });
  const today_ = rows.filter(r => r.today).sort((a, b) => b.today.sc - a.today.sc || a.today.ms - b.today.ms);
  const week_ = rows.filter(r => r.weekPlayed).sort((a, b) => b.week - a.week);
  const all_ = rows.filter(r => r.played).sort((a, b) => ((b.played >= 3) - (a.played >= 3)) || b.avg - a.avg);
  const depts = {};
  rows.forEach(r => {
    const x = depts[r.dept] = depts[r.dept] || {dept: r.dept, players: 0, todaySum: 0, todayN: 0, weekSum: 0};
    x.players++; if (r.today) { x.todaySum += r.today.sc; x.todayN++; } x.weekSum += r.week;
  });
  const teams = Object.values(depts).map(x => ({dept: x.dept, players: x.players, todayAvg: x.todayN ? Math.round(x.todaySum / x.todayN) : 0, todayN: x.todayN, weekAvg: Math.round(x.weekSum / x.players)})).sort((a, b) => b.todayAvg - a.todayAvg || b.weekAvg - a.weekAvg);
  return {rows, today: today_, week: week_, all: all_, teams, inProgress: rows.filter(r => r.inProgress).length};
}

if (typeof module !== "undefined") module.exports = {LAUNCH, QTIME, PATTERN, londonParts, todayKey, addDays, dayNum, secsToMidnight, pools, defaultIds, orders, daySet, points, tally, streak, boards, hash};
