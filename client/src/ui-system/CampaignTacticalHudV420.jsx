/** Campaign adapter for the shared Unified Tactical HUD V4.2.0. */
import React, { useMemo } from 'react';
import { projectCampaignTacticalHudV420 } from '../game/ui/CampaignTacticalPresentationV420.js';
import TacticalCombatHudV411 from './TacticalCombatHudV411.jsx';

export default function CampaignTacticalHudV420({
  lang = 'vi',
  state = null,
  planetId = 1,
  qa = false,
  announcement = null,
  onRetreat = null,
  retreating = false,
} = {}) {
  const presentation = useMemo(() => projectCampaignTacticalHudV420({ state, planetId, lang, qa }), [state, planetId, lang, qa]);
  return <TacticalCombatHudV411
    lang={lang}
    {...presentation}
    announcement={announcement}
    onRetreat={onRetreat}
    retreating={retreating}
  />;
}
