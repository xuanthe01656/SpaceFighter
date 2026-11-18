import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createDungeonRuntimeMonitorV450,
  DUNGEON_RUNTIME_LIMITS_V450,
  DUNGEON_RUNTIME_RELIABILITY_VERSION_V450,
} from '../src/game/dungeon/DungeonRuntimeReliabilityV450.js';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const frame = (m, at, detail = {}) => {
  m.frameAttempt(at);
  m.simulationStep(at, { roomIndex: 2, tick: at / 16, enemies: 2, projectiles: 3, ...detail });
  m.frameSuccess(at);
};

test('V450 monitor classifies a healthy continuously updating Dungeon', () => {
  assert.equal(DUNGEON_RUNTIME_RELIABILITY_VERSION_V450, 'dungeon-runtime-reliability-v4.5.0-rc1');
  const m = createDungeonRuntimeMonitorV450({ nowMs: 0 });
  frame(m, 4000);
  const status = m.inspect(4900);
  assert.equal(status.state, 'running');
  assert.equal(status.frameCount, 1);
  assert.equal(status.simulationCount, 1);
  assert.equal(status.context.roomIndex, 2);
  assert.equal(status.context.enemies, 2);
  assert.equal(status.recoveryCount, 0);
});

test('V450 catches a stopped requestAnimationFrame without touching game state', () => {
  const m = createDungeonRuntimeMonitorV450({ nowMs: 0 });
  frame(m, 100);
  const status = m.inspect(5100);
  assert.equal(status.state, 'render_stalled');
  assert.equal(status.simulationSilenceMs, 5000);
  assert.equal(m.canRestart(), true);
  assert.equal(m.noteRestart(5100), true);
  assert.equal(m.inspect(5200).state, 'resume_grace');
  frame(m, 5500);
  assert.equal(m.inspect(9000).state, 'running');
  assert.equal(m.canRestart(), false);
});

test('V450 distinguishes simulation stalls while Babylon still renders', () => {
  const m = createDungeonRuntimeMonitorV450({ nowMs: 0 });
  frame(m, 100);
  for (let t = 1000; t <= 5500; t += 500) { m.frameAttempt(t); m.frameSuccess(t); }
  assert.equal(m.inspect(5600).state, 'simulation_stalled');
  assert.equal(m.snapshot(5600).lastFault, null);
});

test('V450 avoids false stalls during background and first resume grace', () => {
  const m = createDungeonRuntimeMonitorV450({ nowMs: 0 });
  frame(m, 100);
  m.setVisible(false, 200);
  assert.equal(m.inspect(20000).state, 'background');
  m.setVisible(true, 20000);
  assert.equal(m.inspect(21000).state, 'resume_grace');
  frame(m, 22000);
  assert.equal(m.inspect(24000).state, 'running');
});

test('V450 isolates repeated rendering failures and stores bounded QA evidence', () => {
  const m = createDungeonRuntimeMonitorV450({ nowMs: 0 });
  for (let i = 1; i <= 3; i++) {
    m.frameAttempt(5000 + i);
    m.simulationFault(5000 + i, { stage: 'simulation', error: new Error('disposed enemy mesh'), roomIndex: 2 });
    m.frameError(5000 + i, new Error('frame rejected'));
  }
  m.setRenderStopped(true);
  const status = m.inspect(6000);
  assert.equal(status.state, 'render_exception');
  assert.equal(status.totalRenderErrors, 3);
  assert.equal(status.lastFault.message, 'disposed enemy mesh');
  assert.equal(status.lastFault.roomIndex, 2);
  assert.equal(DUNGEON_RUNTIME_LIMITS_V450.maxConsecutiveRenderErrors, 3);
});

test('V450 records WebGL context loss and never rearms while GPU context is lost', () => {
  const m = createDungeonRuntimeMonitorV450({ nowMs: 0 });
  frame(m, 100);
  m.setContextLost(true, 4000);
  assert.equal(m.inspect(7000).state, 'webgl_context_lost');
  assert.equal(m.canRestart(), false);
  m.setContextLost(false, 7000);
  assert.equal(m.inspect(7100).state, 'resume_grace');
});

test('V450 terminal/closed scenes never generate false freezes or rewards', () => {
  const m = createDungeonRuntimeMonitorV450({ nowMs: 0 });
  frame(m, 100);
  m.setTerminal();
  assert.equal(m.inspect(100000).state, 'terminal');
  assert.equal(m.canRestart(), false);
  m.close();
  assert.equal(m.inspect(110000).state, 'closed');
});

test('V450 component contains bounded frame guard and cleanup with no battle rewrites', () => {
  const engine = read('../src/components/Dungeon/DungeonEngine.jsx');
  const scene = read('../src/components/Dungeon/DungeonScene.js');
  assert.match(engine, /const renderDungeonFrameV450 = \(\) =>/);
  assert.match(engine, /try\s*\{\s*scene\.render\(\)/);
  assert.match(engine, /runtimeV450\.frameError\(/);
  assert.match(engine, /runtimeV450\.canRestart\(\)/);
  assert.match(engine, /runtimeV450\.noteRestart\(/);
  assert.match(engine, /}, \[gsRef, lang, setScreen\]\);/);
  assert.doesNotMatch(engine, /\[gsRef, lang, setScreen, saveUserProfile, gameAction, getRealTime\]/);
  assert.match(engine, /webglcontextlost/);
  assert.match(engine, /document\.removeEventListener\('visibilitychange'/);
  assert.match(engine, /globalThis\.clearInterval\(runtimeWatchdogV450\)/);
  assert.match(scene, /onRuntimeHeartbeat\?\.\(/);
  assert.match(scene, /onRuntimeFault\?\.\(/);
  assert.match(scene, /onRuntimePhase\?\.\(\{ phase: 'terminal', reason: 'defeat' \}\)/);
  assert.match(scene, /onRuntimePhase\?\.\(\{ phase: 'terminal', reason: 'victory' \}\)/);
  assert.doesNotMatch(engine, /localStorage\.setItem|firebase\.deploy|bundleRelease/);
});

test('V450 Unified manual QA workflow emits APK only; future release workflow is unchanged', () => {
  const workflow = read('../../.github/workflows/android-native-smoke.yml');
  const release = read('../../.github/workflows/android-release-candidate.yml');
  assert.match(workflow, /gradle --no-daemon --stacktrace :app:assembleDebug\n/);
  assert.match(workflow, /app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /VITE_SF_UNIFIED_CAMPAIGN_DUNGEON_QA:/);
  assert.doesNotMatch(workflow, /:app:bundleDebug|app-debug\.aab|outputs\/bundle\/debug/);
  assert.match(release, /:app:bundleRelease/);
});
