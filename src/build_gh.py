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
  const wrapDoc = ref => ({
    set: data => ref.set(data),
    update: patch => ref.set(patch, {merge: true}),   // Claude db update = deep merge
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
      if (!u) u = (await auth.signInAnonymously()).user;
      paintOrg(u);
      return {db, uid: u.uid, owner: isOwner(u)};
    }
  };
  function paintOrg(u){
    const el = document.getElementById("orgfoot"); if (!el) return;
    if (isOwner(u)) el.innerHTML = 'Signed in as organiser · <a href="#" id="orgout">Sign out</a>';
    else el.innerHTML = '<a href="#" id="orgin">Organiser sign-in</a>';
  }
  document.addEventListener("click", async e => {
    const t = e.target;
    if (t && t.id === "orgin") {
      e.preventDefault();
      try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); location.reload(); }
      catch (x) { if (x && x.code !== "auth/popup-closed-by-user") console.warn("organiser sign-in failed", x && x.code); }
    }
    if (t && t.id === "orgout") { e.preventDefault(); await auth.signOut(); location.reload(); }
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
