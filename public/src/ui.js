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
  };
}
