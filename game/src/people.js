// People on foot: pedestrians strolling the sidewalks (and fleeing danger)
// and foot cops who chase the player and make the bust.
import { clamp, dist2 } from './util.js';
import { ROAD_COORDS, ROAD, CITY_HALF } from './city.js';

const SKINS = [0xd9a066, 0xb07a4a, 0x8a5a32, 0xe8b88a];
const SHIRTS = [0xd33a2c, 0x2c6fd3, 0xe8b93a, 0x37b06a, 0x8a5fc0, 0xe8e8e8, 0xd3702c, 0x3fb8b0];

export function makePersonMesh(shirt, isCop = false) {
  const g = new THREE.Group();
  const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.95, 8),
    new THREE.MeshLambertMaterial({ color: isCop ? 0x1c2f55 : shirt }));
  body.position.y = 0.78; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.5; head.castShadow = true; g.add(head);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.12, 8),
      new THREE.MeshLambertMaterial({ color: 0x101c33 }));
    cap.position.y = 1.7; g.add(cap);
  }
  const legMat = new THREE.MeshLambertMaterial({ color: isCop ? 0x14181f : 0x2e3440 });
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.15), legMat);
    leg.position.set(s * 0.14, 0.28, 0); g.add(leg); legs.push(leg);
  }
  return { group: g, legs };
}

export class Pedestrians {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng; this.list = [];
  }
  spawnNear(px, pz, n) {
    while (this.list.length < n) {
      const horizontal = this.rng() < 0.5;
      const road = ROAD_COORDS[Math.floor(this.rng() * ROAD_COORDS.length)];
      const line = road + (this.rng() < 0.5 ? -1 : 1) * (ROAD / 2 + 3);
      const along = clamp((horizontal ? px : pz) + (this.rng() - 0.5) * 140, -190, 190);
      const { group, legs } = makePersonMesh(SHIRTS[Math.floor(this.rng() * SHIRTS.length)]);
      const p = {
        mesh: group, legs, phase: this.rng() * 6,
        x: horizontal ? along : line, z: horizontal ? line : along,
        axis: horizontal ? 'x' : 'z', line, speed: 1.1 + this.rng() * 0.7,
        target: clamp(along + (this.rng() - 0.5) * 120, -190, 190),
        flee: 0, fx: 0, fz: 0,
      };
      group.position.set(p.x, 0, p.z);
      this.scene.add(group); this.list.push(p);
    }
  }
  scare(x, z, radius) {
    for (const p of this.list) {
      if (dist2(p.x, p.z, x, z) < radius * radius) {
        p.flee = 2.5 + this.rng() * 1.5;
        const d = Math.sqrt(dist2(p.x, p.z, x, z)) || 1;
        p.fx = (p.x - x) / d; p.fz = (p.z - z) / d;
      }
    }
  }
  update(dt, playerPos, playerSpeed, inCar) {
    for (const p of this.list) {
      // A fast car nearby scares pedestrians into a run.
      if (inCar && playerSpeed > 8 && dist2(p.x, p.z, playerPos.x, playerPos.z) < 100) this.scare(playerPos.x, playerPos.z, 10);
      let vx = 0, vz = 0, sp = p.speed;
      if (p.flee > 0) { p.flee -= dt; vx = p.fx; vz = p.fz; sp = 5; }
      else {
        const cur = p.axis === 'x' ? p.x : p.z;
        const dir = Math.sign(p.target - cur) || 1;
        if (p.axis === 'x') vx = dir; else vz = dir;
        if (Math.abs(p.target - cur) < 1) {
          p.target = clamp(cur + (this.rng() - 0.5) * 140, -190, 190);
          if (this.rng() < 0.25) { // switch to a crossing sidewalk
            p.axis = p.axis === 'x' ? 'z' : 'x';
            const road = ROAD_COORDS[Math.floor(this.rng() * ROAD_COORDS.length)];
            p.line = road + (this.rng() < 0.5 ? -1 : 1) * (ROAD / 2 + 3);
            if (p.axis === 'x') p.z = p.line; else p.x = p.line;
          }
        }
      }
      p.x += vx * sp * dt; p.z += vz * sp * dt;
      p.x = clamp(p.x, -CITY_HALF, CITY_HALF); p.z = clamp(p.z, -CITY_HALF, 250);
      p.phase += dt * sp * 3;
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.phase)) * 0.05, p.z);
      p.mesh.rotation.y = Math.atan2(vx, vz);
      p.legs[0].rotation.x = Math.sin(p.phase) * 0.5;
      p.legs[1].rotation.x = -Math.sin(p.phase) * 0.5;
    }
    // Recycle far pedestrians.
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (dist2(p.x, p.z, playerPos.x, playerPos.z) > 260 * 260) {
        this.scene.remove(p.mesh); this.list.splice(i, 1);
      }
    }
    this.spawnNear(playerPos.x, playerPos.z, 22);
  }
}

export class FootCops {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng; this.list = [];
    this.bustT = 0; this.shootT = 0;
  }
  update(dt, playerPos, onFoot, wanted, onShot, onBusted) {
    const want = onFoot ? wanted : 0;
    const target = want >= 1 ? Math.min(want, 3) : 0;
    while (this.list.length < target) {
      const a = this.rng() * Math.PI * 2;
      const { group, legs } = makePersonMesh(0, true);
      const p = { mesh: group, legs, phase: 0, hp: 50, x: playerPos.x + Math.sin(a) * 30, z: playerPos.z + Math.cos(a) * 30 };
      p.mesh.position.set(p.x, 0, p.z);
      this.scene.add(group); this.list.push(p);
    }
    while (this.list.length > target) {
      const p = this.list.pop(); this.scene.remove(p.mesh);
    }
    let near = false;
    for (const p of this.list) {
      const d = Math.sqrt(dist2(p.x, p.z, playerPos.x, playerPos.z));
      const ux = (playerPos.x - p.x) / (d || 1), uz = (playerPos.z - p.z) / (d || 1);
      const sp = d > 6 ? 5.6 : 4.2;
      p.x += ux * sp * dt; p.z += uz * sp * dt;
      p.phase += dt * sp * 3;
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.phase)) * 0.05, p.z);
      p.mesh.rotation.y = Math.atan2(ux, uz);
      p.legs[0].rotation.x = Math.sin(p.phase) * 0.5;
      p.legs[1].rotation.x = -Math.sin(p.phase) * 0.5;
      if (d < 1.9) near = true;
      // Cops open fire at 3+ stars when the player is on foot and in range.
      if (wanted >= 3 && d < 30 && d > 3) {
        this.shootT -= dt;
        if (this.shootT <= 0) { this.shootT = 1.1 + this.rng() * 0.5; onShot(); }
      }
    }
    this.bustT = near ? this.bustT + dt : 0;
    if (this.bustT > 1.5) { this.bustT = 0; onBusted(); }
  }
}
