/**
 * Opt-in, client-only rendering probe: add ?bgPerf=1 to the URL.
 * No player data, network requests, Firebase operations or game decisions.
 * Diagnostic values are approximate and are NOT equivalent to GPU frame time.
 */
export function backgroundPerfRequested(queryString = '') {
  try { return new URLSearchParams(queryString).get('bgPerf') === '1'; }
  catch { return false; }
}

export function frameP95(frameTimes) {
  if (!Array.isArray(frameTimes) || !frameTimes.length) return null;
  const sorted = frameTimes.filter(x => Number.isFinite(x) && x >= 0).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.ceil(sorted.length * .95) - 1];
}

export function summarizeBackgroundFrames(samples, metadata = {}) {
  const valid = samples.filter(s => Number.isFinite(s.frameMs) && s.frameMs >= 0);
  const n = valid.length;
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const numeric = (key) => valid.map(s => s[key]).filter(Number.isFinite);
  const frames = numeric('frameMs');
  return {
    ...metadata,
    samples: n,
    frameMsAverage: avg(frames), frameMsP95: frameP95(frames),
    fpsAverage: avg(numeric('fps')),
    activeMeshesAverage: avg(numeric('activeMeshes')),
    drawCallsAverage: avg(numeric('drawCalls')),
    meshCountLast: valid.at(-1)?.meshCount ?? null,
    texturesLast: valid.at(-1)?.textures ?? null,
    particleSystemsLast: valid.at(-1)?.particleSystems ?? null,
    jsHeapMiBLast: valid.at(-1)?.jsHeapMiB ?? null,
    // GPU frame time and VRAM are not exposed by this lightweight probe.
    gpuTimeMs: null,
  };
}

/** Attach exactly once per scene, and auto-detach on disposal. */
export function attachBattleBackgroundProfiler({
  scene, engine, mode, backgroundId = 'legacy', queryString = '',
  host = globalThis,
} = {}) {
  if (!backgroundPerfRequested(queryString)) return null;
  if (!scene?.onAfterRenderObservable || !scene?.onDisposeObservable || !engine) return null;
  const samples = [];
  let disposed = false;
  const metadata = { mode, backgroundId, measuring: 'Chrome/engine only' };

  const read = () => {
    const dt = Number(engine.getDeltaTime?.());
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1000) return;
    const engineDrawCalls = Number(engine._drawCalls?.current); // optional Babylon internal
    const perfHeap = Number(host.performance?.memory?.usedJSHeapSize);
    samples.push({
      frameMs: dt,
      fps: Number(engine.getFps?.()),
      activeMeshes: Number(scene.getActiveMeshes?.()?.length),
      drawCalls: Number.isFinite(engineDrawCalls) ? engineDrawCalls : null,
      meshCount: scene.meshes?.length ?? null,
      textures: scene.textures?.length ?? null,
      particleSystems: scene.particleSystems?.length ?? null,
      jsHeapMiB: Number.isFinite(perfHeap) && perfHeap > 0 ? perfHeap / 1048576 : null,
    });
    if (samples.length > 1800) samples.splice(0, samples.length - 1800); // ~30 s @60 FPS
  };
  const afterObserver = scene.onAfterRenderObservable.add(read);
  const initialStore = host.__SF_BG_PERF__;
  const store = initialStore?.format === 'BG2-v1' ? initialStore : {
    format: 'BG2-v1', active: null, history: [],
    snapshot() { return this.active?.getReport() || this.history.at(-1) || null; },
    exportJson() { return JSON.stringify(this.snapshot(), null, 2); },
  };
  host.__SF_BG_PERF__ = store;
  const handle = {
    getReport: () => summarizeBackgroundFrames(samples, metadata),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      scene.onAfterRenderObservable.remove(afterObserver);
      if (disposeObserver) scene.onDisposeObservable.remove(disposeObserver);
      const report = handle.getReport();
      store.history.push(report);
      if (store.history.length > 6) store.history.shift();
      if (store.active === handle) store.active = null;
    },
  };
  store.active = handle;
  const disposeObserver = scene.onDisposeObservable.add(handle.dispose);
  return handle;
}
