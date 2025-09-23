// src/door.js
import * as THREE from 'three';
import { MAZE } from './constants.js';

/**
 * Creates a door frame and a hinged door panel.
 * @param {'N'|'S'|'E'|'W'} edge - which edge of the maze the door is on
 * @returns { group, hinge, open(fn), isCrossed(playerPos, center, normal) }
 */
export function createDoor(edge) {
  const group = new THREE.Group();

  // Frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.6, metalness: 0.1 });
  const postW = 0.12, postH = MAZE.WALL_H, openingW = MAZE.CELL * 0.9, openingD = 0.2;

  const leftPost  = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, openingD), frameMat);
  const rightPost = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, openingD), frameMat);
  const lintel    = new THREE.Mesh(new THREE.BoxGeometry(openingW + postW*2, postW, openingD), frameMat);

  leftPost.castShadow = rightPost.castShadow = lintel.castShadow = true;

  // Door panel (thin box), pivoted on left post
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x7CFF8A, roughness: 0.45, metalness: 0.2, emissive: 0x0, emissiveIntensity: 0 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(openingW, postH*0.95, 0.06), doorMat);
  panel.castShadow = true;

  // Hinge pivot: put panel so that its left edge is at pivot (x=0)
  const hinge = new THREE.Group();
  panel.position.set(openingW/2, postH*0.5, 0);
  hinge.add(panel);

  // Layout local positions (facing +Z by default), we’ll rotate group later
  leftPost.position.set(-openingW/2 - postW/2, postH/2, 0);
  rightPost.position.set( openingW/2 + postW/2, postH/2, 0);
  lintel.position.set(0, postH - postW/2, 0);
  hinge.position.set(-openingW/2, 0, 0);

  group.add(leftPost, rightPost, lintel, hinge);

  // Rotate door group to align with edge
  switch (edge) {
    case 'N': group.rotation.y = Math.PI; break;      // faces -Z
    case 'S': group.rotation.y = 0; break;            // faces +Z
    case 'E': group.rotation.y = -Math.PI/2; break;   // faces +X
    case 'W': group.rotation.y =  Math.PI/2; break;   // faces -X
  }

  // Simple opener
  let t = 0, opening = false;
  function open(dt) {
    if (!opening) return;
    t = Math.min(1, t + dt*2);            // 0→1 over ~0.5s
    const angle = -Math.PI/2 * t;         // swing 90°
    hinge.rotation.y = angle;
  }
  function triggerOpen() { opening = true; }

  // Crossing test: dot((player-center), normal) > threshold
  function isCrossed(playerPos, center, normal) {
    const v = { x: playerPos.x - center.x, z: playerPos.z - center.z };
    const d = v.x * normal.x + v.z * normal.z; // signed distance along outward normal
    return d > MAZE.CELL * 0.3; // crossed ~30% outward from the plane
  }

  return { group, hinge, open, triggerOpen, isCrossed };
}
