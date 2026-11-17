import React from 'react';
import './GameUiTokens.css';
import styles from './ProductScreenShell.module.css';
import {
  PRODUCT_UI_FOUNDATION_VERSION_V440,
  resolveProductScreenPolicyV440,
} from './ProductUiFoundationV440.js';

/**
 * Root presentation shell for product screens.
 * It owns visual viewport/scroll policy only; screen routing and business logic
 * remain in App and the existing screen components.
 */
export default function ProductScreenShell({
  screen,
  uiSkin = 'legacy',
  className = '',
  children,
  ...rootProps
}) {
  const policy = resolveProductScreenPolicyV440(screen);

  return (
    <div
      {...rootProps}
      data-sf-ui-foundation={PRODUCT_UI_FOUNDATION_VERSION_V440}
      data-sf-ui-skin={uiSkin}
      data-sf-ui-screen={screen}
      data-sf-screen-kind={policy.kind}
      data-sf-screen-tone={policy.tone}
      data-sf-scroll-policy={policy.scroll}
      className={[styles.shell, styles[policy.kind], className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
