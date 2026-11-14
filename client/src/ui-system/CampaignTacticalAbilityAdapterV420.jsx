/** Campaign adapter for the shared tactical skill/passive cluster V4.2.0. */
import React, { useMemo } from 'react';
import { projectCampaignTacticalAbilityV420 } from '../game/ui/CampaignTacticalPresentationV420.js';
import TacticalAbilityClusterV411 from './TacticalAbilityClusterV411.jsx';

export default function CampaignTacticalAbilityAdapterV420({
  state = null,
  feedback = null,
  onActivate = null,
  lang = 'vi',
} = {}) {
  const presentation = useMemo(() => projectCampaignTacticalAbilityV420({ state, feedback, lang }), [state, feedback, lang]);
  if (!presentation || typeof onActivate !== 'function') return null;
  return <TacticalAbilityClusterV411
    lang={lang}
    active={presentation.active}
    passive={presentation.passive}
    feedback={presentation.feedback}
    onActivate={() => onActivate('ship_skill')}
  />;
}
