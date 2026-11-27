window.addEventListener("gh-rerender", () => { try { if (S.view !== "play") render(); } catch (e) {} });
// The mark: what the player thinks they are worth (10) against their real average. Runs down once, on first paint.
function ghMarkRun(){
  const D = 1500, t = Math.min(1, (Date.now() - window.GH_T0) / D), e = 1 - Math.pow(1 - t, 3);
  const el = document.querySelector(".mast .mtm[data-v]");
  if (el) { const v = +el.getAttribute("data-v"), cur = 10 - (10 - v) * e; el.style.setProperty("--p", (cur * 10) + "%"); const n = el.querySelector(".mk b"); if (n) n.textContent = cur.toFixed(1); }
  if (t < 1) requestAnimationFrame(ghMarkRun);
}
function ghMark(m){
  // Marked to market = today's average correct answers across everyone who has finished today's set.
  const k = S.key, P = Object.values(S.players || {});
  let n = 0, s = 0; P.forEach(p => { const d = p.days && p.days[k]; if (d && d.done && typeof d.n === "number") { n++; s += d.n; } });
  const mine = m && m.days && m.days[k] && m.days[k].done && typeof m.days[k].n === "number" ? m.days[k].n : null;
  const top = '';
  if (!n) return '<div class="mtm">' + top + '<div class="row mk"><span>Marked to market</span><em>no trades yet today</em></div></div>';
  const v = Math.round(s / n * 10) / 10;
  try { if (!window.GH_T0 && window.requestAnimationFrame && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) { window.GH_T0 = Date.now(); requestAnimationFrame(ghMarkRun); } } catch (e) {}
  const you = mine === null ? '' : '<i class="you" style="left:' + (mine * 10) + '%" title="You today: ' + mine + '/10"></i>';
  const sub = 'today\'s average across ' + n + (n === 1 ? ' player' : ' players') + (mine === null ? '' : ' · you: ' + mine + '/10');
  return '<div class="mtm" data-v="' + v + '" style="--p:' + (v * 10) + '%">' + top + '<div class="row mk"><span>Marked to market <small>' + sub + '</small></span><b>' + v.toFixed(1) + '</b></div><div class="scale"><i class="dot"></i>' + you + '</div></div>';
}
function header(){
  const m = me(); const st = m ? streak(m.days || {}, S.key) : 0;
  const right = (S.owner && m && m.name && S.view !== "play" ? '<button class="gear" data-a="admin" title="Organiser tools">⚙️</button>' : '') + (m && m.name && S.view !== "play" ? '<button class="me" data-a="profile">' + esc(m.name) + (st ? '<br><span class="fire">🔥 ' + st + '</span>' : '') + '</button>' : '');
  if (S.view === "play") return '<div class="mast compact"><h1><span>Crude </span><span>Awakening</span></h1></div>';
  const note = window.GH_NOTE ? '<p class="dnote">' + esc(window.GH_NOTE) + '</p>' : '';
  return '<header class="mast"><div class="bar">' + right + '</div><h1><span>Crude</span> <span>Awakening</span></h1>' +
    '<p class="tag">Oil trader? Analyst? Ops? You must be good… or are you?</p>' + ghMark(m) + note + '</header>';
}
const GH_TAUNTS = ["Still long yourself?", "Your desk can see the leaderboard. No pressure.", "Twenty seconds a question. No calling a broker.", "Confidence is not a fundamental.", "Yesterday's close has been noted.", "Go on. Take the position.", "You can't hedge this one.", "Ten questions. Your mark moves either way.", "The leaderboard has a long memory.", "Everyone's a ten until the set opens.", "Loud on the desk. Quiet on the leaderboard?", "Price discovery starts when you press Play."];
function ghTaunt(){ const k = S.key || ""; let n = 0; for (const c of k) n = (n * 31 + c.charCodeAt(0)) % 9973; return GH_TAUNTS[n % GH_TAUNTS.length]; }
function ghVerdict(n){ return n >= 10 ? "Ten out of ten. For once, the self-estimate was the right price." : n >= 8 ? "Strong book. One or two positions you'd rather not discuss." : n >= 5 ? "Flat on the day. Nobody got hurt, nobody got a bonus." : n >= 2 ? "Deep contango: your knowledge is worth more in the future." : "Wide of the market. Tell the desk the Wi-Fi dropped."; }
// Combo bonus for consecutive correct answers is switched off from this set onwards (London date):
// points should reflect knowledge and speed only. Earlier days keep the scores they were played with.
const GH_NOCOMBO = "2026-11-28";
