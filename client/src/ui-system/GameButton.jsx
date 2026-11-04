/** Shared game button. No separate bitmap asset, no new npm dependencies. */
import React from 'react';
import './GameUiTokens.css';
import styles from './GameButton.module.css';

const variants=Object.freeze({primary:'primary',secondary:'secondary',ghost:'ghost',danger:'danger'});
export default function GameButton({variant='secondary',wide=false,dock=null,className='',children,type='button',...buttonProps}){
  const tone=variants[variant]||variants.secondary;
  return <button type={type} {...buttonProps}
    className={[styles.button,styles[tone],wide?styles.wide:'',dock==='bottom-left'?styles.dockBottomLeft:'',className].filter(Boolean).join(' ')}>
    {children}
  </button>;
}
