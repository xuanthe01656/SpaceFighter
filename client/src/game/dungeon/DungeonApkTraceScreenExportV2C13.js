/**
 * Dungeon C15 V2C.13 - QA-only, local, on-device JSON export.
 * No HTTP, account/wallet/reward mutation or cloud upload; Android uses QA-only cache share.
 * Active only when V2C.11's doubly-gated Taurus recorder was instantiated.
 */

import { prepareDungeonApkInputBundleJsonV2C14B } from './DungeonApkInputBundleV2C14B.js';
import { isDungeonApkInputCheckpointPairV2C14B1 } from './DungeonApkInputCheckpointV2C14B1.js';
import { prepareDungeonC2CInputGridJsonV1 } from './DungeonC2CInputGridV1.js';

export const DUNGEON_APK_SCREEN_EXPORT_V2C13 = 'c15-dungeon-qa-screen-export-v2c13';
const V2C11_VERSION = 'c15-dungeon-apk-trace-v2c11';
const FIELDS = Object.freeze([
  'version', 'source', 'dungeonId', 'roomId', 'sceneSeed', 'seedSource',
  'tickBasis', 'frames', 'events', 'finished', 'truncated', 'error',
  'safeForSettlement', 'rewardSettlementEnabled', 'cloudRewards',
  'liveApkParityVerified', 'checksum',
]);
let currentPanel = null;

export function prepareDungeonApkTraceJsonV2C13(trace, date = new Date()) {
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)
      || Object.keys(trace).length !== FIELDS.length
      || !FIELDS.every(key => Object.hasOwn(trace, key))
      || trace.version !== V2C11_VERSION
      || trace.source !== 'qa-babylon-observer-untrusted'
      || trace.dungeonId !== 'dung_taurus'
      || trace.roomId !== 'taurus_entry'
      || trace.safeForSettlement !== false
      || trace.rewardSettlementEnabled !== false
      || trace.cloudRewards !== false
      || trace.liveApkParityVerified !== false
      || !Array.isArray(trace.frames)
      || !Array.isArray(trace.events)
      || typeof trace.checksum !== 'string'
      || !/^[a-f0-9]{8}$/.test(trace.checksum)
      || !(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('INVALID_OR_NON_QA_DUNGEON_TRACE');
  }
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const fileName = `dungeon_taurus_v2c11_${stamp}.json`;
  const json = `${JSON.stringify(trace, null, 2)}\n`;
  if (new TextEncoder().encode(json).byteLength > 4 * 1024 * 1024) {
    throw new Error('V2C12_AUDIT_JSON_SIZE_LIMIT');
  }
  // Presentation/export does not validate witness truth, parity, or checksum.
  return Object.freeze({
    fileName, json,
    frameCount: trace.frames.length,
    eventCount: trace.events.length,
    isCompleteShortTrace: trace.frames.length > 0 && trace.truncated === false && trace.error === null,
    evidenceStatus: 'CLIENT_TRACE_UNTRUSTED_UNPAIRED',
  });
}

export async function shareDungeonQaJsonV2C13(prepared, dependencies = {}) {
  if (!prepared || typeof prepared.fileName !== 'string'
      || !/^dungeon_taurus_(?:v2c(?:11|14b)|c2c)_[0-9]{8}_[0-9]{6}\.json$/.test(prepared.fileName)
      || typeof prepared.json !== 'string') {
    throw new Error('INVALID_QA_EXPORT');
  }
  let native = dependencies.native;
  let sharePlugin = dependencies.nativePlugin;
  if (native === undefined || (native && !sharePlugin)) {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (native === undefined) native = Capacitor.isNativePlatform();
    if (native && !sharePlugin) sharePlugin = registerPlugin('SpaceFighterQaTraceExport');
    if (dependencies.native === undefined && native) {
      native = Capacitor.isPluginAvailable('SpaceFighterQaTraceExport');
    }
  }
  if (native) {
    const result = await sharePlugin.shareJson({ fileName: prepared.fileName, json: prepared.json });
    if (result?.status !== 'chooser_opened') throw new Error('NATIVE_SHARE_NOT_OPENED');
    return 'NATIVE_SHARE_CHOOSER_OPENED';
  }
  const browserNavigator = dependencies.navigator ?? globalThis.navigator;
  const FileConstructor = dependencies.File ?? globalThis.File;
  if (typeof browserNavigator?.share === 'function' && typeof FileConstructor === 'function') {
    const file = new FileConstructor([prepared.json], prepared.fileName, { type: 'application/json' });
    if (browserNavigator.canShare?.({ files: [file] })) {
      await browserNavigator.share({ files: [file], title: 'Dungeon QA JSON' });
      return 'BROWSER_FILE_SHARE_REQUESTED';
    }
  }
  throw new Error('FILE_SHARE_UNAVAILABLE_USE_COPY');
}

const style = (node, rules) => Object.assign(node.style, rules);
function makeButton(doc, text, onClick) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = text;
  style(button, {
    background: '#163b55', border: '1px solid #6ac9e0', borderRadius: '8px',
    color: '#ffffff', padding: '10px 12px', minHeight: '44px',
    fontSize: '13px', fontWeight: '700', touchAction: 'manipulation',
  });
  button.addEventListener('pointerdown', event => event.stopPropagation());
  button.addEventListener('pointerup', event => event.stopPropagation());
  button.addEventListener('click', event => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

/** Returns a cleanup callback. No DOM or global UI exists in normal builds. */
export function mountDungeonApkTraceScreenExportV2C13({ getSnapshot, getInputJournal, getInputCheckpoint,
  getC2CGrid, onSubmitC2CStaging, document: doc = globalThis.document } = {}) {
  if (typeof getSnapshot !== 'function' || !doc?.body?.appendChild) {
    return () => {};
  }
  currentPanel?.();
  let destroyed = false;
  let prepared = null;
  let safeCheckpoint = null;
  let checkpointTimer = null;
  const root = doc.createElement('div');
  root.setAttribute('data-sf-v2c13-qa-json', 'true');
  style(root, {
    position: 'fixed', zIndex: '2147483000',
    top: 'calc(90px + var(--sf-native-battle-hud-top, 0px) + env(safe-area-inset-top))',
    right: '8px', fontFamily: 'Arial, sans-serif',
    pointerEvents: 'auto',
  });
  const toggle = makeButton(doc, 'QA JSON', () => openPanel());
  style(toggle, { background: '#071c2c', boxShadow: '0 2px 12px #000b', fontSize: '12px' });
  root.appendChild(toggle);

  const shade = doc.createElement('div');
  style(shade, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,.88)',
    display: 'none', alignItems: 'center', justifyContent: 'center',
    padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
    boxSizing: 'border-box', zIndex: '2147483001',
    overscrollBehavior: 'contain',
  });
  const panel = doc.createElement('section');
  panel.setAttribute('aria-label', 'Xuất trace Dungeon QA');
  style(panel, {
    width: 'min(96vw, 600px)', maxHeight: '82dvh', display: 'flex',
    flexDirection: 'column', gap: '9px', padding: '14px', boxSizing: 'border-box',
    overflowY: 'auto', borderRadius: '12px', color: '#f2fbff',
    border: '1px solid #55cfe5', background: '#0b1c2e',
    boxShadow: '0 8px 50px #000',
  });
  shade.appendChild(panel);
  const heading = doc.createElement('strong');
  heading.textContent = 'DUNGEON C15 · APK TRACE V2C.11';
  panel.appendChild(heading);
  const note = doc.createElement('div');
  note.textContent = 'Dữ liệu QA cục bộ, CHƯA XÁC THỰC THIẾT BỊ / CHƯA ĐỐI CHIẾU SERVER. Không mở thưởng.';
  style(note, { color: '#ffdb90', fontSize: '12px', lineHeight: '1.35' });
  panel.appendChild(note);
  const summary = doc.createElement('div');
  style(summary, { fontSize: '12px', whiteSpace: 'pre-wrap' });
  panel.appendChild(summary);
  const status = doc.createElement('div');
  status.setAttribute('role', 'status');
  style(status, { minHeight: '18px', fontSize: '12px', color: '#a7dff0' });
  panel.appendChild(status);
  const content = doc.createElement('textarea');
  content.readOnly = true;
  content.setAttribute('aria-label', 'Toàn bộ JSON – có thể chọn và sao chép thủ công');
  content.spellcheck = false;
  style(content, {
    width: '100%', minHeight: '170px', maxHeight: '36vh', boxSizing: 'border-box',
    background: '#061320', color: '#dcf6ff', border: '1px solid #5b8ca7',
    fontFamily: 'monospace', fontSize: '10px', resize: 'vertical',
  });
  panel.appendChild(content);
  const actions = doc.createElement('div');
  style(actions, { display: 'flex', gap: '8px', flexWrap: 'wrap' });
  panel.appendChild(actions);

  function openPanel() {
    if (destroyed) return;
    try {
      const liveTrace = getSnapshot();
      const useCheckpoint = Boolean(safeCheckpoint)
        && (liveTrace.truncated === true || liveTrace.error != null);
      prepared = prepareDungeonApkTraceJsonV2C13(useCheckpoint ? safeCheckpoint : liveTrace);
      content.value = prepared.json;
      const trace = JSON.parse(prepared.json);
      summary.textContent = `Frames: ${prepared.frameCount} | Events: ${prepared.eventCount} | `
        + `Truncated: ${trace.truncated} | Error: ${trace.error ?? 'null'}`
        + `${useCheckpoint ? ' | Mẫu tự động trước giới hạn frame' : ''}\nFile: ${prepared.fileName}`;
      status.textContent = prepared.isCompleteShortTrace
        ? 'JSON sẵn sàng để xuất. Đây KHÔNG phải kết quả server parity.'
        : 'Trace thiếu frame hoặc đã bị cắt/lỗi. Chỉ dùng để chẩn đoán, KHÔNG chấm PASS.';
    } catch (error) {
      prepared = null;
      content.value = '';
      summary.textContent = '';
      status.textContent = `Lỗi lấy trace: ${error?.message || 'UNKNOWN'}`;
    }
    shade.style.display = 'flex';
  }
  function activeText() {
    if (!prepared) throw new Error('NO_TRACE_READY');
    return prepared.json;
  }

  if (typeof getInputJournal === 'function') {
    actions.appendChild(makeButton(doc, 'Xem INPUT V2C.14-B', () => {
      try {
        const checkpoint = typeof getInputCheckpoint === 'function'
          ? getInputCheckpoint() : null;
        const savedPair = isDungeonApkInputCheckpointPairV2C14B1(checkpoint)
          ? checkpoint : null;
        // V2C.14-B.1: export the first valid, unmodified post-pointerup
        // checkpoint; never use a later FRAME_CAP live trace as a substitute.
        // If no valid checkpoint exists, show the original live diagnostic.
        const evidence = savedPair ? savedPair.trace : getSnapshot();
        const input = savedPair ? savedPair.inputJournal : getInputJournal();
        prepared = prepareDungeonApkInputBundleJsonV2C14B(evidence, input);
        content.value = prepared.json;
        summary.textContent = `V2C.14-B · Frames: ${prepared.frameCount} | `
          + `Accepted pointer events: ${prepared.eventCount} | `
          + `Overflow: ${input.pointerOverflow || input.frameOverflow} | `
          + `Input lỗi: ${input.captureError ?? 'null'}`
          + `${savedPair ? ' | CHECKPOINT sau pointerup (đoạn QA, không phải cả trận)' : ' | LIVE (không có checkpoint hợp lệ)'}`
          + `\nFile: ${prepared.fileName}`;
        status.textContent = prepared.isCompleteShortTrace
          ? (savedPair
            ? 'Snapshot INPUT QA đã lưu trước FRAME_CAP. Đây chỉ là đoạn QA cục bộ, CHƯA CÓ ticket/loadout/parity server.'
            : 'Đã ghi input QA. CHƯA XÁC MINH ticket / server loadout / 60Hz parity.')
          : 'Dữ liệu input chưa hoàn chỉnh (hoặc đã quá giới hạn). Chỉ dùng chẩn đoán; KHÔNG phải parity PASS.';
      } catch (error) {
        prepared = null;
        content.value = '';
        summary.textContent = '';
        status.textContent = `Không thể đóng gói INPUT: ${error?.message || 'UNKNOWN'}`;
      }
    }));
    actions.appendChild(makeButton(doc, 'Xem TRACE V2C.11', openPanel));
  }
  if (typeof getC2CGrid === 'function') {
    actions.appendChild(makeButton(doc, 'Xem GRID C2C 30Hz', () => {
      try {
        const record = getC2CGrid();
        prepared = prepareDungeonC2CInputGridJsonV1(record);
        content.value = prepared.json;
        summary.textContent = `C2C 30Hz · Ticks: ${prepared.tickCount} | `
          + `Accepted pointer: ${prepared.eventCount} | `
          + `Capture error: ${record.captureError ?? 'null'} | `
          + `Battle ID: ${record.battleId || 'Guest / no ticket'}
File: ${prepared.fileName}`;
        status.textContent = prepared.subsetCandidateReady
          ? 'Input grid QA hoan tat. CHUA xac minh combat/attestation/rewards.'
          : 'Input grid thieu gesture/ticks hoac gap loi. Khong chon PASS.';
      } catch (error) {
        prepared = null;
        content.value = '';
        status.textContent = `Loi GRID C2C: ${error?.message || 'UNKNOWN'}`;
      }
    }));
    if (typeof onSubmitC2CStaging === 'function') {
      actions.appendChild(makeButton(doc, 'GUI KIEM TOAN C2D STAGING', async () => {
        try {
          const record = getC2CGrid();
          const exported = prepareDungeonC2CInputGridJsonV1(record);
          if (!exported.subsetCandidateReady) throw new Error('C2C_INPUT_GRID_NOT_READY');
          status.textContent = 'Dang gui input QA den staging (khong co rewards)...';
          const result = await onSubmitC2CStaging(record);
          if (result?.rewardSettlementEnabled !== false ||
              result?.trueApkServerParity !== 'NOT_VERIFIED' ||
              result?.fullCombatReplayVerified !== false)
            throw new Error('C2D_SERVER_RESPONSE_ASSERTED_UNSUPPORTED_AUTHORITY');
          status.textContent = `C2D: ${result.status} | Input ticks: ${result.replayedInputTicks} | `
            + 'FULL COMBAT PARITY = NOT VERIFIED; REWARDS LOCKED.';
        } catch (error) {
          status.textContent = `C2D STAGING FAIL-CLOSED: ${error?.code || error?.message || 'UNKNOWN'}`;
        }
      }));
    }
  }
  actions.appendChild(makeButton(doc, 'Chia sẻ file .json', async () => {
    try {
      if (!prepared) throw new Error('NO_TRACE_READY');
      const result = await shareDungeonQaJsonV2C13(prepared);
      status.textContent = result === 'NATIVE_SHARE_CHOOSER_OPENED'
        ? 'Đã mở bảng chia sẻ Android. Chọn Drive, Gmail hoặc nơi lưu file; chưa xác nhận đã gửi.'
        : 'Đã gọi bảng chia sẻ. Xác nhận lưu file trong ứng dụng được chọn.';
    } catch (error) {
      status.textContent = `Không mở được chia sẻ file (${error?.message || 'UNKNOWN'}). Hãy dùng Sao chép JSON.`;
    }
  }));
  actions.appendChild(makeButton(doc, 'Sao chép JSON', async () => {
    try {
      const value = activeText();
      try {
        if (!globalThis.navigator?.clipboard?.writeText) throw new Error('CLIPBOARD_API_UNAVAILABLE');
        await globalThis.navigator.clipboard.writeText(value);
      } catch (_) {
        content.focus();
        content.select();
        if (!doc.execCommand?.('copy')) throw new Error('COPY_MANUALLY');
      }
      status.textContent = 'Đã sao chép JSON. Dán vào tệp .json hoặc ứng dụng ghi chú để chuyển qua máy tính.';
    } catch (_) {
      content.focus();
      content.select();
      status.textContent = 'Không thể tự sao chép. Nhấn giữ vùng JSON, Chọn tất cả → Sao chép.';
    }
  }));
  actions.appendChild(makeButton(doc, 'Chọn tất cả', () => {
    if (!prepared) { status.textContent = 'NO_TRACE_READY'; return; }
    content.focus();
    content.select();
    status.textContent = 'Đã chọn JSON. Sử dụng Sao chép của Android nếu nút sao chép không hoạt động.';
  }));
  actions.appendChild(makeButton(doc, 'Đóng', () => { shade.style.display = 'none'; }));
  // A DOM control must not let pointer events reach Babylon's flight controller.
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) {
    shade.addEventListener(type, event => event.stopPropagation());
  }
  doc.body.appendChild(root);
  doc.body.appendChild(shade);
  // Keep one local in-memory checkpoint so testers need not race the 720-frame cap.
  // It is not a replay, signature, or assertion of device provenance.
  if (typeof globalThis.setInterval === 'function') {
    checkpointTimer = globalThis.setInterval(() => {
      if (destroyed || safeCheckpoint) return;
      try {
        const trace = getSnapshot();
        if (trace.frames?.length >= 120 && trace.truncated === false && trace.error == null) {
          safeCheckpoint = trace;
          toggle.textContent = 'QA JSON ✓';
          globalThis.clearInterval(checkpointTimer);
          checkpointTimer = null;
        }
      } catch (_) { /* observation must not alter combat */ }
    }, 450);
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (checkpointTimer !== null) globalThis.clearInterval(checkpointTimer);
    safeCheckpoint = null;
    root.remove();
    shade.remove();
    prepared = null;
    if (currentPanel === destroy) currentPanel = null;
  }
  currentPanel = destroy;
  return destroy;
}
