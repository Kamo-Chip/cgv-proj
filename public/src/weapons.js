// src/weapons.js
import * as THREE from "three";
import { WEAPON } from "./constants.js";
import { gridToWorld, worldToGrid } from "./utils.js";

// Simple registry for weapons. Extendable: add new types with their behaviour.
const WeaponTypes = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    color: 0x9fbfff,
    emissive: 0x2a49ff,
    kind: "projectile",
    ammoCap: 12,
    damage: 25,
    projectileSpeed: 30,
    projectileRadius: 0.12,
    projectileLife: 2.0,
    hudName: "Pistol",
  },
  knife: {
    id: "knife",
    name: "Knife",
    color: 0xffe08a,
    emissive: 0xffc94a,
    kind: "melee",
    ammoCap: Infinity,
    damage: 40,
    meleeRange: 1.0,
    hudName: "Knife",
  },
};

class WorldWeapon {
  constructor(type, gx, gy, scene, ammo) {
    this.type = type;
    this.gx = gx;
    this.gy = gy;
    this.taken = false;
    // ammo may be Infinity or a number; default to full capacity if not provided
    this.ammo = ammo === undefined ? (type.ammoCap === Infinity ? Infinity : type.ammoCap) : ammo;
    this.mesh = this._createMesh(type, gx, gy);
    scene.add(this.mesh);
  }
  _createMesh(type, gx, gy) {
    const w = gridToWorld(gx, gy);
    const group = new THREE.Group();

    // Shared material for weapon body parts using the type colors
    const bodyMat = new THREE.MeshStandardMaterial({
      color: type.color,
      emissive: type.emissive,
      roughness: 0.4,
      roughness: 0.4,
      metalness: 0.2,
    });

    if (type.id === "pistol") {
      // Simple stylized pistol made from boxes + a small barrel cylinder
      const bodyGeo = new THREE.BoxGeometry(0.36, 0.12, 0.16);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      body.position.set(0, 0.02, 0);
      group.add(body);

      const barrelGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.36, 10);
      const barrel = new THREE.Mesh(barrelGeo, bodyMat);
      barrel.castShadow = true;
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(0.18, 0.02, 0);
      group.add(barrel);

      const gripGeo = new THREE.BoxGeometry(0.10, 0.18, 0.06);
      const grip = new THREE.Mesh(gripGeo, bodyMat);
      grip.castShadow = true;
      grip.position.set(-0.12, -0.06, 0);
      grip.rotation.z = -Math.PI / 12;
      group.add(grip);

      // small sight detail
      const sightGeo = new THREE.BoxGeometry(0.06, 0.03, 0.02);
      const sight = new THREE.Mesh(sightGeo, bodyMat);
      sight.castShadow = true;
      sight.position.set(0.05, 0.07, 0);
      group.add(sight);
    } else if (type.id === "knife") {
      // Knife: thin metallic blade + colored handle
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0xdddddd, roughness: 0.18, metalness: 0.9 });
      const bladeGeo = new THREE.BoxGeometry(0.04, 0.02, 0.72);
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.castShadow = true;
      blade.position.set(0, 0.02, 0);
      group.add(blade);

      // tapered tip using a cone
      const tipGeo = new THREE.ConeGeometry(0.02, 0.08, 8);
      const tip = new THREE.Mesh(tipGeo, bladeMat);
      tip.castShadow = true;
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, 0.02, 0.36);
      group.add(tip);

      // handle
      const handleMat = new THREE.MeshStandardMaterial({ color: type.color, emissive: type.emissive, roughness: 0.6, metalness: 0.15 });
      const handleGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.16, 10);
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.castShadow = true;
      handle.rotation.z = Math.PI / 2;
      handle.position.set(-0.18, -0.03, 0);
      group.add(handle);
    } else {
      // fallback: keep the original simple cylinder so unknown types still work
      const geo = new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: type.color,
        emissive: type.emissive,
        emissiveIntensity: 0.6,
        roughness: 0.4,
        metalness: 0.1,
      });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.rotation.x = Math.PI / 2;
      m.position.set(w.x, 0.45, w.z);
      return m;
    }

    // position combined model on the ground similar to previous item
    group.position.set(w.x, 0.45, w.z);
    // lay flat so orientation matches previous objects
    group.rotation.x = Math.PI / 2;
    return group;
  }
}

export function initWeapons(scene, maze, walls, enemiesCtl, hud, camera) {
  // enemiesCtl is the controller returned by initEnemies so we can access enemies array
  const weapons = []; // world weapons scattered
  const equipped = { weapon: null, ammo: 0 };
  const projectiles = [];
  const ray = new THREE.Raycaster();

  let lastKeyTime = 0;
  const KEY_COOLDOWN = 200; // ms, simple debounce to avoid jitter from key repeats
  let ignoreHintUntil = 0;

  function scatter() {
    for (const w of weapons) scene.remove(w.mesh);
    weapons.length = 0;

    const H = maze.length,
      W = maze[0].length;
    const cells = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) if (maze[y][x] === 1) cells.push({ x, y });

    // shuffle
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    let placed = 0;
    const minCellGap = 3;
    const chosen = [];
    const types = Object.keys(WeaponTypes);
    for (const c of cells) {
      if (placed >= WEAPON.COUNT) break;
      const ok = chosen.every((d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) >= minCellGap);
      if (!ok) continue;
      chosen.push(c);
      const typeName = types[placed % types.length];
      // initialize world weapon with full ammo
      const fullAmmo = WeaponTypes[typeName].ammoCap === Infinity ? Infinity : WeaponTypes[typeName].ammoCap;
      weapons.push(new WorldWeapon(WeaponTypes[typeName], c.x, c.y, scene, fullAmmo));
      placed++;
    }
  }

  // Find nearest world weapon within pickup radius and roughly in front of camera
  function getWeaponUnderCrosshair(cameraRef) {
    if (performance.now() < ignoreHintUntil) return null;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraRef.quaternion);
    forward.y = 0;
    forward.normalize();
    let best = null;
    for (let i = 0; i < weapons.length; i++) {
      const w = weapons[i];
      if (w.taken) continue;
      const wp = w.mesh.position;
      const dx = wp.x - cameraRef.position.x;
      const dz = wp.z - cameraRef.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > WEAPON.PICKUP_RADIUS) continue;
      const dirTo = new THREE.Vector3(dx, 0, dz).normalize();
      const dot = forward.dot(dirTo);
      // require weapon to be roughly in front (small cone). Threshold 0.92 ~ ~23deg
      if (dot < 0.92) continue;
      if (!best || dist < best.dist) best = { weapon: w, index: i, dist };
    }
    return best;
  }

  // drop currently equipped weapon into the world at the player's location
  function dropEquipped() {
    if (!equipped.weapon) return;
    const here = worldToGrid(camera.position.x, camera.position.z);
    // preserve remaining ammo on drop
    const dropped = new WorldWeapon(equipped.weapon, here.gx, here.gy, scene, equipped.ammo);
    weapons.push(dropped);
    equipped.weapon = null;
    equipped.ammo = 0;
    if (hud?.updateWeapon) hud.updateWeapon(equipped);
  }

  // E key behavior: pick up when aiming at a weapon and in range, otherwise drop equipped
  function onKey(e) {
    if (e.key.toLowerCase() !== "e") return;
    if (e.repeat) return; // ignore OS key repeat; require discrete presses
    const now = performance.now();
    if (now - lastKeyTime < KEY_COOLDOWN) return;
    lastKeyTime = now;
    const found = getWeaponUnderCrosshair(camera);
    if (found && found.dist <= WEAPON.PICKUP_RADIUS) {
      // There is a weapon under crosshair and we are close enough
      if (!equipped.weapon) {
        // equip the found weapon
        const w = found.weapon;
        // mark taken to avoid race
        w.taken = true;
        // remove world weapon
        scene.remove(w.mesh);
        weapons.splice(found.index, 1);
        equipped.weapon = w.type;
        // restore ammo from the world weapon (preserves partial ammo)
        equipped.ammo = w.ammo === undefined ? (w.type.ammoCap === Infinity ? Infinity : w.type.ammoCap) : w.ammo;
        ignoreHintUntil = performance.now() + 300;
        if (hud?.updateWeapon) hud.updateWeapon(equipped);
      } else {
        // already have a weapon: drop current at player's position (do NOT auto-equip the targeted one)
        dropEquipped();
        ignoreHintUntil = performance.now() + 300;
      }
    } else {
      // not aiming at a weapon: drop equipped if any
      if (equipped.weapon) dropEquipped();
    }
  }
  addEventListener("keydown", onKey);

  function fire(enemiesCtlRef) {
    // returns true if we handled a fire (projectile or melee) and prevented raycast fallback
    if (!equipped.weapon) return false;
    const wt = equipped.weapon;
    if (wt.kind === "projectile") {
      if (equipped.ammo <= 0) return false; // no ammo => fall back to unarmed attack
      // spawn projectile
      const pos = camera.position.clone();
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
      const spawn = pos.clone().add(dir.clone().multiplyScalar(0.6));
      const geo = new THREE.SphereGeometry(wt.projectileRadius, 8, 8);
      const mat = new THREE.MeshStandardMaterial({ color: wt.color, emissive: wt.emissive });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.position.copy(spawn);
      scene.add(m);
      projectiles.push({ mesh: m, vel: dir.clone().multiplyScalar(wt.projectileSpeed), life: wt.projectileLife, dmg: wt.damage, type: wt });
      if (equipped.ammo !== Infinity) equipped.ammo = Math.max(0, equipped.ammo - 1);
      if (hud?.updateWeapon) hud.updateWeapon(equipped);
      return true;
    } else if (wt.kind === "melee") {
      // melee: apply instant damage to enemies within range
      const range = wt.meleeRange || 1.0;
      const pdx = camera.position.x;
      const pdz = camera.position.z;
      const enemies = enemiesCtl.enemies;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(pdx - e.mesh.position.x, pdz - e.mesh.position.z);
        if (d <= range) {
          e.hp -= wt.damage;
          e.hitFlash = 0.2;
          if (e.hp <= 0 && !e.dead) e.dead = true;
        }
      }
      return true;
    }
    return false;
  }

  function update(dt, player, cameraRef, enemiesCtlRef) {
    // animate world weapons
    for (const w of weapons) {
      if (!w.taken) {
        w.mesh.rotation.z += dt * 1.2;
        w.mesh.position.y = 0.45 + Math.sin(performance.now() * 0.003 + w.gx * 13.3) * 0.05;
      }
    }

    // action hint update: show pickup/drop hint if aiming at a weapon
    const hint = document.getElementById("actionHint");
    const found = getWeaponUnderCrosshair(cameraRef);
    if (hint) {
      if (found && found.dist <= WEAPON.PICKUP_RADIUS) {
        hint.textContent = equipped.weapon ? "Drop Weapon (E)" : "Pick Up Weapon (E)";
        hint.classList.add("show");
      } else {
        hint.classList.remove("show");
      }
    }

    // update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const prev = p.mesh.position.clone();
      const travel = p.vel.clone().multiplyScalar(dt);
      const next = prev.clone().add(travel);

      // raycast from prev towards next for enemies & walls
      ray.set(prev, p.vel.clone().normalize());
      ray.far = travel.length();

      // enemies
      const aliveMeshes = enemiesCtl.enemies.filter((e) => !e.dead).map((e) => e.mesh);
      const hitE = ray.intersectObjects(aliveMeshes, false);
      if (hitE.length) {
        const hit = hitE[0];
        const enemy = enemiesCtl.enemies.find((ee) => ee.mesh === hit.object);
        if (enemy) {
          enemy.hp -= p.dmg;
          enemy.hitFlash = 0.2;
          enemy.mesh.scale.setScalar(1.12);
          setTimeout(() => enemy.mesh.scale.setScalar(1), 80);
          if (enemy.hp <= 0 && !enemy.dead) enemy.dead = true;
        }
        // remove projectile
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
        continue;
      }

      // walls
      // walls: walls here is an array of AABB objects (not Three.js meshes),
      // so do a manual AABB vs point check for the projectile's next position.
      let hitWall = false;
      for (const wa of walls) {
        const cx = Math.max(wa.min.x, Math.min(next.x, wa.max.x));
        const cz = Math.max(wa.min.z, Math.min(next.z, wa.max.z));
        const ddx = next.x - cx;
        const ddz = next.z - cz;
        if (ddx * ddx + ddz * ddz < (p.type.projectileRadius || 0.12) * (p.type.projectileRadius || 0.12)) {
          hitWall = true;
          break;
        }
      }
      if (hitWall) {
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
        continue;
      }

      // advance
      p.mesh.position.copy(next);
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
      }
    }

    // HUD update
    if (hud?.updateWeapon) hud.updateWeapon(equipped);
  }

  function reset(player) {
    for (const w of weapons) scene.remove(w.mesh);
    weapons.length = 0;
    for (const p of projectiles) scene.remove(p.mesh);
    projectiles.length = 0;
    equipped.weapon = null;
    equipped.ammo = 0;
    scatter();
    if (hud?.updateWeapon) hud.updateWeapon(equipped);
  }

  // initial scatter
  scatter();

  return { weapons, projectiles, update, reset, fire, dropEquipped };
}
