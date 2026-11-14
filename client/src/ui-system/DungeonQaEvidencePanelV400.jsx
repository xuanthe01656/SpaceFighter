/** QA-only Android-visible per-room evidence. No runtime or reward authority. */
import React, { useState } from 'react';
import styles from './DungeonQaEvidencePanelV400.module.css';
const display = n => Number.isFinite(n) ? String(Math.round(n)) : '—';
const seconds = n => `${Math.max(0, Math.round((n || 0) / 1000))}s`;
export default function DungeonQaEvidencePanelV400({ report, lang = 'vi' }) {
  const [open, setOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [message, setMessage] = useState('');
  if (report?.scope !== 'guest_dungeon_qa_only') return null;
  const vi = lang === 'vi';
  const text = JSON.stringify(report, null, 2);
  const copy = async () => {
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setMessage(vi ? 'Đã sao chép.' : 'Copied.');
    } catch (_) {
      setJsonOpen(true);
      setMessage(vi ? 'Chọn và sao chép JSON phía dưới.' : 'Select and copy JSON below.');
    }
  };
  return <aside className={styles.root} aria-label="Dungeon QA evidence">
    <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? (vi ? 'ĐÓNG QA' : 'CLOSE QA') : (vi ? 'SỐ LIỆU QA' : 'QA METRICS')}
    </button>
    {open && <section className={styles.panel}>
      <strong>{vi ? 'THỐNG KÊ PHÓ BẢN' : 'DUNGEON EVIDENCE'}</strong>
      <p className={styles.note}>{report.dungeonId} · {report.presetId}<br/>
        {vi ? 'Chỉ QA · Không thưởng/ghi dữ liệu · Chưa duyệt production'
          : 'QA only · No rewards/writes · Not production approved'}</p>
      {Number.isFinite(report.qaOutgoingDamageScale) && report.qaOutgoingDamageScale < 1 &&
        <p className={styles.note}>{vi ? 'HỎA LỰC QA LÊN ĐỊCH' : 'QA DAMAGE VS ENEMIES'}
          {' '}{Math.round(report.qaOutgoingDamageScale * 100)}%
          {' · '}{vi ? 'Không áp dụng cho tài khoản thật' : 'No impact on real account'}</p>}
      <div className={styles.metrics}>
        {[[vi?'FPS TB':'AVG FPS',display(report.averageFps)],
          [vi?'FPS THẤP':'LOW FPS',report.lowFpsPercent == null ? '—' : `${report.lowFpsPercent}%`],
          [vi?'ĐẠN ĐỊCH':'SHOTS',display(report.projectiles)],
          [vi?'MẤT HP':'HP LOST',display(report.damageTaken)]].map(([k,v]) =>
          <div key={k}><small>{k}</small><b>{v}</b></div>)}
      </div>
      <p className={styles.note}>{vi?'ĐỊCH TỐI ĐA':'PEAK ENEMIES'} {display(report.peakEnemies)}
        {' · '}{vi?'ĐẠN TỒN TẠI':'PEAK SHOTS'} {display(report.peakHostileProjectiles)}
        {' · '}{vi?'ĐỢT BẮN':'VOLLEYS'} {display(report.volleys)}</p>
      <p className={styles.note}>
        {vi?'HP ĐẦU/CUỐI':'START/END HP'} {display(report.hpStart)}/{display(report.hpEnd)}
        {' · '}{vi?'MẪU BẮN':'FIRE PROBES'} {display(report.fireProbeSamples)}
        {' · '}{vi?'QUÁI TẦM XA SỐNG LÂU KHÔNG BẮN':'LONG-LIVED UNFIRED'} {display(report.rangedLongLivedWithoutShots)}
      </p>
      <p className={styles.note}>
        {vi?'BOSS SỐNG':'BOSS ALIVE'} {report.bossLifetimeMs == null ? '—' : seconds(report.bossLifetimeMs)}
        {' · '}{vi?'CẢNH BÁO BOSS':'BOSS WARNINGS'} {display(report.telegraphs)}
        {' · '}{vi?'NODE ĐÃ PHÁ':'DESTROYED NODES'} {display(report.objectiveNodesDestroyed)}
      </p>
      <div className={styles.rooms}>
        <div className={styles.roomHeader}><span>{vi?'PHÒNG':'ROOM'}</span><span>{vi?'GIÂY':'SECONDS'}</span><span>{vi?'ĐẠN':'SHOTS'}</span><span>{vi?'MẤT HP':'HP LOST'}</span></div>
        {(report.rooms || []).map(r => <div className={styles.room} key={`${r.roomIndex}-${r.roomId}`}>
          <span title={r.roomId}>{r.roomIndex+1} · {r.kind}</span><span>{seconds(r.durationMs)}</span>
          <span>{display(r.projectiles)}</span><span>{display(r.damageTaken)}</span>
        </div>)}
      </div>
      {report.reviewFlags?.length > 0 && <p className={styles.warning}>
        {vi?'CẦN KIỂM TRA':'REVIEW'}: {report.reviewFlags.join(', ')}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={copy}>{vi?'SAO CHÉP JSON':'COPY JSON'}</button>
        <button type="button" onClick={() => setJsonOpen(!jsonOpen)}>JSON</button>
      </div>
      {message && <p className={styles.note} role="status">{message}</p>}
      {jsonOpen && <textarea aria-label="QA JSON" className={styles.json} readOnly value={text}/>}
    </section>}
  </aside>;
}
