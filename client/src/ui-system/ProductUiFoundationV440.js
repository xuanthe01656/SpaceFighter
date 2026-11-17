/**
 * Space Fighter Product UI Foundation V4.4A.
 *
 * Presentation metadata only. This module must never own gameplay, rewards,
 * persistence, battle tickets, resource activation, or server authority.
 */
export const PRODUCT_UI_FOUNDATION_VERSION_V440 = 'product-ui-foundation-v4.4a';

const policy = (kind, scroll = 'auto', tone = kind) => Object.freeze({ kind, scroll, tone });

export const PRODUCT_SCREEN_POLICIES_V440 = Object.freeze({
  portal: policy('auth', 'auto', 'portal'),
  resource_manager: policy('system', 'auto', 'resource'),
  hq: policy('workspace', 'auto', 'hangar'),
  pilots: policy('workspace', 'auto', 'hangar'),
  inventory: policy('workspace', 'auto', 'armory'),
  campaign_portal: policy('home', 'auto', 'portal'),
  galaxy_map: policy('map', 'locked', 'map'),
  stage_select: policy('selection', 'auto', 'campaign'),
  missions: policy('workspace', 'auto', 'missions'),
  events: policy('workspace', 'auto', 'events'),
  shop_campaign: policy('workspace', 'auto', 'shop'),
  dungeon_select: policy('selection', 'auto', 'dungeon'),
  campaign: policy('battle', 'locked', 'battle'),
  dungeon: policy('battle', 'locked', 'battle'),
  dungeon_result: policy('result', 'auto', 'result'),
  cloud_qa_alpha1: policy('qa', 'auto', 'qa'),
});

const FALLBACK_POLICY_V440 = policy('workspace', 'auto', 'default');

export function resolveProductScreenPolicyV440(screen) {
  const key = String(screen || '').trim();
  return PRODUCT_SCREEN_POLICIES_V440[key] || FALLBACK_POLICY_V440;
}

export function auditProductUiFoundationV440() {
  const issues = [];
  const expectedScreens = [
    'portal',
    'resource_manager',
    'hq',
    'pilots',
    'inventory',
    'campaign_portal',
    'galaxy_map',
    'stage_select',
    'missions',
    'events',
    'shop_campaign',
    'dungeon_select',
    'campaign',
    'dungeon',
    'dungeon_result',
    'cloud_qa_alpha1',
  ];

  for (const screen of expectedScreens) {
    const entry = PRODUCT_SCREEN_POLICIES_V440[screen];
    if (!entry) {
      issues.push(`MISSING_SCREEN_POLICY:${screen}`);
      continue;
    }
    if (!['auth', 'system', 'workspace', 'home', 'map', 'selection', 'battle', 'result', 'qa'].includes(entry.kind)) {
      issues.push(`INVALID_SCREEN_KIND:${screen}:${entry.kind}`);
    }
    if (!['auto', 'locked'].includes(entry.scroll)) {
      issues.push(`INVALID_SCROLL_POLICY:${screen}:${entry.scroll}`);
    }
    if (!entry.tone) issues.push(`MISSING_SCREEN_TONE:${screen}`);
    if (!Object.isFrozen(entry)) issues.push(`MUTABLE_SCREEN_POLICY:${screen}`);
  }

  if (!Object.isFrozen(PRODUCT_SCREEN_POLICIES_V440)) issues.push('MUTABLE_SCREEN_POLICY_REGISTRY');
  if (resolveProductScreenPolicyV440('unknown').kind !== 'workspace') issues.push('INVALID_FALLBACK_POLICY');

  return Object.freeze(issues);
}
