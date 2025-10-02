# CGV Project — public/

Overview
- Small 3D maze shooter built with Three.js. The `public/` folder contains the playable web app (HTML + ES modules under `src/`).
- Entry point: `index.html` which imports the JS modules from `src/`.

Quick structure
- `index.html` — app entry that loads the JavaScript modules and the canvas.
- `src/main.js` — application bootstrap: renderer, camera, game loop and wiring of subsystems.
- `src/scene.js` — scene setup (lighting, ground, global objects).
- `src/constants.js` — global game constants (counts, distances, radii).
- `src/controls.js` — input handling (keyboard + mouse look/movement).
- `src/player.js` — player state and movement helpers.
- `src/maze.js` — maze generator and grid representation used for placement and collisions.
- `src/weapons.js` — weapon registry and world weapon logic (spawning, pickup/drop, projectiles, melee).
- `src/enemies.js` — enemy spawning, AI and health/hit logic.
- `src/powerups.js` — pickups (health, ammo, etc).
- `src/minimap.js` — minimap rendering.
- `src/ui.js` — HUD and DOM helpers.
- `src/utils.js` — utility helpers (`gridToWorld`, `worldToGrid`, math helpers).

How to run (development)
- Serve the `public/` folder over HTTP and open `index.html` in a modern browser. A simple static server is sufficient (e.g. `python -m http.server` in `public/`, or any dev server).

Runtime flow
- `main.js` initializes systems (maze, enemies, weapons, UI) and repeatedly calls `update(dt, ...)` on each subsystem.
- Subsystems typically export an `init` or return an API object with `update`, `reset`, etc.
- Weapons: call `initWeapons(scene, maze, walls, enemiesCtl, hud, camera)` to get `{ weapons, projectiles, update, reset, fire, dropEquipped }`.

Extending
- Add a weapon: extend `WeaponTypes` in `src/weapons.js` and add a matching visual in `WorldWeapon._createMesh`. Implement custom firing behavior in `initWeapons().fire` if needed.
- Add enemy types: modify `src/enemies.js` but preserve the contract used elsewhere (enemy objects expose `.mesh`, `.hp`, `.dead`, etc).

Debugging tips
- Inspect `scene.children` in the browser console to find objects.
- Check returned objects from init functions (e.g., `weapons.projectiles`) for runtime state.
- Projectile collisions use Three.js raycasts for enemies and manual AABB checks for walls (see `src/weapons.js`).

Notes
- HUD updates are optional (guarded by `hud?.updateWeapon`) so subsystems can run headless for testing.
- Keep shared contracts (enemy shape, grid/world conversions) intact when refactoring.

If you want, I can add a short CONTRIBUTING or a checklist to add new weapons/enemies.
