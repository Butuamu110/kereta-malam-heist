// Tata letak Gerbong Emas: tiga gerbong, dinding, cover, pintu,
// peti emas, jalur patroli, CCTV, EXIT. Semua angka dalam unit dunia
// (x sepanjang kereta -17..17, z lebar gerbong -6..6).
import { WORLD } from './config.js';

// AABB: {x, z} = pusat, w = lebar (sumbu x), d = dalam (sumbu z).
export function aabb(cx, cz, w, d) {
  return { x: cx, z: cz, w, d, minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

export function pointInAABB(x, z, box, pad) {
  const p = pad || 0;
  return x > box.minX - p && x < box.maxX + p && z > box.minZ - p && z < box.maxZ + p;
}

// Lingkaran (pemain/penjaga) vs AABB: true bila bertabrakan.
export function circleHitsBox(x, z, r, box) {
  const cx = Math.max(box.minX, Math.min(x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// Segmen (x1,z1)-(x2,z2) vs AABB (slab test): true bila garis menembus kotak.
export function segmentHitsBox(x1, z1, x2, z2, box) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < box.minX || x1 > box.maxX) return false;
  } else {
    let t1 = (box.minX - x1) / dx;
    let t2 = (box.maxX - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z1 < box.minZ || z1 > box.maxZ) return false;
  } else {
    let t1 = (box.minZ - z1) / dz;
    let t2 = (box.maxZ - z1) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

export const LEVEL = (() => {
  // Dinding luar (tebal, di luar area jalan).
  const walls = [
    aabb(0, -6.6, 36.4, 1.2),   // utara
    aabb(0, 6.6, 36.4, 1.2),    // selatan
    aabb(-17.6, 0, 1.2, 13.2),  // barat (belakang kereta)
    aabb(17.6, 0, 1.2, 13.2),   // timur (menuju lokomotif)
  ];
  // Sekat antar-gerbong, masing-masing menyisakan celah pintu di tengah (z -1..1).
  const partitions = [
    { x: -5.5, segments: [aabb(-5.5, -3.5, 0.7, 5), aabb(-5.5, 3.5, 0.7, 5)] },
    { x: 6.5, segments: [aabb(6.5, -3.5, 0.7, 5), aabb(6.5, 3.5, 0.7, 5)] },
  ];
  for (const p of partitions) walls.push(...p.segments);

  // Cover: sofa, meja, bar, tumpukan koper — menghalangi gerak & pandangan.
  // label dipakai render untuk memilih bentuk/warna.
  const covers = [
    // Gerbong A (belakang)
    { box: aabb(-13.5, -3.8, 3.5, 1.4), kind: 'sofa' },
    { box: aabb(-13.5, 3.8, 3.5, 1.4), kind: 'sofa' },
    { box: aabb(-9.5, 0, 2.0, 2.0), kind: 'table' },
    { box: aabb(-15.8, 4.2, 1.6, 1.6), kind: 'luggage' },
    { box: aabb(-8, -4.6, 1.4, 1.4), kind: 'chair' },
    // Gerbong B (tengah, ruang makan + bar)
    { box: aabb(-2, -3.5, 3.0, 1.6), kind: 'table' },
    { box: aabb(-2, 3.5, 3.0, 1.6), kind: 'table' },
    { box: aabb(2.5, -4.9, 4.0, 1.2), kind: 'bar' },
    { box: aabb(4.5, 3.8, 2.5, 1.4), kind: 'sofa' },
    { box: aabb(5.5, -3, 1.5, 1.5), kind: 'luggage' },
    // Gerbong C (depan)
    { box: aabb(8.5, -3.8, 3.0, 1.4), kind: 'sofa' },
    { box: aabb(8.5, 3.8, 3.0, 1.4), kind: 'sofa' },
    { box: aabb(13, 0, 2.2, 2.2), kind: 'table' },
    { box: aabb(16, 4.5, 1.2, 1.2), kind: 'luggage' },
    { box: aabb(12, 4.5, 1.4, 1.4), kind: 'chair' },
  ];

  // Pintu geser antar-gerbong (tertutup di awal, dibuka dengan E).
  const doors = [
    { id: 0, x: -5.5, z: 0, box: aabb(-5.5, 0, 0.7, 2.0), label: 'PINTU GERBONG A–B' },
    { id: 1, x: 6.5, z: 0, box: aabb(6.5, 0, 0.7, 2.0), label: 'PINTU GERBONG B–C' },
  ];

  // Tiga peti emas.
  const lootSpots = [
    { id: 0, x: -16.0, z: -4.8, name: 'Peti Emas I', compartment: 'A' },
    { id: 1, x: -0.5, z: 4.8, name: 'Peti Emas II', compartment: 'B' },
    { id: 2, x: 15.8, z: -4.8, name: 'Peti Emas III', compartment: 'C' },
  ];

  // Jalur patroli kondektur (waypoint di ruang terbuka, bebas halangan).
  const guardDefs = [
    { id: 0, name: 'Kondektur Budi', kind: 'guard', waypoints: [[-14, -3], [-9, 3], [-14, 3], [-9, -3]] },
    { id: 1, name: 'Kondektur Sari', kind: 'guard', waypoints: [[-4, -2], [4, 2], [4, -2], [-4, 2]] },
    { id: 2, name: 'Kondektur Rudi', kind: 'guard', waypoints: [[4, -3], [11, 3], [11, -3], [4, 3]] },
    { id: 3, name: 'Kondektur Dewi', kind: 'guard', waypoints: [[9, -4], [15, 4], [15, -4], [9, 4]] },
    { id: 4, name: 'Masinis Joko', kind: 'engineer', waypoints: [[12, 2.5], [16, 2.5]] },
    { id: 5, name: 'Anjing K-9 Rex', kind: 'dog', waypoints: [[-4, -1.5], [5, -1.5]] },
  ];

  // CCTV di sudut langit-langit, menyapu ruangan.
  const cameraDefs = [
    { id: 0, x: -11, z: -5.7, baseAngle: Math.PI / 2, compartment: 'A' },
    { id: 1, x: 0, z: 5.7, baseAngle: -Math.PI / 2, compartment: 'B' },
    { id: 2, x: 11, z: 5.7, baseAngle: -Math.PI / 2, compartment: 'C' },
  ];

  const exit = { x: 16.4, z: 0 };
  const start = { x: -15.5, z: 0 };
  // Titik kembali sesudah ketahuan: pintu masuk gerbong tempat pemain berada.
  const checkpoints = [
    { x: -15.5, z: 0, compartment: 'A' },
    { x: -4.5, z: 0, compartment: 'B' },
    { x: 7.5, z: 0, compartment: 'C' },
  ];

  return { walls, covers, doors, lootSpots, guardDefs, cameraDefs, exit, start, checkpoints };
})();

// Semua penghalang padat untuk tabrakan & garis pandang (dinding + cover).
export function solidBoxes(doorStates) {
  const boxes = [...LEVEL.walls];
  for (const c of LEVEL.covers) boxes.push(c.box);
  for (const d of LEVEL.doors) {
    if (!doorStates[d.id] || !doorStates[d.id].open) boxes.push(d.box);
  }
  return boxes;
}

// Garis pandang bersih? (dinding/cover menghalangi; pintu tertutup juga.)
export function losClear(x1, z1, x2, z2, doorStates) {
  const boxes = solidBoxes(doorStates);
  for (const b of boxes) {
    if (segmentHitsBox(x1, z1, x2, z2, b)) return false;
  }
  return true;
}

// Gerbong tempat sebuah posisi berada.
export function compartmentOf(x) {
  if (x < -5.5) return 'A';
  if (x < 6.5) return 'B';
  return 'C';
}

export function clampToWorld(x, z) {
  return {
    x: Math.max(WORLD.minX + 0.5, Math.min(WORLD.maxX - 0.5, x)),
    z: Math.max(WORLD.minZ + 0.5, Math.min(WORLD.maxZ - 0.5, z)),
  };
}
