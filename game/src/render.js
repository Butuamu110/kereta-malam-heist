// Render Three.js + HUD DOM + minimap untuk Gerbong Emas.
// Kamera oblique top-down mengikuti pencuri; goyangan kereta &
// gelap terowongan hidup di cahaya. Cone visi = sektor transparan
// di lantai (kuning patroli, oranye curiga, merah kejar).
import * as THREE from 'three';
import { WORLD, PALETTE, TRAIN, RULES } from './config.js';
import { LEVEL } from './level.js';
import { guardCone } from './guards.js';
import { cameraCone } from './cameras.js';
import { swayOffset } from './train.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_WIN = 'win';
export const SCREEN_LOSE = 'lose';
export const SCREEN_PAUSED = 'paused';

// Geometri sektor (kipas) di bidang XZ, puncak di origin, menghadap +X.
function makeSectorGeometry(range, halfAngle, segments) {
  const positions = [0, 0, 0];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = -halfAngle + (2 * halfAngle * i) / segments;
    positions.push(Math.cos(a) * range, 0, Math.sin(a) * range);
    if (i > 0) indices.push(0, i, i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeTextSprite(text, opts) {
  const o = opts || {};
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(o.w || 3.2, o.h || 1.2, 1);
  function redraw(t, color, bg) {
    ctx.clearRect(0, 0, 256, 96);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(6, 14, 244, 68, 14);
      ctx.fill();
    }
    ctx.font = `bold ${o.font || 44}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#ffd34d';
    ctx.fillText(t, 128, 50);
    tex.needsUpdate = true;
  }
  redraw(text, o.color, o.bg);
  sprite.userData.redraw = redraw;
  return sprite;
}

// Tekstur lantai: papan kayu + karpet marun tengah + garis kuningan + nama gerbong.
function makeFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5d3a1e';
  ctx.fillRect(0, 0, 1024, 384);
  for (let y = 0; y < 384; y += 32) {
    ctx.fillStyle = y % 64 === 0 ? '#6b4a26' : '#54341d';
    ctx.fillRect(0, y, 1024, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, y + 30, 1024, 2);
  }
  ctx.fillStyle = '#7a1f2b';
  ctx.fillRect(0, 128, 1024, 128);
  ctx.fillStyle = '#8f2434';
  for (let x = 0; x < 1024; x += 64) ctx.fillRect(x, 128, 32, 128);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, 124, 1024, 5);
  ctx.fillRect(0, 255, 1024, 5);
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,211,77,0.85)';
  ctx.fillText('GERBONG  A', 180, 200);
  ctx.fillText('GERBONG  B', 512, 200);
  ctx.fillText('GERBONG  C', 845, 200);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,211,77,0.9)');
  g.addColorStop(0.5, 'rgba(255,170,40,0.35)');
  g.addColorStop(1, 'rgba(255,170,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

const CONE_COLORS = { patrol: 0xffd23f, suspicious: 0xff7b24, alert: 0xff2e2e, search: 0xff7b24 };

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.nightBlue);
  scene.fog = new THREE.Fog(PALETTE.nightBlue, 30, 55);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  // ---- Cahaya.
  const ambient = new THREE.AmbientLight(0x8a6a4a, 0.85);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x8fa3cc, 0x3a2415, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6b0, 1.4);
  sun.position.set(-6, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.far = 50;
  scene.add(sun);
  const lampA = new THREE.PointLight(0xffc46b, 22, 16, 1.8);
  lampA.position.set(-12, 3.2, 0);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0xffc46b, 22, 16, 1.8);
  lampB.position.set(0, 3.2, 0);
  scene.add(lampB);
  const lampC = new THREE.PointLight(0x9fc4ff, 18, 16, 1.8);
  lampC.position.set(12, 3.2, 0);
  scene.add(lampC);

  // ---- Lantai & dinding.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(34.4, 12.4),
    new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.maroon, roughness: 0.7 });
  const brassMat = new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.35, metalness: 0.7 });
  const wallDefs = [
    { x: 0, z: -6.6, w: 36.4, d: 1.2 }, { x: 0, z: 6.6, w: 36.4, d: 1.2 },
    { x: -17.6, z: 0, w: 1.2, d: 13.2 }, { x: 17.6, z: 0, w: 1.2, d: 13.2 },
    { x: -5.5, z: -3.5, w: 0.7, d: 5 }, { x: -5.5, z: 3.5, w: 0.7, d: 5 },
    { x: 6.5, z: -3.5, w: 0.7, d: 5 }, { x: 6.5, z: 3.5, w: 0.7, d: 5 },
  ];
  for (const w of wallDefs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w.w, WORLD.wallHeight, w.d), wallMat);
    wall.position.set(w.x, WORLD.wallHeight / 2, w.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w.w === 0.7 ? w.w + 0.1 : w.w, 0.12, w.d === 0.7 ? w.d + 0.1 : w.d), brassMat);
    trim.position.set(w.x, WORLD.wallHeight - 0.06, w.z);
    scene.add(trim);
  }
  // Jendela bercahaya (asap biru malam).
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x1a2c4a, emissive: 0x4a6fa5, emissiveIntensity: 0.9, roughness: 0.2 });
  for (const wx of [-14, -8, -2, 3, 9, 14]) {
    for (const wz of [-6.05, 6.05]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3), windowMat);
      win.position.set(wx, 1.6, wz);
      if (wz > 0) win.rotation.y = Math.PI;
      scene.add(win);
    }
  }

  // ---- Cover.
  const coverMats = {
    sofa: new THREE.MeshStandardMaterial({ color: 0x8e1f2f, roughness: 0.8 }),
    table: new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.6 }),
    bar: new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.4, metalness: 0.3 }),
    luggage: new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 }),
    chair: new THREE.MeshStandardMaterial({ color: 0x5a2a35, roughness: 0.8 }),
  };
  for (const c of LEVEL.covers) {
    const h = c.kind === 'table' || c.kind === 'bar' ? 0.95 : c.kind === 'luggage' ? 0.7 : 0.8;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(c.box.w, h, c.box.d), coverMats[c.kind]);
    mesh.position.set(c.box.x, h / 2, c.box.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (c.kind === 'table' || c.kind === 'bar') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(c.box.w + 0.2, 0.08, c.box.d + 0.2), brassMat);
      top.position.set(c.box.x, h + 0.04, c.box.z);
      scene.add(top);
    }
    if (c.kind === 'sofa') {
      const back = new THREE.Mesh(new THREE.BoxGeometry(c.box.w, 0.55, 0.25), coverMats.sofa);
      back.position.set(c.box.x, 0.95, c.box.z + (c.box.z < 0 ? -c.box.d / 2 : c.box.d / 2));
      back.castShadow = true;
      scene.add(back);
    }
  }

  // ---- Pintu geser.
  const doorMeshes = [];
  for (const d of LEVEL.doors) {
    const group = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.3, metalness: 0.8 });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), frameMat);
    postL.position.set(0, 1.2, -1.05);
    const postR = postL.clone();
    postR.position.z = 1.05;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 2.3), frameMat);
    top.position.set(0, 2.4, 0);
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 2.25, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x7a5c1e, roughness: 0.4, metalness: 0.6 }),
    );
    panel.position.set(0, 1.12, 0);
    panel.castShadow = true;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xff2e2e, emissive: 0xff2e2e, emissiveIntensity: 1.5 }),
    );
    lamp.position.set(0, 2.65, 0);
    group.add(postL, postR, top, panel, lamp);
    group.position.set(d.x, 0, d.z);
    scene.add(group);
    doorMeshes.push({ panel, lamp });
  }

  // ---- Peti emas.
  const glowTex = makeGlowTexture();
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.9, emissive: 0x664400, emissiveIntensity: 0.5 });
  const lootMeshes = [];
  for (const l of LEVEL.lootSpots) {
    const group = new THREE.Group();
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.65), goldMat);
    chest.position.y = 0.28;
    chest.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.65), new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.2, metalness: 0.9, emissive: 0x886600, emissiveIntensity: 0.6 }));
    lid.position.set(0, 0.62, -0.12);
    lid.rotation.x = -0.5;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb300, emissiveIntensity: 1.2, roughness: 0.1 }));
    gem.position.y = 1.15;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.85 }));
    glow.scale.set(2.6, 2.6, 1);
    glow.position.y = 0.7;
    const label = makeTextSprite(l.name, { w: 3.4, h: 1.1, font: 36, color: '#ffd34d' });
    label.position.y = 1.9;
    group.add(chest, lid, gem, glow, label);
    group.position.set(l.x, 0, l.z);
    scene.add(group);
    lootMeshes.push({ group, gem, glow, label });
  }

  // ---- EXIT.
  const exitGroup = new THREE.Group();
  const exitPad = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x1fae5f, emissive: 0x1fae5f, emissiveIntensity: 0.35, transparent: true, opacity: 0.55 }));
  exitPad.rotation.x = -Math.PI / 2;
  exitPad.position.y = 0.03;
  const exitLabel = makeTextSprite('EXIT ▶', { w: 3.6, h: 1.2, color: '#7dffb0', bg: 'rgba(10,60,30,0.85)' });
  exitLabel.position.set(0, 2.2, 0);
  exitGroup.add(exitPad, exitLabel);
  exitGroup.position.set(LEVEL.exit.x - 0.6, 0, LEVEL.exit.z);
  scene.add(exitGroup);

  // ---- Penjaga.
  function buildPerson(kind) {
    const g = new THREE.Group();
    if (kind === 'dog') {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.4), bodyMat);
      body.position.y = 0.35;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), bodyMat);
      head.position.set(0.5, 0.55, 0);
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.12), bodyMat);
      ear.position.set(0.42, 0.78, 0.12);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), bodyMat);
      tail.position.set(-0.5, 0.45, 0);
      tail.rotation.z = 0.6;
      g.add(body, head, ear, tail);
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      return g;
    }
    const bodyColor = kind === 'engineer' ? 0x2a4a6b : 0x33507e;
    const hatColor = kind === 'engineer' ? 0x8a6a2a : 0x141c33;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.05, 10), new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 }));
    body.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.6 }));
    head.position.y = 1.5;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.16, 10), new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.5 }));
    hat.position.y = 1.72;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.5 }));
    brim.position.y = 1.65;
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), brassMat);
    badge.position.set(0, 1.05, 0.4);
    g.add(body, head, hat, brim, badge);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  const guardMeshes = [];
  for (const def of LEVEL.guardDefs) {
    const group = buildPerson(def.kind);
    const coneGeo = makeSectorGeometry(7.5, 0.61, 18);
    const coneMat = new THREE.MeshBasicMaterial({ color: CONE_COLORS.patrol, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = 0.07;
    group.add(cone);
    const mark = makeTextSprite('', { w: 1.4, h: 1.4, font: 72, color: '#ff2e2e' });
    mark.position.y = def.kind === 'dog' ? 1.1 : 2.15;
    group.add(mark);
    scene.add(group);
    guardMeshes.push({ group, cone, coneMat, mark, lastMark: '' });
  }

  // ---- CCTV.
  const camMeshes = [];
  for (const def of LEVEL.cameraDefs) {
    const group = new THREE.Group();
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.5, metalness: 0.5 }));
    mount.position.y = 2.45;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.3, metalness: 0.6 }));
    lens.rotation.x = Math.PI / 2.5;
    lens.position.set(0, 2.3, 0.15);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff2e2e, emissive: 0xff2e2e, emissiveIntensity: 2 }));
    dot.position.set(0, 2.45, 0.28);
    group.add(mount, lens, dot);
    const coneGeo = makeSectorGeometry(8, 0.52, 16);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = 0.07;
    group.add(cone);
    group.position.set(def.x, 0, def.z);
    scene.add(group);
    camMeshes.push({ group, cone, coneMat, dot });
  }

  // ---- Pencuri (pemain): jaket kuning terang + cincin hijau + panah.
  const playerGroup = new THREE.Group();
  const thiefBody = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 1.15, 10), new THREE.MeshStandardMaterial({ color: PALETTE.thiefYellow, roughness: 0.6 }));
  thiefBody.position.y = 0.78;
  thiefBody.castShadow = true;
  const thiefHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.6 }));
  thiefHead.position.y = 1.55;
  thiefHead.castShadow = true;
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.1), new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.5 }));
  mask.position.set(0, 1.57, 0.24);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.46, 0.22), new THREE.MeshStandardMaterial({ color: PALETTE.thiefTeal, roughness: 0.7 }));
  bag.position.set(0, 1.0, -0.46);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 24), new THREE.MeshBasicMaterial({ color: 0x2eff7a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 4), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
  arrow.rotation.x = Math.PI;
  arrow.position.y = 2.3;
  playerGroup.add(thiefBody, thiefHead, mask, bag, ring, arrow);
  scene.add(playerGroup);

  // ---- Decoy (koin pengalih) — penanda berdenyut.
  const decoyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb300, emissiveIntensity: 1.4 }),
  );
  decoyMesh.visible = false;
  scene.add(decoyMesh);

  // ---- Elemen HUD DOM.
  const el = (id) => document.getElementById(id);
  const hudLoot = el('hud-loot');
  const hudTime = el('hud-time');
  const hudCoins = el('hud-coins');
  const hudStrikes = el('hud-strikes');
  const hudAlarmFill = el('hud-alarm-fill');
  const hudAlarmLabel = el('hud-alarm-label');
  const hudGuards = el('hud-guards');
  const hudBanner = el('hud-banner');
  const hudTunnel = el('hud-tunnel');
  const hudHint = el('hud-hint');
  const minimap = el('minimap');
  const mmCtx = minimap ? minimap.getContext('2d') : null;
  const overlays = {
    title: el('overlay-title'),
    win: el('overlay-win'),
    lose: el('overlay-lose'),
    paused: el('overlay-paused'),
  };
  const winStats = el('win-stats');
  const winGrade = el('win-grade');
  const loseStats = el('lose-stats');

  function fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function drawMinimap(state) {
    if (!mmCtx) return;
    const W = minimap.width;
    const H = minimap.height;
    const sx = W / 36;
    const sz = H / 13.5;
    const X = (x) => (x + 18) * sx;
    const Z = (z) => (z + 6.75) * sz;
    mmCtx.fillStyle = '#10182e';
    mmCtx.fillRect(0, 0, W, H);
    mmCtx.fillStyle = '#2b3a55';
    for (const c of LEVEL.covers) mmCtx.fillRect(X(c.box.minX), Z(c.box.minZ), c.box.w * sx, c.box.d * sz);
    mmCtx.fillStyle = '#c9a227';
    for (const d of state.doors) {
      if (d.state === 'closed') mmCtx.fillRect(X(d.x - 0.35), Z(d.z - 1), 0.7 * sx, 2 * sz);
    }
    // Kerucut penjaga (segitiga kecil).
    for (const g of state.guards) {
      const cone = guardCone(g, state.tunnel.darkness);
      mmCtx.fillStyle = g.state === 'alert' ? 'rgba(255,46,46,0.5)' : g.state === 'patrol' ? 'rgba(255,210,63,0.35)' : 'rgba(255,123,36,0.45)';
      mmCtx.beginPath();
      mmCtx.moveTo(X(g.x), Z(g.z));
      mmCtx.lineTo(X(g.x + Math.cos(cone.angle - cone.half) * cone.range), Z(g.z + Math.sin(cone.angle - cone.half) * cone.range));
      mmCtx.lineTo(X(g.x + Math.cos(cone.angle + cone.half) * cone.range), Z(g.z + Math.sin(cone.angle + cone.half) * cone.range));
      mmCtx.closePath();
      mmCtx.fill();
    }
    for (const l of state.loot) {
      if (l.taken) continue;
      mmCtx.fillStyle = '#ffd34d';
      mmCtx.beginPath();
      mmCtx.arc(X(l.x), Z(l.z), 3.5, 0, Math.PI * 2);
      mmCtx.fill();
    }
    mmCtx.fillStyle = '#2eff7a';
    mmCtx.fillRect(X(LEVEL.exit.x - 0.6) - 3, Z(LEVEL.exit.z) - 3, 6, 6);
    for (const g of state.guards) {
      mmCtx.fillStyle = g.kind === 'dog' ? '#8a6a4a' : '#ff5a5a';
      mmCtx.beginPath();
      mmCtx.arc(X(g.x), Z(g.z), 3, 0, Math.PI * 2);
      mmCtx.fill();
    }
    mmCtx.fillStyle = '#2eff7a';
    mmCtx.beginPath();
    mmCtx.arc(X(state.player.x), Z(state.player.z), 4, 0, Math.PI * 2);
    mmCtx.fill();
    mmCtx.strokeStyle = '#ffd34d';
    mmCtx.lineWidth = 1.5;
    mmCtx.beginPath();
    mmCtx.arc(X(state.player.x), Z(state.player.z), 6, 0, Math.PI * 2);
    mmCtx.stroke();
  }

  function updateHud(state, screen) {
    if (hudLoot) hudLoot.textContent = `◆ ${state.lootCount}/3 Peti Emas`;
    if (hudTime) hudTime.textContent = fmtTime(state.time);
    if (hudCoins) hudCoins.textContent = `◉ Koin: ${state.decoys}`;
    if (hudStrikes) hudStrikes.textContent = `Ketahuan: ${state.strikes}/3`;
    if (hudAlarmFill) {
      hudAlarmFill.style.width = `${Math.round(state.alarm)}%`;
      hudAlarmFill.style.background = state.alarm >= 75 ? '#ff2e2e' : state.alarm >= 40 ? '#ff7b24' : '#ffd23f';
    }
    if (hudAlarmLabel) hudAlarmLabel.textContent = state.alarm >= 100 ? 'ALARM PENUH!' : state.alarm >= 40 ? 'TERLIHAT!' : 'ALARM';
    if (hudGuards) {
      hudGuards.innerHTML = state.guards.map((g) => {
        const sym = g.state === 'alert' ? '!' : g.state === 'suspicious' || g.state === 'search' ? '?' : '·';
        const cls = g.state === 'alert' ? 'alert' : g.state === 'suspicious' || g.state === 'search' ? 'sus' : '';
        return `<span class="${cls}">${g.name} ${sym}</span>`;
      }).join(' · ');
    }
    if (hudBanner) {
      if (state.messageTimer > 0 && state.message) {
        hudBanner.textContent = state.message;
        hudBanner.style.opacity = '1';
      } else {
        hudBanner.style.opacity = '0';
      }
    }
    if (hudTunnel) {
      hudTunnel.style.opacity = state.tunnel.inTunnel ? '1' : '0';
      if (state.tunnel.inTunnel) hudTunnel.textContent = '🚇 TEROWONGAN — GELAP, PENJAGA TAK MELIHAT JAUH';
    }
    if (hudHint) {
      const nearLoot = state.loot.find((l) => !l.taken && Math.hypot(l.x - state.player.x, l.z - state.player.z) < 1.7);
      const nearDoor = state.doors.find((d) => d.state === 'closed' && Math.hypot(d.x - state.player.x, d.z - state.player.z) < 2.1);
      if (state.channel) {
        const loot = state.loot.find((l) => l.id === state.channel.lootId);
        const pct = Math.min(99, Math.round((state.channel.t / RULES.lootChannelSeconds) * 100));
        hudHint.textContent = `Membobol ${loot ? loot.name : 'peti'}… ${pct}%`;
      } else if (screen === SCREEN_PLAY && nearLoot) hudHint.textContent = `Tekan E — bobol ${nearLoot.name}`;
      else if (screen === SCREEN_PLAY && nearDoor) hudHint.textContent = 'Tekan E — buka pintu geser';
      else if (screen === SCREEN_PLAY && state.lootCount >= 3) hudHint.textContent = 'Semua peti direbut — KABUR LEWAT EXIT ▶';
      else hudHint.textContent = '';
    }
    drawMinimap(state);
  }

  function showOverlay(screen, state) {
    for (const key of Object.keys(overlays)) {
      if (overlays[key]) overlays[key].style.display = 'none';
    }
    if (screen === SCREEN_TITLE && overlays.title) overlays.title.style.display = 'flex';
    if (screen === SCREEN_WIN && overlays.win) {
      overlays.win.style.display = 'flex';
      if (winGrade) winGrade.textContent = `GRADE ${state.grade || '?'}`;
      if (winStats) winStats.textContent = `Waktu ${fmtTime(state.time)} · Ketahuan ${state.stats.caught}× · Peti 3/3 · Koin tersisa ${state.decoys}`;
    }
    if (screen === SCREEN_LOSE && overlays.lose) {
      overlays.lose.style.display = 'flex';
      if (loseStats) loseStats.textContent = `Waktu ${fmtTime(state.time)} · Peti ${state.lootCount}/3 · Ketahuan ${state.strikes}/3`;
    }
    if (screen === SCREEN_PAUSED && overlays.paused) overlays.paused.style.display = 'flex';
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function draw(state, screen) {
    resize();
    const p = state.player;
    const t = state.time;
    const dark = state.tunnel.darkness;

    // Cahaya meredup di terowongan.
    const lightF = 1 - dark * 0.72;
    ambient.intensity = 0.7 * lightF + 0.06;
    hemi.intensity = 0.55 * lightF + 0.04;
    sun.intensity = 1.4 * lightF;
    lampA.intensity = 22 * lightF + 1;
    lampB.intensity = 22 * lightF + 1;
    lampC.intensity = 18 * lightF + 1;
    windowMat.emissiveIntensity = 0.9 * (1 - dark) + 0.05;
    scene.background.setHex(dark > 0.5 ? 0x05070f : PALETTE.nightBlue);

    // Kamera: oblique top-down; fokus dijepit agar frame tak menampilkan
    // ruang kosong di luar kereta (ujung barat/timur). Judul: bidikan tengah.
    const focusX = screen === SCREEN_TITLE ? 0 : Math.max(-10, Math.min(10, p.x));
    const focusZ = screen === SCREEN_TITLE ? 0 : Math.max(-1, Math.min(1, p.z));
    const sway = swayOffset(t);
    camera.position.set(focusX + sway.x, 19, focusZ + 12.5 + sway.z);
    camera.lookAt(focusX + sway.x * 0.4, 0, focusZ - 1.5);

    // Pencuri.
    playerGroup.position.set(p.x, 0, p.z);
    playerGroup.rotation.y = -p.angle + Math.PI / 2;
    const blink = p.invulnerable > 0 && Math.floor(t * 8) % 2 === 0;
    playerGroup.visible = !blink;
    arrow.position.y = 2.3 + Math.sin(t * 3) * 0.12;
    ring.material.opacity = 0.65 + Math.sin(t * 4) * 0.25;

    // Penjaga + kerucut + tanda.
    for (let i = 0; i < state.guards.length; i += 1) {
      const g = state.guards[i];
      const m = guardMeshes[i];
      m.group.position.set(g.x, 0, g.z);
      m.group.rotation.y = -g.angle + Math.PI / 2;
      const cone = guardCone(g, dark);
      m.cone.scale.set(cone.range / 7.5, 1, cone.range / 7.5);
      // Kerucut anak dari grup penjaga yang sudah dirotasi (π/2 − sudut):
      // rotasi lokal −π/2 membuat totalnya −sudut, tepat searah pandang.
      m.cone.rotation.y = -Math.PI / 2;
      m.coneMat.color.setHex(CONE_COLORS[g.state] || CONE_COLORS.patrol);
      m.coneMat.opacity = g.state === 'alert' ? 0.5 : 0.4;
      const mark = g.state === 'alert' ? '!' : g.state === 'suspicious' || g.state === 'search' ? '?' : '';
      if (mark !== m.lastMark) {
        m.mark.userData.redraw(mark, g.state === 'alert' ? '#ff2e2e' : '#ff7b24');
        m.lastMark = mark;
      }
      m.mark.visible = mark !== '';
    }

    // CCTV.
    for (let i = 0; i < state.cameras.length; i += 1) {
      const c = state.cameras[i];
      const m = camMeshes[i];
      const cone = cameraCone(c, dark);
      m.cone.scale.set(cone.range / 8, 1, cone.range / 8);
      m.cone.rotation.y = -cone.angle;
      m.coneMat.opacity = c.seesPlayer ? 0.45 : 0.28;
      m.dot.material.emissiveIntensity = c.seesPlayer ? 4 : 1.5;
    }

    // Pintu geser.
    for (let i = 0; i < state.doors.length; i += 1) {
      const d = state.doors[i];
      const m = doorMeshes[i];
      m.panel.position.z = d.openT * 1.9;
      const lampMat = m.lamp.material;
      if (d.state === 'open') {
        lampMat.color.setHex(0x2eff7a);
        lampMat.emissive.setHex(0x2eff7a);
      } else if (d.state === 'opening') {
        lampMat.color.setHex(0xffd23f);
        lampMat.emissive.setHex(0xffd23f);
      } else {
        lampMat.color.setHex(0xff2e2e);
        lampMat.emissive.setHex(0xff2e2e);
      }
    }

    // Peti emas: yang sudah diambil hilang; permata berputar.
    for (let i = 0; i < state.loot.length; i += 1) {
      const l = state.loot[i];
      const m = lootMeshes[i];
      m.group.visible = !l.taken;
      if (!l.taken) {
        m.gem.rotation.y = t * 1.6 + i;
        m.gem.position.y = 1.15 + Math.sin(t * 2 + i) * 0.12;
        m.glow.material.opacity = 0.7 + Math.sin(t * 2.5 + i) * 0.2;
      }
    }

    // Koin pengalih.
    if (state.decoyActive) {
      decoyMesh.visible = true;
      decoyMesh.position.set(state.decoyActive.x, 0.4 + Math.sin(t * 6) * 0.15, state.decoyActive.z);
    } else {
      decoyMesh.visible = false;
    }

    // EXIT berdenyut saat semua peti sudah direbut.
    exitPad.material.emissiveIntensity = state.lootCount >= 3 ? 0.6 + Math.sin(t * 5) * 0.3 : 0.3;

    updateHud(state, screen);
    showOverlay(screen, state);
    renderer.render(scene, camera);
  }

  return { draw, resize };
}
