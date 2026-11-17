/** Visual-only panel primitive with compact / standard / modal geometry. */
import React from 'react';
import './GameUiTokens.css';
import styles from './GamePanel.module.css';

const classes = Object.freeze({ compact: 'compact', standard: 'standard', modal: 'modal' });
const tones = Object.freeze({
  default: 'defaultTone',
  accent: 'accentTone',
  muted: 'mutedTone',
  success: 'successTone',
  warning: 'warningTone',
  danger: 'dangerTone',
});

export default function GamePanel({
  as: Tag = 'section',
  variant = 'standard',
  tone = 'default',
  className = '',
  children,
  ...props
}) {
  const variantClass = styles[classes[variant] || classes.standard];
  const toneClass = styles[tones[tone] || tones.default];
  return (
    <Tag {...props} className={[styles.base, variantClass, toneClass, className].filter(Boolean).join(' ')}>
      {children}
    </Tag>
  );
}
