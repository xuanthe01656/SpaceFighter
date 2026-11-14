/** In-app attribution for HUD V2; no authentication or network dependencies. */
import React, { useState } from 'react';
import styles from './HudAssetCreditsV423.module.css';

const AUTHORS = Object.freeze([
  ['upklyak', 'Game live stream interface elements'],
  ['pch.vector', 'Different HUD elements flat frames set'],
  ['redgreystock', 'Vector set of futuristic abstract HUD frames'],
  ['redgreystock', 'Futuristic HUD frames vector set'],
  ['pikisuperstar', 'Gradient video game elements collection'],
  ['Freepik', 'Art deco ornament collection'],
]);

export default function HudAssetCreditsV423({lang = 'vi'}) {
  const [open, setOpen] = useState(false);
  const vi = lang === 'vi';
  return <>
    <button type="button" className={styles.creditsButton} onClick={() => setOpen(true)}
      aria-label={vi ? 'Ghi công tài nguyên HUD' : 'HUD visual resource credits'}>
      {vi ? 'GHI CÔNG HÌNH ẢNH' : 'VISUAL CREDITS'}
    </button>
    {open && <div className={styles.backdrop} role="presentation" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label={vi ? 'Ghi công tài nguyên' : 'Visual resource credits'}
        className={styles.dialog} onClick={event => event.stopPropagation()}>
        <button className={styles.close} type="button" onClick={() => setOpen(false)}
          aria-label={vi ? 'Đóng' : 'Close'}>×</button>
        <h2>{vi ? 'GHI CÔNG TÀI NGUYÊN' : 'VISUAL RESOURCE CREDITS'}</h2>
        <p>{vi ? 'Gói hình HUD V2 sử dụng tài nguyên thương mại có yêu cầu ghi công:' :
          'HUD V2 contains commercially permitted visual resources requiring attribution:'}</p>
        <ul>{AUTHORS.map(([author, resource], index) =>
          <li key={`${author}-${index}`}>{resource} — designed by <strong>{author}</strong> — Magnific.com</li>)}</ul>
      </section>
    </div>}
  </>;
}
