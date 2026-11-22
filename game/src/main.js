// Boot & loop utama Gerbong Emas.
// ?shot=start|play|climax|end men-stage adegan deterministik lalu
// mengecatnya dua kali dan menandai window.__shotReady untuk screenshot.
// Tanpa ?shot: game interaktif (TITLE -> PLAY -> WIN/LOSE, R/Enter ulang).
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_OVER, EVENT_LOOT, EVENT_CAUGHT, EVENT_WIN, EVENT_LOSE, EVENT_ALARM_FULL, EVENT_DECOY, EVENT_DOOR } from './world.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_INTERACT, ACTION_DECOY, ACTION_MUTE, ACTION_RESTART } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_WIN, SCREEN_LOSE, SCREEN_PAUSED } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261122;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function runShot(name) {
  const scene = stageShot(name, world);
  // Paparkan hasil autopilot ke konsol agar bisa diverifikasi headless.
  // eslint-disable-next-line no-console
  console.log(`[shot:${name}] screen=${scene.screen} loot=${world.state.lootCount}/3 time=${world.state.time.toFixed(1)}s strikes=${world.state.strikes} grade=${world.state.grade || '-'} alarm=${Math.round(world.state.alarm)} maxAlarm=${Math.round(world.state.maxAlarmSeen)}`);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let stepSoundTimer = 0;
  // Aksi tepi diambil SEKALI per frame di frame(), lalu dipakai step()
  // (interact/decoy hanya pada langkah pertama frame itu).
  let frameActions = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startRumble();
    announce('Bermain. Curi 3 peti emas lalu kabur lewat EXIT.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_LOSE;
    if (won) audio.win();
    else audio.lose();
    announce(won ? `Menang! Grade ${world.state.grade}.` : 'Tertangkap tiga kali. Misi gagal.');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Suara mati.' : 'Suara hidup.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_WIN || screen === SCREEN_LOSE)) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_WIN || screen === SCREEN_LOSE)) {
      startGame();
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Bermain.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, mz: 0 }, true);
      return;
    }
    const dir = input.direction();
    const actions = frameActions;
    frameActions = 0; // tepi hanya berlaku pada langkah pertama frame ini
    const events = world.step(STEP, {
      mx: dir.x,
      mz: dir.z,
      sneak: input.sneak,
      interact: !!(actions & ACTION_INTERACT),
      decoy: !!(actions & ACTION_DECOY),
    }, false);
    if (events & EVENT_LOOT) audio.loot();
    if (events & EVENT_DOOR) audio.door();
    if (events & EVENT_DECOY) audio.coin();
    if (events & EVENT_ALARM_FULL) audio.alarmSting();
    if (events & EVENT_CAUGHT) audio.caught();
    for (const g of world.state.guards) {
      if (g.justSuspicious) audio.suspicious();
      if (g.justAlerted) audio.alarmSting();
    }
    if (world.state.player.moving) {
      stepSoundTimer -= STEP;
      if (stepSoundTimer <= 0) {
        audio.step();
        stepSoundTimer = world.state.player.sneak ? 0.55 : 0.38;
      }
    }
    if (events & EVENT_OVER) endGame(!!(events & EVENT_WIN));
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    frameActions = input.takeActions();
    handleActions(frameActions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    }
  });

  announce('Vault Kereta: Gerbong Emas. Tekan Enter atau klik untuk mulai.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
