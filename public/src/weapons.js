// src/weapons.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WEAPON } from "./constants.js";
import { gridToWorld, worldToGrid } from "./utils.js";
import { audio } from "./audio.js";

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
    this.ammo =
      ammo === undefined
        ? type.ammoCap === Infinity
          ? Infinity
          : type.ammoCap
        : ammo;
    this.mesh = this._createMesh(type, gx, gy);
    scene.add(this.mesh);
  }
  _createMesh(type, gx, gy) {
    // Create a placeholder Group positioned like previous items so other systems
    // can interact with it right away. The GLTF model will be loaded
    // asynchronously and inserted into this group when available.
    const w = gridToWorld(gx, gy);
  const group = new THREE.Group();
    group.position.set(w.x, 0.45, w.z);
    // keep the same base orientation as before (lay flat)
    group.rotation.x = 0;
  group.userData.typeId = type.id;
  group.userData.createAvatarAttachment = null;

    // Attempt to load a GLTF for this weapon. Expect files at ./models/weapons/<id>.glb
    const loader = new GLTFLoader();
    const url = `./models/weapons/${type.id}.glb`;

    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene || gltf.scenes?.[0];
        if (!model) {
          console.warn("GLTF has no scene:", url);
          return;
        }

        // make sure the model casts/receives shadows and is centered in the group
        model.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = true;
            n.receiveShadow = true;
            // ensure the weapon material has decent defaults if none provided
            if (!n.material)
              n.material = new THREE.MeshStandardMaterial({
                color: type.color,
                emissive: type.emissive,
              });
          }
        });

        // Apply a modest default scale so most models fit in the scene. Projects may
        // want to tweak per-model scale and orientation if needed.
        const DEFAULT_SCALE = 1.0;
        model.scale.setScalar(DEFAULT_SCALE);

        // Place the loaded model at the group's origin so existing code that
        // rotates/positions the group continues to work.
        model.position.set(0, 0, 0);

        // Some models may be authored with different forward/up axes. If you notice
        // orientation issues you can adjust model.rotation here (per type) e.g.
        // if (type.id === 'pistol') model.rotation.z = Math.PI/2;

        // Add the model to the placeholder group
        group.add(model);

        group.userData.createAvatarAttachment = () => {
          const clone = model.clone(true);
          clone.position.set(0, 0, 0);
          clone.rotation.set(0, 0, 0);
          clone.scale.setScalar(1);
          return clone;
        };
      },
      undefined,
      (err) => {
        // On error, fall back to a simple cylinder so the weapon is still visible.
        console.warn("Failed to load weapon GLTF:", url, err);
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
        // match base orientation used for this type (pistol is upright)
        m.rotation.x = type.id === "pistol" ? 0 : Math.PI / 2;
        m.position.set(0, 0, 0);
        group.add(m);

        group.userData.createAvatarAttachment = () => {
          const clone = m.clone(true);
          clone.position.set(0, 0, 0);
          clone.rotation.set(0, 0, 0);
          clone.scale.setScalar(1);
          return clone;
        };
      }
    );

    return group;
  }
}

export function initWeapons(scene, maze, walls, enemiesCtl, hud, camera, playerModel) {
  // ====== VIEWMODEL (attached to camera; reuses your existing meshes) ======
  const vm = (() => {
    const root = new THREE.Group();
    root.position.set(0.45, -0.38, -0.55); // bottom-right in camera space
    camera.add(root);
    if (!camera.parent) scene.add(camera); // safety: ensure camera is in scene

    const anim = new THREE.Group();
    root.add(anim);

    // Keep VM always visible on top and not culled (preserves your existing materials/maps)
    function markFpsOverlay(obj) {
      obj.traverse((n) => {
        if (n.isMesh) {
          n.renderOrder = 999;
          if (n.material) {
            n.material.depthTest = false;
            n.material.depthWrite = false;
            if ("toneMapped" in n.material) n.material.toneMapped = false;
          }
          n.frustumCulled = false;
        }
      });
    }

    // small ambient fill so the VM isn't too dark
    const vmLight = new THREE.AmbientLight(0xffffff, 0.8);
    root.add(vmLight);

    let slot = null; // current FPS model (a deep clone of your world mesh)

    /**
     * Clone and attach the given source mesh as the FPS view model.
     * @param {THREE.Object3D} sourceMesh - existing world mesh (with textures).
     * @param {{forwardAxis?: 'x'|'z', scale?: number}} opts
     */
    function setModelFrom(sourceMesh, { forwardAxis = "x", scale = 1.35 } = {}) {
      if (slot) { anim.remove(slot); slot = null; }
      // deep clone (preserve materials, textures, children)
      slot = sourceMesh.clone(true);

      // reset local transform and scale for FPS
      slot.position.set(0, 0, 0);
      slot.rotation.set(0, 0, 0);
      slot.scale.multiplyScalar(scale);

      // Orient so the weapon points forward (camera forward is -Z).
      // Most of your meshes point +X -> rotate -90° around Y.
      if (forwardAxis === "x") {
        slot.rotation.y = -Math.PI / 2;
      } else if (forwardAxis === "z") {
        // If your mesh faces +Z, flip around
        slot.rotation.y = Math.PI;
      }

      markFpsOverlay(slot);
      anim.add(slot);
    }

    function clearModel() {
      if (slot) { anim.remove(slot); slot = null; }
    }

    // Recoil / slash spring state (applied to 'anim' transform)
    const recoil = { z: 0, vz: 0, x: 0, vx: 0, rotX: 0, vrotX: 0 };
    const slash  = { t: 0, active: false, dur: 0.18, dir: 1 };

    function playRecoil() {
      recoil.vz    -= 2.6;                     // kick back
      recoil.vrotX -= 8.0 * (Math.PI / 180);   // slight tilt
      recoil.vx    += (Math.random() - 0.5) * 0.02;
    }

    function playSlash() {
      slash.active = true;
      slash.t = 0;
      slash.dir *= -1; // alternate direction
    }

    function tick(dt) {
      // Spring back to rest
      const kPos = 28, dPos = 10;
      const kRot = 40, dRot = 12;

      recoil.vz    += (-kPos * recoil.z    - dPos * recoil.vz)    * dt;
      recoil.z     += recoil.vz * dt;

      recoil.vx    += (-kPos * recoil.x    - dPos * recoil.vx)    * dt;
      recoil.x     += recoil.vx * dt;

      recoil.vrotX += (-kRot * recoil.rotX - dRot * recoil.vrotX) * dt;
      recoil.rotX  += recoil.vrotX * dt;

      anim.position.set(recoil.x, 0, recoil.z);
      anim.rotation.x = recoil.rotX;

      // Knife slash arc (applies on top of recoil)
      if (slash.active) {
        slash.t += dt;
        const t = Math.min(1, slash.t / slash.dur);
        const e = t < 0.5 ? (2 * t * t) : (1 - Math.pow(-2 * t + 2, 2) / 2); // ease in-out

        anim.position.x = recoil.x + 0.06 + 0.08 * e * slash.dir;
        anim.position.y = 0.00 + 0.05 * e;
        anim.position.z = recoil.z - 0.06 * e;
        anim.rotation.z = ( -25 * Math.PI/180 ) + (60 * Math.PI/180) * e * slash.dir;
        anim.rotation.x = recoil.rotX + ( -8 * Math.PI/180 ) * e;

        if (slash.t >= slash.dur) {
          slash.active = false;
          // reset extra offsets, keep recoil values
          anim.position.y = 0;
          anim.rotation.z = 0;
        }
      }
    }

    return { setModelFrom, clearModel, playRecoil, playSlash, tick };
  })();

  // ====== EXISTING WORLD-WEAPON SYSTEM ======
  const weapons = []; // scattered items in the maze
  const equipped = { weapon: null, ammo: 0 };
  const projectiles = [];
  const ray = new THREE.Raycaster();

  let lastKeyTime = 0;
  const KEY_COOLDOWN = 200;
  let ignoreHintUntil = 0;

  function scatter() {
    for (const w of weapons) scene.remove(w.mesh);
    weapons.length = 0;

    const H = maze.length, W = maze[0].length;
    const cells = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++)
        if (maze[y][x] === 1) cells.push({ x, y });

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
      const ok = chosen.every(
        (d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) >= minCellGap
      );
      if (!ok) continue;
      chosen.push(c);
      const typeName = types[placed % types.length];
      // initialize world weapon with full ammo
      const fullAmmo =
        WeaponTypes[typeName].ammoCap === Infinity
          ? Infinity
          : WeaponTypes[typeName].ammoCap;
      weapons.push(
        new WorldWeapon(WeaponTypes[typeName], c.x, c.y, scene, fullAmmo)
      );
      placed++;
    }
  }

  function getWeaponUnderCrosshair(cameraRef) {
    if (performance.now() < ignoreHintUntil) return null;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      cameraRef.quaternion
    );
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
      if (dot < 0.92) continue;
      if (!best || dist < best.dist) best = { weapon: w, index: i, dist };
    }
    return best;
  }

  function dropEquipped() {
    if (!equipped.weapon) return;
    const prevType = equipped.weapon;
    const here = worldToGrid(camera.position.x, camera.position.z);
    // preserve remaining ammo on drop
    const dropped = new WorldWeapon(
      equipped.weapon,
      here.gx,
      here.gy,
      scene,
      equipped.ammo
    );
    weapons.push(dropped);
    equipped.weapon = null;
    equipped.ammo = 0;
    vm.clearModel(); // hide FPS model
    avatar?.clearWeapon?.(prevType?.id || prevType);
    if (hud?.updateWeapon) hud.updateWeapon(equipped);
  }

  function onKey(e) {
    if (e.key.toLowerCase() !== "e") return;
    if (e.repeat) return;
    const now = performance.now();
    if (now - lastKeyTime < KEY_COOLDOWN) return;
    lastKeyTime = now;

    const found = getWeaponUnderCrosshair(camera);
    if (found && found.dist <= WEAPON.PICKUP_RADIUS) {
      if (!equipped.weapon) {
        const w = found.weapon;

        // 1) Show FPS view using your actual mesh & textures
        //    Most of your meshes are modeled facing +X in world -> forwardAxis: 'x'
        vm.setModelFrom(w.mesh, { forwardAxis: "x", scale: 1.35 });

        // 2) Remove the world pickup
        w.taken = true;
        scene.remove(w.mesh);
        weapons.splice(found.index, 1);

        equipped.weapon = w.type;
        // restore ammo from the world weapon (preserves partial ammo)
        equipped.ammo =
          w.ammo === undefined
            ? w.type.ammoCap === Infinity
              ? Infinity
              : w.type.ammoCap
            : w.ammo;
        ignoreHintUntil = performance.now() + 300;
        if (hud?.updateWeapon) hud.updateWeapon(equipped);
        try {
          audio.play(`${w.type.id}_pick`, { volume: 0.9 });
        } catch (e) {
          console.error("Failed to play pick sound:", e);
        }

        const attachmentFactory = w.mesh.userData?.createAvatarAttachment;
        const attachment =
          (typeof attachmentFactory === "function" && attachmentFactory()) ||
          w.mesh.clone(true);
        attachment.position.set(0, 0, 0);
        attachment.rotation.set(0, 0, 0);
        attachment.scale.set(1, 1, 1);
        avatar?.equipWeapon?.(w.type.id, attachment);
      } else {
        dropEquipped();
        ignoreHintUntil = performance.now() + 300;
      }
    } else {
      if (equipped.weapon) dropEquipped();
    }
  }
  addEventListener("keydown", onKey);

  const avatar = playerModel?.userData;

  function fire(enemiesCtl) {
    // returns true if we handled a fire (projectile or melee) and prevented raycast fallback
    if (!equipped.weapon) return false;
    const wt = equipped.weapon;

    if (wt.kind === "projectile") {
      if (equipped.ammo <= 0) {
        try {
          audio.play(`${wt.id}_dry`, { volume: 0.9 });
        } catch (e) {
          console.error("Failed to play dry fire sound:", e);
        }
        return false; // no ammo => fall back to unarmed attack
      }

      // muzzle shot
      try {
        audio.play(`pistol_attack`, { volume: 0.9 });
      } catch (e) {
        console.error("Failed to play sound:", e);
      }

      // spawn projectile
      const pos = camera.position.clone();
      const dir = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(camera.quaternion)
        .normalize();
      const spawn = pos.clone().add(dir.clone().multiplyScalar(0.6));
      const geo = new THREE.SphereGeometry(wt.projectileRadius, 8, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffa500,
        emissive: 0xffa500,
      });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.position.copy(spawn);
      scene.add(m);
      projectiles.push({
        mesh: m,
        vel: dir.clone().multiplyScalar(wt.projectileSpeed),
        life: wt.projectileLife,
        dmg: wt.damage,
        type: wt,
      });
      if (equipped.ammo !== Infinity)
        equipped.ammo = Math.max(0, equipped.ammo - 1);
      if (hud?.updateWeapon) hud.updateWeapon(equipped);

      // play recoil on gun fire
      vm.playRecoil();
      avatar?.triggerAction?.("shoot");

      return true;
    } else if (wt.kind === "melee") {
      // melee: apply instant damage to enemies within range
      try {
        audio.play(`knife_attack`, { volume: 0.9 });
      } catch (e) {
        console.error("Failed to play knife attack sound:", e);
      }
      const range = wt.meleeRange || 1.0;
      const pdx = camera.position.x;
      const pdz = camera.position.z;
      const enemies = enemiesCtl.enemies;
      let hitAny = false;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(pdx - e.mesh.position.x, pdz - e.mesh.position.z);
        if (d <= range) {
          hitAny = true;
          if (typeof enemiesCtl.applyDamage === "function") {
            enemiesCtl.applyDamage(e, wt.damage);
          } else {
            e.hp -= wt.damage;
            e.hitFlash = 0.5;
            e.mesh.scale.setScalar(1.2);
            setTimeout(() => e.mesh.scale.setScalar(1), 100);
            if (e.hp <= 0 && !e.dead) {
              e.dead = true;
            }
          }
        }
      }
      if (hitAny) {
        try {
          audio.play(`enemy_damage`, { volume: 0.9 });
        } catch (err) {
          console.error("Failed to play enemy damage sound:", err);
        }
      }

      // play knife slash/stab
      vm.playSlash();
      avatar?.triggerAction?.("sword");

      return true;
    }
    return false;
  }

  function update(dt, player, cameraRef, enemiesCtl) {
    // animate world weapons
    for (const w of weapons) {
      if (!w.taken) {
        // rotate around vertical axis so items spin upright
        w.mesh.rotation.y += dt * 1.2;
        w.mesh.position.y =
          0.45 + Math.sin(performance.now() * 0.003 + w.gx * 13.3) * 0.05;
      }
    }

    // action hint update
    const hint = document.getElementById("actionHint");
    const found = getWeaponUnderCrosshair(cameraRef);
    if (hint) {
      if (found && found.dist <= WEAPON.PICKUP_RADIUS) {
        hint.textContent = equipped.weapon
          ? "Drop Weapon (E)"
          : "Pick Up Weapon (E)";
        hint.classList.add("show");
      } else {
        hint.classList.remove("show");
      }
    }

    // projectiles update (unchanged)
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const prev = p.mesh.position.clone();
      const travel = p.vel.clone().multiplyScalar(dt);
      const next = prev.clone().add(travel);

      ray.set(prev, p.vel.clone().normalize());
      ray.far = travel.length();

      // enemies
      const aliveMeshes = enemiesCtl.enemies
        .filter((e) => !e.dead)
        .map((e) => e.mesh);
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

      // walls (AABB vs sphere)
      let hitWall = false;
      for (const wa of walls) {
        const cx = Math.max(wa.min.x, Math.min(next.x, wa.max.x));
        const cz = Math.max(wa.min.z, Math.min(next.z, wa.max.z));
        const ddx = next.x - cx;
        const ddz = next.z - cz;
        if (
          ddx * ddx + ddz * ddz <
          (p.type.projectileRadius || 0.12) * (p.type.projectileRadius || 0.12)
        ) {
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

    // tick FPS viewmodel
    if (equipped.weapon) vm.tick(dt);

    // HUD update
    if (hud?.updateWeapon) hud.updateWeapon(equipped);
  }

  function isEquipped() {
    return !!equipped.weapon;
  }

  function reset(player) {
    for (const w of weapons) scene.remove(w.mesh);
    weapons.length = 0;
    for (const p of projectiles) scene.remove(p.mesh);
    projectiles.length = 0;
    equipped.weapon = null;
    equipped.ammo = 0;
    scatter();
    vm.clearModel();
    avatar?.clearAllWeapons?.();
    if (hud?.updateWeapon) hud.updateWeapon(equipped);
  }

  // initial scatter
  scatter();

  return { weapons, projectiles, update, reset, fire, dropEquipped, isEquipped };
}


