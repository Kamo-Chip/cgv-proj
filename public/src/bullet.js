// src/bullet.js
import * as THREE from "three";

/**
 * Tiny visual projectile. Not responsible for authoritative hit detection,
 * it's purely for visuals (zipping tracer).
 */
export class Bullet {
  constructor() {
    const g = new THREE.SphereGeometry(0.03, 6, 6);
    const m = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
    this.mesh = new THREE.Mesh(g, m);
    this.speed = 55; // units / s
    this.active = false;
    this.direction = new THREE.Vector3();
    this.age = 0;
  }

  activate(origin, dir) {
    this.mesh.position.copy(origin);
    this.direction.copy(dir);
    this.active = true;
    this.age = 0;
    this.mesh.visible = true;
  }

  deactivate() {
    this.active = false;
    this.mesh.visible = false;
  }

  update(dt) {
    if (!this.active) return;
    this.age += dt;
    this.mesh.position.addScaledVector(this.direction, this.speed * dt);
    // fade out after a bit
    if (this.age > 0.9) this.deactivate();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
