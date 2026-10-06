// src/render/particles.js
// Particle pools for render-side effects. Particles are reused instead of allocated per burst. Live
// particles sit at the front of `items`; a dead one is swapped with the last live one, so nothing is
// spliced mid-array and bursts don't create garbage.

export function createParticlePool(make = () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 1, age: 0, w: 0, h: 0, c: "" })) {
  return { items: [], count: 0, make };
}

export function allocParticle(pool) {
  if (pool.count === pool.items.length) pool.items.push(pool.make());
  return pool.items[pool.count++];
}

export function freeParticle(pool, i) {
  const last = --pool.count;
  if (i !== last) {
    const dead = pool.items[i];
    pool.items[i] = pool.items[last];
    pool.items[last] = dead;
  }
}
