      { const nk = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const clash = Object.values(S.players).find(p => p.id !== S.uid && p.name && nk(p.name) === nk(name));
        if (clash) { const t = document.createElement("div"); t.className = "toast"; t.style.maxWidth = "340px"; t.textContent = "“" + clash.name + "” is already playing. If that's you, use “Play on another phone or computer” at the bottom of the page to link this device. Otherwise pick a different name."; document.body.appendChild(t); setTimeout(() => t.remove(), 7000); return; } }
