import React from 'react';
import styles from './StatusBadge.module.css';

const tones = Object.freeze({
  neutral: 'neutral',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  qa: 'qa',
});

export default function StatusBadge({ tone = 'neutral', children, className = '', ...props }) {
  const safeTone = tones[tone] || tones.neutral;
  return (
    <span {...props} className={[styles.badge, styles[safeTone], className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
