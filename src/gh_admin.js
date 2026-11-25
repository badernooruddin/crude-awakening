  // ---- Organiser dashboard (organisers only): monitoring + player/question/notice tools ----
  // Uses the game's own helpers (todayKey, addDays, streak, tally, buildDailyBank...) which are page globals.
  const ADM = {tab: "today", players: [], errs: [], flags: [], qtext: null, sort: "last", arm: null};
  const nkey = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const TODAY = () => (typeof todayKey === "function" ? todayKey() : new Date().toISOString().slice(0, 10));
  const back = (k, n) => (typeof addDays === "function" ? addDays(k, -n) : k);
  const played = (p, k) => !!(p.days && p.days[k] && p.days[k].done);
  const daysOf = p => Object.keys(p.days || {}).filter(k => p.days[k]).sort();
  const scoreOf = (p, k) => (p.days && p.days[k] && p.days[k].done ? (p.days[k].sc || 0) : 0);
  const fmt = n => Math.round(n).toLocaleString("en-GB");
  const pct = (a, b) => (b ? Math.round(100 * a / b) + "%" : "–");
  const ago = t => { if (!t) return "–"; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? m + "m ago" : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"; };
  const strk = p => { try { return typeof streak === "function" ? streak(p.days || {}, TODAY()) : 0; } catch (e) { return 0; } };

  async function questionText(){
    if (ADM.qtext) return ADM.qtext;
    const m = {};
    try { buildDailyBank(BANK).forEach(q => m[q[0]] = q[3]); } catch (e) {}
    try { [BATCH1, BATCH2].forEach(b => (b.items || []).forEach(it => m[it[0]] = it[5])); } catch (e) {}
    try { (await repoBank()).forEach(b => b.items.forEach(it => m[it[0]] = it[5])); } catch (e) {}
    try { const s = await fs.collection("bank").get(); s.docs.forEach(d => ((d.data() || {}).items || []).forEach(it => m[it[0]] = it[5])); } catch (e) {}
    return (ADM.qtext = m);
  }
  async function admLoad(){
    const [ps, es, fl] = await Promise.all([
      fs.collection("players").get(),
      fs.collection("errs").get().catch(() => ({docs: []})),
      fs.collection("flags").get().catch(() => ({docs: []}))
    ]);
    ADM.players = ps.docs.map(d => Object.assign({id: d.id}, d.data())).filter(p => p.name);
    ADM.errs = es.docs.map(d => Object.assign({id: d.id}, d.data())).sort((a, b) => (b.at || 0) - (a.at || 0));
    ADM.flags = fl.docs.map(d => Object.assign({id: d.id}, d.data()));
  }
  async function openAdmin(tab){
    if (!isOwner()) return;
    if (tab) ADM.tab = tab;
    dialog('<b>Organiser dashboard</b><p class="note">Loading…</p>');
    try { await admLoad(); admRender(); } catch (e) { logErr("admin load", e); dialog('<b>Organiser dashboard</b><p class="note">Couldn\'t load the data. Check your connection.</p>'); }
  }
  const tabsHtml = () => '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px">' + [["today", "Today"], ["players", "Players"], ["questions", "Questions"], ["errors", "Errors"], ["notice", "Notice"]].map(t =>
    '<button class="btn sec" data-adm-tab="' + t[0] + '" style="display:inline-block;width:auto;padding:7px 11px;font-size:13px' + (ADM.tab === t[0] ? ';border-color:var(--sun)' : '') + '">' + t[1] + '</button>').join("") + '</div>';
  const tbl = (head, rows) => '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><tr>' + head.map(h => '<th style="text-align:left;padding:5px 6px;border-bottom:1px solid var(--line);white-space:nowrap">' + h + '</th>').join("") + '</tr>' +
    rows.map(r => '<tr>' + r.map(c => '<td style="padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:top">' + c + '</td>').join("") + '</tr>').join("") + '</table></div>';
  const kpi = (v, l) => '<div style="flex:1 1 30%;min-width:90px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px"><div style="font-size:20px;font-weight:800">' + v + '</div><div class="note">' + l + '</div></div>';
  const smallBtn = (label, attrs) => '<button class="btn sec" ' + attrs + ' style="display:inline-block;width:auto;padding:4px 8px;font-size:12px;margin:2px">' + label + '</button>';

  function viewToday(){
    const k = TODAY(), P = ADM.players;
    const started = P.filter(p => p.days && p.days[k]), done = P.filter(p => played(p, k));
    const inprog = started.filter(p => !played(p, k));
    const sc = done.map(p => scoreOf(p, k)), avg = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : 0;
    const best = done.slice().sort((a, b) => scoreOf(b, k) - scoreOf(a, k))[0];
    const newToday = P.filter(p => p.joined && new Date(p.joined).toISOString().slice(0, 10) === k);
    const active7 = P.filter(p => { for (let i = 0; i < 7; i++) if (played(p, back(k, i))) return true; return false; });
    const errs24 = ADM.errs.filter(e => e.at > Date.now() - 864e5 && e.stage !== "deploy-check").length;
    let h = '<div style="display:flex;gap:8px;flex-wrap:wrap">' + kpi(done.length + " / " + P.length, "played today / all players") + kpi(pct(done.length, active7.length), "of this week's players played today") +
      kpi(sc.length ? fmt(avg) : "–", "average score today") + kpi(best ? esc(best.name) : "–", "top today" + (best ? " · " + fmt(scoreOf(best, k)) : "")) +
      kpi(inprog.length, "started, not finished") + kpi(newToday.length, "new players today") + kpi(ADM.flags.length, "flagged questions") + kpi(errs24, "errors in 24h") + '</div>';
    // 14-day participation
    const days = []; for (let i = 13; i >= 0; i--) days.push(back(k, i));
    const counts = days.map(d => P.filter(p => played(p, d)).length), mx = Math.max(1, ...counts);
    h += '<p class="note" style="margin:14px 0 6px"><b>Players per day (last 14 days)</b></p><div style="display:flex;align-items:flex-end;gap:3px;height:80px">' +
      days.map((d, i) => '<div title="' + d + ': ' + counts[i] + '" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%"><span style="font-size:10px;opacity:.7">' + (counts[i] || "") + '</span><div style="width:100%;height:' + Math.max(2, 60 * counts[i] / mx) + 'px;background:var(--sun);border-radius:3px 3px 0 0;opacity:' + (d === k ? 1 : .6) + '"></div></div>').join("") +
      '</div><div style="display:flex;justify-content:space-between" class="note"><span>' + days[0].slice(5) + '</span><span>today</span></div>';
    // teams
    const teams = {}; P.forEach(p => { const t = teams[p.dept || "Other"] = teams[p.dept || "Other"] || {n: 0, today: 0, sc: []}; t.n++; if (played(p, k)) { t.today++; t.sc.push(scoreOf(p, k)); } });
    h += '<p class="note" style="margin:14px 0 6px"><b>Teams</b></p>' + tbl(["Team", "Players", "Played today", "Avg today"], Object.keys(teams).sort().map(t => [esc(t), teams[t].n, teams[t].today, teams[t].sc.length ? fmt(teams[t].sc.reduce((a, b) => a + b, 0) / teams[t].sc.length) : "–"]));
    // watch list
    const flags = [];
    inprog.forEach(p => { const d = p.days[k]; if (d.st && Date.now() - d.st > 15 * 60000) flags.push(esc(p.name) + ' started today\'s set ' + ago(d.st) + ' and didn\'t finish (left mid-game or lost connection).'); });
    done.forEach(p => { const a = p.days[k].a || []; const ms = a.length ? a.reduce((s, x) => s + (x.ms || 0), 0) / a.length : 0; if (a.length >= 10 && ms < 1500 && (p.days[k].n || 0) >= 9) flags.push(esc(p.name) + ' answered ' + p.days[k].n + '/10 right in ' + (ms / 1000).toFixed(1) + 's per question on average. Unusually fast.'); });
    const groups = {}; P.forEach(p => { const n = nkey(p.name); (groups[n] = groups[n] || []).push(p); });
    Object.values(groups).filter(g => g.length > 1).forEach(g => flags.push(g.length + ' entries called "' + esc(g[0].name) + '". Possible duplicates: use Merge.'));
    h += '<p class="note" style="margin:14px 0 6px"><b>Worth a look</b></p>' + (flags.length ? '<ul style="margin:0;padding-left:18px;font-size:13px">' + flags.map(f => '<li style="margin:4px 0">' + f + '</li>').join("") + '</ul>' : '<p class="note">Nothing unusual today.</p>');
    return h;
  }

  function viewPlayers(){
    const k = TODAY();
    const rows = ADM.players.map(p => { const ds = daysOf(p); return {p, days: ds.filter(d => p.days[d].done).length, last: ds.filter(d => p.days[d].done).pop() || "", total: ds.reduce((s, d) => s + scoreOf(p, d), 0), streak: strk(p)}; });
    const S = {last: (a, b) => (b.last > a.last ? 1 : b.last < a.last ? -1 : 0), name: (a, b) => a.p.name.localeCompare(b.p.name), total: (a, b) => b.total - a.total, streak: (a, b) => b.streak - a.streak, days: (a, b) => b.days - a.days};
    rows.sort(S[ADM.sort] || S.last);
    let h = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><span class="note">Sort:</span>' + [["last", "Last played"], ["name", "Name"], ["total", "Total score"], ["streak", "Streak"], ["days", "Days played"]].map(s => smallBtn((ADM.sort === s[0] ? "● " : "") + s[1], 'data-adm-sort="' + s[0] + '"')).join("") + smallBtn("⬇ Export CSV", 'data-adm-csv="1"') + smallBtn("Merge duplicates", 'id="mrgopen"') + '</div>';
    const td = 'style="padding:5px 6px;vertical-align:top"';
    h += '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><tr>' + ["Player", "Days", "Streak", "Total", "Last"].map(x => '<th style="text-align:left;padding:5px 6px;border-bottom:1px solid var(--line)">' + x + '</th>').join("") + '</tr>' +
      rows.map(r => {
        const id = esc(r.p.id), armed = ADM.arm;
        return '<tr><td ' + td + '><b>' + esc(r.p.name) + '</b><br><span class="note">' + esc(r.p.dept || "") + ((r.p.uids || []).length ? ' · ' + (r.p.uids.length + 1) + ' devices' : '') + '</span></td><td ' + td + '>' + r.days + '</td><td ' + td + '>' + (r.streak ? "🔥" + r.streak : "–") + '</td><td ' + td + '>' + fmt(r.total) + '</td><td ' + td + '>' + (r.last === k ? "today" : (r.last ? r.last.slice(5) : "–")) + '</td></tr>' +
          '<tr><td colspan="5" style="padding:0 2px 6px;border-bottom:1px solid var(--line)">' + smallBtn("Edit", 'data-adm-edit="' + id + '"') + (r.p.days && r.p.days[k] ? smallBtn(armed === "reset:" + r.p.id ? "Tap again to confirm" : "Let replay today", 'data-adm-reset="' + id + '"') : "") + smallBtn(armed === "del:" + r.p.id ? "Tap again to confirm" : "Remove", 'data-adm-del="' + id + '"') + '</td></tr>';
      }).join("") + '</table></div>';
    if (ADM.edit) {
      const p = ADM.players.find(x => x.id === ADM.edit);
      if (p) h += '<div class="card" style="margin-top:12px"><b>Edit ' + esc(p.name) + '</b><p class="note" style="margin:8px 0 4px">Display name</p><input class="in" id="adm-name" maxlength="24" value="' + esc(p.name) + '"><p class="note" style="margin:8px 0 4px">Team</p><select class="in" id="adm-dept">' +
        ["Trading", "Research", "Operations", "Engineering", "Commercial", "Finance", "Other"].map(t => '<option' + (t === p.dept ? " selected" : "") + '>' + t + '</option>').join("") + '</select><button class="btn" data-adm-save="' + esc(p.id) + '" style="margin-top:10px">Save</button></div>';
    }
    h += '<p class="note" style="margin-top:10px">“Let replay today” clears today\'s attempt so that player can play the set again (use it for genuine technical problems). “Remove” deletes the player and their scores.</p>';
    return h;
  }

  async function viewQuestions(){
    const k = TODAY(), Q = await questionText(), st = {};
    for (let i = 0; i < 7; i++) {
      const d = back(k, i);
      ADM.players.forEach(p => { const day = p.days && p.days[d]; if (!day || !Array.isArray(day.ids)) return; (day.a || []).forEach((a, j) => { const id = day.ids[j]; if (!id) return; const s = st[id] = st[id] || {n: 0, ok: 0, ms: 0, day: d}; s.n++; if (a.ok) s.ok++; s.ms += a.ms || 0; }); });
    }
    const list = Object.keys(st).map(id => Object.assign({id}, st[id])).filter(x => x.n >= 2);
    const hard = list.slice().sort((a, b) => a.ok / a.n - b.ok / b.n).slice(0, 8), easy = list.slice().sort((a, b) => b.ok / b.n - a.ok / a.n || a.ms / a.n - b.ms / b.n).slice(0, 5);
    const row = x => [esc((Q[x.id] || x.id).slice(0, 110)) + '<br><span class="note">' + esc(x.id) + ' · ' + x.day + '</span>', pct(x.ok, x.n), x.n, (x.ms / x.n / 1000).toFixed(1) + "s"];
    let h = '<p class="note" style="margin:0 0 6px"><b>Hardest this week</b> (lowest % correct, at least 2 answers)</p>' + (hard.length ? tbl(["Question", "Correct", "Answers", "Avg time"], hard.map(row)) : '<p class="note">Not enough answers yet.</p>');
    h += '<p class="note" style="margin:14px 0 6px"><b>Easiest this week</b></p>' + (easy.length ? tbl(["Question", "Correct", "Answers", "Avg time"], easy.map(row)) : '<p class="note">Not enough answers yet.</p>');
    const fl = {}; ADM.flags.forEach(f => { (fl[f.qid] = fl[f.qid] || []).push(f); });
    h += '<p class="note" style="margin:14px 0 6px"><b>Flagged by players</b></p>' + (Object.keys(fl).length ? tbl(["Question", "Flags", ""], Object.keys(fl).map(q => [esc((Q[q] || q).slice(0, 110)) + '<br><span class="note">' + esc(q) + '</span>', fl[q].length, smallBtn("Clear", 'data-adm-unflag="' + esc(q) + '"')])) : '<p class="note">No flags. 👍</p>') +
      '<p class="note" style="margin-top:8px">To fix or replace a flagged question, ask Claude with its id. To swap a question in an upcoming set, use ⚙️ Organiser tools.</p>';
    return h;
  }

  function viewErrors(){
    const E = ADM.errs.filter(e => e.stage !== "deploy-check").slice(0, 60);
    const br = ua => /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Edg\//.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : "Other";
    let h = '<p class="note" style="margin:0 0 8px">Problems players\' browsers reported (no names stored). A few connection blips are normal; the same error repeating means something to fix.</p>';
    h += E.length ? tbl(["When", "Where", "Error", "Browser"], E.map(e => [ago(e.at), esc(e.stage || ""), esc((e.code ? e.code + " " : "") + (e.msg || "").slice(0, 90)), br(e.ua || "")])) + smallBtn(ADM.arm === "errs" ? "Tap to confirm" : "Clear all errors", 'data-adm-clearerrs="1"') : '<p class="note">No errors reported. 👍</p>';
    return h;
  }

  async function viewNotice(){
    let n = {};
    try { const d = await fs.doc("config/notice").get(); n = d.exists ? d.data() : {}; } catch (e) {}
    return '<p class="note" style="margin:0 0 8px">Show a short message at the top of the game for everyone (e.g. "Double points Friday!" or "Maintenance tonight").</p><textarea class="in" id="adm-notice" maxlength="200" rows="3" style="resize:vertical">' + esc(n.text || "") + '</textarea>' +
      '<button class="btn" data-adm-notice="save" style="margin-top:10px">Publish notice</button>' + (n.text ? '<button class="btn sec" data-adm-notice="clear">Remove notice</button>' : '') + (n.at ? '<p class="note" style="margin-top:8px">Live since ' + new Date(n.at).toLocaleString("en-GB") + '</p>' : '');
  }

  async function admRender(){
    const body = ADM.tab === "players" ? viewPlayers() : ADM.tab === "questions" ? await viewQuestions() : ADM.tab === "errors" ? viewErrors() : ADM.tab === "notice" ? await viewNotice() : viewToday();
    const o = dialog('<b>Organiser dashboard</b>' + tabsHtml() + '<div id="adm-body">' + body + '</div>');
    o.firstChild.style.maxWidth = "680px"; o.firstChild.style.maxHeight = "88vh"; o.firstChild.style.overflow = "auto";
  }
  function csv(){
    const k = TODAY(), rows = [["name", "team", "joined", "days_played", "total_score", "streak", "last_played", "today_score"]];
    ADM.players.forEach(p => { const ds = daysOf(p).filter(d => p.days[d].done); rows.push([p.name, p.dept || "", p.joined ? new Date(p.joined).toISOString().slice(0, 10) : "", ds.length, ds.reduce((s, d) => s + scoreOf(p, d), 0), strk(p), ds[ds.length - 1] || "", played(p, k) ? scoreOf(p, k) : ""]); });
    const text = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type: "text/csv"})); a.download = "crude-awakening-players-" + k + ".csv"; document.body.appendChild(a); a.click(); a.remove();
  }
  async function admAct(t){
    const ds = t.dataset, k = TODAY();
    try {
      if (ds.admTab) { ADM.tab = ds.admTab; ADM.edit = null; ADM.arm = null; return admRender(); }
      if (ds.admSort) { ADM.sort = ds.admSort; return admRender(); }
      if (ds.admCsv) return csv();
      if (ds.admEdit) { ADM.edit = ds.admEdit; return admRender(); }
      if (ds.admSave) {
        const name = (document.getElementById("adm-name").value || "").trim().slice(0, 24), dept = document.getElementById("adm-dept").value;
        if (!name) return;
        if (ADM.players.some(p => p.id !== ds.admSave && nkey(p.name) === nkey(name))) { t.insertAdjacentHTML("afterend", '<p class="note">Another player already uses that name. Merge them instead.</p>'); return; }
        await retry("admin edit", () => fs.doc("players/" + ds.admSave).set({name, dept}, {merge: true}));
        ADM.edit = null; await admLoad(); return admRender();
      }
      if (ds.admReset) {
        if (ADM.arm !== "reset:" + ds.admReset) { ADM.arm = "reset:" + ds.admReset; return admRender(); }
        await retry("admin reset", () => fs.doc("players/" + ds.admReset).set({days: {[k]: null}}, {merge: true}));
        ADM.arm = null; await admLoad(); return admRender();
      }
      if (ds.admDel) {
        if (ADM.arm !== "del:" + ds.admDel) { ADM.arm = "del:" + ds.admDel; return admRender(); }
        await retry("admin remove", () => fs.doc("players/" + ds.admDel).delete());
        ADM.arm = null; await admLoad(); return admRender();
      }
      if (ds.admUnflag) { for (const f of ADM.flags.filter(f => f.qid === ds.admUnflag)) await fs.doc("flags/" + f.id).delete(); await admLoad(); return admRender(); }
      if (ds.admClearerrs) {
        if (ADM.arm !== "errs") { ADM.arm = "errs"; return admRender(); }
        for (const e of ADM.errs) await fs.doc("errs/" + e.id).delete().catch(() => {});
        ADM.arm = null; await admLoad(); return admRender();
      }
      if (ds.admNotice) {
        const text = ds.admNotice === "save" ? (document.getElementById("adm-notice").value || "").trim().slice(0, 200) : "";
        await retry("admin notice", () => fs.doc("config/notice").set({text, at: Date.now()}));
        return admRender();
      }
    } catch (e) { logErr("admin action", e); const b = document.getElementById("adm-body"); if (b) b.insertAdjacentHTML("afterbegin", '<p class="note" style="color:#ff8a8a">That didn\'t work (' + esc(e && e.code || "error") + '). Try again.</p>'); }
  }
  document.addEventListener("click", e => { const t = e.target && e.target.closest && e.target.closest("[data-adm-tab],[data-adm-sort],[data-adm-csv],[data-adm-edit],[data-adm-save],[data-adm-reset],[data-adm-del],[data-adm-unflag],[data-adm-clearerrs],[data-adm-notice]"); if (t) admAct(t); });

  // Notice banner for everyone
  function watchNotice(){
    try {
      fs.doc("config/notice").onSnapshot(d => {
        const n = d.exists ? d.data() : null; let el = document.getElementById("gh-notice");
        if (!n || !n.text) { if (el) el.remove(); return; }
        if (!el) { el = document.createElement("div"); el.id = "gh-notice"; el.style.cssText = "max-width:520px;margin:10px auto 0;padding:10px 14px;border-radius:12px;background:var(--panel2);border:1px solid var(--sun);font-size:14px"; const app = document.getElementById("app"); app.parentNode.insertBefore(el, app); }
        el.textContent = "📣 " + n.text;
      }, () => {});
    } catch (e) {}
  }
