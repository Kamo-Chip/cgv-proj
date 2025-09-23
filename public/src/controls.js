// src/controls.js
import * as THREE from "three";

export function createLookControls(renderer, camera) {
  const look = { yaw: 0, pitch: 0, sensitivity: 0.0025 };

  function applyLook() {
    camera.quaternion.setFromEuler(
      new THREE.Euler(look.pitch, look.yaw, 0, "YXZ")
    );
  }

  function lockPointer() {
    renderer.domElement.requestPointerLock();
  }

  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    look.yaw -= e.movementX * look.sensitivity;
    look.pitch -= e.movementY * look.sensitivity;
    const maxPitch = Math.PI / 2 - 0.001;
    look.pitch = Math.max(-maxPitch, Math.min(maxPitch, look.pitch));
    applyLook();
  });

  renderer.domElement.addEventListener("click", () => {
    if (document.pointerLockElement !== renderer.domElement) lockPointer();
  });

  applyLook();
  return { look, applyLook, lockPointer };
}
