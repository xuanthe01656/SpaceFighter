/**
 * Space Fighter V4.5.0 Dungeon runtime reliability monitor.
 * Volatile state only. Does not mutate rewards, player progress, or authority.
 * All clocks are monotonic milliseconds passed by the embedding engine.
 */
export const DUNGEON_RUNTIME_RELIABILITY_VERSION_V450 = 'dungeon-runtime-reliability-v4.5.0-rc1';

export const DUNGEON_RUNTIME_LIMITS_V450 = Object.freeze({
  silenceMs: 4800,
  resumeGraceMs: 3500,
  inspectIntervalMs: 1200,
  maxRenderRestarts: 1,
  maxConsecutiveRenderErrors: 3,
});

const finite = value => Number.isFinite(value) ? Math.max(0, value) : 0;
const messageOf = error => String(error?.message || error || 'unknown').slice(0, 300);
const trimString = value => String(value || '').slice(0, 90);

export function createDungeonRuntimeMonitorV450({ nowMs = 0, limits = DUNGEON_RUNTIME_LIMITS_V450 } = {}) {
  const bornAt = finite(nowMs);
  let lastFrameAt = bornAt;
  let lastRenderAt = bornAt;
  let lastSimulationAt = bornAt;
  let resumedAt = bornAt;
  let visible = true;
  let contextLost = false;
  let terminal = false;
  let closed = false;
  let renderStopped = false;
  let recoveryCount = 0;
  let consecutiveRenderErrors = 0;
  let totalRenderErrors = 0;
  let frameCount = 0;
  let simulationCount = 0;
  let lastFault = null;
  let context = null;
  let health = 'starting';

  const snapshot = (at = bornAt) => Object.freeze({
    version: DUNGEON_RUNTIME_RELIABILITY_VERSION_V450,
    state: health,
    visible,
    contextLost,
    terminal,
    closed,
    frameCount,
    simulationCount,
    frameSilenceMs: Math.round(Math.max(0, finite(at) - lastFrameAt)),
    renderSilenceMs: Math.round(Math.max(0, finite(at) - lastRenderAt)),
    simulationSilenceMs: Math.round(Math.max(0, finite(at) - lastSimulationAt)),
    recoveryCount,
    consecutiveRenderErrors,
    totalRenderErrors,
    lastFault,
    context,
  });

  const state = {
    frameAttempt(at) {
      if (closed || terminal) return;
      lastFrameAt = finite(at);
      frameCount += 1;
    },
    frameSuccess(at) {
      if (closed || terminal) return;
      lastRenderAt = finite(at);
      consecutiveRenderErrors = 0;
      renderStopped = false;
    },
    simulationStep(at, detail = {}) {
      if (closed || terminal) return;
      lastSimulationAt = finite(at);
      simulationCount += 1;
      context = Object.freeze({
        roomIndex: Number.isInteger(detail.roomIndex) ? detail.roomIndex : null,
        tick: Number.isFinite(detail.tick) ? Math.round(detail.tick * 10) / 10 : null,
        encounterStatus: trimString(detail.encounterStatus),
        enemies: finite(detail.enemies),
        projectiles: finite(detail.projectiles),
        bossActive: Boolean(detail.bossActive),
      });
    },
    simulationFault(at, info = {}) {
      if (closed) return;
      lastFault = Object.freeze({
        timeMs: Math.round(finite(at)),
        stage: trimString(info.stage || 'simulation'),
        message: messageOf(info.error),
        roomIndex: Number.isInteger(info.roomIndex) ? info.roomIndex : context?.roomIndex ?? null,
      });
    },
    frameError(at, error) {
      if (closed) return 0;
      totalRenderErrors += 1;
      consecutiveRenderErrors += 1;
      if (!lastFault || lastFault.stage !== 'simulation' || lastFault.timeMs < finite(at) - 1500) {
        state.simulationFault(at, { stage: 'render', error });
      }
      return consecutiveRenderErrors;
    },
    setRenderStopped(value) { renderStopped = Boolean(value); },
    setContextLost(value, at) {
      if (closed) return;
      contextLost = Boolean(value);
      if (!contextLost) {
        resumedAt = finite(at);
        lastFrameAt = resumedAt;
        lastRenderAt = resumedAt;
        lastSimulationAt = resumedAt;
      }
    },
    setVisible(value, at) {
      if (closed) return;
      const next = Boolean(value);
      if (next !== visible) {
        visible = next;
        resumedAt = finite(at);
        if (next) {
          // Paused Android WebViews must not create false freeze alerts.
          lastFrameAt = resumedAt;
          lastRenderAt = resumedAt;
          lastSimulationAt = resumedAt;
        }
      }
    },
    setTerminal() { terminal = true; health = 'terminal'; },
    close() { closed = true; health = 'closed'; },
    canRestart() { return !closed && !terminal && visible && !contextLost && recoveryCount < limits.maxRenderRestarts; },
    noteRestart(at) {
      if (!state.canRestart()) return false;
      recoveryCount += 1;
      renderStopped = false;
      resumedAt = finite(at);
      lastFrameAt = resumedAt;
      lastRenderAt = resumedAt;
      lastSimulationAt = resumedAt;
      consecutiveRenderErrors = 0;
      health = 'recovering';
      return true;
    },
    inspect(at, { isDisposed = false } = {}) {
      const time = finite(at);
      if (closed || isDisposed) health = 'closed';
      else if (terminal) health = 'terminal';
      else if (!visible) health = 'background';
      else if (contextLost) health = 'webgl_context_lost';
      else if (time - resumedAt < limits.resumeGraceMs) health = 'resume_grace';
      else if (renderStopped || consecutiveRenderErrors >= limits.maxConsecutiveRenderErrors) health = 'render_exception';
      else if (time - lastFrameAt >= limits.silenceMs || time - lastRenderAt >= limits.silenceMs) health = 'render_stalled';
      else if (time - lastSimulationAt >= limits.silenceMs) health = 'simulation_stalled';
      else health = 'running';
      return snapshot(time);
    },
    snapshot,
  };
  return state;
}
