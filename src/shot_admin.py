"""Screenshot the organiser dashboard with fake data (phone width). Usage: python3 shot_admin.py"""
import asyncio, json, random, datetime
from playwright.async_api import async_playwright

today = datetime.datetime.now(datetime.timezone.utc).date()
def day(i): return (today - datetime.timedelta(days=i)).isoformat()
random.seed(3)
names = [("Omar", "Research"), ("Max", "Research"), ("Maryam", "Commercial"), ("Pdv", "Operations"), ("Affan", "Commercial"), ("Toby", "Trading"), ("Sara alw", "Finance"), ("Ban", "Research"), ("PK", "Trading"), ("ban", "Research")]
players = {}
ids = ["e10", "e43", "e44", "e13", "cs-ref02", "cs-ref01", "e40", "m28", "cs-dis14", "cs-dis13"]
for n, (name, dept) in enumerate(names):
    days = {}
    for i in range(0, 12):
        if random.random() < 0.7:
            a = [{"c": 0, "ok": random.random() < 0.65, "ms": random.randint(2000, 12000), "p": 900, "b": 0} for _ in range(10)]
            days[day(i)] = {"a": a, "ids": ids, "done": True, "sc": sum(x["p"] for x in a if x["ok"]), "n": sum(x["ok"] for x in a), "st": 0}
    players["p%d" % n] = {"name": name, "dept": dept, "joined": 1795000000000, "days": days}
players["p8"]["days"][day(0)] = {"a": [{"c": 0, "ok": True, "ms": 3000, "p": 900, "b": 0}] * 3, "ids": ids, "st": 1, "n": 3, "sc": 2700}
players["owner"] = {"name": "Ban", "dept": "Research", "joined": 1795000000000, "days": {k: v for k, v in players["p7"]["days"].items() if k != day(0)}}
notes = {"note-" + day(0): {"text": "Today: refining week starts. Nobody has scored 10/10 yet. Will you?", "at": 0}}
errs = {"e1": {"stage": "update players", "code": "unavailable", "msg": "Could not reach Cloud Firestore backend", "ua": "Mozilla/5.0 (iPhone)", "at": 0}}
flags = {"f1": {"qid": "e43", "day": day(1), "at": 0}, "f2": {"qid": "e43", "day": day(1), "at": 0}}

MOCK = r"""
(() => {
const DATA = __DATA__;
const now = Date.now(); Object.values(DATA.errs).forEach(e => e.at = now - 3600e3);
Object.values(DATA.players).forEach(p => Object.values(p.days).forEach(d => { if (d && d.st === 1) d.st = now - 40*60e3; }));
const store = new Map();
for (const c of ["players", "errs", "flags", "config"]) for (const [k, v] of Object.entries(DATA[c])) store.set(c + "/" + k, v);
const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const parentOf = p => p.split("/").slice(0, -1).join("/");
const snapDoc = p => { const d = store.get(p); return {id: p.split("/").pop(), exists: !!d, data: () => clone(d)}; };
const snapCol = c => ({docs: [...store.keys()].filter(k => parentOf(k) === c).map(snapDoc), empty: false});
const L = [];
const notify = () => setTimeout(() => L.forEach(f => f()), 5);
const user = {uid: "owner", isAnonymous: false, email: "organiser@example.com", emailVerified: true, getIdToken: async () => "t"};
const auth = {currentUser: user, onAuthStateChanged(cb){ setTimeout(() => cb(user), 1); return () => {}; }, signInAnonymously: async () => ({user})};
const deep = (t, s) => { for (const k in s) { if (s[k] && typeof s[k] === "object" && !Array.isArray(s[k]) && t[k] && typeof t[k] === "object") deep(t[k], s[k]); else t[k] = clone(s[k]); } };
const doc = p => ({parent: {id: parentOf(p)}, get: async () => snapDoc(p), set: async (d, o) => { if (o && o.merge && store.has(p)) deep(store.get(p), d); else store.set(p, clone(d)); notify(); }, delete: async () => { store.delete(p); notify(); },
  onSnapshot: (ok) => { const f = () => ok(snapDoc(p)); L.push(f); setTimeout(f, 3); return () => {}; }});
const col = c => ({get: async () => snapCol(c), limit: () => ({get: async () => snapCol(c)}), add: async d => doc(c + "/" + Math.random()).set(d),
  where: () => ({limit: () => ({get: async () => ({empty: true, docs: []})})}), onSnapshot: (ok) => { const f = () => ok(snapCol(c)); L.push(f); setTimeout(f, 3); return () => {}; }});
const fsx = {doc, collection: col};
window.firebase = {initializeApp(){}, auth: Object.assign(() => auth, {GoogleAuthProvider: function(){}}), firestore: () => fsx};
})();
"""

async def main():
    html = open("docs/index.html", encoding="utf-8").read()
    js = MOCK.replace("__DATA__", json.dumps({"players": players, "errs": errs, "flags": flags, "config": notes}))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        await pg.route("https://www.gstatic.com/**", lambda r: r.fulfill(body="", content_type="application/javascript"))
        await pg.route("**/bank/index.json", lambda r: r.fulfill(body='{"batches":[]}', content_type="application/json"))
        await pg.route("https://trial.test/", lambda r: r.fulfill(body=html, content_type="text/html"))
        await pg.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="@font-face{font-family:'Nosifer';src:url(https://trial.test/nosifer.woff2) format('woff2')}", content_type="text/css"))
        await pg.route("https://trial.test/nosifer.woff2", lambda r: r.fulfill(path="/tmp/fnt/node_modules/@fontsource/nosifer/files/nosifer-latin-400-normal.woff2", content_type="font/woff2"))
        await pg.add_init_script(js)
        await pg.goto("https://trial.test/")
        await pg.wait_for_timeout(5500)
        await pg.screenshot(path="/tmp/home.png")
        pg.on("console", lambda m: print("CONSOLE", m.type, m.text[:200]))
        pg.on("pageerror", lambda e: print("PAGEERR", str(e)[:300]))
        print("foot:", (await pg.inner_html("#orgfoot"))[:400])
        await pg.click("#admopen"); await pg.wait_for_timeout(800)
        print("dialog:", (await pg.evaluate("(document.getElementById('lnk')||{}).textContent||'none'"))[:300])
        await pg.screenshot(path="/tmp/adm-today.png", full_page=False)
        for t in ["players", "questions", "errors", "notice"]:
            await pg.click('[data-adm-tab="%s"]' % t); await pg.wait_for_timeout(600)
            await pg.screenshot(path="/tmp/adm-%s.png" % t)
        await pg.fill("#adm-notice", "Double points Friday!"); await pg.click('[data-adm-notice="save"]'); await pg.wait_for_timeout(500)
        await pg.click("#lnkclose"); await pg.wait_for_timeout(400)
        await pg.screenshot(path="/tmp/adm-banner.png")
        await b.close()
asyncio.run(main())
print("ok")
