"""Build the GitHub Pages trial of Crude Awakening -> docs/index.html

Same game as crude-awakening.html, but the Claude database + sign-in are swapped for Firebase
(Firestore + Anonymous auth for players, Google sign-in for the organiser).
Run python3 rebuild.py first (it writes dbq.js), then python3 build_gh.py.
"""
import os, re, sys

LAUNCH = os.environ.get("TRIAL_LAUNCH", "2026-11-23")   # trial Day 1 (London date)
OWNERS = ["bader.nooruddin.bot@gmail.com"]               # organiser Google account(s)
FB = {
    "apiKey": "AIzaSyBnHXmY96GrebuaN17Hwrd4gxPRjKCjDls",
    "authDomain": "crude-awakening-trial.firebaseapp.com",
    "projectId": "crude-awakening-trial",
    "storageBucket": "crude-awakening-trial.firebasestorage.app",
    "messagingSenderId": "182339202148",
    "appId": "1:182339202148:web:22dd8f5730760103650371",
}
SDK = "13.4.0"

r = lambda f: open(f, encoding="utf-8").read()
def must_replace(s, old, new, what):
    if old not in s: sys.exit("build_gh: couldn't find " + what)
    return s.replace(old, new, 1)

core = r("daily-core.js")
core, n = re.subn(r'const LAUNCH = "\d{4}-\d{2}-\d{2}";', 'const LAUNCH = "%s";' % LAUNCH, core, count=1)
if n != 1: sys.exit("build_gh: LAUNCH line not found")

d = r("daily.html")
for k, f in [("BANK", "bank.js"), ("DAILYBANK", "dbq.js"), ("BATCH1", "batch1.js"), ("BATCH2", "batch2.js")]:
    d = must_replace(d, "/*%s*/" % k, r(f), k)
d = must_replace(d, "/*CORE*/", core, "CORE")

# 1) Firebase sign-in + database instead of claude.use("db") / claude.use("user")
OLD_INIT = '''    if (window.claude && claude.use) {
      const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
      S.db = db; S.user = user;
      if (user) { try { S.uid = await user.id(); } catch(e){} try { S.owner = !!user.isOwner(); } catch(e){} }
    }'''
NEW_INIT = '''    if (window.FBDB) {
      const g = await window.FBDB.start();
      S.db = g.db; S.uid = g.uid; S.owner = g.owner;
    }'''
d = must_replace(d, OLD_INIT, NEW_INIT, "init block")

# 2) Messages that mention claude.ai / Claude permissions
d = must_replace(d, '<b>Sign in to play</b>', '<b>Can&#39;t reach the leaderboard</b>', "fail title")
d = must_replace(d,
    'Crude Awakening needs you signed in to claude.ai, with access to this page, so your scores can go on the leaderboard. If you were sent a link, ask the organiser to invite you by email.',
    "Couldn&#39;t connect to the leaderboard. Check your connection and reload the page. If you&#39;re on a work network or using private browsing, try another browser.",
    "fail text")
d = must_replace(d,
    'e && e.code === "invalid_argument" ? "You don\'t have permission to play here yet. Ask the organiser to invite you."',
    'e && (e.code === "permission-denied" || e.code === "invalid_argument") ? "That couldn\'t be saved (not allowed). Reload and try again."',
    "save error text")

# 2b) Robustness for the trial (seen 23 Nov: some players had to reload while joining)
#  - a slow first connection no longer leaves the page stuck on the error card
#  - other players joining no longer re-draws the join form under someone who is typing
d = must_replace(d, 'if (S.db && S.uid) subscribe(); else S.failed = true;',
    'if (S.db && S.uid) { S.failed = false; subscribe(); } else S.failed = true;', "init subscribe")
d = must_replace(d, 'setTimeout(() => { if (!S.ready) { S.ready = true; S.failed = true; render(); } }, 10000);',
    'setTimeout(() => { if (!S.ready) { S.ready = true; S.failed = true; render(); } }, 25000);', "init timeout")
d = must_replace(d, 'S.players = m; S.loaded = true; render();',
    'const first = !S.loaded; S.players = m; S.loaded = true; const joining = !me() || !me().name || S.view === "profile"; if (first || !joining) render();', "players render")

# 3) Firebase adapter: the game expects a Claude-style db (update = deep merge, set = replace)
cfg = ",".join('%s:"%s"' % kv for kv in FB.items())
owners = ",".join('"%s"' % e for e in OWNERS)
ADAPTER = r'''<script src="https://www.gstatic.com/firebasejs/%(sdk)s/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/%(sdk)s/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/%(sdk)s/firebase-firestore-compat.js"></script>
<script>
(function(){
  if (!window.firebase) return;
  const OWNERS = [%(owners)s];
  firebase.initializeApp({%(cfg)s});
  const auth = firebase.auth(), fs = firebase.firestore();
  // Log failures (no personal data) so problems players hit can be diagnosed.
  const logErr = (stage, e) => { try { fs.collection("errs").add({stage: String(stage).slice(0, 40), code: String(e && e.code || "").slice(0, 60), msg: String(e && e.message || e).slice(0, 200), ua: navigator.userAgent.slice(0, 200), at: Date.now()}).catch(() => {}); } catch (x) {} };
  window.addEventListener("error", e => logErr("window", e.error || e.message));
  window.addEventListener("unhandledrejection", e => logErr("promise", e.reason));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Writes retry: refresh the sign-in token on auth errors, back off on network errors.
  const retry = async (stage, fn) => {
    for (let i = 0; ; i++) {
      try { return await fn(); }
      catch (e) {
        const c = e && e.code || "";
        if (i >= 3 || !/permission-denied|unauthenticated|unavailable|deadline-exceeded|aborted|internal|resource-exhausted/.test(c)) { logErr(stage, e); throw e; }
        if (/permission-denied|unauthenticated/.test(c)) { if (i >= 1) { logErr(stage, e); throw e; } if (auth.currentUser) await auth.currentUser.getIdToken(true).catch(() => {}); }
        await sleep(600 * (i + 1));
      }
    }
  };
  const wrapDoc = ref => ({
    set: data => retry("set " + ref.parent.id, () => ref.set(data)),
    update: patch => retry("update " + ref.parent.id, () => ref.set(patch, {merge: true})),   // Claude db update = deep merge
    delete: () => ref.delete(),
    onSnapshot: (ok, err) => ref.onSnapshot(s => ok({id: s.id, exists: s.exists, data: () => s.data()}), err)
  });
  const wrapCol = ref => ({
    add: data => ref.add(data),
    onSnapshot: (ok, err) => ref.onSnapshot(s => ok({docs: s.docs.map(x => ({id: x.id, data: () => x.data()}))}), err)
  });
  // Extra question batches: published as static files in the repo (docs/bank/*.json) by the daily top-up,
  // merged with any bank/* docs in Firestore. The game appends batches in (added, id) order, so past sets never change.
  const repoBank = () => fetch("bank/index.json", {cache: "no-cache"}).then(r => r.ok ? r.json() : {batches: []})
    .then(ix => Promise.all((ix.batches || []).map(f => fetch("bank/" + f).then(r => r.ok ? r.json() : null).catch(() => null))))
    .then(list => list.filter(b => b && b.id && b.added && Array.isArray(b.items))).catch(() => []);
  const bankCol = ref => ({
    add: data => ref.add(data),
    onSnapshot: (ok, err) => {
      let fileDocs = [], fsDocs = [];
      const emit = () => ok({docs: fileDocs.concat(fsDocs)});
      repoBank().then(list => { fileDocs = list.map(b => ({id: b.id, data: () => ({added: b.added, items: b.items})})); if (list.length) emit(); });
      return ref.onSnapshot(s => { fsDocs = s.docs.map(x => ({id: x.id, data: () => x.data()})); emit(); }, err);
    }
  });
  const db = {doc: p => wrapDoc(fs.doc(p)), collection: p => p === "bank" ? bankCol(fs.collection(p)) : wrapCol(fs.collection(p))};
  const isOwner = u => !!(u && !u.isAnonymous && u.email && u.emailVerified && OWNERS.includes(u.email.toLowerCase()));
  window.FBDB = {
    start: async () => {
      let u = await new Promise(res => { const off = auth.onAuthStateChanged(x => { off(); res(x); }); });
      for (let i = 0; !u; i++) {
        try { u = (await auth.signInAnonymously()).user; }
        catch (e) { if (i >= 3) { logErr("signin", e); throw e; } await sleep(1000 * (i + 1)); }
      }
      AUTHUID = u.uid; PID = u.uid;
      try {
        const dv = await fs.doc("devices/" + u.uid).get();
        if (dv.exists && dv.data().pid) PID = dv.data().pid;
        else {
          const own = await fs.doc("players/" + u.uid).get();
          if (!own.exists) { const q = await fs.collection("players").where("uids", "array-contains", u.uid).limit(1).get(); if (!q.empty) PID = q.docs[0].id; }
        }
      } catch (e) { logErr("device", e); }
      paintOrg(u);
      return {db, uid: PID, owner: isOwner(u)};
    }
  };
  let AUTHUID = null, PID = null;
  function paintOrg(u){
    const el = document.getElementById("orgfoot"); if (!el) return;
    const link = '<a href="#" id="lnkopen">Play on another phone or computer</a><br><br>';
    if (isOwner(u)) el.innerHTML = link + '<a href="#" id="mrgopen">Merge duplicate players</a><br><br>Signed in as organiser · <a href="#" id="orgout">Sign out</a>';
    else el.innerHTML = link + '<a href="#" id="orgin">Organiser sign-in</a>';
  }
  // ---- Organiser: merge duplicate players into one record ----
  let MRG = [];
  const dayCount = x => Object.keys(x.days || {}).filter(k => x.days[k]).length;
  const lastDay = x => Object.keys(x.days || {}).filter(k => x.days[k]).sort().pop() || "-";
  async function openMerge(){
    dialog('<b>Merge duplicate players</b><p class="note">Loading players…</p>');
    try {
      const s = await fs.collection("players").get();
      MRG = s.docs.map(d => Object.assign({id: d.id}, d.data())).filter(x => x.name)
        .sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : (a.joined || 0) - (b.joined || 0));
      let h = '<b>Merge duplicate players</b><p class="note" style="margin:8px 0 10px">Tick every entry that is the same person (2 or more), then merge. All their days are combined into the one you keep (if two entries played the same day, the higher score is kept), the others are removed, and their browsers become that player.</p>';
      h += '<div style="max-height:45vh;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:4px 8px">' + MRG.map((x, i) =>
        '<label style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" class="mrgck" data-i="' + i + '" style="width:20px;height:20px"><span><b>' + esc(x.name) + '</b> · ' + esc(x.dept || "") + '<br><span class="note">' + dayCount(x) + ' day(s) · last ' + lastDay(x) + ' · joined ' + (x.joined ? new Date(x.joined).toISOString().slice(0, 10) : "?") + '</span></span></label>').join("") + '</div>';
      h += '<p class="note" style="margin:12px 0 6px">Keep which name and team?</p><select class="in" id="mrgkeep"><option value="">Tick entries first</option></select>';
      h += '<button class="btn" id="mrggo" style="margin-top:10px">Merge</button><p class="note" id="mrgmsg" style="margin-top:8px"></p>';
      dialog(h);
    } catch (e) { logErr("merge list", e); dialog('<b>Merge duplicate players</b><p class="note">Couldn\'t load players. Check your connection.</p>'); }
  }
  function mrgPicked(){ return Array.from(document.querySelectorAll(".mrgck")).filter(c => c.checked).map(c => MRG[+c.dataset.i]); }
  function mrgRefresh(){
    const sel = document.getElementById("mrgkeep"); if (!sel) return;
    const p = mrgPicked();
    sel.innerHTML = p.length ? p.map(x => '<option value="' + esc(x.id) + '">' + esc(x.name) + ' · ' + esc(x.dept || "") + ' (' + dayCount(x) + ' day(s), last ' + lastDay(x) + ')</option>').join("") : '<option value="">Tick entries first</option>';
  }
  async function doMerge(){
    const msg = document.getElementById("mrgmsg"), btn = document.getElementById("mrggo");
    const p = mrgPicked(), keepId = document.getElementById("mrgkeep").value;
    if (p.length < 2 || !keepId) { msg.textContent = "Tick at least two entries."; return; }
    const keep = p.find(x => x.id === keepId), others = p.filter(x => x.id !== keepId);
    btn.disabled = true; msg.textContent = "Merging…";
    try {
      const K = (await fs.doc("players/" + keepId).get()).data() || {};
      const days = Object.assign({}, K.days || {}), uids = new Set(K.uids || []);
      for (const o of others) {
        const O = (await fs.doc("players/" + o.id).get()).data() || {};
        Object.keys(O.days || {}).forEach(k => {
          const a = days[k], b = O.days[k]; if (!b) return;
          if (!a || ((b.done ? 1 : 0) > (a.done ? 1 : 0)) || ((b.done ? 1 : 0) === (a.done ? 1 : 0) && (b.sc || 0) > (a.sc || 0))) days[k] = b;
        });
        uids.add(o.id); (O.uids || []).forEach(x => uids.add(x));
      }
      uids.delete(keepId);
      await retry("merge keep", () => fs.doc("players/" + keepId).update({days, uids: Array.from(uids).slice(0, 10)}));
      for (const o of others) await retry("merge remove", () => fs.doc("players/" + o.id).delete());
      msg.textContent = "Merged " + p.length + " entries into " + keep.name + ". Reloading…";
      setTimeout(() => location.reload(), 900);
    } catch (e) { btn.disabled = false; logErr("merge", e); msg.textContent = "Merge failed (" + (e && e.code || "error") + "). Nothing was removed unless the first step finished; try again."; }
  }
  document.addEventListener("change", e => { if (e.target && e.target.classList && e.target.classList.contains("mrgck")) mrgRefresh(); });

  // ---- Link devices: one player record across browsers (anonymous sign-in is per browser) ----
  const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const newCode = () => { const a = new Uint32Array(8); crypto.getRandomValues(a); return Array.from(a, x => ABC[x %% ABC.length]).join(""); };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  function dialog(html){
    let o = document.getElementById("lnk"); if (o) o.remove();
    o = document.createElement("div"); o.id = "lnk";
    o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px";
    o.innerHTML = '<div class="card" style="max-width:420px;width:100%%;margin:0">' + html + '<button class="btn sec" id="lnkclose" style="margin-top:12px">Close</button></div>';
    document.body.appendChild(o); return o;
  }
  async function openLink(){
    const mine = await fs.doc("players/" + PID).get().catch(() => null);
    const has = mine && mine.exists && mine.data().name;
    let h = '<b>Play on another phone or computer</b><p class="note" style="margin:8px 0 12px">Each browser starts as a new player. Link them so your scores, streak and name stay in one place.</p>';
    if (has) h += '<p class="note" style="margin:0 0 8px"><b>On this device</b> (' + esc(mine.data().name) + '): get a code, then enter it on the other device within 15 minutes.</p><button class="btn" id="lnkget">Get a code</button><div id="lnkcode" style="font-size:28px;font-weight:800;letter-spacing:4px;text-align:center;margin:12px 0 4px"></div>';
    h += '<p class="note" style="margin:14px 0 8px"><b>Got a code from your other device?</b> Enter it here' + (has ? '. Today\'s and past scores from this device are moved across (where that device has no score for the day), and this device\'s separate entry is removed.' : '.') + '</p><input class="in" id="lnkin" maxlength="9" autocapitalize="characters" autocomplete="off" placeholder="8-letter code" style="text-transform:uppercase;letter-spacing:3px"><button class="btn sec" id="lnkuse" style="margin-top:10px">Link this device</button><p class="note" id="lnkmsg" style="margin-top:8px"></p>';
    dialog(h);
  }
  async function getCode(){
    const box = document.getElementById("lnkcode"); box.textContent = "…";
    try {
      const code = newCode();
      await retry("link create", () => fs.doc("links/" + code).set({pid: PID, exp: Date.now() + 15 * 60 * 1000}));
      box.textContent = code.slice(0, 4) + " " + code.slice(4);
    } catch (e) { box.textContent = ""; document.getElementById("lnkcode").insertAdjacentHTML("afterend", '<p class="note">Couldn\'t make a code. Check your connection and try again.</p>'); }
  }
  async function useCode(){
    const msg = document.getElementById("lnkmsg"), btn = document.getElementById("lnkuse");
    const code = (document.getElementById("lnkin").value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 8) { msg.textContent = "The code has 8 letters and numbers."; return; }
    btn.disabled = true; msg.textContent = "Linking…";
    try {
      const L = await fs.doc("links/" + code).get();
      if (!L.exists || !L.data().pid || L.data().exp < Date.now()) throw {code: "bad-code"};
      const target = L.data().pid;
      if (target === PID) { msg.textContent = "This device is already that player."; btn.disabled = false; return; }
      const T = await fs.doc("players/" + target).get();
      if (!T.exists) throw {code: "bad-code"};
      const t = T.data(), uids = Array.isArray(t.uids) ? t.uids : [];
      if (!uids.includes(AUTHUID)) await retry("link join", () => fs.doc("players/" + target).update({uids: uids.concat([AUTHUID]), lastLink: code}));
      // move this device's own scores across (days the other record doesn't have), then remove the duplicate
      const M = await fs.doc("players/" + PID).get();
      if (M.exists && PID === AUTHUID) {
        const md = M.data().days || {}, td = t.days || {}, add = {};
        Object.keys(md).forEach(k => { if (md[k] && !td[k]) add[k] = md[k]; });
        if (Object.keys(add).length) await retry("link merge", () => fs.doc("players/" + target).set({days: add}, {merge: true}));
        await retry("link remove", () => fs.doc("players/" + PID).delete());
      }
      await retry("link device", () => fs.doc("devices/" + AUTHUID).set({pid: target}));
      msg.textContent = "Linked! Reloading…"; setTimeout(() => location.reload(), 700);
    } catch (e) {
      btn.disabled = false;
      msg.textContent = e && e.code === "bad-code" ? "That code isn't valid or has expired. Get a new one on your other device." : "Couldn't link. Check your connection and try again.";
      if (!(e && e.code === "bad-code")) logErr("link", e);
    }
  }
  document.addEventListener("click", async e => {
    const t = e.target;
    if (t && t.id === "orgin") {
      e.preventDefault();
      try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); location.reload(); }
      catch (x) { if (x && x.code !== "auth/popup-closed-by-user") console.warn("organiser sign-in failed", x && x.code); }
    }
    if (t && t.id === "orgout") { e.preventDefault(); await auth.signOut(); location.reload(); }
    if (t && t.id === "lnkopen") { e.preventDefault(); openLink(); }
    if (t && t.id === "lnkclose") { const o = document.getElementById("lnk"); if (o) o.remove(); }
    if (t && t.id === "lnkget") { getCode(); }
    if (t && t.id === "lnkuse") { useCode(); }
    if (t && t.id === "mrgopen") { e.preventDefault(); openMerge(); }
    if (t && t.id === "mrggo") { doMerge(); }
  });
})();
</script>
''' % {"sdk": SDK, "owners": owners, "cfg": cfg}
FOOT = '<div class="wrap" id="app"></div>\n<div id="orgfoot" style="text-align:center;font-size:12px;opacity:.55;margin:18px 0 28px"></div>\n'
d = must_replace(d, '<div class="wrap" id="app"></div>\n', FOOT + ADAPTER, "app div")
d = must_replace(d, '<style>', '<style>\n#orgfoot a{color:inherit}', "style tag")

assert "claude.use" not in d, "Claude API still referenced"
os.makedirs("docs", exist_ok=True)
open("docs/index.html", "w", encoding="utf-8").write(d)
open("docs/.nojekyll", "w").write("")
os.makedirs("docs/bank", exist_ok=True)
if not os.path.exists("docs/bank/index.json"): open("docs/bank/index.json", "w").write('{"batches": []}\n')
print("docs/index.html", len(d) // 1024, "KB · LAUNCH", LAUNCH)
