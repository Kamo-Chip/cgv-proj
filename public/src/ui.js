// src/ui.js
export function createHUD() {
  const start = document.getElementById("start");
  const win = document.getElementById("win");
  const lose = document.getElementById("lose");
  const playBtn = document.getElementById("playBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const fill = document.getElementById("healthfill");
  const text = document.getElementById("healthtext");

  let settingsOverlay = document.getElementById("settings");
  if (!settingsOverlay) {
    settingsOverlay = document.createElement("div");
    settingsOverlay.id = "settings";
    settingsOverlay.className = "overlay hidden";
    settingsOverlay.innerHTML = `
      <div class="panel">
        <h3 style="margin-top:0">Settings</h3>
        <div style="text-align:left">
          <label>Master Volume <input id="masterVol" type="range" min="0" max="1" step="0.01" value="1"></label>
          <br/>
          <label>SFX Volume <input id="sfxVol" type="range" min="0" max="1" step="0.01" value="1"></label>
          <br/>
          <label>Music Volume <input id="musicVol" type="range" min="0" max="1" step="0.01" value="1"></label>
          <br/>
          <label><input id="audioToggle" type="checkbox" checked> Audio Enabled</label>
          <br/>
          <button id="closeSettings">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(settingsOverlay);
  }

  const masterVol = document.getElementById("masterVol");
  const sfxVol = document.getElementById("sfxVol");
  const musicVol = document.getElementById("musicVol");
  const audioToggle = document.getElementById("audioToggle");
  const closeSettings = document.getElementById("closeSettings");

  function updateHealth(h) {
    fill.style.transform = `scaleX(${h / 100})`;
    text.textContent = `Health: ${Math.round(h)} / 100`;
  }

  function showStart(show) {
    start.classList.toggle("hidden", !show);
  }
  function showWin() {
    win.classList.remove("hidden");
  }
  function hideWin() {
    win.classList.add("hidden");
  }
  function showLose() {
    lose.classList.remove("hidden");
  }
  function hideLose() {
    lose.classList.add("hidden");
  }
  function updateKeys(collected, total) {
    const keysCount = document.getElementById("keysCount");
    const keysTotal = document.getElementById("keysTotal");
    if (keysCount && keysTotal) {
      keysCount.textContent = collected;
      keysTotal.textContent = total;
    }
  }

  function updateWeapon(equipped) {
    const weapName = document.getElementById("weaponName");
    const weapAmmo = document.getElementById("weaponAmmo");
    if (!weapName || !weapAmmo) return;
    if (!equipped || !equipped.weapon) {
      weapName.textContent = "Unarmed";
      weapAmmo.textContent = "";
      weapName.style.opacity = 0.6;
      return;
    }
    weapName.textContent = equipped.weapon.hudName || equipped.weapon.name;
    weapAmmo.textContent = equipped.ammo === Infinity ? "∞" : equipped.ammo;
    weapName.style.opacity = 1.0;
  }

  // Audio/settings helpers exposed to code
  function showSettings(show) {
    settingsOverlay.classList.toggle("hidden", !show);
  }

  // connect settings callbacks (users of createHUD should set handlers)
  function onMasterVol(cb) {
    if (masterVol)
      masterVol.addEventListener("input", (e) =>
        cb(parseFloat(e.target.value))
      );
  }
  function onSfxVol(cb) {
    if (sfxVol)
      sfxVol.addEventListener("input", (e) => cb(parseFloat(e.target.value)));
  }
  function onMusicVol(cb) {
    if (musicVol)
      musicVol.addEventListener("input", (e) => cb(parseFloat(e.target.value)));
  }
  function onToggleAudio(cb) {
    if (audioToggle)
      audioToggle.addEventListener("change", (e) => cb(e.target.checked));
  }
  function onCloseSettings(cb) {
    if (closeSettings) closeSettings.addEventListener("click", cb);
  }

  // Accessibility helpers (optional)
  function focusPlayButton() {
    if (playBtn) playBtn.focus();
  }

  // after: const hud = createHUD();
  const damageFlash = document.createElement("div");
  Object.assign(damageFlash.style, {
    position: "fixed",
    inset: "0",
    background: "red",
    opacity: "0",
    transition: "opacity 180ms ease-out",
    pointerEvents: "none",
    width: "100vw",
    height: "100vh",
    zIndex: "9999", // above HUD
  });
  document.body.appendChild(damageFlash);

  let damageFlashTO;
  function triggerDamageFlash(opacity = 0.7, holdMs = 80, fadeMs = 180) {
    // restart transition if spammed
    damageFlash.style.transition = "none";
    damageFlash.style.opacity = "0";
    // force reflow so the next transition applies
    // eslint-disable-next-line no-unused-expressions
    damageFlash.offsetHeight;
    damageFlash.style.transition = `opacity ${fadeMs}ms ease-out`;

    damageFlash.style.opacity = String(opacity);
    clearTimeout(damageFlashTO);
    damageFlashTO = setTimeout(() => {
      damageFlash.style.opacity = "0";
    }, holdMs);
  }

  return {
    playBtn,
    showStart,
    showWin,
    hideWin,
    showLose,
    hideLose,
    updateHealth,
    updateKeys,
    updateWeapon,
    // new
    showSettings,
    settingsBtn,
    onMasterVol,
    onSfxVol,
    onMusicVol,
    onToggleAudio,
    onCloseSettings,
    focusPlayButton,
    triggerDamageFlash
  };
}
