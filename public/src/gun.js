// src/gun.js
import * as THREE from "three";
import { Bullet } from "./bullet.js"; // reuse bullet.js from earlier or create minimal tracer

export class Gun {
  /**
   * opts:
   *  scene, camera, wallGroup (THREE.Group), walls (array of walls AABB),
   *  enemies (array from enemiesCtl), hud (createHUD())
   */
  constructor(opts = {}) {
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.wallGroup = opts.wallGroup; // group used for raycast occlusion
    this.walls = opts.walls || [];
    this.enemies = opts.enemies || [];
    this.hud = opts.hud || null;

    // gun params
    this.damage = 35;
    this.range = 30;
    this.rof = 6; // rounds per second
    this.magazine = 6;
    this.ammo = this.magazine;
    this.reloadTime = 1.2;
    this.lastShotTime = -Infinity;
    this.reloading = false;

    // visuals
    this.muzzleFlash = this._makeMuzzleFlash();
    this.scene.add(this.muzzleFlash);
    this.muzzleFlash.visible = false;
    this._muzzleFlashTimer = 0;

    // bullet visuals
    this.bullets = [];
    this.bulletPoolSize = 6;
    for (let i = 0; i < this.bulletPoolSize; i++) {
      const b = new Bullet();
      this.bullets.push(b);
      this.scene.add(b.mesh);
      b.deactivate();
    }

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.range;

    // simple sfx placeholders
    this.sfx = { shot: null, reload: null, empty: null };

    // HUD update
    if (this.hud && typeof this.hud.updateAmmo === "function") {
      this.hud.updateAmmo(this.ammo, this.magazine);
    }

    this._currentRecoil = 0;
  }

  _makeMuzzleFlash() {
    const geo = new THREE.SphereGeometry(0.055, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff3c8,
      transparent: true,
      opacity: 0.95,
    });
    return new THREE.Mesh(geo, mat);
  }

  _getNextBulletFromPool() {
    for (const b of this.bullets) if (!b.active) return b;
    const nb = new Bullet();
    this.bullets.push(nb);
    this.scene.add(nb.mesh);
    return nb;
  }

  fire() {
    if (this.reloading) return false;
    const now = performance.now() / 1000;
    if (now - this.lastShotTime < 1 / this.rof) return false;

    if (this.ammo <= 0) {
      if (this.sfx.empty) this.sfx.empty.play();
      // notify HUD
      if (this.hud && typeof this.hud.updateAmmo === "function")
        this.hud.updateAmmo(this.ammo, this.magazine);
      return false;
    }

    this.lastShotTime = now;
    this.ammo--;
    if (this.hud && typeof this.hud.updateAmmo === "function")
      this.hud.updateAmmo(this.ammo, this.magazine);

    // muzzle flash in front of camera
    const flashPos = new THREE.Vector3(0, 0, -0.9).applyMatrix4(
      this.camera.matrixWorld
    );
    this.muzzleFlash.position.copy(flashPos);
    this.muzzleFlash.visible = true;
    this._muzzleFlashTimer = 0.06;

    // visual tracer
    const origin = new THREE.Vector3().setFromMatrixPosition(
      this.camera.matrixWorld
    );
    const dir = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();
    const b = this._getNextBulletFromPool();
    b.activate(origin, dir);

    // hitscan: raycast from camera center
    this.raycaster.set(origin, dir);
    this.raycaster.far = this.range;

    // check walls first (if wallGroup provided)
    const wallHits = this.wallGroup
      ? this.raycaster.intersectObject(this.wallGroup, true)
      : [];
    const wallDist = wallHits.length ? wallHits[0].distance : Infinity;

    // check enemies by intersecting their meshes
    const aliveEnemyMeshes = this.enemies
      .filter((e) => !e.dead)
      .map((e) => e.mesh);
    const enemyHits = aliveEnemyMeshes.length
      ? this.raycaster.intersectObjects(aliveEnemyMeshes, true)
      : [];

    // find closest enemy hit that isn't past wall
    let chosenHit = null;
    if (enemyHits.length) {
      for (const h of enemyHits) {
        if (h.distance < wallDist) {
          chosenHit = h;
          break;
        }
      }
    }

    if (chosenHit) {
      // locate enemy object
      const enemyObj = this.enemies.find((en) => {
        // intersectObjects may return child mesh — check ancestor
        let o = chosenHit.object;
        while (o && o !== en.mesh) {
          o = o.parent;
        }
        return o === en.mesh;
      });
      if (enemyObj) {
        enemyObj.hp -= this.damage;
        enemyObj.hitFlash = 0.2;
        // brief scale punch
        enemyObj.mesh.scale.setScalar(1.08);
        setTimeout(() => {
          if (!enemyObj.dead) enemyObj.mesh.scale.setScalar(1);
        }, 80);
        if (enemyObj.hp <= 0 && !enemyObj.dead) enemyObj.dead = true;
      }
      this._spawnHitEffect(chosenHit.point);
    } else if (wallHits.length) {
      this._spawnHitEffect(wallHits[0].point);
    }

    if (this.sfx.shot) this.sfx.shot.play();

    // auto reload when empty (optional)
    if (this.ammo <= 0) this.reload();

    return true;
  }

  reload() {
    if (this.reloading || this.ammo === this.magazine) return;
    this.reloading = true;
    if (this.sfx.reload) this.sfx.reload.play();
    setTimeout(() => {
      this.ammo = this.magazine;
      this.reloading = false;
      if (this.hud && typeof this.hud.updateAmmo === "function")
        this.hud.updateAmmo(this.ammo, this.magazine);
    }, this.reloadTime * 1000);
  }

  _spawnHitEffect(pos) {
    const g = new THREE.SphereGeometry(0.06, 6, 6);
    const m = new THREE.MeshBasicMaterial({ color: 0xffb4b4 });
    const s = new THREE.Mesh(g, m);
    s.position.copy(pos);
    this.scene.add(s);
    setTimeout(() => {
      this.scene.remove(s);
      s.geometry.dispose();
      s.material.dispose();
    }, 220);
  }

  update(dt) {
    // muzzle flash
    if (this.muzzleFlash.visible) {
      this._muzzleFlashTimer -= dt;
      if (this._muzzleFlashTimer <= 0) this.muzzleFlash.visible = false;
    }
    for (const b of this.bullets) if (b.active) b.update(dt);
  }

  dispose() {
    try {
      this.scene.remove(this.muzzleFlash);
      this.muzzleFlash.geometry.dispose();
      this.muzzleFlash.material.dispose();
    } catch (e) {}
    for (const b of this.bullets) {
      try {
        this.scene.remove(b.mesh);
        b.dispose();
      } catch (e) {}
    }
  }
}
