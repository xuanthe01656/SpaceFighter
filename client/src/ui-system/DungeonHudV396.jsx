/**
 * Dungeon HUD adapter V4.1.1 (V3.9.6 compatibility path).
 *
 * Dungeon-specific state is projected into the shared Unified Tactical HUD.
 * No combat, reward, progression or network authority is owned here.
 */
import React, { useMemo } from 'react';
import { resolveDungeonHudProfileV396 } from '../game/dungeon/DungeonHudCatalogV396.js';
import TacticalCombatHudV411 from './TacticalCombatHudV411.jsx';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.max(0, Math.round(finite(value, fallback)));

export const EMPTY_DUNGEON_HUD_STATE_V396 = Object.freeze({
  dungeonId: 'dung_taurus',
  score: 0,
  kills: 0,
  hp: 1,
  maxHp: 1,
  roomIndex: 0,
  roomNumber: 1,
  roomTotal: 5,
  roomId: null,
  roomTitle: '',
  roomKind: 'entry',
  roomKindLabel: '',
  roomTone: 'standard',
  roomMarkers: Object.freeze([]),
  objectiveTitle: '',
  objectiveBody: '',
  objectiveMode: 'hostiles',
  objectiveLabel: '',
  objectiveValue: '0/0',
  objectiveSecondary: '',
  objectiveRatio: 0,
  bossName: '',
  bossHp: null,
  bossMaxHp: null,
  roomComplete: false,
  qaLabel: null,
  qaLoadoutLabel: null,
});

const objectiveCounterFor = (state, vi) => {
  const value = String(state.objectiveValue || '').trim();
  const secondary = String(state.objectiveSecondary || '').trim();
  if (state.roomComplete) return vi ? 'HOÀN TẤT' : 'COMPLETE';
  switch (state.objectiveMode) {
    case 'nodes':
      return `${vi ? 'NODE' : 'NODES'} ${value}${secondary ? ` · ${secondary}` : ''}`;
    case 'boss':
      return '';
    case 'hostiles':
      return `${vi ? 'ĐỊCH' : 'HOSTILES'} ${value}`;
    default:
      return [state.objectiveLabel, value].filter(Boolean).join(' ');
  }
};

export default function DungeonHudV396({
  lang = 'vi',
  state = EMPTY_DUNGEON_HUD_STATE_V396,
  announcement = null,
  onRetreat = null,
  retreating = false,
}) {
  const vi = lang === 'vi';
  const profile = useMemo(() => resolveDungeonHudProfileV396(state.dungeonId), [state.dungeonId]);
  const roomNumber = Math.max(1, integer(state.roomNumber, integer(state.roomIndex) + 1));
  const roomTotal = Math.max(1, integer(state.roomTotal, 1));
  const bossActive = state.objectiveMode === 'boss'
    && state.bossHp !== null
    && finite(state.bossMaxHp) > 0;
  return <TacticalCombatHudV411
    lang={lang}
    modeCode={profile.shortCode}
    phaseLabel={`${vi ? 'P' : 'R'} ${roomNumber}/${roomTotal}`}
    objectiveCounter={objectiveCounterFor(state, vi)}
    hp={state.hp}
    maxHp={state.maxHp}
    score={state.score}
    kills={state.kills}
    boss={bossActive ? {
      active: true,
      name: state.bossName,
      hp: state.bossHp,
      maxHp: state.bossMaxHp,
    } : null}
    qa={Boolean(state.qaLabel)}
    announcement={announcement}
    onRetreat={onRetreat}
    retreating={retreating}
    palette={{
      accent: profile.colors.accent,
      accentDim: profile.colors.accentSoft,
      objective: profile.colors.objective,
      danger: profile.colors.danger,
      text: profile.colors.text,
      muted: profile.colors.muted,
    }}
  />;
}
