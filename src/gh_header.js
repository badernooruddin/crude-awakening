window.addEventListener("gh-rerender", () => { try { if (S.view !== "play") render(); } catch (e) {} });
function header(){
  const m = me(); const st = m ? streak(m.days || {}, S.key) : 0;
  const right = (S.owner && m && m.name && S.view !== "play" ? '<button class="gear" data-a="admin" title="Organiser tools">⚙️</button>' : '') + (m && m.name && S.view !== "play" ? '<button class="me" data-a="profile">' + esc(m.name) + (st ? '<br><span class="fire">🔥 ' + st + '</span>' : '') + '</button>' : '');
  if (S.view === "play") return '<div class="mast compact"><h1><span>Crude </span><span>Awakening</span></h1></div>';
  const note = window.GH_NOTE ? '<p class="dnote">' + esc(window.GH_NOTE) + '</p>' : '';
  return '<header class="mast"><div class="oil">__OILSVG__</div><div class="bar">' + right + '</div><h1><span>Crude</span><span>Awakening</span></h1>' +
    '<p class="tag">You work at the best trading company in the world. Prove it. New set at midnight London.</p>' + note + '</header>';
}
const GH_TAUNTS = ["Still bullish on yourself?", "Your desk is watching. No pressure.", "Twenty seconds. No calling a broker.", "Confidence is not a fundamental.", "Yesterday's score has been noted.", "Go on. Take the position.", "You can't hedge this one.", "It's only ten questions. What could go wrong?", "The leaderboard remembers everything.", "Think you know your barrels?", "Loud on the desk. Quiet on the leaderboard?", "Time to mark your knowledge to market."];
function ghTaunt(){ const k = S.key || ""; let n = 0; for (const c of k) n = (n * 31 + c.charCodeAt(0)) % 9973; return GH_TAUNTS[n % GH_TAUNTS.length]; }
function ghVerdict(n){ return n >= 10 ? "Flawless. Suspiciously flawless. We're checking the tape." : n >= 8 ? "Strong book. One or two positions you'd rather not discuss." : n >= 5 ? "Flat on the day. Nobody got hurt, nobody got a bonus." : n >= 2 ? "Deep contango: your knowledge is worth more in the future." : "Dry hole. Tell the desk the Wi-Fi dropped."; }
