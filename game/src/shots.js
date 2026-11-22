// Adegan ?shot=start|play|climax|end: dunia dimainkan maju dari state
// segar oleh autopilot yang memainkan aturan asli — tanpa override.
// climax: autopilot main sampai WIN/kalah (atau 150 dtk), lalu frame yang
// dipakai adalah MOMEN PALING TEGANG yang benar-benar terjadi (alarm
// tertinggi + penjaga mengejar + peti di dekat pemain) — dibekukan apa adanya.
// end: sampai WIN murni (grade asli).
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createAutopilot } from './autopilot.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_WIN, SCREEN_LOSE } from './render.js';

const SAMPLE = STEP;
const START_SECONDS = 6;
const PLAY_SECONDS = 2.5;
const CLIMAX_LIMIT_SECONDS = 150;
const END_LIMIT_SECONDS = 600;

export function stageShot(name, world) {
  const state = world.state;
  const pilot = createAutopilot();
  if (name === 'start') {
    world.reset();
    for (let i = 0; i < START_SECONDS / SAMPLE; i += 1) world.step(SAMPLE, { mx: 0, mz: 0 }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    world.reset();
    for (let i = 0; i < PLAY_SECONDS / SAMPLE; i += 1) {
      if (world.step(SAMPLE, pilot.decide(state, SAMPLE), false) & EVENT_OVER) break;
    }
    return { screen: state.over ? (state.won ? SCREEN_WIN : SCREEN_LOSE) : SCREEN_PLAY, best: state.lootCount };
  }
  if (name === 'climax') {
    world.reset();
    let best = null;
    for (let i = 0; i < CLIMAX_LIMIT_SECONDS / SAMPLE; i += 1) {
      const events = world.step(SAMPLE, pilot.decide(state, SAMPLE), false);
      const anyAlert = state.guards.some((g) => g.state === 'alert');
      const anySus = state.guards.some((g) => g.state === 'suspicious');
      const nearLoot = state.loot.some((l) => !l.taken && Math.hypot(l.x - state.player.x, l.z - state.player.z) < 3);
      const score = state.alarm + (anyAlert ? 25 : 0) + (anySus ? 10 : 0) + (nearLoot ? 20 : 0) + (state.lootCount >= 1 ? 5 : 0);
      if (!best || score > best.score) {
        best = { score, snap: JSON.stringify(state, (k, v) => (k === 'rng' ? undefined : v)) };
      }
      if (events & EVENT_OVER) break;
    }
    if (best) {
      const snap = JSON.parse(best.snap);
      for (const k of Object.keys(snap)) state[k] = snap[k];
      state.rng = createRandom(20261122);
      state.over = false;
      state.won = false;
    }
    return { screen: SCREEN_PLAY, best: state.lootCount };
  }
  // end: autopilot sampai WIN (atau LOSE bila gagal — dilaporkan apa adanya).
  world.reset();
  let events = 0;
  for (let i = 0; i < END_LIMIT_SECONDS / SAMPLE; i += 1) {
    events = world.step(SAMPLE, pilot.decide(state, SAMPLE), false);
    if (events & EVENT_OVER) break;
  }
  const screen = state.won ? SCREEN_WIN : state.over ? SCREEN_LOSE : SCREEN_PLAY;
  return { screen, best: state.lootCount, won: !!(events & EVENT_WIN) };
}
