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
    async signInAnonymously(){ auth.currentUser = {uid: "anon-" + Math.random().toString(36).slice(2, 8), isAnonymous: true}; return {user: auth.currentUser}; },
    async signOut(){ auth.currentUser = null; }
  };
  const docRef = p => ({
    set: async (d, o) => { writes.push([auth.currentUser && auth.currentUser.uid, p]); if (o && o.merge && store.has(p)) deep(store.get(p), d); else store.set(p, clone(d)); notify(p); },
    delete: async () => { store.delete(p); notify(p); },
    onSnapshot: (ok) => { (docL.get(p) || docL.set(p, []).get(p)).push(ok); setTimeout(() => ok(snapDoc(p)), 3); return () => {}; }
  });
  const fsx = {
    doc: p => docRef(p),
    collection: c => ({
      add: async d => { const p = c + "/" + Math.random().toString(36).slice(2); await docRef(p).set(d); },
      onSnapshot: (ok) => { (colL.get(c) || colL.set(c, []).get(c)).push(ok); setTimeout(() => ok(snapCol(c)), 3); return () => {}; }
    })
  };
  const fb = {initializeApp(){}, auth: () => auth, firestore: () => fsx};
  fb.auth.GoogleAuthProvider = function(){};
  return {fb, auth};
}
let REPO = null; // {"index.json": {...}, "b1.json": {...}}
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
  await join(A, "Ali", "Trading"); await join(B, "Sara", "Research"); await join(O, "Bader", "Research");
  ok(!!$(O, '[data-a="admin"]'), "organiser sees the gear");
  ok(!$(A, '[data-a="admin"]'), "player has no gear");
  ok(txt(A).includes("#1 ·"), "trial opens at #1 (" + (txt(A).match(/#\d+ ·/) || [""])[0] + ")");
  ok(await playAll(A, i => i % 4), "player A plays 10 questions");
  ok(await playAll(B, () => 0), "player B plays 10 questions");
  await sleep(200);
  const uidA = A.__auth.currentUser.uid, docA = store.get("players/" + uidA);
  const day = docA && Object.values(docA.days || {})[0];
  ok(day && day.done && day.a.length === 10 && Array.isArray(day.ids) && day.ids.length === 10, "A's day saved with 10 answers and ids (deep merge kept earlier fields)");
  ok(docA && docA.name === "Ali" && docA.dept === "Trading" && docA.joined, "A's profile kept after answer updates");
  ok(writes.every(([u, p]) => !p.startsWith("players/") || p === "players/" + u), "players only ever wrote their own doc");
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
  console.log(fail ? fail + " FAILED" : "ALL PASSED");
  process.exit(fail ? 1 : 0);
})();
