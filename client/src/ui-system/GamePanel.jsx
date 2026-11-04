/** Visual-only panel primitive with compact / standard / modal geometry. */
import React from 'react';
import './GameUiTokens.css';
import styles from './GamePanel.module.css';
const classes={compact:'compact',standard:'standard',modal:'modal'};
export default function GamePanel({as:Tag='section',variant='standard',className='',children,...props}){
  const variantClass=styles[classes[variant]||classes.standard];
  return <Tag {...props} className={[styles.base,variantClass,className].filter(Boolean).join(' ')}>{children}</Tag>;
}
