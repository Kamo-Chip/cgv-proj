// src/minimap.js
import { MINIMAP } from "./constants.js";
import { worldToGrid, gridToWorld } from "./utils.js";

export function createMinimap(
  maze,
  goal,
  enemiesRef,
  powerupsRef,
  weaponsRef,
  camera,
  look,
  getCompassState
) {
  const canvas = document.getElementById("minimap");
  const TILE = MINIMAP.TILE,
    PAD = MINIMAP.PAD;
  canvas.width = maze[0].length * TILE + PAD * 2;
  canvas.height = maze.length * TILE + PAD * 2;
  const mm = canvas.getContext("2d");

  // Helper to draw a tiny key icon centered at (x, y)
  function drawKeyIcon(ctx, x, y, tileSize, {
    fill = "#00a6ffff",
    stroke = "#167d94ff",
    glow = true,
  } = {}) {
    const S = Math.max(8, tileSize * 0.95); // overall size clamp
    const r = S * 0.22; // ring radius
    const shankL = S * 0.55; // shank length
    const shankH = Math.max(2, S * 0.12); // shank thickness
    const toothW = Math.max(2, S * 0.16);
    const toothH = Math.max(2, S * 0.18);

    ctx.save();
    if (glow) {
      ctx.shadowColor = fill;
      ctx.shadowBlur = 6;
    }

    // Bow (ring)
    ctx.beginPath();
    ctx.arc(x - S * 0.25, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, S * 0.06);
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // Shank
    const sx = x - S * 0.02;
    const sy = y - shankH / 2;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, S * 0.06);
    ctx.beginPath();
    ctx.rect(sx, sy, shankL, shankH);
    ctx.fill();
    ctx.stroke();

    // Teeth (two notches at the far end)
    const tx = sx + shankL - toothW;
    ctx.beginPath();
    ctx.rect(tx, y - shankH / 2 - toothH * 0.2, toothW, toothH);
    ctx.rect(tx - toothW * 0.85, y - shankH / 2 + toothH * 0.05, toothW, toothH);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function draw() {
    const width = canvas.width,
      height = canvas.height;
    mm.clearRect(0, 0, width, height);
    mm.fillStyle = "rgba(10,14,20,0.95)";
    mm.fillRect(0, 0, width, height);

    const g = worldToGrid(camera.position.x, camera.position.z);
    const px = PAD + (g.gx + 0.5) * TILE;
    const py = PAD + (g.gy + 0.5) * TILE;
    const R = MINIMAP.RADIUS_TILES * TILE;

    mm.save();
    mm.beginPath();
    mm.arc(px, py, R, 0, Math.PI * 2);
    mm.clip();

    // walls
    mm.fillStyle = "#1e2a3a";
    for (let y = 0; y < maze.length; y++) {
      for (let x = 0; x < maze[0].length; x++) {
        if (maze[y][x] === 0) {
          const cx = PAD + (x + 0.5) * TILE;
          const cy = PAD + (y + 0.5) * TILE;
          const dx = cx - px,
            dy = cy - py;
          if (dx * dx + dy * dy <= R * R) {
            mm.fillRect(PAD + x * TILE, PAD + y * TILE, TILE, TILE);
          }
        }
      }
    }

    // goal (if within radius)
    const goalG = worldToGrid(goal.position.x, goal.position.z);
    const gx = PAD + goalG.gx * TILE + 2;
    const gy = PAD + goalG.gy * TILE + 2;
    const gcx = gx + (TILE - 4) / 2,
      gcy = gy + (TILE - 4) / 2;
    if ((gcx - px) ** 2 + (gcy - py) ** 2 <= R * R) {
      mm.fillStyle = "#46ff7a";
      mm.fillRect(gx, gy, TILE - 4, TILE - 4);
    }

    // enemies
    if (enemiesRef?.length) {
      for (const e of enemiesRef) {
        const eg = worldToGrid(e.mesh.position.x, e.mesh.position.z);
        const cx = PAD + (eg.gx + 0.5) * TILE;
        const cy = PAD + (eg.gy + 0.5) * TILE;
        if ((cx - px) ** 2 + (cy - py) ** 2 > R * R) continue;
        mm.fillStyle = "rgba(255,82,82,0.8)";
        mm.fillRect(
          PAD + eg.gx * TILE + 3,
          PAD + eg.gy * TILE + 3,
          TILE - 6,
          TILE - 6
        );
      }
    }

    // powerups (if you wire them in)
    if (powerupsRef?.length) {
      for (const p of powerupsRef) {
        if (p.taken) continue;
        const w = gridToWorld(p.gx, p.gy);
        const pg = worldToGrid(w.x, w.z);
        const cx = PAD + (pg.gx + 0.5) * TILE;
        const cy = PAD + (pg.gy + 0.5) * TILE;
        if ((cx - px) ** 2 + (cy - py) ** 2 > R * R) continue;
        const kind = p.mesh?.userData?.kind;
        const isCompass = kind === "compass";
        mm.fillStyle = isCompass ? "rgba(72,255,214,0.95)" : "#7c9cff";
        mm.fillRect(
          PAD + pg.gx * TILE + 3,
          PAD + pg.gy * TILE + 3,
          TILE - 6,
          TILE - 6
        );
      }
    }

    // weapons (if wired in)
    if (weaponsRef?.length) {
      mm.fillStyle = "#ffd36b";
      for (const w of weaponsRef) {
        if (w.taken) continue;
        const ww = gridToWorld(w.gx, w.gy);
        const pg = worldToGrid(ww.x, ww.z);
        const cx = PAD + (pg.gx + 0.5) * TILE;
        const cy = PAD + (pg.gy + 0.5) * TILE;
        if ((cx - px) ** 2 + (cy - py) ** 2 > R * R) continue;
        mm.fillRect(PAD + pg.gx * TILE + 3, PAD + pg.gy * TILE + 3, TILE - 6, TILE - 6);
      }
    }

    // keys (if wired in) — draw a key icon instead of a square
    if (window.keyMeshes?.length) {
      for (const k of window.keyMeshes) {
        const w = k.mesh.position;
        const pg = worldToGrid(w.x, w.z);
        const cx = PAD + (pg.gx + 0.5) * TILE;
        const cy = PAD + (pg.gy + 0.5) * TILE;
        if ((cx - px) ** 2 + (cy - py) ** 2 > R * R) continue;
        drawKeyIcon(mm, cx, cy, TILE, { fill: "#00a6ffff", stroke: "#167d94ff" });
      }
    }

    // player dot + facing
    mm.fillStyle = "#e6f0ff";
    mm.beginPath();
    mm.arc(px, py, Math.max(2, TILE * 0.25), 0, Math.PI * 2);
    mm.fill();
    const dirLen = TILE * 0.7;
    const dx = -Math.sin(look.yaw) * dirLen;
    const dy = -Math.cos(look.yaw) * dirLen;
    mm.strokeStyle = "#9ad1ff";
    mm.lineWidth = 2;
    mm.beginPath();
    mm.moveTo(px, py);
    mm.lineTo(px + dx, py + dy);
    mm.stroke();

    const compassState = typeof getCompassState === "function" ? getCompassState() : null;
    if (compassState?.active && compassState.timeLeft > 0) {
      const intensity = compassState.duration > 0 ? compassState.timeLeft / compassState.duration : 1;
      const arrowAlpha = 0.45 + 0.45 * Math.max(0, Math.min(1, intensity));
      const goalCenterX = PAD + (goalG.gx + 0.5) * TILE;
      const goalCenterY = PAD + (goalG.gy + 0.5) * TILE;
      let adx = goalCenterX - px;
      let ady = goalCenterY - py;
      const dist = Math.hypot(adx, ady) || 1;
      adx /= dist;
      ady /= dist;
      const arrowRadius = Math.min(R - 6, dist);
      const arrowX = px + adx * arrowRadius;
      const arrowY = py + ady * arrowRadius;

      mm.save();
      mm.translate(arrowX, arrowY);
      mm.rotate(Math.atan2(ady, adx));
      mm.fillStyle = `rgba(72,255,214,${arrowAlpha.toFixed(3)})`;
      mm.beginPath();
      mm.moveTo(0, 0);
      mm.lineTo(-TILE * 0.6, TILE * 0.35);
      mm.lineTo(-TILE * 0.6, -TILE * 0.35);
      mm.closePath();
      mm.fill();
      mm.restore();

      const pulseRadius = Math.max(TILE * 0.6, Math.min(TILE * 1.1, R * 0.3));
      const pulseAlpha = 0.2 + 0.25 * Math.sin(performance.now() * 0.008) * Math.max(0.4, intensity);
      mm.beginPath();
      mm.arc(px, py, pulseRadius, 0, Math.PI * 2);
      mm.strokeStyle = `rgba(72,255,214,${pulseAlpha.toFixed(3)})`;
      mm.lineWidth = 2;
      mm.stroke();
    }

    mm.restore();

    mm.beginPath();
    mm.arc(px, py, R, 0, Math.PI * 2);
    mm.strokeStyle = "rgba(154,209,255,0.25)";
    mm.lineWidth = 2;
    mm.stroke();

    mm.strokeStyle = "rgba(255,255,255,0.15)";
    mm.lineWidth = 1;
    mm.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  return { draw };
}