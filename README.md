# 🚂 Vault Kereta: Gerbong Emas

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/Butuamu110/kereta-malam-heist/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/Butuamu110/kereta-malam-heist/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

Game heist 3D (Three.js) di kereta malam: selinap melintasi tiga gerbong, curi **3 peti emas**, lalu kabur lewat pintu lokomotif (**EXIT**) sebelum ketahuan 3 kali.

## Cerita singkat

Kereta malam Gerbong Emas melaju menembus gelap membawa tiga peti emas milik seorang kolektor. Kau naik diam-diam dari gerbong belakang. Di depanmu: empat kondektur berpatroli, seorang masinis yang memeriksa tiket, anjing K-9 Rex, dan CCTV yang menyapu tiap gerbong. Satu-satunya sekutumu adalah gelap terowongan — saat kereta masuk terowongan, pandangan penjaga menyusut dan alarm lebih cepat reda.

## Cara main

| Tombol | Aksi |
|---|---|
| WASD / panah | Bergerak |
| E | Ambil peti emas / buka pintu geser antar-gerbong |
| Q | Lempar koin pengalih (2×) — penjaga menyelidiki bunyinya |
| Shift | Menyelinap (lebih lambat, lebih sulit terlihat) |
| M | Suara hidup/mati |
| P | Jeda |
| R / Enter | Mulai ulang |

**Menang:** 3/3 peti emas + mencapai EXIT (grade S/A/B/C dari waktu & jumlah ketahuan).
**Kalah:** ketahuan 3 kali.

**Mekanik khas kereta:**

- **Goyangan kereta** — kamera bergoyang mengikuti laju kereta.
- **Terowongan berkala** — tiap ~28 detik kereta masuk terowongan 6 detik: gelap total, jangkauan pandang penjaga menyusut, alarm lebih cepat reda.
- **Pintu geser antar-gerbong** — harus dibuka dengan E sebelum melintas.

**Sistem heist:** patroli → curiga (?) → kejar (!) → geledah → patroli; meter alarm naik saat terlihat penjaga/CCTV dan surut saat bersembunyi; kerucut visi bervolume (kuning/oranye/merah); minimap langsung; suara synth WebAudio sendiri.

## Menjalankan

Buka `game/index.html` lewat server statis apa pun, misal `python3 -m http.server` dari folder repo lalu kunjungi `http://localhost:8000/game/`. Tidak butuh jaringan — semua berkas lokal di bawah `game/`.

## Teknologi

- Three.js 0.160.0 (divendor di `game/vendor/three.min.js`)
- JavaScript ES modules, tanpa build step
- Suara: WebAudio synth (tanpa file audio eksternal)
