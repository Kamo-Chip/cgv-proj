// src/lightsaber.js
import * as THREE from 'three';
import { WEAPON } from './constants.js';
import { gridToWorld } from './utils.js';

function cellId(x, y) { return `${x},${y}`; }

export function initLightsaber(scene, maze, opts = {}) {
  let collected = false;

  // World pickup (group at world position)
  let pickupGroup = null;

  // First-person viewmodel (attached to camera)
  let viewGroup = null;
  let viewParentCamera = null;
  let swingT = 0; // 0..1 animation timer (counts down)

  // HUD chip
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

  // ---------- builders ----------
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

  // lightweight arm
  function buildArmMesh() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.7, metalness: 0.0 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.8, metalness: 0.0 });

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.42, 16), sleeveMat);
    const wristRing = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.02, 12, 24), sleeveMat);
    wristRing.rotation.x = Math.PI * 0.5;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.22), skin);

    const arm = new THREE.Group();
    forearm.castShadow = hand.castShadow = false;
    forearm.receiveShadow = hand.receiveShadow = false;

    arm.add(forearm);
    forearm.position.set(0, -0.08, -0.05);

    const wristNode = new THREE.Group();
    wristNode.add(wristRing);
    wristNode.position.set(0, -0.23, -0.05);
    arm.add(wristNode);

    const handNode = new THREE.Group();
    handNode.add(hand);
    handNode.position.set(0.04, -0.31, 0.05);
    arm.add(handNode);

    return { group: arm, nodes: { wristNode, handNode } };
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
    const { x: wx, z: wz } = gridToWorld(pick.x, pick.y);

    const { group: saber } = buildSaberMesh({ bladeLen: 1.1, bladeRadius: 0.03 });
    saber.position.set(0, 0, 0);
    saber.rotation.z = -0.25;
    saber.traverse(o => { if (o.isMesh) o.castShadow = true; });

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

    const { group: saber, blade } = buildSaberMesh({ bladeLen: 0.9, bladeRadius: 0.028 });
    const arm = buildArmMesh();

    const group = new THREE.Group();
    group.add(arm.group);
    group.add(saber);

    // always on top
    group.renderOrder = 9999;
    group.traverse(o => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = false;
        o.frustumCulled = false;
        o.material.depthTest = false;
        o.material.depthWrite = false;
        o.material.fog = false;
      }
    });

    // base camera-space pose
    const base = {
      pos: new THREE.Vector3(0.32, -0.26, -1.15),
      rot: new THREE.Euler(-0.15, 0.25, 0.55),
    };
    group.position.copy(base.pos);
    group.rotation.copy(base.rot);

    // position saber relative to arm (grip alignment)
    saber.position.set(0.06, -0.02, -0.06);
    saber.rotation.set(-0.12, 0.4, 0.85);

    group.userData = { blade, base, armNodes: arm.nodes };

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

  // ---------- loop ----------
  function update(dt, camera) {
    // beacon + proximity
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

    // saber+arm swing
    if (viewGroup) {
      if (swingT > 0) {
        swingT = Math.max(0, swingT - dt * 2.5); // ~250ms total
        const phase = 1 - swingT;                 // 0→1
        const swingAmt = Math.sin(Math.min(phase, 1) * Math.PI); // 0..1..0
        const strong = 1.25;

        const { base, armNodes, blade } = viewGroup.userData;

        viewGroup.rotation.set(
          base.rot.x + swingAmt * 0.55 * strong,
          base.rot.y + swingAmt * 0.25 * strong,
          base.rot.z + swingAmt * 1.35 * strong
        );
        viewGroup.position.set(
          base.pos.x + swingAmt * 0.06 * strong,
          base.pos.y + swingAmt * -0.03 * strong,
          base.pos.z + swingAmt * -0.03 * strong
        );

        if (armNodes) {
          armNodes.wristNode.rotation.z = -swingAmt * 0.35 * strong;
          armNodes.handNode.rotation.x =  swingAmt * 0.25 * strong;
          armNodes.handNode.rotation.y =  swingAmt * 0.15 * strong;
        }

        if (blade?.material) blade.material.emissiveIntensity = 1.2 + swingAmt * 0.9;
      } else {
        const blade = viewGroup.userData?.blade;
        if (blade?.material && blade.material.emissiveIntensity > 1.2) {
          blade.material.emissiveIntensity = THREE.MathUtils.lerp(blade.material.emissiveIntensity, 1.2, 0.2);
        }
      }
    }
  }

  function swing() {
    if (!collected || !viewGroup) return;
    swingT = 1.0;
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

  // init
  setHud();
  reset();

  return {
    update,
    reset,
    swing,
    get collected() { return collected; },
  };
}
