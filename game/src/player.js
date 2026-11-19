// Mara Voss on foot and behind the wheel: movement, jumping, stealing cars,
// punching, shooting, health and money.
import { clamp, circleVsAABB, dist2 } from './util.js';
import { makePersonMesh } from './people.js';
import { driveCar } from './cars.js';

export class Player {
  constructor(scene) {
    const { group, legs } = makePersonMesh(0xc22a2a); // Mara's red jacket
    this.mesh = group; this.legs = legs;
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0;
    this.heading = 0; this.phase = 0;
    this.onFoot = true; this.car = null;
    this.health = 100; this.ammo = 12; this.money = 0;
    this.reloadT = 0; this.hurtT = 0; this.punchT = 0;
    scene.add(group);
  }
  get pos() { return { x: this.x, z: this.z }; }
  spawn(x, z, heading = 0) {
    this.x = x; this.z = z; this.y = 0; this.heading = heading;
    this.mesh.position.set(x, 0, z); this.mesh.rotation.y = heading;
  }
  // On-foot movement, relative to the camera yaw. Returns speed for animation/audio.
  moveOnFoot(input, camYaw, dt, colliders) {
    let fx = 0, fz = 0;
    if (input.up) { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
    if (input.down) { fx -= Math.sin(camYaw); fz -= Math.cos(camYaw); }
    if (input.left) { fx += Math.sin(camYaw - Math.PI / 2); fz += Math.cos(camYaw - Math.PI / 2); }
    if (input.right) { fx += Math.sin(camYaw + Math.PI / 2); fz += Math.cos(camYaw + Math.PI / 2); }
    const len = Math.hypot(fx, fz);
    let speed = 0;
    if (len > 0) {
      fx /= len; fz /= len;
      speed = 6.5;
      const targetHeading = Math.atan2(fx, fz);
      let dh = targetHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += clamp(dh, -dt * 10, dt * 10);
      const p = { x: this.x + fx * speed * dt, z: this.z + fz * speed * dt };
      for (const b of colliders) circleVsAABB(p, 0.5, b);
      this.x = clamp(p.x, -205, 205); this.z = clamp(p.z, -205, 250);
    }
    // Jump with simple gravity.
    if (input.jump && this.y === 0) this.vy = 7;
    this.vy -= 22 * dt; this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    this.phase += dt * speed * 1.6;
    this.mesh.position.set(this.x, this.y + Math.abs(Math.sin(this.phase)) * 0.04, this.z);
    this.mesh.rotation.y = this.heading;
    this.legs[0].rotation.x = Math.sin(this.phase) * 0.6;
    this.legs[1].rotation.x = -Math.sin(this.phase) * 0.6;
    return speed;
  }
  // Take the nearest car within reach. Returns the car or null.
  tryEnterCar(cars) {
    let best = null, bestD = 4.5;
    for (const c of cars) {
      if (c.wrecked) continue;
      const d = Math.sqrt(dist2(this.x, this.z, c.x, c.z));
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return null;
    this.car = best; this.onFoot = false;
    this.mesh.visible = false;
    return best;
  }
  exitCar() {
    if (!this.car) return null;
    const car = this.car;
    car.speed = 0;
    const a = car.heading + Math.PI / 2;
    this.x = car.x + Math.sin(a) * 2.2; this.z = car.z + Math.cos(a) * 2.2;
    this.y = 0; this.heading = car.heading;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.car = null; this.onFoot = true;
    return car;
  }
  syncToCar() {
    if (!this.car) return;
    this.x = this.car.x; this.z = this.car.z; this.heading = this.car.heading;
  }
  punch(targets) {
    if (this.punchT > 0 || !this.onFoot) return false;
    this.punchT = 0.4;
    let hit = false;
    for (const t of targets) {
      const d = Math.sqrt(dist2(this.x, this.z, t.x, t.z));
      if (d < 2.2) {
        hit = true;
        if (t.hp !== undefined) {
          t.hp -= 20;
          const ux = (t.x - this.x) / (d || 1), uz = (t.z - this.z) / (d || 1);
          t.x += ux * 2.5; t.z += uz * 2.5;
          if (t.mesh) t.mesh.position.set(t.x, 0, t.z);
        }
      }
    }
    return hit;
  }
  shoot() {
    if (!this.onFoot || this.ammo <= 0 || this.reloadT > 0) return false;
    this.ammo--;
    if (this.ammo === 0) this.reloadT = 0.9;
    return true;
  }
  reload() { if (this.ammo < 12 && this.reloadT <= 0) this.reloadT = 0.9; }
  damage(n) {
    if (this.hurtT > 0) return false;
    this.health = Math.max(0, this.health - n);
    this.hurtT = 0.4;
    return true;
  }
  update(dt) {
    if (this.punchT > 0) this.punchT -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = 12;
    }
  }
  get speed() { return this.car ? Math.abs(this.car.speed) : 0; }
}
