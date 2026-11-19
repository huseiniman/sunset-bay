// HUD: DOM panels (stars, health, money, objective, dialogue, speed) and the
// 2D minimap canvas that mirrors the city, the player, the mission and the law.
import { ROAD_COORDS } from './city.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'stars', 'health', 'money', 'clock', 'objective', 'msg', 'speed', 'carhp', 'crosshair', 'toast', 'title', 'pause', 'end', 'end-title', 'end-text', 'status']) {
      this.el[id] = document.getElementById(id);
    }
    this.map = document.getElementById('minimap').getContext('2d');
    this.sayTimer = null; this.toastTimer = null;
    this.msgQueue = []; this.msgBusy = false;
  }
  setScreen(name) {
    for (const k of ['title', 'pause', 'end']) this.el[k].classList.toggle('on', k === name);
    this.el.hud.classList.toggle('on', name === 'play');
    this.el.crosshair.style.display = name === 'play' ? 'block' : 'none';
  }
  showEnd(title, text) {
    this.el['end-title'].textContent = title;
    this.el['end-text'].innerHTML = text;
    this.setScreen('end');
  }
  announce(text) { this.el.status.textContent = text; }
  say(lines) {
    this.msgQueue = lines.slice();
    if (!this.msgBusy) this.nextSay();
  }
  nextSay() {
    const line = this.msgQueue.shift();
    if (!line) { this.el.msg.style.display = 'none'; this.msgBusy = false; return; }
    this.msgBusy = true;
    this.el.msg.innerHTML = line;
    this.el.msg.style.display = 'block';
    clearTimeout(this.sayTimer);
    this.sayTimer = setTimeout(() => this.nextSay(), 3600);
  }
  toast(text, ms = 2600) {
    const t = this.el.toast;
    t.textContent = text; t.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.style.display = 'none'; }, ms);
  }
  update(s) {
    // Wanted stars.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="${i < s.wanted ? '' : 'off'}">★</span>`;
    this.el.stars.innerHTML = stars;
    this.el.health.style.width = `${Math.max(0, s.health)}%`;
    this.el.health.style.background = s.health > 50 ? 'linear-gradient(90deg,#37d67a,#a8e063)' : s.health > 25 ? 'linear-gradient(90deg,#e8b93a,#f0d060)' : 'linear-gradient(90deg,#d33a2c,#f06a5a)';
    this.el.money.textContent = `$${s.money.toLocaleString('en-US')}`;
    this.el.clock.textContent = s.clock;
    this.el.objective.innerHTML = s.objective;
    const mph = Math.round(s.speed * 2.237);
    this.el.speed.innerHTML = s.inCar ? `${mph} <small>mph</small>` : `${s.ammo} <small>ammo</small>`;
    this.el.carhp.style.display = s.inCar ? 'block' : 'none';
    if (s.inCar) this.el.carhp.textContent = `CAR ${Math.max(0, Math.round(s.carHp))}%`;
    this.el.crosshair.style.display = s.inCar ? 'none' : 'block';
  }
  drawMinimap(w) {
    const g = this.map, S = 190, C = 95;
    const scale = S / 470; // world -235..235 maps to the canvas
    const px = x => C + x * scale, pz = z => C + z * scale;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#16283a'; g.fillRect(0, 0, S, S);
    // Sea at the south edge.
    g.fillStyle = '#2e7fa8'; g.fillRect(0, pz(195), S, S - pz(195));
    g.fillStyle = '#e8d39a'; g.fillRect(0, pz(185), S, pz(205) - pz(185));
    // City blocks.
    g.fillStyle = '#2c3a2c';
    for (let i = 0; i < ROAD_COORDS.length - 1; i++) for (let j = 0; j < ROAD_COORDS.length - 1; j++) {
      const x0 = ROAD_COORDS[i] + 7, x1 = ROAD_COORDS[i + 1] - 7;
      const z0 = ROAD_COORDS[j] + 7, z1 = ROAD_COORDS[j + 1] - 7;
      g.fillRect(px(x0), pz(z0), (x1 - x0) * scale, (z1 - z0) * scale);
    }
    // Roads.
    g.strokeStyle = '#5a636e'; g.lineWidth = 14 * scale;
    for (const c of ROAD_COORDS) {
      g.beginPath(); g.moveTo(px(c), 0); g.lineTo(px(c), S); g.stroke();
      g.beginPath(); g.moveTo(0, pz(c)); g.lineTo(S, pz(c)); g.stroke();
    }
    // Traffic dots.
    g.fillStyle = '#cfd8e3';
    for (const c of w.traffic) g.fillRect(px(c.x) - 1, pz(c.z) - 1, 2, 2);
    // Police (flashing blue).
    if (Math.floor(w.t * 2) % 2 === 0) {
      g.fillStyle = '#3a86ff';
      for (const c of w.police) { g.beginPath(); g.arc(px(c.x), pz(c.z), 3, 0, 7); g.fill(); }
    }
    // Mission blip (pulsing gold).
    if (w.marker) {
      const r = 4 + Math.sin(w.t * 5) * 1.5;
      g.fillStyle = '#ffb347';
      g.beginPath(); g.arc(px(w.marker.x), pz(w.marker.z), r, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
    }
    // Player arrow.
    g.save();
    g.translate(px(w.player.x), pz(w.player.z));
    g.rotate(-w.player.heading + Math.PI);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();
    g.restore();
    // North.
    g.fillStyle = '#fff'; g.font = 'bold 11px Verdana'; g.fillText('N', 6, 14);
  }
}
