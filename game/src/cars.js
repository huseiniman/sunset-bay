// Cars: low-poly box builds, arcade driving physics, and traffic AI that
// follows the road grid, stops at red lights, and keeps clear of the player.
import { clamp, wrapAngle, circleVsAABB, dist2 } from './util.js';
import { ROAD_COORDS, CITY_HALF } from './city.js';

const PALETTE = [0xd33a2c, 0x2c6fd3, 0xe8b93a, 0x37b06a, 0x8a5fc0, 0xe8e8e8, 0x22262c, 0xd3702c, 0x3fb8b0];

export function makeCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f2f2 : color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), dark);
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0x11151c }));
    stripe.position.y = 0.62; g.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
    bar.position.set(0, 1.48, -0.2); g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000aa }));
    bar2.position.set(0.6, 1.48, -0.2); g.add(bar2);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0e12 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.1),
    new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0x888844 }));
  hl.position.set(0, 0.62, 2.22); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.1),
    new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x550000 }));
  tl.position.set(0, 0.62, -2.22); g.add(tl);
  return { group: g, wheels };
}

export class Car {
  constructor(scene, color, isPolice = false) {
    const { group, wheels } = makeCarMesh(color, isPolice);
    this.mesh = group; this.wheels = wheels;
    this.isPolice = isPolice; this.color = color;
    this.heading = 0; this.speed = 0; this.steer = 0;
    this.hp = 100; this.wrecked = false; this.stolen = false;
    this.spin = 0;
    scene.add(group);
  }
  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  setPos(x, z, heading) {
    this.mesh.position.set(x, 0, z); this.heading = heading; this.speed = 0;
    this.sync();
  }
  sync() {
    this.mesh.rotation.y = this.heading;
    for (const w of this.wheels) w.rotation.x += this.speed * 0.06;
  }
  remove(scene) { scene.remove(this.mesh); }
}

// Arcade driving for the player's car. input: {up,down,left,right,handbrake}
export function driveCar(car, input, dt, colliders, others) {
  const maxF = 34, maxR = 11;
  if (input.up) car.speed += 15 * dt;
  if (input.down) car.speed -= car.speed > 0.5 ? 26 * dt : 12 * dt;
  car.speed -= car.speed * (input.handbrake ? 1.6 : 0.35) * dt;
  car.speed = clamp(car.speed, -maxR, maxF);
  if (Math.abs(car.speed) < 0.05 && !input.up && !input.down) car.speed = 0;
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerMax = 0.55 * (1 - Math.min(Math.abs(car.speed) / maxF, 0.7) * 0.6);
  car.steer += (steerTarget * steerMax - car.steer) * Math.min(1, dt * 8);
  car.heading += (car.steer * car.speed * 0.055) * dt * (car.speed < 0 ? -1 : 1) * (input.handbrake ? 1.5 : 1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const p = { x: nx, z: nz };
  let hit = false;
  for (const b of colliders) if (circleVsAABB(p, 1.7, b)) hit = true;
  if (hit && Math.abs(car.speed) > 6) { car.hp -= Math.abs(car.speed) * 0.9; car.speed *= 0.35; }
  else if (hit) car.speed *= 0.5;
  car.mesh.position.x = clamp(p.x, -CITY_HALF, CITY_HALF);
  car.mesh.position.z = clamp(p.z, -CITY_HALF, 262);
  // Simple circle push against other cars.
  for (const o of others) {
    if (o === car || o.wrecked) continue;
    const d2 = dist2(car.x, car.z, o.x, o.z);
    if (d2 < 12.5 && d2 > 0.01) {
      const d = Math.sqrt(d2), push = (3.6 - d) / 2;
      const ux = (car.x - o.x) / d, uz = (car.z - o.z) / d;
      car.mesh.position.x += ux * push; car.mesh.position.z += uz * push;
      if (Math.abs(car.speed) > 8) { car.hp -= 2; o.hp -= 2; }
    }
  }
  if (car.hp <= 0 && !car.wrecked) { car.wrecked = true; car.speed = 0; }
  car.sync();
}

// Traffic: NPC cars that cruise the grid, turn at intersections, and obey lights.
export class Traffic {
  constructor(scene, rng, city) {
    this.scene = scene; this.rng = rng; this.city = city;
    this.cars = [];
  }
  spawnNear(px, pz, n) {
    while (this.cars.length < n) {
      const horizontal = this.rng() < 0.5;
      const road = ROAD_COORDS[Math.floor(this.rng() * ROAD_COORDS.length)];
      const along = clamp((horizontal ? px : pz) + (this.rng() - 0.5) * 160, -190, 190);
      const lane = (this.rng() < 0.5 ? -3.6 : 3.6);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const car = new Car(this.scene, PALETTE[Math.floor(this.rng() * PALETTE.length)]);
      const x = horizontal ? along : road + lane * (dir > 0 ? 1 : -1);
      const z = horizontal ? road + lane * (dir > 0 ? 1 : -1) : along;
      car.setPos(x, z, horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
      car.speed = 9 + this.rng() * 4;
      car._axis = horizontal ? 'x' : 'z'; car._dir = dir; car._lane = lane;
      this.cars.push(car);
    }
  }
  update(dt, playerPos, colliders) {
    const rng = this.rng;
    for (const car of this.cars) {
      if (car.wrecked) continue;
      // Stop for a red light ahead (lights sit near the five central intersections).
      const state = this.city.lightState();
      let stop = false;
      for (const c of [0, 58, -58]) {
        const ahead = car._axis === 'x'
          ? (car._dir * (c - car.x) > 0 && car._dir * (c - car.x) < 13 && Math.abs(car.z - 0) < 8)
          : (car._dir * (c - car.z) > 0 && car._dir * (c - car.z) < 13 && Math.abs(car.x - 0) < 8);
        if (ahead && ((car._axis === 'x' && state === 'ns') || (car._axis === 'z' && state === 'ew'))) { stop = true; break; }
      }
      // Slow for the car ahead.
      for (const o of this.cars) {
        if (o === car || o.wrecked) continue;
        const d2 = dist2(car.x, car.z, o.x, o.z);
        if (d2 < 64) { const d = Math.sqrt(d2); if (d < 8) stop = true; }
      }
      const target = stop ? 0 : 10 + (car._lane > 0 ? 1 : -1) * 0.5;
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
      car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
      // At an intersection (near a road crossing), sometimes turn.
      const nearX = ROAD_COORDS.find(c => Math.abs(car.x - c) < 2);
      const nearZ = ROAD_COORDS.find(c => Math.abs(car.z - c) < 2);
      if (nearX !== undefined && nearZ !== undefined && rng() < dt * 0.9) {
        if (rng() < 0.5) { // turn onto the cross road
          car._axis = car._axis === 'x' ? 'z' : 'x';
          car._dir = rng() < 0.5 ? 1 : -1;
          car._lane = rng() < 0.5 ? -3.6 : 3.6;
          car.heading = car._axis === 'x' ? (car._dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car._dir > 0 ? 0 : Math.PI);
        }
      }
      car.sync();
    }
    // Recycle cars that drifted far from the player.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (dist2(car.x, car.z, playerPos.x, playerPos.z) > 300 * 300) {
        car.remove(this.scene); this.cars.splice(i, 1);
      }
    }
    this.spawnNear(playerPos.x, playerPos.z, 10);
  }
}
