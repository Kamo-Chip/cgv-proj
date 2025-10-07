// src/minimap.js
import { MINIMAP } from "./constants.js";
import { worldToGrid, gridToWorld } from "./utils.js";

export function createMinimap(
  maze,
  goal,
  enemiesRef,
  powerupsRef,
  camera,
  look
) {
  const canvas = document.getElementById("minimap");
  const TILE = MINIMAP.TILE,
    PAD = MINIMAP.PAD;
  canvas.width = maze[0].length * TILE + PAD * 2;
  canvas.height = maze.length * TILE + PAD * 2;
  const mm = canvas.getContext("2d");

  const compassState = {
    active: false,
    expireAt: 0,
    durationSec: 0,
  };

  function activateCompass(duration = 4) {
    compassState.active = true;
    compassState.durationSec = duration;
    compassState.expireAt = performance.now() + duration * 1000;
  }

  function clearCompass() {
    compassState.active = false;
    compassState.durationSec = 0;
    compassState.expireAt = 0;
  }

  function compassActive(nowTs) {
    if (!compassState.active) return false;
    if (nowTs > compassState.expireAt) {
      clearCompass();
      return false;
    }
    return true;
  }

  function draw() {
    const width = canvas.width,
      height = canvas.height;
    const now = performance.now();

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

    const hasCompassHint = compassActive(now);
    if (hasCompassHint) {
      const dirX = gcx - px;
      const dirY = gcy - py;
      const len = Math.hypot(dirX, dirY) || 1;
      const normX = dirX / len;
      const normY = dirY / len;
      const arrowLen = Math.min(R - 6, len);
      const endX = px + normX * arrowLen;
      const endY = py + normY * arrowLen;

      mm.strokeStyle = "rgba(255,244,122,0.92)";
      mm.lineWidth = Math.max(3.5, TILE * 0.6);
      mm.beginPath();
      mm.moveTo(px, py);
      mm.lineTo(endX, endY);
      mm.stroke();

      const head = 10;
      mm.fillStyle = "rgba(255,244,122,0.92)";
      mm.beginPath();
      mm.moveTo(endX, endY);
      mm.lineTo(
        endX - normX * head - normY * head * 0.6,
        endY - normY * head + normX * head * 0.6
      );
      mm.lineTo(
        endX - normX * head + normY * head * 0.6,
        endY - normY * head - normX * head * 0.6
      );
      mm.closePath();
      mm.fill();

      mm.strokeStyle = "rgba(18, 22, 26, 0.65)";
      mm.lineWidth = 1.5;
      mm.beginPath();
      mm.moveTo(px, py);
      mm.lineTo(endX, endY);
      mm.stroke();
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
        const cx = PAD + (p.gx + 0.5) * TILE;
        const cy = PAD + (p.gy + 0.5) * TILE;
        if ((cx - px) ** 2 + (cy - py) ** 2 > R * R) continue;

        const style = p.mapStyle || {};
        const ratio = typeof style.ratio === "number" ? style.ratio : 0.58;
        const size = Math.max(4, Math.min(TILE, ratio * TILE));
        const half = size / 2;

        if (p.kind === "compass" || style.shape === "compass") {
          const fill = style.fill || "#ffd95a";
          const stroke = style.stroke || "rgba(255,255,255,0.9)";
          const inner = style.inner || "rgba(11,13,18,0.45)";
          const radius = Math.max(4, half);

          mm.fillStyle = fill;
          mm.beginPath();
          mm.arc(cx, cy, radius, 0, Math.PI * 2);
          mm.fill();

          mm.lineWidth = Math.max(1.2, radius * 0.25);
          mm.strokeStyle = stroke;
          mm.beginPath();
          mm.arc(cx, cy, radius, 0, Math.PI * 2);
          mm.stroke();

          mm.strokeStyle = inner;
          mm.lineWidth = Math.max(1, radius * 0.35);
          mm.beginPath();
          mm.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
          mm.stroke();

          // simple NSEW needle
          mm.strokeStyle = stroke;
          mm.lineWidth = Math.max(1, radius * 0.2);
          mm.beginPath();
          mm.moveTo(cx, cy - radius * 0.9);
          mm.lineTo(cx, cy + radius * 0.9);
          mm.moveTo(cx - radius * 0.9, cy);
          mm.lineTo(cx + radius * 0.9, cy);
          mm.stroke();
        } else {
          const left = cx - half;
          const top = cy - half;
          mm.fillStyle = style.fill || "#7c9cff";
          mm.fillRect(left, top, size, size);
          if (style.stroke) {
            mm.strokeStyle = style.stroke;
            mm.lineWidth = 1;
            mm.strokeRect(left - 0.5, top - 0.5, size + 1, size + 1);
          }
        }
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

<<<<<<< Updated upstream
  return { draw };
}
=======
  return { draw, activateCompass, clearCompass };
}
>>>>>>> Stashed changes
