// src/ui.js
export function createHUD() {
  const start = document.getElementById("start");
  const win = document.getElementById("win");
  const lose = document.getElementById("lose");
  const playBtn = document.getElementById("playBtn");

  const fill = document.getElementById("healthfill");
  const text = document.getElementById("healthtext");

  function updateHealth(h) {
    fill.style.transform = `scaleX(${h / 100})`;
    text.textContent = `Health: ${Math.round(h)} / 100`;
  }

  const ammoEl = document.getElementById("ammo"); // optional: prefer existing element in DOM
  function ensureAmmoEl() {
    if (!ammoEl) {
      // if you didn't create an element in HTML, create one under start or HUD container
      const el = document.createElement("div");
      el.id = "ammo";
      el.className = "ammo-counter";
      // append to body or a HUD container - adjust per your markup
      document.body.appendChild(el);
      return el;
    }
    return ammoEl;
  }
  function updateAmmo(ammo, mag) {
    const el = ensureAmmoEl();
    el.textContent = `${ammo} / ${mag}`;
    // optional: hide if no gun
    if (ammo === null || ammo === undefined) el.style.display = "none";
    else el.style.display = "inline-block";
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

  return {
    playBtn,
    showStart,
    showWin,
    hideWin,
    showLose,
    hideLose,
    updateHealth,
    updateAmmo,
  };
}
