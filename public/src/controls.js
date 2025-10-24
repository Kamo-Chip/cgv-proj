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

// Add after the existing createLookControls function, before the export
export function createThirdPersonCamera(camera, targetPosition) {
  const config = {
    distance: 4.5,        // distance behind player
    height: 1.8,          // height above player
    smoothing: 0.15,      // camera follow smoothing (lower = smoother but laggier)
    collisionRadius: 0.3, // sphere radius for collision detection
  };

  // Camera target offset (slightly above and behind player)
  const offset = new THREE.Vector3();
  const currentPosition = new THREE.Vector3();
  
  function update(yaw, walls) {
    // Calculate ideal camera position behind player
    offset.set(
      Math.sin(yaw) * config.distance,
      config.height,
      Math.cos(yaw) * config.distance
    );
    
    const idealPos = new THREE.Vector3()
      .copy(targetPosition)
      .add(offset);
    
    // Collision detection: raycast from player to ideal camera position
    let finalPos = idealPos.clone();
    const direction = idealPos.clone().sub(targetPosition).normalize();
    const maxDist = offset.length();
    
    // Check collision with walls (AABB vs ray)
    let closestDist = maxDist;
    for (const wall of walls) {
      // Simple AABB-ray intersection (we check if ray hits wall box)
      const t = intersectRayAABB(targetPosition, direction, wall, config.collisionRadius);
      if (t !== null && t < closestDist) {
        closestDist = t;
      }
    }
    
    // Pull camera closer if collision detected
    if (closestDist < maxDist) {
      finalPos.copy(targetPosition).add(direction.multiplyScalar(closestDist * 0.9));
    }
    
    // Smooth interpolation to final position
    currentPosition.lerp(finalPos, config.smoothing);
    camera.position.copy(currentPosition);
    
    // Look at player (slightly above feet)
    const lookTarget = targetPosition.clone();
    lookTarget.y += 0.6;
    camera.lookAt(lookTarget);
  }
  
  // Simple ray-AABB intersection helper
  function intersectRayAABB(origin, dir, aabb, padding = 0) {
    const min = { x: aabb.min.x - padding, z: aabb.min.z - padding };
    const max = { x: aabb.max.x + padding, z: aabb.max.z + padding };
    
    const tminX = (min.x - origin.x) / (dir.x || 0.0001);
    const tmaxX = (max.x - origin.x) / (dir.x || 0.0001);
    const tminZ = (min.z - origin.z) / (dir.z || 0.0001);
    const tmaxZ = (max.z - origin.z) / (dir.z || 0.0001);
    
    const tmin = Math.max(
      Math.min(tminX, tmaxX),
      Math.min(tminZ, tmaxZ)
    );
    const tmax = Math.min(
      Math.max(tminX, tmaxX),
      Math.max(tminZ, tmaxZ)
    );
    
    if (tmax < 0 || tmin > tmax) return null;
    return tmin > 0 ? tmin : tmax;
  }
  
  return { update, config };
}