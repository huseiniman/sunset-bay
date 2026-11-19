// Sunset Bay: a procedural sun-soaked coastal city on a road grid.
// Roads run at fixed coordinates; blocks hold box buildings with canvas window
// textures, palms line the sidewalks, the south edge is a beach with a pier.
import { mulberry32, clamp } from './util.js';

export const BLOCK = 44, ROAD = 14, PITCH = BLOCK + ROAD; // 58 m between road centers
export const ROAD_COORDS = [-174, -116, -58, 0, 58, 116, 174];
export const CITY_HALF = 205;

function facadeTexture(base, lit) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 14) for (let x = 6; x < 58; x += 12) {
    g.fillStyle = Math.random() < 0.28 ? lit : '#202833';
    g.fillRect(x, y, 8, 9);
  }
  const t = new THREE.CanvasTexture(cv);
  return t;
}
function textTexture(text, bg, fg, w = 256, h = 64) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = 'bold 34px Verdana'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
  return new THREE.CanvasTexture(cv);
}

export function createCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  const M = {
    ground: new THREE.MeshLambertMaterial({ color: 0x7ba05f }),
    road: new THREE.MeshLambertMaterial({ color: 0x33373d }),
    walk: new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }),
    sand: new THREE.MeshLambertMaterial({ color: 0xe8d39a }),
    water: new THREE.MeshLambertMaterial({ color: 0x2e7fa8, transparent: true, opacity: 0.92 }),
    wood: new THREE.MeshLambertMaterial({ color: 0x8a6a42 }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
    palm: new THREE.MeshLambertMaterial({ color: 0x3f9e4d }),
    pole: new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
    cloud: new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  };
  const facades = [
    facadeTexture('#8a7f8a', '#ffd98a'), facadeTexture('#6f7f96', '#ffe9b0'), facadeTexture('#a08a6a', '#ffcf7a'),
  ];
  const addBox = (w, h, d, x, y, z, mat, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
    group.add(m); return m;
  };
  const plane = (w, d, x, z, mat, y = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
    group.add(m); return m;
  };

  // Ground, roads, sidewalks, beach, water.
  plane(700, 700, 0, 0, M.ground);
  for (const c of ROAD_COORDS) {
    plane(ROAD, 420, c, 0, M.road, 0.02);
    plane(420, ROAD, 0, c, M.road, 0.02);
    plane(3, 420, c - ROAD / 2 - 1.5, 0, M.walk, 0.01);
    plane(3, 420, c + ROAD / 2 + 1.5, 0, M.walk, 0.01);
    plane(420, 3, 0, c - ROAD / 2 - 1.5, M.walk, 0.01);
    plane(420, 3, 0, c + ROAD / 2 + 1.5, M.walk, 0.01);
  }
  // Dashed center lines.
  const dash = textTexture('— — — — — —', '#33373d', '#d8c25a', 256, 16);
  dash.wrapS = THREE.RepeatWrapping; dash.repeat.set(40, 1);
  for (const c of ROAD_COORDS) {
    const a = plane(0.5, 420, c, 0, new THREE.MeshLambertMaterial({ map: dash }), 0.03);
    a.material.map = dash.clone(); a.material.map.needsUpdate = true;
    const b = plane(420, 0.5, 0, c, new THREE.MeshLambertMaterial({ map: dash }), 0.03);
    b.material.map = dash.clone(); b.material.map.needsUpdate = true;
  }
  plane(700, 90, 0, 245, M.sand, 0.01);
  const water = plane(700, 460, 0, 480, M.water, 0.05);
  // Pier at x = 0 reaching into the sea.
  for (let z = 205; z <= 285; z += 8) addBox(10, 0.6, 7, 0, 0.6, z, M.wood);
  for (const px of [-4, 4]) for (let z = 208; z <= 284; z += 16) addBox(0.8, 1.6, 0.8, px, 0, z, M.wood);

  // Buildings: one or two per block.
  const addBuilding = (x, z, w, d, h, tex) => {
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const m = addBox(w, h, d, x, h / 2, z, mat);
    addBox(w + 1, 1, d + 1, x, h + 0.5, z, M.pole); // roof rim
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  };
  const downtown = (x, z) => Math.abs(x) <= 90 && Math.abs(z) <= 90;
  for (let i = 0; i < ROAD_COORDS.length - 1; i++) {
    for (let j = 0; j < ROAD_COORDS.length - 1; j++) {
      const x0 = ROAD_COORDS[i] + ROAD / 2 + 4, x1 = ROAD_COORDS[i + 1] - ROAD / 2 - 4;
      const z0 = ROAD_COORDS[j] + ROAD / 2 + 4, z1 = ROAD_COORDS[j + 1] - ROAD / 2 - 4;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (cz > 150) continue; // beach blocks stay open
      if (Math.abs(cx) < 20 && cz > 130) continue; // pier plaza
      if (Math.abs(cx + 87) < 20 && Math.abs(cz - 87) < 20) continue; // garage block
      if (Math.abs(cx - 87) < 20 && Math.abs(cz + 87) < 20) continue; // hospital block
      const tex = facades[Math.floor(rng() * facades.length)];
      const hMax = downtown(cx, cz) ? 62 : (Math.abs(cx) > 130 || Math.abs(cz) > 130 ? 16 : 28);
      if (rng() < 0.55) {
        addBuilding(cx, cz, 26 + rng() * 8, 26 + rng() * 8, 8 + rng() * hMax, tex);
      } else {
        addBuilding(cx - 9, cz - 8, 15, 15, 7 + rng() * hMax * 0.7, tex);
        addBuilding(cx + 9, cz + 8, 15, 15, 7 + rng() * hMax * 0.8, tex);
      }
    }
  }
  // Landmark: Kross Garage (mission hub) and the hospital (respawn).
  const garage = { x: -87, z: 87 };
  addBuilding(garage.x, garage.z, 30, 18, 9, facades[1]);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 5),
    new THREE.MeshLambertMaterial({ map: textTexture('KROSS GARAGE', '#20242c', '#ffb347') }));
  sign.position.set(garage.x, 10.5, garage.z - 9.6); sign.rotation.y = Math.PI; group.add(sign);
  const hospital = { x: 87, z: -87 };
  addBuilding(hospital.x, hospital.z, 26, 20, 14, facades[2]);
  const hsign = new THREE.Mesh(new THREE.PlaneGeometry(16, 5),
    new THREE.MeshLambertMaterial({ map: textTexture('HOSPITAL +', '#f2f2f2', '#d33') }));
  hsign.position.set(hospital.x, 15.5, hospital.z - 10.6); hsign.rotation.y = Math.PI; group.add(hsign);

  // Palms along sidewalks and the beach; lamps along roads.
  const palms = [];
  const addPalm = (x, z) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), M.trunk);
    trunk.position.y = 3.5; trunk.castShadow = true; g.add(trunk);
    for (let k = 0; k < 6; k++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 4), M.palm);
      frond.position.y = 7.4; frond.rotation.z = 1.1; frond.rotation.y = (k / 6) * Math.PI * 2;
      frond.castShadow = true; g.add(frond);
    }
    g.position.set(x, 0, z); group.add(g); palms.push(g);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  };
  for (const c of ROAD_COORDS) for (let t = -180; t <= 180; t += 36) {
    // Palms line the sidewalks, never the crossing roads (a palm in the
    // middle of an intersection would block traffic).
    const tt = t + (rng() - 0.5) * 8;
    const crossesRoad = ROAD_COORDS.some(rc => Math.abs(tt - rc) < 11);
    if (!crossesRoad && rng() < 0.7) addPalm(c + ROAD / 2 + 3.5, tt);
    if (!crossesRoad && rng() < 0.7) addPalm(tt, c + ROAD / 2 + 3.5);
  }
  for (let x = -180; x <= 180; x += 18) addPalm(x, 205 + rng() * 8);
  const lamps = [];
  for (const c of ROAD_COORDS) for (let t = -160; t <= 160; t += 58) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), M.pole);
    pole.position.set(c + ROAD / 2 + 2, 3, t); pole.castShadow = true; group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffdf80 }));
    bulb.position.set(c + ROAD / 2 + 2, 6.1, t); group.add(bulb); lamps.push(bulb);
  }
  // Traffic lights at five central intersections; one shared cycle.
  const lightHeads = [];
  const lightSpots = [[0, 0], [58, 0], [-58, 0], [0, 58], [0, -58]];
  for (const [lx, lz] of lightSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.5, 6), M.pole);
    pole.position.set(lx + 8.5, 2.75, lz + 8.5); pole.castShadow = true; group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), M.pole);
    head.position.set(lx + 8.5, 5.8, lz + 8.5); group.add(head);
    const dots = [];
    for (let k = 0; k < 3; k++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x330000, emissive: 0x220000 }));
      d.position.set(lx + 8.5, 6.6 - k * 0.7, lz + 8.5 + 0.48); group.add(d); dots.push(d);
    }
    lightHeads.push({ x: lx, z: lz, dots });
  }
  // Billboards for skyline flavor.
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(30, 9),
    new THREE.MeshLambertMaterial({ map: textTexture('SUNSET BAY', '#e2672a', '#fff', 512, 128) }));
  bb.position.set(-58, 26, -174); bb.rotation.y = 0; group.add(bb);
  const bb2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 9),
    new THREE.MeshLambertMaterial({ map: textTexture('PALM  BEACH  •  PIER', '#1c5f7a', '#ffe9b0', 512, 128) }));
  bb2.position.set(116, 20, 174); bb2.rotation.y = Math.PI; group.add(bb2);
  // Drifting clouds.
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + rng() * 6, 8, 6), M.cloud);
      s.scale.y = 0.35; s.position.set(k * 8 - 8, rng() * 2, rng() * 4); g.add(s);
    }
    g.position.set(rng() * 400 - 200, 65 + rng() * 25, rng() * 400 - 200);
    group.add(g); clouds.push(g);
  }
  // Lights.
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.3);
  sun.position.set(100, 190, 140); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a55, 0.95));

  let cycle = 0; // traffic-light cycle, seconds
  return {
    colliders, garage, hospital, pier: { x: 0, z: 240 },
    // 'ns' = north-south roads green, 'ew' = east-west roads green.
    lightState() { return (cycle % 16) < 8 ? 'ns' : 'ew'; },
    update(dt) {
      cycle += dt;
      const st = this.lightState();
      for (const h of lightHeads) {
        h.dots[0].material.emissive.setHex(st === 'ns' ? 0x220000 : 0xff2211);
        h.dots[2].material.emissive.setHex(st === 'ns' ? 0x22ff44 : 0x002200);
      }
      water.position.y = 0.05 + Math.sin(cycle * 0.5) * 0.06;
      for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 260) c.position.x = -260; }
    },
  };
}
