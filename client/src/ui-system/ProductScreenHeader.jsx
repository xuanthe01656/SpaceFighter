import React from 'react';
import GameButton from './GameButton.jsx';
import GameIcon from './GameIconRegistry.jsx';
import styles from './ProductScreenHeader.module.css';

/** Shared title/back/action row for non-combat product screens. */
export default function ProductScreenHeader({
  eyebrow,
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  actions,
  compact = false,
  className = '',
}) {
  return (
    <header className={[styles.header, compact ? styles.compact : '', className].filter(Boolean).join(' ')}>
      <div className={styles.leading}>
        {onBack && (
          <GameButton
            variant="ghost"
            size="sm"
            onClick={onBack}
            aria-label={backLabel}
            leadingIcon={<GameIcon name="back" />}
            className={styles.backButton}
          >
            <span className={styles.backText}>{backLabel}</span>
          </GameButton>
        )}
      </div>
      <div className={styles.copy}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        {title && <h1 className={styles.title}>{title}</h1>}
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      <div className={styles.actions}>{actions}</div>
    </header>
  );
}
