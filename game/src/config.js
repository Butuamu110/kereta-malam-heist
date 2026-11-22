// VAULT KERETA: GERBONG EMAS — tuning & konstanta permainan.
// Satu-satunya tempat angka-angka keseimbangan tinggal, supaya revisi
// (pass revisi genuin) bisa mengubah rasa main tanpa menyentuh logika.
export const STEP = 1 / 60;

// Ruang gerbong: x sepanjang kereta, z lebar gerbong.
export const WORLD = {
  minX: -17, maxX: 17,
  minZ: -6, maxZ: 6,
  wallHeight: 2.6,
};

// Pemain (pencuri).
export const PLAYER = {
  radius: 0.45,
  speed: 4.3,          // jalan biasa
  sneakSpeed: 2.3,     // Shift: lebih lambat, lebih sulit terlihat
  start: { x: -15.5, z: 0 },
};

// Penjaga & penglihatan.
export const VISION = {
  guardRange: 7.0,
  guardHalfAngle: 0.61,   // ~35 derajat
  dogRange: 5.5,
  dogHalfAngle: 0.52,
  engineerRange: 8.0,
  engineerHalfAngle: 0.70,
  cameraRange: 8.0,
  cameraHalfAngle: 0.52,
  // Seberapa cepat meter curiga (0..1) terisi saat pemain terlihat.
  fillPerSecond: 0.75,    // jarak dekat, berdiri
  fillCloseBoost: 1.6,    // pengali saat pemain < 2.5 unit
  fillSneakFactor: 0.45,  // menyelinap jauh lebih sulit terlihat
  fillTunnelFactor: 0.5,  // terowongan: penglihatan meredup
  decayPerSecond: 0.35,   // meter curiga surut saat tak terlihat
  suspiciousAt: 0.35,     // "?" — penjaga berhenti & menatap
  alertAt: 1.0,           // "!" — penjaga mengejar
  chaseSpeed: 4.0,    // sedikit lebih lambat dari pemain: kabur mungkin, tapi ketat
  dogChaseSpeed: 5.0,
  patrolSpeed: 1.6,
  dogPatrolSpeed: 2.6,
  searchSeconds: 4.0,     // menggeledah titik terakhir terlihat
};

// Kamera CCTV.
export const CAMERA = {
  sweepSpeed: 0.55,       // radian/detik ayunan
  sweepArc: 0.85,         // setengah busur ayunan
  fillPerSecond: 0.85,    // meter kamera terisi saat pemain kena sorot
  decayPerSecond: 0.5,
  alarmOnFull: 30,        // alarm melonjak saat kamera penuh
};

// Meter alarm 0..100.
export const ALARM = {
  riseGuardPerSecond: 14, // naik saat penjaga melihat pemain
  riseCameraPerSecond: 16,
  decayPerSecond: 7,      // surut saat bersembunyi
  decayTunnelFactor: 2.0, // terowongan: alarm lebih cepat reda
  fullAt: 100,
  fullHoldSeconds: 4,     // alarm penuh: semua penjaga menyerbu
  afterFull: 50,          // lalu turun ke sini
};

// Kereta: goyangan & terowongan.
export const TRAIN = {
  swayAmpX: 0.45,         // goyangan kamera (unit)
  swayAmpZ: 0.3,
  swaySpeedX: 0.42,
  swaySpeedZ: 0.31,
  tunnelPeriod: 28,       // detik per siklus
  tunnelStart: 20,        // terowongan mulai di detik ke-20 siklus
  tunnelLength: 6,        // detik gelap total
  tunnelRangeFactor: 0.55,
};

// Alat pencuri.
export const TOOLS = {
  decoys: 2,              // koin pengalih (Q), sekali pakai
  decoyRadius: 8,         // penjaga dalam radius ini menyelidiki
  decoyInvestigate: 4,    // detik penyelidikan
};

// Aturan menang/kalah.
export const RULES = {
  lootTotal: 3,
  strikesMax: 3,          // ketahuan 3 kali = kalah
  interactRange: 1.7,     // jangkauan E (ambil loot / buka pintu)
  lootChannelSeconds: 1.6, // membobol peti butuh berdiri diam 1,6 detik
  doorOpenSeconds: 0.7,   // pintu geser butuh waktu membuka
  catchRange: 0.85,       // penjaga menyentuh pemain = ketahuan
  invulnerableSeconds: 3, // kebal sesaat sesudah ketahuan
};

// Grade akhir (waktu nyata autopilot/pemain, tanpa dipaksa).
export const GRADES = [
  { grade: 'S', maxTime: 150, maxStrikes: 0 },
  { grade: 'A', maxTime: 210, maxStrikes: 1 },
  { grade: 'B', maxTime: 300, maxStrikes: 3 },
  { grade: 'C', maxTime: Infinity, maxStrikes: 3 },
];

// Palet kuningan + marun + asap biru.
export const PALETTE = {
  brass: 0xc9a227,
  brassLight: 0xe8c84a,
  maroon: 0x6e1423,
  maroonDark: 0x3d0a14,
  wood: 0x5a3a22,
  woodDark: 0x3a2415,
  smokeBlue: 0x2b3a55,
  nightBlue: 0x10182e,
  carpet: 0x7a1f2b,
  gold: 0xffd34d,
  guardNavy: 0x1e2a4a,
  thiefYellow: 0xffc93c,
  thiefTeal: 0x1fa8a0,
  alarmRed: 0xff2e2e,
};
