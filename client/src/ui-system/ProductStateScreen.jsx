import React from 'react';
import GameButton from './GameButton.jsx';
import GamePanel from './GamePanel.jsx';
import GameIcon from './GameIconRegistry.jsx';
import styles from './ProductStateScreen.module.css';

const STATE_META = Object.freeze({
  loading: Object.freeze({ icon: 'download', tone: 'accent' }),
  error: Object.freeze({ icon: 'warning', tone: 'danger' }),
  offline: Object.freeze({ icon: 'offline', tone: 'warning' }),
  disabled: Object.freeze({ icon: 'lock', tone: 'muted' }),
  empty: Object.freeze({ icon: 'info', tone: 'muted' }),
  success: Object.freeze({ icon: 'check', tone: 'success' }),
});

/** Shared full-screen/inline loading, error, offline, disabled and empty state. */
export default function ProductStateScreen({
  state = 'loading',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  overlay = false,
  busy = false,
  className = '',
}) {
  const meta = STATE_META[state] || STATE_META.empty;
  const role = state === 'error' ? 'alert' : 'status';

  return (
    <div
      role={role}
      aria-live={state === 'error' ? 'assertive' : 'polite'}
      aria-busy={busy || state === 'loading' ? true : undefined}
      data-state={state}
      data-overlay={overlay ? 'true' : 'false'}
      className={[styles.stateScreen, overlay ? styles.overlay : '', className].filter(Boolean).join(' ')}
    >
      <GamePanel variant="modal" tone={meta.tone} className={styles.panel}>
        <span className={styles.iconFrame} aria-hidden="true">
          <GameIcon name={meta.icon} size={30} />
          {state === 'loading' && <span className={styles.spinnerRing} />}
        </span>
        {title && <h1 className={styles.title}>{title}</h1>}
        {description && <p className={styles.description}>{description}</p>}
        {(actionLabel || secondaryActionLabel) && (
          <div className={styles.actions}>
            {secondaryActionLabel && (
              <GameButton variant="ghost" onClick={onSecondaryAction}>
                {secondaryActionLabel}
              </GameButton>
            )}
            {actionLabel && (
              <GameButton
                variant={state === 'error' ? 'danger' : 'primary'}
                onClick={onAction}
                busy={busy}
                leadingIcon={state === 'error' ? <GameIcon name="reload" /> : null}
              >
                {actionLabel}
              </GameButton>
            )}
          </div>
        )}
      </GamePanel>
    </div>
  );
}
