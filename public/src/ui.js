// src/ui.js
export function createHUD() {
  // -----------------------------
  // Grab existing DOM (optional)
  // -----------------------------
  const start = document.getElementById("start");
  const win = document.getElementById("win");
  const lose = document.getElementById("lose");
  const playBtn = document.getElementById("playBtn");
  const fill = document.getElementById("healthfill");
  const text = document.getElementById("healthtext");

  // ---------------------------------------
  // Settings Button (top-right)
  // ---------------------------------------
  let settingsBtn = document.getElementById("settingsBtn");
  if (!settingsBtn) {
    settingsBtn = document.createElement("button");
    settingsBtn.id = "settingsBtn";
    settingsBtn.textContent = "⚙️";
    Object.assign(settingsBtn.style, {
      position: "fixed",
      top: "12px",
      right: "12px",
      zIndex: 1001,
      fontSize: "18px",
      padding: "6px 10px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(0,0,0,0.5)",
      color: "#fff",
      cursor: "pointer",
    });
    document.body.appendChild(settingsBtn);
  }

  // ---------------------------------------
  // Settings Overlay
  // ---------------------------------------
  let settingsOverlay = document.getElementById("settings");
  if (!settingsOverlay) {
    settingsOverlay = document.createElement("div");
    settingsOverlay.id = "settings";
    settingsOverlay.className = "overlay hidden";
    Object.assign(settingsOverlay.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.45)",
      zIndex: 1002,
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(92vw, 360px)",
      background: "rgba(0,0,0,0.75)",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: "12px",
      color: "#fff",
      fontFamily: "system-ui, sans-serif",
      padding: "14px 16px",
      backdropFilter: "blur(4px)",
    });
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0">Settings</h3>
        <button id="closeSettings" style="background:transparent;color:#fff;border:none;font-size:18px;cursor:pointer;">✖</button>
      </div>
      <label>Master Volume</label>
      <input id="masterVol" type="range" min="0" max="1" step="0.01" value="1" style="width:100%;">
      <label>SFX Volume</label>
      <input id="sfxVol" type="range" min="0" max="1" step="0.01" value="1" style="width:100%;">
      <label>Music Volume</label>
      <input id="musicVol" type="range" min="0" max="1" step="0.01" value="1" style="width:100%;">
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px;">
        <input id="audioToggle" type="checkbox" checked> Enable Audio
      </label>
    `;
    settingsOverlay.appendChild(panel);
    document.body.appendChild(settingsOverlay);
  }

  function showSettings(show) {
    settingsOverlay.classList.toggle("hidden", !show);
    settingsOverlay.style.display = show ? "flex" : "none";
  }
  settingsBtn.addEventListener("click", () => showSettings(true));
  const closeSettings = document.getElementById("closeSettings");
  if (closeSettings) closeSettings.addEventListener("click", () => showSettings(false));
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") showSettings(false); });

  // ---------------------------------------
  // Health bar
  // ---------------------------------------
  function updateHealth(h) {
    if (fill) fill.style.transform = `scaleX(${Math.max(0, Math.min(1, h / 100))})`;
    if (text) text.textContent = `Health: ${Math.round(h)} / 100`;
  }

  // ---------------------------------------
  // Overlays
  // ---------------------------------------
  function showStart(show) {
    if (start) {
      start.classList.toggle("hidden", !show);
      start.style.display = show ? "" : "none";
    }
    if (show) showSettings(false);
  }
  function showWin() { if (win) win.classList.remove("hidden"); }
  function hideWin() { if (win) win.classList.add("hidden"); }
  function showLose() { if (lose) lose.classList.remove("hidden"); }
  function hideLose() { if (lose) lose.classList.add("hidden"); }

  // ---------------------------------------
  // Keys counter
  // ---------------------------------------
  function updateKeys(collected, total) {
    const keysCount = document.getElementById("keysCount");
    const keysTotal = document.getElementById("keysTotal");
    if (keysCount) keysCount.textContent = collected;
    if (keysTotal) keysTotal.textContent = total;
  }

  // ---------------------------------------
  // COOL WEAPON HUD (bottom-right)
  // ---------------------------------------
  // SVG silhouettes (monochrome, sharp)
  // Replace the weaponSVG block in ui.js with this:
  const weaponSVG = {
    pistol: `
      <svg viewBox="0 0 200 80" width="120" height="40" fill="white" stroke="none" preserveAspectRatio="xMidYMid meet">
        <!-- barrel -->
        <path d="M10 30 H120 L130 40 H180 V50 H130 L120 60 H10 Z" />
        <!-- slide -->
        <rect x="12" y="25" width="105" height="6" rx="1" />
        <!-- trigger guard -->
        <path d="M90 50 h20 a10 10 0 0 1 10 10 v4 h-10 v-2 a4 4 0 0 0 -4 -4 h-16 z" />
        <!-- grip -->
        <polygon points="70,50 110,50 100,75 60,75" />
      </svg>
    `,
    knife: `
      <svg viewBox="0 0 200 80" width="120" height="40" fill="white" stroke="none" preserveAspectRatio="xMidYMid meet">
        <!-- handle -->
        <rect x="18" y="34" width="46" height="12" rx="2" />
        <!-- bolster -->
        <rect x="64" y="34" width="6" height="12" />
        <!-- blade -->
        <polygon points="70,34 150,28 182,38 150,48 70,46" />
        <!-- spine highlight (optional, subtle) -->
        <rect x="74" y="32" width="92" height="3" fill="rgba(255,255,255,0.55)" />
      </svg>
    `,
  };

  let hudRoot, card, iconWrap, nameEl, bigAmmo, subRow, ammoBar, ammoFill;

  function createWeaponHud() {
    if (hudRoot) return;

    hudRoot = document.createElement("div");
    Object.assign(hudRoot.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: 2000,
      pointerEvents: "none",
    });

    // Card
    card = document.createElement("div");
    Object.assign(card.style, {
      display: "grid",
      gridTemplateColumns: "140px auto",
      gap: "14px",
      alignItems: "center",
      padding: "14px 16px",
      minWidth: "320px",
      background: "linear-gradient(180deg, rgba(0,0,0,0.65), rgba(0,0,0,0.55))",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "12px",
      color: "#fff",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
      backdropFilter: "blur(4px)",
    });

    // Weapon silhouette
    iconWrap = document.createElement("div");
    iconWrap.style.display = "grid";
    iconWrap.style.placeItems = "center";
    iconWrap.style.opacity = "0.95";

    // Right column
    const right = document.createElement("div");
    right.style.display = "grid";
    right.style.gap = "6px";

    // Name (small, all-caps)
    nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
      fontSize: "11px",
      letterSpacing: "1.2px",
      textTransform: "uppercase",
      opacity: "0.8",
    });
    nameEl.textContent = "UNARMED";

    // Big ammo row
    bigAmmo = document.createElement("div");
    Object.assign(bigAmmo.style, {
      display: "flex",
      alignItems: "baseline",
      gap: "8px",
      fontVariantNumeric: "tabular-nums",
    });
    const cur = document.createElement("span");
    cur.id = "ammoCur";
    cur.style.fontSize = "28px";
    cur.style.fontWeight = "700";
    cur.textContent = "0";
    const slashCap = document.createElement("span");
    slashCap.id = "ammoCap";
    slashCap.style.fontSize = "18px";
    slashCap.style.opacity = "0.85";
    slashCap.textContent = "/ 0";
    bigAmmo.appendChild(cur);
    bigAmmo.appendChild(slashCap);

    // Sub row (icon + text)
    subRow = document.createElement("div");
    Object.assign(subRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      fontSize: "12px",
      opacity: "0.85",
    });
    const bulletGlyph = document.createElement("div");
    bulletGlyph.textContent = "⦿";
    bulletGlyph.style.fontSize = "14px";
    const ammoText = document.createElement("span");
    ammoText.id = "ammoText";
    ammoText.textContent = "";
    subRow.appendChild(bulletGlyph);
    subRow.appendChild(ammoText);

    // Thin ammo bar
    ammoBar = document.createElement("div");
    Object.assign(ammoBar.style, {
      position: "relative",
      height: "6px",
      width: "100%",
      background: "rgba(255,255,255,0.12)",
      borderRadius: "4px",
      overflow: "hidden",
      marginTop: "4px",
    });
    ammoFill = document.createElement("div");
    Object.assign(ammoFill.style, {
      height: "100%",
      width: "0%",
      background: "white",
      borderRadius: "4px",
      transition: "width .12s ease-out",
    });
    ammoBar.appendChild(ammoFill);

    right.appendChild(nameEl);
    right.appendChild(bigAmmo);
    right.appendChild(subRow);
    right.appendChild(ammoBar);

    card.appendChild(iconWrap);
    card.appendChild(right);
    hudRoot.appendChild(card);
    document.body.appendChild(hudRoot);
  }

  function setWeaponIcon(id) {
    iconWrap.innerHTML = ""; // clear
    const svg = document.createElement("div");
    svg.innerHTML = weaponSVG[id] || weaponSVG.pistol;
    // scale/white already baked in; add slight glow
    svg.style.filter = "drop-shadow(0 1px 0 rgba(255,255,255,0.15))";
    iconWrap.appendChild(svg.firstElementChild);
  }

  function updateWeapon(equipped) {
    createWeaponHud();

    // Unarmed
    if (!equipped || !equipped.weapon) {
      iconWrap.innerHTML = "";
      nameEl.textContent = "UNARMED";
      document.getElementById("ammoCur").textContent = "0";
      document.getElementById("ammoCap").textContent = "/ 0";
      document.getElementById("ammoText").textContent = "";
      ammoFill.style.width = "0%";
      card.style.opacity = "0.8";
      return;
    }

    // Data
    const wt = equipped.weapon;
    const cur = equipped.ammo ?? 0;
    const cap = wt.ammoCap ?? 0;

    // Visuals
    setWeaponIcon(wt.id);
    nameEl.textContent = (wt.hudName || wt.name || wt.id).toUpperCase();

    const curEl = document.getElementById("ammoCur");
    const capEl = document.getElementById("ammoCap");
    const textEl = document.getElementById("ammoText");

    if (wt.ammoCap === Infinity) {
      curEl.textContent = "∞";
      capEl.textContent = "";
      textEl.textContent = "MELEE";
      ammoFill.style.width = "100%";
    } else {
      curEl.textContent = String(cur);
      capEl.textContent = `/ ${cap}`;
      textEl.textContent = "AMMO";
      const pct = Math.max(0, Math.min(1, cap ? cur / cap : 0));
      ammoFill.style.width = `${Math.round(pct * 100)}%`;
    }

    // subtle pulse
    card.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.05)" }, { transform: "scale(1)" }],
      { duration: 160, easing: "ease-out" }
    );
    card.style.opacity = "1";
  }

  // ---------------------------------------
  // Audio hooks (callbacks set by main.js)
  // ---------------------------------------
  let _onMaster = null, _onSfx = null, _onMusic = null, _onToggle = null, _onClose = null;
  function onMasterVol(cb) { _onMaster = cb; }
  function onSfxVol(cb) { _onSfx = cb; }
  function onMusicVol(cb) { _onMusic = cb; }
  function onToggleAudio(cb) { _onToggle = cb; }
  function onCloseSettings(cb) { _onClose = cb; }

  const masterVol = document.getElementById("masterVol");
  const sfxVol = document.getElementById("sfxVol");
  const musicVol = document.getElementById("musicVol");
  const audioToggle = document.getElementById("audioToggle");
  if (masterVol) masterVol.addEventListener("input", (e) => _onMaster && _onMaster(parseFloat(e.target.value)));
  if (sfxVol) sfxVol.addEventListener("input", (e) => _onSfx && _onSfx(parseFloat(e.target.value)));
  if (musicVol) musicVol.addEventListener("input", (e) => _onMusic && _onMusic(parseFloat(e.target.value)));
  if (audioToggle) audioToggle.addEventListener("change", (e) => _onToggle && _onToggle(e.target.checked));
  if (closeSettings) closeSettings.addEventListener("click", () => _onClose && _onClose());

  // ---------------------------------------
  // Public API
  // ---------------------------------------
  return {
    playBtn,
    settingsBtn,
    showStart, showWin, hideWin, showLose, hideLose,
    updateHealth, updateKeys,
    updateWeapon,
    showSettings,
    onMasterVol, onSfxVol, onMusicVol, onToggleAudio, onCloseSettings,
  };
}
