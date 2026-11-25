// Test the GitHub Pages build (docs/index.html) against a mock Firebase compat SDK
// that follows Firestore semantics: set() replaces, set(x,{merge:true}) deep-merges maps.
const {JSDOM} = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/docs/index.html", "utf8").replace(/<script src=[^>]+><\/script>/g, "");

const store = new Map(), docL = new Map(), colL = new Map();
const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const parentOf = p => p.split("/").slice(0, -1).join("/");
const writes = [];
function deep(t, s){ for (const k in s) { if (s[k] && typeof s[k] === "object" && !Array.isArray(s[k]) && t[k] && typeof t[k] === "object" && !Array.isArray(t[k])) deep(t[k], s[k]); else t[k] = clone(s[k]); } }
function snapDoc(p){ const d = store.get(p); return {id: p.split("/").pop(), exists: !!d, data: () => d ? clone(d) : undefined}; }
function snapCol(c){ return {docs: [...store.keys()].filter(k => parentOf(k) === c).sort().map(snapDoc)}; }
function notify(p){ setTimeout(() => { (docL.get(p) || []).forEach(f => f(snapDoc(p))); (colL.get(parentOf(p)) || []).forEach(f => f(snapCol(parentOf(p)))); }, 5); }
function makeFirebase(user){
  const auth = {
    currentUser: user,
    onAuthStateChanged(cb){ setTimeout(() => cb(auth.currentUser), 1); return () => {}; },
    async signInAnonymously(){ auth.currentUser = {uid: "anon-" + Math.random().toString(36).slice(2, 8), isAnonymous: true, getIdToken: async () => "t"}; return {user: auth.currentUser}; },
    async signOut(){ auth.currentUser = null; }
  };
  const docRef = p => ({
    parent: {id: parentOf(p)},
    set: async (d, o) => { if (FAILNEXT.n > 0 && p.startsWith("players/")) { FAILNEXT.n--; throw {code: FAILNEXT.code}; } writes.push([auth.currentUser && auth.currentUser.uid, p]); if (o && o.merge && store.has(p)) deep(store.get(p), d); else store.set(p, clone(d)); notify(p); },
    delete: async () => { store.delete(p); notify(p); },
    get: async () => snapDoc(p),
    update: async d => { if (!store.has(p)) throw {code: "not-found"}; Object.assign(store.get(p), clone(d)); notify(p); },
    onSnapshot: (ok) => { (docL.get(p) || docL.set(p, []).get(p)).push(ok); setTimeout(() => ok(snapDoc(p)), 3); return () => {}; }
  });
  const fsx = {
    doc: p => docRef(p),
    collection: c => ({
      add: async d => { const p = c + "/" + Math.random().toString(36).slice(2); await docRef(p).set(d); },
      get: async () => snapCol(c),
      where: (f, op, v) => ({limit: () => ({get: async () => { const docs = snapCol(c).docs.filter(d => { const x = d.data(); return op === "array-contains" && Array.isArray(x[f]) && x[f].includes(v); }); return {empty: !docs.length, docs}; }})}),
      onSnapshot: (ok) => { (colL.get(c) || colL.set(c, []).get(c)).push(ok); setTimeout(() => ok(snapCol(c)), 3); return () => {}; }
    })
  };
  const fb = {initializeApp(){}, auth: () => auth, firestore: () => fsx};
  fb.auth.GoogleAuthProvider = function(){};
  return {fb, auth};
}
let REPO = null; const FAILNEXT = {n: 0, code: ""}; // {"index.json": {...}, "b1.json": {...}}
function win(user){
  const {fb, auth} = makeFirebase(user);
  const dom = new JSDOM(html.replace("<script>\n(function(){\n  if (!window.firebase) return;", "<script>window.firebase = window.__fb;\n(function(){\n  if (!window.firebase) return;"),
    {runScripts: "dangerously", url: "https://badernooruddin.github.io/crude-awakening/", pretendToBeVisual: true,
     beforeParse(w){ w.__fb = fb; w.HTMLElement.prototype.scrollIntoView = () => {};
       w.fetch = async u => { const f = String(u).replace(/^bank\//, ""); const b = REPO && REPO[f]; return {ok: !!b, json: async () => JSON.parse(JSON.stringify(b))}; }; }});
  dom.window.__auth = auth; return dom.window;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = (w, s) => w.document.querySelector(s), $$ = (w, s) => [...w.document.querySelectorAll(s)];
const click = (w, s) => { const el = typeof s === "string" ? $(w, s) : s; if (!el) throw new Error("no element " + s); el.dispatchEvent(new w.MouseEvent("click", {bubbles: true})); };
const type = (w, id, v) => { const el = w.document.getElementById(id); el.value = v; el.dispatchEvent(new w.Event("input", {bubbles: true})); };
const txt = w => w.document.getElementById("app").textContent;
async function join(w, n, d){ type(w, "in-name", n); click(w, `[data-a="dept"][data-v="${d}"]`); click(w, '[data-a="save-profile"]'); await sleep(40); }
async function playAll(w, pick){ click(w, '[data-a="play"]'); await sleep(60); for (let i = 0; i < 10; i++) { const o = $$(w, '[data-a="ans"]'); if (o.length !== 4) return false; click(w, o[pick(i)]); await sleep(1400); } return true; }
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

(async () => {
  const A = win(null), B = win(null);
  const O = win({uid: "g-owner", isAnonymous: false, email: "bader.nooruddin.bot@gmail.com", emailVerified: true});
  const X = win({uid: "g-other", isAnonymous: false, email: "someone@gmail.com", emailVerified: true});
  await sleep(120);
  ok(!txt(A).includes("leaderboard. Check"), "anonymous player connects");
  ok($(A, "#orgfoot").textContent.includes("Organiser sign-in"), "player sees organiser sign-in link");
  ok($(O, "#orgfoot").textContent.includes("Signed in as organiser"), "owner email recognised");
  ok(!$(X, "#orgfoot").textContent.includes("Signed in as organiser"), "other Google account is not organiser");
  // Typing in the join form is not disturbed when someone else joins
  type(A, "in-name", "Al"); const inp = A.document.getElementById("in-name");
  await join(B, "Sara", "Research"); await sleep(60);
  ok(A.document.getElementById("in-name") === inp, "join form not re-drawn while typing when another player joins");
  // A transient permission error on the first save is retried (token refresh) and succeeds
  FAILNEXT.n = 1; FAILNEXT.code = "permission-denied";
  await join(A, "Ali", "Trading"); await sleep(1500);
  ok(store.get("players/" + A.__auth.currentUser.uid) && store.get("players/" + A.__auth.currentUser.uid).name === "Ali", "first save retried after a transient permission error");
  ok(!txt(A).includes("Display name"), "A moved past the join form");
  await join(O, "Bader", "Research");
  ok(!!$(O, '[data-a="admin"]'), "organiser sees the gear");
  ok(!$(A, '[data-a="admin"]'), "player has no gear");
  const LA = (fs.readFileSync(__dirname + "/docs/index.html", "utf8").match(/const LAUNCH = "([\d-]+)"/) || [])[1];
  const lon = new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/London"}).format(new Date());
  const expect = Math.round((Date.parse(lon) - Date.parse(LA)) / 864e5) + 1;
  ok(txt(A).includes("#" + expect + " ·"), "day number counts from the trial launch (#" + expect + ")");
  ok(await playAll(A, i => i % 4), "player A plays 10 questions");
  ok(await playAll(B, () => 0), "player B plays 10 questions");
  await sleep(200);
  const uidA = A.__auth.currentUser.uid, docA = store.get("players/" + uidA);
  const day = docA && Object.values(docA.days || {})[0];
  ok(day && day.done && day.a.length === 10 && Array.isArray(day.ids) && day.ids.length === 10, "A's day saved with 10 answers and ids (deep merge kept earlier fields)");
  ok(docA && docA.name === "Ali" && docA.dept === "Trading" && docA.joined, "A's profile kept after answer updates");
  ok(writes.every(([u, p]) => !p.startsWith("players/") || p === "players/" + u), "players only ever wrote their own doc");
  writes.length = 0;
  const B2 = win(B.__auth.currentUser); await sleep(150);
  const board = txt(B2);
  ok(board.includes("Ali") && board.includes("Sara"), "B's leaderboard shows both players");
  // Repo question batches: organiser's bank count grows when docs/bank has a batch
  const bankLine = async w => { click(w, '[data-a="admin"]'); await sleep(80); const m = txt(w).match(/Question bank: (\d+) easy · (\d+) medium · (\d+) hard/); return m ? m.slice(1).map(Number) : null; };
  const OWN = () => win({uid: "g-owner", isAnonymous: false, email: "bader.nooruddin.bot@gmail.com", emailVerified: true});
  const W0 = OWN(); await sleep(200); const before = await bankLine(W0);
  const B2src = fs.readFileSync(__dirname + "/batch2.js", "utf8"); const BT2 = JSON.parse(B2src.slice(B2src.indexOf("{"), B2src.lastIndexOf("}") + 1));
  const items = BT2.items.filter(x => x[4] === 1).slice(0, 5).map((x, i) => [ "t26112400" + i ].concat(x.slice(1)));
  REPO = {"index.json": {batches: ["b20261124.json"]}, "b20261124.json": {id: "b20261124", added: "2026-11-24", items}};
  const W = OWN(); await sleep(200);
  const after = await bankLine(W);
  ok(before && after && after[0] === before[0] + 5 && after[1] === before[1], "repo batch adds 5 easy questions (" + before + " -> " + after + ")");
  // Link devices: Bader plays on browser P1, then again as a separate player on P2; linking merges them
  const P1 = win(null), P2 = win(null); await sleep(150);
  await join(P1, "Ban", "Research"); await join(P2, "Ban", "Research"); await sleep(60);
  const u1 = P1.__auth.currentUser.uid, u2 = P2.__auth.currentUser.uid;
  store.get("players/" + u1).days = {"2026-11-22": {done: true, sc: 5000, n: 5, a: []}};
  store.get("players/" + u2).days = {"2026-11-22": {done: true, sc: 1, n: 1, a: []}, "2026-11-21": {done: true, sc: 7000, n: 7, a: []}};
  click(P1, "#lnkopen"); await sleep(80); click(P1, "#lnkget"); await sleep(80);
  const code = P1.document.getElementById("lnkcode").textContent.replace(/\s/g, "");
  ok(/^[A-Z2-9]{8}$/.test(code), "device 1 shows an 8-character code (" + code + ")");
  click(P2, "#lnkopen"); await sleep(80); P2.document.getElementById("lnkin").value = code.toLowerCase(); click(P2, "#lnkuse"); await sleep(400);
  const T = store.get("players/" + u1);
  ok(T.uids && T.uids.includes(u2), "device 2 added to the player's linked browsers");
  ok(T.days["2026-11-22"].sc === 5000 && T.days["2026-11-21"] && T.days["2026-11-21"].sc === 7000, "device 2's extra day moved across, existing day kept");
  ok(!store.has("players/" + u2), "duplicate entry removed");
  ok(store.get("devices/" + u2) && store.get("devices/" + u2).pid === u1, "device 2 now plays as the same player");
  const P2b = win(P2.__auth.currentUser); await sleep(200);
  ok(!P2b.document.getElementById("in-name") && txt(P2b).includes("Ban"), "after reload device 2 is signed in as Ban, no join form");
  ok(Object.values(store).length === 0 || [...store.keys()].filter(k => k.startsWith("players/") && store.get(k).name === "Ban").length === 1, "only one Ban on the leaderboard");
  ok(await playAll(P2b, () => 0), "linked device plays today's set");
  await sleep(200);
  ok(store.get("players/" + u1).days[lon] && store.get("players/" + u1).days[lon].done, "linked device's game saved to the shared record");
  // Organiser merge: three "Bo" entries from browsers that forgot the player
  const Q1 = win(null), Q2 = win(null), Q3 = win(null); await sleep(150);
  for (const w of [Q1, Q2, Q3]) await join(w, "Bo", "Research");
  await sleep(60);
  const q = [Q1, Q2, Q3].map(w => w.__auth.currentUser.uid);
  store.get("players/" + q[0]).days = {"2026-11-20": {done: true, sc: 8430, n: 8, a: []}};
  store.get("players/" + q[1]).days = {"2026-11-21": {done: true, sc: 7705, n: 7, a: []}, "2026-11-20": {done: true, sc: 100, n: 1, a: []}};
  store.get("players/" + q[2]).days = {"2026-11-22": {done: true, sc: 11681, n: 9, a: []}};
  const OW = OWN(); await sleep(200);
  ok(!!OW.document.getElementById("mrgopen"), "organiser sees the merge tool");
  ok(!A.document.getElementById("mrgopen"), "players don't see the merge tool");
  click(OW, "#mrgopen"); await sleep(150);
  const boxes = [...OW.document.querySelectorAll(".mrgck")].filter(c => c.parentElement.textContent.includes("Bo ·"));
  ok(boxes.length === 3, "merge list shows all three Bo entries");
  boxes.forEach(c => { c.checked = true; c.dispatchEvent(new OW.Event("change", {bubbles: true})); });
  const sel = OW.document.getElementById("mrgkeep"); sel.value = q[0];
  click(OW, "#mrggo"); await sleep(400);
  const KB = store.get("players/" + q[0]);
  ok(KB && KB.days["2026-11-20"].sc === 8430 && KB.days["2026-11-21"].sc === 7705 && KB.days["2026-11-22"].sc === 11681, "all three days combined, higher score kept on a clash");
  ok(!store.has("players/" + q[1]) && !store.has("players/" + q[2]), "the other two entries removed");
  ok(KB.uids.includes(q[1]) && KB.uids.includes(q[2]), "their browsers are recorded on the kept player");
  const Q3b = win(Q3.__auth.currentUser); await sleep(250);
  ok(!Q3b.document.getElementById("in-name") && txt(Q3b).includes("Bo"), "a merged browser comes back as the kept player");
  // a wrong code is refused
  const P3 = win(null); await sleep(150); click(P3, "#lnkopen"); await sleep(60); P3.document.getElementById("lnkin").value = "ZZZZZZZZ"; click(P3, "#lnkuse"); await sleep(200);
  ok(P3.document.getElementById("lnkmsg").textContent.includes("isn't valid"), "unknown code is refused with a clear message");
  console.log(fail ? fail + " FAILED" : "ALL PASSED");
  process.exit(fail ? 1 : 0);
})();
