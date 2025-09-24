// src/lightsaber.js
import * as THREE from 'three';
import { WEAPON } from './constants.js';
import { gridToWorld } from './utils.js';

function cellId(x, y) { return `${x},${y}`; }

export function initLightsaber(scene, maze, opts = {}) {
  // ----- State -----
  let collected = false;

  // World pickup (group at world position)
  let pickupGroup = null;

  // First-person viewmodel (attached to camera)
  let viewGroup = null;
  let viewParentCamera = null;
  let swingT = 0; // 0..1 animation timer

  // ----- HUD chip -----
  const hudWrap = document.getElementById('powerupsHud');
  const saberHud = document.createElement('div');
  saberHud.style.cssText = `
    padding: 4px 8px;
    border-radius: 8px;
    background: #142131;
    border: 1px solid #2c3a4d;
    font-size: 12px;
  `;
  if (hudWrap) hudWrap.appendChild(saberHud);
  const setHud = () => { saberHud.textContent = collected ? 'Saber: ready' : 'Saber: not found'; };

  // ----- Builders -----
  function buildSaberMesh({ bladeLen = 0.9, bladeRadius = 0.028 }) {
    const hiltH = 0.38;

    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, hiltH, 24),
      new THREE.MeshStandardMaterial({ color: 0x222629, metalness: 0.75, roughness: 0.25 })
    );
    hilt.position.y = hiltH / 2;

    const emitter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0x9aa7b0, metalness: 0.6, roughness: 0.35 })
    );
    emitter.position.y = hiltH + 0.03;

    const blade = new THREE.Mesh(
      new THREE.CylinderGeometry(bladeRadius, bladeRadius, bladeLen, 16),
      new THREE.MeshStandardMaterial({
        color: 0x6ff7ff,
        emissive: 0x33c9ff,
        emissiveIntensity: 1.2,
        roughness: 0.1
      })
    );
    blade.position.y = hiltH + 0.03 + bladeLen / 2;

    const g = new THREE.Group();
    g.add(hilt, emitter, blade);
    return { group: g, blade, hilt };
  }

  function spawnPickup() {
    const H = maze.length, W = maze[0].length;
    const excluded = new Set(opts.excludeCells || []);
    excluded.add(cellId(1, 1)); // player start

    const cells = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (maze[y][x] === 1 && !excluded.has(cellId(x, y))) cells.push({ x, y });
      }
    }
    if (!cells.length) return;

    const pick = cells[Math.floor(Math.random() * cells.length)];
    const { x, y } = pick;
    const { x: wx, z: wz } = gridToWorld(x, y);

    const { group: saber } = buildSaberMesh({ bladeLen: 1.1, bladeRadius: 0.03 });
    saber.position.set(0, 0, 0);     // local to parent
    saber.rotation.z = -0.25;        // slight lean
    saber.traverse(o => { if (o.isMesh) o.castShadow = true; });

    // (Optional) beacon above it
    const beacon = new THREE.Mesh(
      new THREE.ConeGeometry(0.10, 0.28, 16),
      new THREE.MeshStandardMaterial({ color: 0x9ff5ff, emissive: 0x44ccff, emissiveIntensity: 1.0, roughness: 0.2 })
    );
    beacon.position.set(0, 0.9, 0);
    beacon.userData.bobSeed = Math.random() * 1000;

    const light = new THREE.PointLight(0x66ddff, 1.0, 4.5, 2.0);
    light.position.set(0, 0.85, 0);

    pickupGroup = new THREE.Group();
    pickupGroup.position.set(wx, 0, wz);
    pickupGroup.add(saber, beacon, light);
    scene.add(pickupGroup);

    console.log('[lightsaber] pickup at grid', pick, 'world', { x: wx, z: wz });
  }

  function removePickup() {
    if (!pickupGroup) return;
    scene.remove(pickupGroup);
    pickupGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) o.material.dispose?.();
    });
    pickupGroup = null;
  }

  function ensureViewModel(camera) {
    if (viewGroup) return;

    const { group, blade } = buildSaberMesh({ bladeLen: 0.9, bladeRadius: 0.028 });

    // Always-on-top, no fog/depth
    group.renderOrder = 9999;
    group.traverse(o => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
        o.material.depthTest = false;
        o.material.depthWrite = false;
        o.material.fog = false;
      }
    });

    // Camera space pose
    group.position.set(0.28, -0.22, -0.8); // tweak Z if near-plane clips
    group.rotation.set(-0.15, 0.25, 0.55);
    group.userData.blade = blade;

    viewGroup = group;
    viewParentCamera = camera;
    camera.add(viewGroup);
  }

  function pickup(camera) {
    collected = true;
    setHud();
    if (pickupGroup) {
      pickupGroup.scale.setScalar(1.2);
      setTimeout(removePickup, 90);
    }
    ensureViewModel(camera);
  }

  // ----- Public methods implemented BEFORE return -----

  function update(dt, camera) {
    // Animate pickup beacon + proximity
    if (pickupGroup) {
      const beacon = pickupGroup.children.find(o => o.isMesh && o.geometry?.type === 'ConeGeometry');
      if (beacon) {
        const t = performance.now() * 0.003 + (beacon.userData.bobSeed || 0);
        beacon.position.y = 0.9 + Math.sin(t) * 0.06;
        beacon.rotation.y += dt * 1.7;
      }
      const p = pickupGroup.position;
      const d = Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
      if (d <= WEAPON.SABER.PICKUP_RADIUS) pickup(camera);
    }

    // Viewmodel animation (always updates if we have it)
    if (viewGroup) {
      if (swingT > 0) {
        swingT = Math.max(0, swingT - dt * 4.0); // return speed
        const swingAmt = Math.sin((1 - swingT) * Math.PI) * 0.65;

        const baseRotX = -0.15, baseRotY = 0.25, baseRotZ = 0.55;
        const basePos = { x: 0.28, y: -0.22, z: -0.8 };

        viewGroup.rotation.set(
          baseRotX + swingAmt * 0.30,
          baseRotY,
          baseRotZ + swingAmt * 0.80
        );
        viewGroup.position.set(
          basePos.x + swingAmt * 0.03,
          basePos.y + swingAmt * -0.02,
          basePos.z
        );

        const blade = viewGroup.userData.blade;
        if (blade?.material) blade.material.emissiveIntensity = 1.2 + swingAmt * 0.8;
      }
    }
  }

  function swing() {
    if (!collected || !viewGroup) return;
    swingT = 1.0; // trigger full swing animation
  }

  function reset() {
    collected = false;
    setHud();
    if (viewGroup && viewParentCamera) {
      viewParentCamera.remove(viewGroup);
      viewGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) o.material.dispose?.();
      });
      viewGroup = null;
      viewParentCamera = null;
    }
    swingT = 0;
    removePickup();
    spawnPickup();
  }

  // ----- Init -----
  setHud();
  reset();

  // ----- API -----
  return {
    update,
    reset,
    swing, // <<— ensure this exists BEFORE returning it
    get collected() { return collected; },
  };
}
