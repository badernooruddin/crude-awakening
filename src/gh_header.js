window.addEventListener("gh-rerender", () => { try { if (S.view !== "play") render(); } catch (e) {} });
function header(){
  const m = me(); const st = m ? streak(m.days || {}, S.key) : 0;
  const right = (S.owner && m && m.name && S.view !== "play" ? '<button class="gear" data-a="admin" title="Organiser tools">⚙️</button>' : '') + (m && m.name && S.view !== "play" ? '<button class="me" data-a="profile">' + esc(m.name) + (st ? '<br><span class="fire">🔥 ' + st + '</span>' : '') + '</button>' : '');
  if (S.view === "play") return '<div class="mast compact"><h1><span>Crude </span><span>Awakening</span></h1></div>';
  const note = window.GH_NOTE ? '<p class="dnote">' + esc(window.GH_NOTE) + '</p>' : '';
  return '<header class="mast"><div class="bar">' + right + '</div><h1><span>Crude</span><span>Awakening</span></h1>' +
    '<p class="tag">You work in oil. You think you know it. Ten questions a day say otherwise. New set at midnight London.</p>' + note + '</header>';
}
