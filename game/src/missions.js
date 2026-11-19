// Mara's five jobs for Kross: data-driven missions with a 3D beacon, dialogue,
// timers, an escape, and a final shootout on the pier.
import { clamp, dist2 } from './util.js';

export const MISSIONS = [
  {
    name: 'Homecoming', reward: 300,
    intro: ['<b>KROSS:</b> Mara Voss. Back in Sunset Bay at last.', '<b>KROSS:</b> You owe me $5,000. First job: get to my garage. There is a car waiting.'],
    steps: [{ type: 'goto', x: -87, z: 87, label: 'Drive to Kross Garage' }],
  },
  {
    name: 'The Pickup', reward: 500,
    intro: ['<b>KROSS:</b> A package is waiting at the pier. Pick it up, then drop it at the hotel downtown.', '<b>MARA:</b> And if the cops ask questions?', '<b>KROSS:</b> Drive faster than their questions.'],
    steps: [
      { type: 'goto', x: 0, z: 210, label: 'Pick up the package at the pier' },
      { type: 'goto', x: 29, z: -29, label: 'Deliver the package downtown' },
    ],
  },
  {
    name: 'Hot Pursuit', reward: 800,
    intro: ['<b>KROSS:</b> Somebody talked. The whole department is looking for you.', '<b>MARA:</b> Then let them look. I will be gone by sundown.'],
    steps: [{ type: 'escape', seconds: 60, label: 'Lose the cops — survive 60 seconds' }],
  },
  {
    name: 'The Exchange', reward: 1200,
    intro: ['<b>KROSS:</b> The buyer waits at the beach house. Ninety seconds, Mara. Not one more.', '<b>MARA:</b> Ninety seconds is plenty. Watch me.'],
    steps: [{ type: 'timed', x: -145, z: 175, seconds: 90, label: 'Reach the beach house in time' }],
  },
  {
    name: 'Payback', reward: 2000,
    intro: ['<b>KROSS:</b> The crew that sold you out is on the pier. End it, and your debt is paid.', '<b>MARA:</b> Five years I waited for this. Let us finish it.'],
    steps: [{ type: 'shootout', x: 0, z: 240, count: 5, label: 'Take down the crew on the pier' }],
  },
];

export class MissionRunner {
  constructor(scene, rng, city) {
    this.scene = scene; this.rng = rng; this.city = city;
    this.index = -1; this.stepIdx = 0; this.active = false;
    this.timer = 0; this.enemies = [];
    // Beacon: a glowing pillar plus a bobbing arrow over the target.
    this.beacon = new THREE.Group();
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 12, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xffb347, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    pillar.position.y = 15; this.beacon.add(pillar);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 4),
      new THREE.MeshLambertMaterial({ color: 0xffb347, emissive: 0x883300 }));
    arrow.rotation.x = Math.PI; arrow.position.y = 12; this.beacon.add(arrow);
    this.arrow = arrow;
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.t = 0;
  }
  get mission() { return MISSIONS[this.index]; }
  get step() { return this.active ? this.mission.steps[this.stepIdx] : null; }
  start(index, fx) {
    this.index = index; this.stepIdx = 0; this.active = true; this.timer = 0;
    this.clearEnemies();
    const m = this.mission;
    fx.say(m.intro);
    if (this.step.type === 'escape') fx.setWanted(3);
    if (this.step.type === 'timed') this.timer = this.step.seconds;
    if (this.step.type === 'shootout') this.spawnEnemies();
    this.placeBeacon();
  }
  placeBeacon() {
    const s = this.step;
    if (!s || s.type === 'escape') { this.beacon.visible = false; return; }
    this.beacon.visible = true;
    this.beacon.position.set(s.x, 0, s.z);
  }
  spawnEnemies() {
    const s = this.step;
    for (let i = 0; i < s.count; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.0, 8),
        new THREE.MeshLambertMaterial({ color: 0x222222 }));
      body.position.y = 0.8; body.castShadow = true; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
      head.position.y = 1.55; g.add(head);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.7),
        new THREE.MeshLambertMaterial({ color: 0x111111 }));
      gun.position.set(0.3, 1.0, 0.4); g.add(gun);
      const a = (i / s.count) * Math.PI * 2;
      const e = {
        mesh: g, hp: 100, shootT: 1 + i * 0.4,
        x: s.x + Math.sin(a) * 14, z: s.z + Math.cos(a) * 14,
      };
      g.position.set(e.x, 0, e.z);
      this.scene.add(g); this.enemies.push(e);
    }
  }
  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }
  // Raycast hit against shootout enemies. Returns the enemy hit or null.
  checkShot(raycaster) {
    const hits = raycaster.intersectObjects(this.enemies.map(e => e.mesh), true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
    const e = this.enemies.find(en => en.mesh === obj);
    if (!e) return null;
    e.hp -= 34;
    if (e.hp <= 0) {
      this.scene.remove(e.mesh);
      this.enemies.splice(this.enemies.indexOf(e), 1);
    }
    return e;
  }
  objectiveText() {
    if (!this.active) return 'No active mission — press <b>1</b> to start the next job.';
    const s = this.step;
    if (s.type === 'escape') return `<b>${this.mission.name}:</b> ${s.label} — <b>${Math.max(0, Math.ceil(s.seconds - this.timer))}s</b> left`;
    if (s.type === 'timed') return `<b>${this.mission.name}:</b> ${s.label} — <b>${Math.ceil(this.timer)}s</b> left`;
    return `<b>${this.mission.name}:</b> ${s.label}`;
  }
  update(dt, ctx, fx) {
    this.t += dt;
    if (this.beacon.visible) this.arrow.position.y = 12 + Math.sin(this.t * 3) * 1.2;
    if (!this.active) return null;
    const s = this.step;
    const p = ctx.playerPos;
    if (s.type === 'goto' || s.type === 'timed') {
      if (s.type === 'timed') {
        this.timer -= dt;
        if (this.timer <= 0) return 'failed';
      }
      if (dist2(p.x, p.z, s.x, s.z) < 100) return this.nextStep(fx);
    } else if (s.type === 'escape') {
      this.timer += dt;
      if (ctx.wanted >= 2) this.timer = this.timer; // survive while hunted
      if (this.timer >= s.seconds && ctx.wanted < 2) return this.complete(fx);
      if (this.timer >= s.seconds) { this.timer = s.seconds; }
    } else if (s.type === 'shootout') {
      // Enemies shoot back.
      for (const e of this.enemies) {
        e.shootT -= dt;
        const d = Math.sqrt(dist2(e.x, e.z, p.x, p.z));
        if (e.shootT <= 0 && d < 38) {
          e.shootT = 1.4 + this.rng() * 0.8;
          fx.enemyShot(e, d);
        }
        // Face the player.
        e.mesh.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
      }
      if (this.enemies.length === 0) return this.complete(fx);
    }
    return null;
  }
  nextStep(fx) {
    fx.blip();
    this.stepIdx++;
    if (this.stepIdx >= this.mission.steps.length) return this.complete(fx);
    const s = this.step;
    if (s.type === 'timed') this.timer = s.seconds;
    if (s.type === 'shootout') this.spawnEnemies();
    this.placeBeacon();
    return null;
  }
  complete(fx) {
    const m = this.mission;
    this.active = false;
    this.beacon.visible = false;
    this.clearEnemies();
    fx.missionDone(m);
    return 'completed';
  }
}
