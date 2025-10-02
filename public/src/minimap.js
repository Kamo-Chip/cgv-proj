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
  look
) {
  const canvas = document.getElementById("minimap");
  const TILE = MINIMAP.TILE,
    PAD = MINIMAP.PAD;
  canvas.width = maze[0].length * TILE + PAD * 2;
  canvas.height = maze.length * TILE + PAD * 2;
  const mm = canvas.getContext("2d");

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
      mm.fillStyle = "#7c9cff";
      for (const p of powerupsRef) {
        if (p.taken) continue;
        const w = gridToWorld(p.gx, p.gy);
        const pg = worldToGrid(w.x, w.z);
        const cx = PAD + (pg.gx + 0.5) * TILE;
        const cy = PAD + (pg.gy + 0.5) * TILE;
        if ((cx - px) ** 2 + (cy - py) ** 2 > R * R) continue;
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

    // keys (if you wire them in)
    if (window.keyMeshes?.length) {
      mm.fillStyle = "#ffff00"; // bright yellow for keys
      for (const k of window.keyMeshes) {
        const w = k.mesh.position;
        const pg = worldToGrid(w.x, w.z);
        const cx = PAD + (pg.gx + 0.5) * TILE;
        const cy = PAD + (pg.gy + 0.5) * TILE;
        if ((cx - px) ** 2 + (cy - py) ** 2 > R * R) continue;
        mm.fillRect(cx - TILE * 0.2, cy - TILE * 0.2, TILE * 0.4, TILE * 0.4);
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

  return { draw };
}
