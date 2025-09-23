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

  return {
    playBtn,
    showStart,
    showWin,
    hideWin,
    showLose,
    hideLose,
    updateHealth,
  };
}
