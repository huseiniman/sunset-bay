// The wanted system: crimes raise heat, heat decays when the player hides,
// and police cars spawn, chase and ram until the heat is gone.
import { clamp, dist2 } from './util.js';
import { Car } from './cars.js';

export class Wanted {
  constructor() { this.points = 0; this.grace = 0; }
  get stars() {
    const p = this.points;
    return p < 100 ? 0 : p < 250 ? 1 : p < 450 ? 2 : p < 650 ? 3 : p < 850 ? 4 : 5;
  }
  add(n) { this.points = clamp(this.points + n, 0, 1000); this.grace = 6; }
  setStars(n) { this.points = [0, 120, 300, 500, 700, 900][clamp(n, 0, 5)]; this.grace = 6; }
  clear() { this.points = 0; this.grace = 0; }
  update(dt, seen) {
    if (this.grace > 0) { this.grace -= dt; return; }
    if (!seen && this.points > 0) this.points = Math.max(0, this.points - 9 * dt);
  }
}

export class PoliceCars {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng; this.cars = [];
    this.spawnT = 0;
  }
  update(dt, playerPos, playerCar, wanted, colliders, onRam) {
    const want = Math.min(wanted, 5);
    this.spawnT -= dt;
    if (this.cars.length < want && this.spawnT <= 0) {
      this.spawnT = 1.5;
      const a = this.rng() * Math.PI * 2;
      const car = new Car(this.scene, 0, true);
      car.setPos(playerPos.x + Math.sin(a) * 70, playerPos.z + Math.cos(a) * 70, a);
      car.speed = 12;
      this.cars.push(car);
    }
    while (this.cars.length > want) {
      const c = this.cars.pop(); c.remove(this.scene);
    }
    for (const car of this.cars) {
      const dx = playerPos.x - car.x, dz = playerPos.z - car.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
      const target = d > 40 ? 36 : d > 12 ? 30 : 20;
      car.speed += (target - car.speed) * Math.min(1, dt * 1.2);
      car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
      car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
      // Ram the player's car (or the player on foot).
      if (playerCar && !playerCar.wrecked) {
        const d2 = dist2(car.x, car.z, playerCar.x, playerCar.z);
        if (d2 < 13) {
          onRam(car.speed);
          car.speed *= 0.4;
          const push = 3;
          car.mesh.position.x -= Math.sin(car.heading) * push;
          car.mesh.position.z -= Math.cos(car.heading) * push;
        }
      }
      car.sync();
    }
    // Give up on cars that fell far behind.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (dist2(car.x, car.z, playerPos.x, playerPos.z) > 200 * 200) {
        car.remove(this.scene); this.cars.splice(i, 1);
      }
    }
  }
}
