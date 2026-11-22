// Autopilot: memainkan aturan asli — A* di grid kasar dengan biaya
// tambahan di dalam kerucut visi penjaga/CCTV, supaya ia menunggu &
// menghindar seperti pemain sungguhan. Tanpa jalan pintas: ia menekan
// tombol yang sama (gerak, E, Q) lewat input yang sama.
import { WORLD, RULES, TOOLS } from './config.js';
import { LEVEL, solidBoxes, circleHitsBox, pointInAABB, compartmentOf } from './level.js';
import { guardCone } from './guards.js';
import { cameraCone } from './cameras.js';

const CELL = 1.0;
const GRID_W = 36; // x -18..18
const GRID_H = 14; // z -7..7
const REPLAN_SECONDS = 0.4;

function toCell(x, z) {
  return {
    cx: Math.max(0, Math.min(GRID_W - 1, Math.floor(x + 18))),
    cz: Math.max(0, Math.min(GRID_H - 1, Math.floor(z + 7))),
  };
}
function toWorld(cx, cz) {
  return { x: cx - 18 + 0.5, z: cz - 7 + 0.5 };
}
function cellKey(cx, cz) { return cz * GRID_W + cx; }

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pointInCone(x, z, cone) {
  const dx = x - cone.x;
  const dz = z - cone.z;
  const dist = Math.hypot(dx, dz);
  if (dist > cone.range) return false;
  if (dist < 0.4) return true;
  return Math.abs(angleDiff(Math.atan2(dz, dx), cone.angle)) < cone.half;
}

// Peta biaya grid: 0 = bebas, Infinity = padat, >1 = berbahaya (kerucut).
function buildCostGrid(state, avoidCones) {
  const grid = new Float32Array(GRID_W * GRID_H).fill(1);
  const solids = solidBoxes(state.doorStates);
  for (let cz = 0; cz < GRID_H; cz += 1) {
    for (let cx = 0; cx < GRID_W; cx += 1) {
      const w = toWorld(cx, cz);
      if (w.x < WORLD.minX + 0.4 || w.x > WORLD.maxX - 0.4 || w.z < WORLD.minZ + 0.4 || w.z > WORLD.maxZ - 0.4) {
        grid[cellKey(cx, cz)] = Infinity;
        continue;
      }
      for (const b of solids) {
        // Padding 0.48: cukup di atas radius pemain (0.45) agar jalur aman,
        // cukup kecil agar sel di celah pintu (jarak 0.5 ke sekat) tetap lolos.
        if (circleHitsBox(w.x, w.z, 0.48, b)) { grid[cellKey(cx, cz)] = Infinity; break; }
      }
    }
  }
  if (avoidCones) {
    const cones = [];
    for (const g of state.guards) cones.push(guardCone(g, state.tunnel.darkness));
    for (const c of state.cameras) cones.push(cameraCone(c, state.tunnel.darkness));
    for (let cz = 0; cz < GRID_H; cz += 1) {
      for (let cx = 0; cx < GRID_W; cx += 1) {
        const key = cellKey(cx, cz);
        if (!Number.isFinite(grid[key])) continue;
        const w = toWorld(cx, cz);
        for (const cone of cones) {
          if (pointInCone(w.x, w.z, cone)) { grid[key] += 7; break; }
        }
        for (const g of state.guards) {
          if (Math.hypot(g.x - w.x, g.z - w.z) < 1.6) { grid[key] += 3; break; }
        }
      }
    }
  }
  return grid;
}

// Sel bebas terdekat dari (cx, cz), mencari melingkar sampai radius 4.
function nearestFreeCell(grid, cx, cz) {
  if (Number.isFinite(grid[cellKey(cx, cz)])) return { cx, cz };
  for (let r = 1; r <= 4; r += 1) {
    let best = null;
    let bestD = Infinity;
    for (let dz = -r; dz <= r; dz += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID_W || nz >= GRID_H) continue;
        if (!Number.isFinite(grid[cellKey(nx, nz)])) continue;
        const d = Math.abs(dx) + Math.abs(dz);
        if (d < bestD) { bestD = d; best = { cx: nx, cz: nz }; }
      }
    }
    if (best) return best;
  }
  return null;
}

function astar(grid, start, goal) {
  // Tujuan boleh di sel yang padat (peti menempel cover/dinding):
  // pakai sel bebas terdekat sebagai tujuan sebenarnya.
  goal = nearestFreeCell(grid, goal.cx, goal.cz);
  if (!goal) return null;
  const goalKey = cellKey(goal.cx, goal.cz);
  const startKey = cellKey(start.cx, start.cz);
  if (!Number.isFinite(grid[startKey])) {
    // Pemain menempel dinding: cari sel bebas terdekat sebagai awal.
    let best = null;
    let bestD = Infinity;
    for (let cz = 0; cz < GRID_H; cz += 1) {
      for (let cx = 0; cx < GRID_W; cx += 1) {
        if (!Number.isFinite(grid[cellKey(cx, cz)])) continue;
        const d = Math.abs(cx - start.cx) + Math.abs(cz - start.cz);
        if (d < bestD) { bestD = d; best = { cx, cz }; }
      }
    }
    if (!best) return null;
    start.cx = best.cx; start.cz = best.cz;
  }
  const open = [{ key: cellKey(start.cx, start.cz), cx: start.cx, cz: start.cz, g: 0, f: 0 }];
  const came = new Map();
  const gScore = new Map([[cellKey(start.cx, start.cz), 0]]);
  const closed = new Set();
  const h = (cx, cz) => Math.abs(cx - goal.cx) + Math.abs(cz - goal.cz);
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const curKey = cellKey(cur.cx, cur.cz);
    if (curKey === goalKey) {
      const path = [];
      let k = curKey;
      let node = cur;
      path.push({ cx: node.cx, cz: node.cz });
      while (came.has(k)) {
        node = came.get(k);
        path.push({ cx: node.cx, cz: node.cz });
        k = cellKey(node.cx, node.cz);
      }
      path.reverse();
      return path;
    }
    if (closed.has(curKey)) continue;
    closed.add(curKey);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dz] of dirs) {
      const nx = cur.cx + dx;
      const nz = cur.cz + dz;
      if (nx < 0 || nz < 0 || nx >= GRID_W || nz >= GRID_H) continue;
      const nKey = cellKey(nx, nz);
      const cost = grid[nKey];
      if (!Number.isFinite(cost)) continue;
      // Diagonal tidak boleh memotong sudut dinding.
      if (dx !== 0 && dz !== 0) {
        if (!Number.isFinite(grid[cellKey(cur.cx + dx, cur.cz)]) || !Number.isFinite(grid[cellKey(cur.cx, cur.cz + dz)])) continue;
      }
      const stepCost = cost * (dx !== 0 && dz !== 0 ? 1.41 : 1);
      const ng = cur.g + stepCost;
      if (ng < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, ng);
        came.set(nKey, { cx: cur.cx, cz: cur.cz });
        open.push({ key: nKey, cx: nx, cz: nz, g: ng, f: ng + h(nx, nz) });
      }
    }
  }
  return null;
}

export function createAutopilot() {
  let path = null;
  let pathTarget = null;
  let replanTimer = 0;
  let stuckTimer = 0;
  let lastPos = null;
  let ignoreConesUntil = 0;
  let doorWaitTimer = 0;
  let decoyCooldown = 0;
  let waypointTimer = 0; // waktu mengejar waypoint saat ini
  let coneWaitTimer = 0; // waktu menunggu cone penjaga lewat

  function nearestLootTarget(state) {
    let best = null;
    let bestD = Infinity;
    for (const l of state.loot) {
      if (l.taken) continue;
      const d = Math.hypot(l.x - state.player.x, l.z - state.player.z);
      if (d < bestD) { bestD = d; best = l; }
    }
    return best;
  }

  function decide(state, dt) {
    const p = state.player;
    const out = { mx: 0, mz: 0, sneak: false, interact: false, decoy: false };
    if (state.over) return out;

    // Baru respawn sesudah ketahuan: diam 1 detik, biarkan penjaga lewat.
    if (state.player.invulnerable > 2.0) {
      return { mx: 0, mz: 0, sneak: false, interact: false, decoy: false };
    }

    // Ancaman terdekat: penjaga mengejar / curiga.
    decoyCooldown -= dt;
    const chaser = state.guards.find((g) => g.state === 'alert' && Math.hypot(g.x - p.x, g.z - p.z) < 6);
    const worrier = state.guards.find((g) => g.state === 'suspicious' && Math.hypot(g.x - p.x, g.z - p.z) < 4.5);
    if ((chaser || worrier) && state.decoys > 0 && decoyCooldown <= 0) {
      out.decoy = true;
      decoyCooldown = 5;
    }

    // KABUR: penjaga mengejar dari dekat -> lari ke checkpoint gerbong
    // (bergerak membatalkan channel membobol — lebih baik hidup).
    let fleeTarget = null;
    if (chaser && Math.hypot(chaser.x - p.x, chaser.z - p.z) < 5.5) {
      const comp = compartmentOf(p.x);
      let cp = LEVEL.checkpoints.find((c) => c.compartment === comp);
      if (Math.hypot(cp.x - p.x, cp.z - p.z) < 2) {
        const others = LEVEL.checkpoints.filter((c) => c.compartment !== comp);
        cp = others.reduce((best, c) => (Math.hypot(c.x - p.x, c.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z) ? c : best), others[0]);
      }
      fleeTarget = { x: cp.x, z: cp.z };
    }

    // Saat membobol peti (dan tidak sedang dikejar): diam di tempat.
    if (state.channel && !fleeTarget) {
      return { mx: 0, mz: 0, sneak: false, interact: false, decoy: out.decoy };
    }

    // Target: kabur, lalu peti terdekat, lalu EXIT.
    let target;
    let targetKind;
    if (fleeTarget) { target = fleeTarget; targetKind = 'flee'; }
    else {
      const loot = nearestLootTarget(state);
      if (loot) { target = { x: loot.x, z: loot.z }; targetKind = 'loot'; }
      else { target = { x: LEVEL.exit.x, z: LEVEL.exit.z }; targetKind = 'exit'; }
    }

    // Ambil peti / buka pintu saat sudah dekat.
    if (targetKind === 'loot' && Math.hypot(target.x - p.x, target.z - p.z) < RULES.interactRange * 0.9) {
      out.interact = true;
    }

    // Rencana ulang berkala atau saat target berubah.
    replanTimer -= dt;
    const targetKey = `${targetKind}:${target.x},${target.z}`;
    if (replanTimer <= 0 || targetKey !== pathTarget) {
      replanTimer = REPLAN_SECONDS;
      pathTarget = targetKey;
      const avoid = state.time > ignoreConesUntil;
      const grid = buildCostGrid(state, avoid);
      const start = toCell(p.x, p.z);
      const goal = toCell(target.x, target.z);
      path = astar(grid, start, goal);
      if (!path && avoid) {
        // Tanpa penghindaran kerucut (koridor tertutup cone).
        const grid2 = buildCostGrid(state, false);
        path = astar(grid2, toCell(p.x, p.z), goal);
        ignoreConesUntil = state.time + 3;
      }
      if (!path) {
        // Jalur tertutup pintu? Tuju pintu tertutup terdekat di antara kita & target.
        let bestDoor = null;
        let bestD = Infinity;
        for (const d of state.doors) {
          if (d.state !== 'closed') continue;
          const dist = Math.hypot(d.x - p.x, d.z - p.z);
          if (dist < bestD) { bestD = dist; bestDoor = d; }
        }
        if (bestDoor) {
          const grid3 = buildCostGrid(state, false);
          // Sel di depan pintu (sisi pemain).
          const side = p.x < bestDoor.x ? -1.4 : 1.4;
          path = astar(grid3, toCell(p.x, p.z), toCell(bestDoor.x + side, bestDoor.z));
          pathTarget = `door:${bestDoor.id}`;
          if (path) {
            doorWaitTimer = 0;
          }
        }
      }
    }

    // Menuju pintu: tekan E saat cukup dekat.
    if (pathTarget && pathTarget.startsWith('door:')) {
      const doorId = Number.parseInt(pathTarget.split(':')[1], 10);
      const door = state.doors.find((d) => d.id === doorId);
      if (door) {
        const d = Math.hypot(door.x - p.x, door.z - p.z);
        if (d < RULES.interactRange + 0.3) {
          out.interact = true;
          doorWaitTimer += dt;
          if (door.state === 'open' || doorWaitTimer > 3) {
            pathTarget = null;
            replanTimer = 0;
          }
          return out;
        }
      }
    }

    if (!path || path.length < 2) {
      // Sudah di sel target atau tanpa jalur: gerak lurus ke target bila aman.
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.2) {
        out.mx = dx / dist;
        out.mz = dz / dist;
      }
      out.sneak = state.guards.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 5 && g.state !== 'alert') && !fleeTarget;
      return out;
    }

    // Ikuti waypoint berikutnya; lewati yang sudah dekat.
    // Bila satu waypoint tak tercapai >2.5 detik (terjepit), lewati saja.
    while (path.length > 1) {
      const w = toWorld(path[1].cx, path[1].cz);
      if (Math.hypot(w.x - p.x, w.z - p.z) < 0.35) { path.shift(); waypointTimer = 0; }
      else break;
    }
    waypointTimer += dt;
    if (waypointTimer > 2.5 && path.length > 2) {
      path.shift();
      waypointTimer = 0;
    }
    const next = toWorld(path[1].cx, path[1].cz);
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      out.mx = dx / dist;
      out.mz = dz / dist;
    }
    // Menyelinap saat penjaga dekat (lebih lambat, lebih sulit terlihat).
    const nearGuard = state.guards.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 5 && g.state !== 'alert');
    out.sneak = nearGuard && !fleeTarget;

    // Deteksi macet: tidak ada kemajuan -> abaikan biaya cone sebentar.
    if (lastPos) {
      const moved = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
      if (moved < 0.02) {
        stuckTimer += dt;
        if (stuckTimer > 1.5) {
          ignoreConesUntil = state.time + 4;
          stuckTimer = 0;
          replanTimer = 0;
        }
      } else stuckTimer = 0;
    }
    lastPos = { x: p.x, z: p.z };
    return out;
  }

  return { decide };
}
