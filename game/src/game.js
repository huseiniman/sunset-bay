// Sunset Bay: the game itself. Owns the renderer, the loop, the camera, input,
// screens, saving, car theft, shootouts and the deterministic shot staging.
import { clamp, lerp, damp, wrapAngle, mulberry32, dist2 } from './util.js';
import { createCity, CITY_HALF } from './city.js';
import { Car, Traffic, driveCar } from './cars.js';
import { Pedestrians, FootCops } from './people.js';
import { Wanted, PoliceCars } from './police.js';
import { MissionRunner, MISSIONS } from './missions.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';

const STEP = 1 / 60;
const SAVE_KEY = 'sunset-bay-save-v1';
const PARKED_SPOTS = [
  [-87, 64, Math.PI], // Mara's ride, right in front of the garage
  [10.5, -60, 0], [-10.5, 30, Math.PI], [68.5, -120, Math.PI / 2], [-68.5, 116, -Math.PI / 2],
  [126.5, 58, 0], [-126.5, -58, Math.PI], [10.5, 150, 0], [-10.5, -150, Math.PI],
];

export class Game {
  constructor(canvas, seed = 1, shotMode = false) {
    this.shotMode = shotMode;
    this.rng = mulberry32(seed);
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5e0);
    this.scene.fog = new THREE.Fog(0x9fc3e8, 200, 560);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.city = createCity(this.scene, seed);
    this.traffic = new Traffic(this.scene, this.rng, this.city);
    this.peds = new Pedestrians(this.scene, this.rng);
    this.cops = new FootCops(this.scene, this.rng);
    this.wanted = new Wanted();
    this.policeCars = new PoliceCars(this.scene, this.rng);
    this.missions = new MissionRunner(this.scene, this.rng, this.city);
    this.player = new Player(this.scene);
    this.hud = new HUD();
    this.audio = new AudioSys();
    this.screen = 'title';
    this.nextMission = 0;
    this.gameMinutes = 12 * 60;
    this.t = 0;
    this.camYaw = 0; this.camPitch = 0.34; this.camDist = 7;
    this.keys = {};
    this.dragging = false; this.downX = 0; this.downY = 0; this.moved = 0;
    this.parked = [];
    this.raycaster = new THREE.Raycaster();
    this.storyDone = false;
    this.spawnParked();
    this.player.spawn(-87, 70, Math.PI);
    this.traffic.spawnNear(this.player.pos, 0, 10);
    this.peds.spawnNear(this.player.pos.x, this.player.pos.z, 22);
    this.fx = {
      say: lines => this.hud.say(lines),
      blip: () => this.audio.pickup(),
      setWanted: n => this.wanted.setStars(n),
      missionDone: m => {
        this.player.money += m.reward;
        this.audio.mission();
        this.hud.toast(`MISSION COMPLETE — ${m.name}  +$${m.reward}`);
        this.nextMission = Math.min(this.missions.index + 1, MISSIONS.length);
        this.save();
        if (this.missions.index >= MISSIONS.length - 1) this.storyComplete();
      },
      enemyShot: (e, d) => {
        if (this.rng() < (d < 25 ? 0.45 : 0.25) && this.player.damage(6)) this.audio.shot();
      },
    };
    this.bindInput();
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  spawnParked() {
    const colors = [0xd33a2c, 0x2c6fd3, 0xe8b93a, 0x37b06a, 0xe8e8e8, 0x22262c];
    for (const [x, z, h] of PARKED_SPOTS) {
      const car = new Car(this.scene, colors[Math.floor(this.rng() * colors.length)]);
      car.setPos(x, z, h);
      this.parked.push(car);
    }
  }
  bindInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.screen === 'play') this.pause();
        else if (this.screen === 'pause') this.resume();
      }
      if (e.code === 'KeyM') this.audio.setMuted(!this.audio.muted);
      if (e.code === 'Digit1' && this.screen === 'play') this.startNextMission();
      if (e.code === 'KeyR' && this.screen === 'play') this.player.reload();
      if (e.code === 'KeyF' && this.screen === 'play') this.doPunch();
      if (e.code === 'KeyE' && this.screen === 'play') this.doEnterExit();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    this.canvas.addEventListener('mousedown', e => {
      this.dragging = true; this.downX = e.clientX; this.downY = e.clientY; this.moved = 0;
      if (!this.shotMode) this.audio.init();
    });
    window.addEventListener('mousemove', e => {
      if (!this.dragging) return;
      const dx = e.clientX - this.downX, dy = e.clientY - this.downY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.camYaw -= dx * 0.005;
      this.camPitch = clamp(this.camPitch + dy * 0.003, 0.08, 0.9);
      this.downX = e.clientX; this.downY = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      if (this.dragging && this.moved < 6 && this.screen === 'play') this.doShoot();
      this.dragging = false;
    });
    document.getElementById('btn-new').addEventListener('click', () => this.newGame());
    document.getElementById('btn-continue').addEventListener('click', () => this.continueGame());
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-quit').addEventListener('click', () => this.toTitle());
    document.getElementById('btn-retry').addEventListener('click', () => this.retry());
    document.getElementById('btn-end-title').addEventListener('click', () => this.toTitle());
  }
  readInput() {
    const k = this.keys;
    return {
      up: !!(k.KeyW || k.ArrowUp), down: !!(k.KeyS || k.ArrowDown),
      left: !!(k.KeyA || k.ArrowLeft), right: !!(k.KeyD || k.ArrowRight),
      handbrake: !!k.Space, jump: !!k.Space,
    };
  }
  // ---- Screens & flow ----
  newGame() {
    this.audio.init();
    this.player.money = 0; this.player.health = 100; this.nextMission = 0; this.storyDone = false;
    this.wanted.clear();
    this.player.spawn(-87, 70, Math.PI);
    this.screen = 'play';
    this.hud.setScreen('play');
    this.hud.announce('Playing Sunset Bay.');
    this.startNextMission();
    this.save();
  }
  continueGame() {
    const s = this.load();
    this.audio.init();
    this.player.money = s ? s.money : 0;
    this.nextMission = s ? s.mission : 0;
    this.player.health = 100;
    this.wanted.clear();
    this.player.spawn(-87, 70, Math.PI);
    this.screen = 'play';
    this.hud.setScreen('play');
    this.startNextMission();
  }
  startNextMission() {
    if (this.missions.active || this.nextMission >= MISSIONS.length) return;
    this.missions.start(this.nextMission, this.fx);
  }
  pause() { this.screen = 'pause'; this.hud.setScreen('pause'); }
  resume() { this.screen = 'play'; this.hud.setScreen('play'); }
  toTitle() {
    this.screen = 'title';
    this.hud.setScreen('title');
    this.missions.active = false;
    this.missions.beacon.visible = false;
    this.wanted.clear();
    document.getElementById('btn-continue').style.display = this.load() ? 'block' : 'none';
  }
  retry() {
    this.player.health = 100; this.player.ammo = 12;
    this.wanted.clear();
    this.player.spawn(this.city.hospital.x, this.city.hospital.z + 24, 0);
    if (this.player.car) { this.player.exitCar(); }
    this.screen = 'play';
    this.hud.setScreen('play');
    if (this.missions.index >= 0 && this.nextMission < MISSIONS.length) {
      this.missions.start(this.missions.index, this.fx);
    }
  }
  storyComplete() {
    this.storyDone = true;
    this.save();
    this.hud.showEnd('STORY COMPLETE',
      `Mara paid off the $5,000 and Sunset Bay is hers again.<br>Total cash: <b>$${this.player.money.toLocaleString('en-US')}</b><br>Thanks for playing — the city is still open. Press TRY AGAIN to keep driving.`);
  }
  endBusted() {
    this.screen = 'end';
    const lost = Math.round(this.player.money * 0.15);
    this.player.money -= lost;
    this.audio.fail();
    this.save();
    this.hud.showEnd('BUSTED', `The Sunset Bay PD caught up with Mara.<br>Bail cost you <b>$${lost}</b>. The job is still waiting.`);
  }
  endWasted() {
    this.screen = 'end';
    const lost = Math.round(this.player.money * 0.1);
    this.player.money -= lost;
    this.audio.fail();
    this.save();
    this.hud.showEnd('WASTED', `Mara went down in Sunset Bay.<br>The hospital bill cost <b>$${lost}</b>.`);
  }
  save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.player.money, mission: this.nextMission, done: this.storyDone,
      }));
    } catch { /* storage off */ }
  }
  load() {
    try {
      const s = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
      return s && typeof s.money === 'number' ? s : null;
    } catch { return null; }
  }
  // ---- Actions ----
  doEnterExit() {
    if (this.player.onFoot) {
      const cars = [...this.parked, ...this.traffic.cars, ...this.policeCars.cars];
      const car = this.player.tryEnterCar(cars);
      if (!car) return;
      const pi = this.parked.indexOf(car);
      if (pi >= 0) this.parked.splice(pi, 1);
      const ti = this.traffic.cars.indexOf(car);
      if (ti >= 0) this.traffic.cars.splice(ti, 1);
      // Witnessed theft raises heat.
      const seen = this.peds.list.some(p => dist2(p.x, p.z, this.player.x, this.player.z) < 625)
        || this.cops.list.some(c => dist2(c.x, c.z, this.player.x, this.player.z) < 900);
      if (seen || car.isPolice) {
        this.wanted.add(car.isPolice ? 200 : 120);
        this.hud.toast(car.isPolice ? 'You stole a police car!' : 'Car stolen — someone saw you!');
        this.audio.blip(220, 0.15, 'square', 0.08);
      } else this.hud.toast('Car acquired.');
    } else {
      const car = this.player.exitCar();
      if (car && !this.parked.includes(car)) this.parked.push(car);
    }
  }
  doPunch() {
    const targets = [...this.peds.list, ...this.cops.list, ...this.missions.enemies];
    if (!this.player.punch(targets)) return;
    this.audio.punch();
    const seen = this.cops.list.some(c => dist2(c.x, c.z, this.player.x, this.player.z) < 900);
    if (seen) this.wanted.add(60);
    // Remove dead cops / enemies handled by their own hp checks below.
    for (let i = this.cops.list.length - 1; i >= 0; i--) {
      if (this.cops.list[i].hp <= 0) {
        this.scene.remove(this.cops.list[i].mesh);
        this.cops.list.splice(i, 1);
        this.wanted.add(200);
      }
    }
    for (let i = this.missions.enemies.length - 1; i >= 0; i--) {
      if (this.missions.enemies[i].hp <= 0) {
        this.scene.remove(this.missions.enemies[i].mesh);
        this.missions.enemies.splice(i, 1);
      }
    }
  }
  doShoot() {
    if (!this.player.shoot()) { if (this.player.ammo === 0) this.player.reload(); return; }
    this.audio.shot();
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const targets = [
      ...this.missions.enemies.map(e => e.mesh),
      ...this.cops.list.map(c => c.mesh),
      ...this.peds.list.map(p => p.mesh),
    ];
    const hits = this.raycaster.intersectObjects(targets, true);
    if (!hits.length) {
      this.peds.scare(this.player.x, this.player.z, 25);
      return;
    }
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
    const enemy = this.missions.enemies.find(e => e.mesh === obj);
    if (enemy) {
      this.missions.checkShot(this.raycaster);
      if (this.missions.enemies.length === 0 && this.missions.step && this.missions.step.type === 'shootout') {
        this.hud.toast('Crew eliminated.');
      }
      return;
    }
    const cop = this.cops.list.find(c => c.mesh === obj);
    if (cop) {
      cop.hp -= 34;
      this.wanted.add(120);
      if (cop.hp <= 0) {
        this.scene.remove(cop.mesh);
        this.cops.list.splice(this.cops.list.indexOf(cop), 1);
        this.wanted.add(150);
        this.hud.toast('Officer down — heat is way up.');
      }
      return;
    }
    const ped = this.peds.list.find(p => p.mesh === obj);
    if (ped) {
      this.scene.remove(ped.mesh);
      this.peds.list.splice(this.peds.list.indexOf(ped), 1);
      this.wanted.add(150);
      this.hud.toast('You shot a civilian!');
    }
    this.peds.scare(this.player.x, this.player.z, 25);
  }
  // ---- Simulation ----
  step(dt) {
    this.t += dt;
    this.gameMinutes += dt * 0.5;
    this.city.update(dt);
    const input = this.readInput();
    const p = this.player;
    if (this.screen === 'play') {
      p.update(dt);
      if (p.onFoot) {
        p.moveOnFoot(input, this.camYaw, dt, this.city.colliders);
      } else {
        const all = [...this.traffic.cars, ...this.policeCars.cars, ...this.parked];
        driveCar(p.car, input, dt, this.city.colliders, all);
        p.syncToCar();
        if (p.car.wrecked) {
          this.audio.crash();
          this.hud.toast('Your car is wrecked!');
          const car = p.exitCar();
          if (car && !this.parked.includes(car)) this.parked.push(car);
        }
        // Running over pedestrians.
        for (let i = this.peds.list.length - 1; i >= 0; i--) {
          const ped = this.peds.list[i];
          if (Math.abs(p.car.speed) > 5 && dist2(ped.x, ped.z, p.x, p.z) < 6) {
            this.scene.remove(ped.mesh);
            this.peds.list.splice(i, 1);
            this.wanted.add(150);
            this.audio.crash();
            this.hud.toast('You hit a pedestrian!');
          }
        }
      }
      // World life.
      this.traffic.update(dt, p.pos, this.city.colliders);
      this.peds.update(dt, p.pos, p.speed, !p.onFoot);
      this.cops.update(dt, p.pos, p.onFoot, this.wanted.stars,
        () => { if (this.rng() < 0.55) { p.damage(6); this.audio.shot(); } },
        () => this.endBusted());
      // Police cars chase; a nearby cop keeps the heat alive.
      const nearestCop = Math.min(
        ...this.policeCars.cars.map(c => Math.sqrt(dist2(c.x, c.z, p.x, p.z))),
        ...this.cops.list.map(c => Math.sqrt(dist2(c.x, c.z, p.x, p.z))),
        999);
      this.wanted.update(dt, nearestCop < 70);
      this.policeCars.update(dt, p.pos, p.car, this.wanted.stars, this.city.colliders,
        speed => {
          if (p.car) {
            p.car.hp -= Math.min(14, speed * 0.4);
            if (Math.abs(speed) > 10) this.audio.crash();
          } else if (p.damage(8)) this.audio.crash();
        });
      // Missions.
      const ev = this.missions.update(dt, { playerPos: p.pos, wanted: this.wanted.stars }, this.fx);
      if (ev === 'failed') {
        this.audio.fail();
        this.hud.showEnd('MISSION FAILED', `The job went sideways.<br>Press TRY AGAIN to take another run at <b>${this.missions.mission.name}</b>.`);
        this.screen = 'end';
      }
      if (p.health <= 0) { this.screen = 'end'; this.endWasted(); }
      // Audio follows the drive.
      this.audio.setEngine(!p.onFoot && p.car, p.car ? Math.abs(p.car.speed) / 34 : 0);
      this.audio.setSiren(this.wanted.stars > 0, this.t);
      // Camera follows the car heading unless the player drags it.
      if (!p.onFoot && p.car && !this.dragging) {
        let dh = wrapAngle(p.car.heading - this.camYaw);
        this.camYaw += dh * Math.min(1, dt * 1.2);
      }
      // HUD.
      const hh = Math.floor(this.gameMinutes / 60) % 24;
      const mm = Math.floor(this.gameMinutes % 60);
      this.hud.update({
        wanted: this.wanted.stars, health: p.health, money: p.money,
        clock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        objective: this.missions.objectiveText(),
        speed: p.speed, inCar: !p.onFoot,
        ammo: p.ammo, carHp: p.car ? p.car.hp : 0,
      });
      this.hud.drawMinimap({
        t: this.t, player: p,
        traffic: this.traffic.cars, police: this.policeCars.cars,
        marker: this.missions.step && this.missions.step.type !== 'escape' ? this.missions.step : null,
      });
    } else if (this.screen === 'title') {
      // Idle city life behind the title screen.
      this.traffic.update(dt, { x: 0, z: 0 }, this.city.colliders);
      this.peds.update(dt, { x: 0, z: 0 }, 0, false);
      this.camYaw += dt * 0.03;
      const cx = Math.sin(this.camYaw) * 120, cz = Math.cos(this.camYaw) * 120;
      this.camera.position.set(cx, 42, cz);
      this.camera.lookAt(0, 8, 0);
      return;
    }
    // Camera follow (play / pause / end).
    const target = p.onFoot ? p : p.car;
    const tx = target.x, tz = target.z;
    const dist = p.onFoot ? 7 : 9.5;
    const height = p.onFoot ? 3.4 : 4.0;
    const cx = tx - Math.sin(this.camYaw) * dist;
    const cz = tz - Math.cos(this.camYaw) * dist;
    this.camera.position.x = damp(this.camera.position.x, cx, 8, dt);
    this.camera.position.y = damp(this.camera.position.y, height, 8, dt);
    this.camera.position.z = damp(this.camera.position.z, cz, 8, dt);
    this.camera.lookAt(tx + Math.sin(this.camYaw) * 4, p.onFoot ? 1.8 : 1.4, tz + Math.cos(this.camYaw) * 4);
  }
  render() { this.renderer.render(this.scene, this.camera); }
  run() {
    let last = performance.now(), acc = 0;
    const frame = now => {
      requestAnimationFrame(frame);
      acc += Math.min((now - last) / 1000, 0.25);
      last = now;
      while (acc >= STEP && this.screen !== 'pause') {
        this.step(STEP);
        acc -= STEP;
        if (this.screen === 'end') { acc = 0; break; }
      }
      if (this.screen !== 'pause') this.render();
    };
    requestAnimationFrame(frame);
  }
  // ---- Deterministic shots for the dossier ----
  stageShot(name) {
    const stepN = n => { for (let i = 0; i < n; i++) this.step(STEP); };
    if (name === 'start') {
      this.screen = 'title';
      this.hud.setScreen('title');
      this.camYaw = 0.6;
      stepN(150);
      this.camera.position.set(-60, 30, 130);
      this.camera.lookAt(0, 10, -20);
      this.render();
    } else if (name === 'play' || name === 'chase') {
      this.screen = 'play';
      this.hud.setScreen('play');
      this.player.spawn(0, -40, 0);
      const car = this.parked[0];
      car.setPos(0, -40, 0); car.speed = 14;
      this.player.car = car; this.player.onFoot = false; this.player.mesh.visible = false;
      this.parked.splice(0, 1);
      this.camYaw = 0;
      this.nextMission = 0;
      // A few cars ahead on the same avenue so the frame reads as a living street.
      const ahead = [[-3.6, -8, 0], [3.6, 24, 0], [-3.6, 58, 0]];
      for (const [lx, lz, h] of ahead) {
        const tc = new Car(this.scene, [0xd33a2c, 0x2c6fd3, 0xe8b93a][Math.floor(this.rng() * 3)]);
        tc.setPos(lx, lz, h); tc.speed = 11;
        tc._axis = 'z'; tc._dir = 1; tc._lane = lx;
        this.traffic.cars.push(tc);
      }
      if (name === 'play') {
        this.missions.start(0, this.fx);
      } else {
        this.missions.start(2, this.fx);
        this.wanted.setStars(3);
        // Police in view: two closing from ahead, one behind.
        const spots = [[-12, 30, Math.PI], [12, 42, Math.PI], [-6, -78, 0]];
        for (const [px, pz, h] of spots) {
          const c = new Car(this.scene, 0, true);
          c.setPos(px, pz, h);
          c.speed = 20;
          this.policeCars.cars.push(c);
        }
      }
      // Drive forward a little so the scene is alive, then render.
      for (let i = 0; i < 100; i++) {
        this.keys.KeyW = true;
        this.step(STEP);
      }
      this.keys.KeyW = false;
      this.render();
    } else if (name === 'end') {
      this.screen = 'play';
      this.player.spawn(-87, 62, 0); // facing the garage, its sign in view
      this.player.money = 300;
      this.camYaw = 0;
      stepN(60);
      this.camera.position.set(-58, 16, 38);
      this.camera.lookAt(-87, 6, 87);
      this.hud.showEnd('MISSION COMPLETE', 'Homecoming done — Kross paid <b>$300</b>.<br>Four jobs to go, Mara.');
      this.screen = 'end';
      this.render();
    }
    window.__shotReady = true;
  }
}
