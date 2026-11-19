// Small shared helpers: seeded random, math, and circle-vs-AABB collision.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;
// Wrap an angle to [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
// Push a circle (x,z,r) out of an AABB {minX,maxX,minZ,maxZ}. Returns true if it hit.
export function circleVsAABB(p, r, box) {
  const cx = clamp(p.x, box.minX, box.maxX);
  const cz = clamp(p.z, box.minZ, box.maxZ);
  const dx = p.x - cx, dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * r;
    p.z = cz + (dz / d) * r;
  } else {
    // Center inside the box: push out along the smallest penetration axis.
    const pl = p.x - box.minX, pr = box.maxX - p.x, pt = p.z - box.minZ, pb = box.maxZ - p.z;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) p.x = box.minX - r; else if (m === pr) p.x = box.maxX + r;
    else if (m === pt) p.z = box.minZ - r; else p.z = box.maxZ + r;
  }
  return true;
}
