/** Shared game button. No separate bitmap asset, no new npm dependencies. */
import React from 'react';
import './GameUiTokens.css';
import styles from './GameButton.module.css';

const variants = Object.freeze({
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
});
const sizes = Object.freeze({ sm: 'sm', md: 'md', lg: 'lg' });

export default function GameButton({
  variant = 'secondary',
  size = 'md',
  wide = false,
  dock = null,
  selected = false,
  busy = false,
  leadingIcon = null,
  trailingIcon = null,
  className = '',
  children,
  type = 'button',
  disabled = false,
  ...buttonProps
}) {
  const tone = variants[variant] || variants.secondary;
  const safeSize = sizes[size] || sizes.md;
  const isDisabled = Boolean(disabled || busy);

  return (
    <button
      type={type}
      {...buttonProps}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      aria-pressed={selected ? true : buttonProps['aria-pressed']}
      data-selected={selected ? 'true' : 'false'}
      className={[
        styles.button,
        styles[tone],
        styles[safeSize],
        wide ? styles.wide : '',
        dock === 'bottom-left' ? styles.dockBottomLeft : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {busy && <span className={styles.spinner} aria-hidden="true" />}
      {!busy && leadingIcon && <span className={styles.icon} aria-hidden="true">{leadingIcon}</span>}
      <span className={styles.label}>{children}</span>
      {!busy && trailingIcon && <span className={styles.icon} aria-hidden="true">{trailingIcon}</span>}
    </button>
  );
}
