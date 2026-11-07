import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PLAYER_DAMAGE_GATE_DEFAULTS_V25,
  PLAYER_DAMAGE_OUTCOME_V25,
  PLAYER_DAMAGE_PIPELINE_VERSION,
  createPlayerDamageGateV25,
  createPlayerDamageOutcomeV25,
} from '../src/game/combat/PlayerDamagePipelineV25.js';

test('distinct projectiles are admitted independently while one projectile ID is idempotent', () => {
  const gate = createPlayerDamageGateV25();
  const first = gate.admitHit({ source: 'projectile', hitId: 'p-1', nowMs: 100 });
  const duplicate = gate.admitHit({ source: 'projectile', hitId: 'p-1', nowMs: 101 });
  const second = gate.admitHit({ source: 'projectile', hitId: 'p-2', nowMs: 101 });

  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, PLAYER_DAMAGE_OUTCOME_V25.DUPLICATE_PROJECTILE);
  assert.equal(second.accepted, true);
  assert.equal(gate.snapshot().projectileLedgerSize, 2);
});

test('projectiles fail closed without a stable hit ID', () => {
  const gate = createPlayerDamageGateV25();
  const result = gate.admitHit({ source: 'projectile', nowMs: 10 });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, PLAYER_DAMAGE_OUTCOME_V25.INVALID_PROJECTILE);
  assert.equal(gate.snapshot().projectileLedgerSize, 0);
});

test('contact cooldown is per source, does not block another enemy, and expires predictably', () => {
  const gate = createPlayerDamageGateV25({ contactCooldownMs: 900 });
  assert.equal(gate.admitHit({ source: 'contact', contactId: 'boss', nowMs: 1000 }).accepted, true);

  const repeat = gate.admitHit({ source: 'contact', contactId: 'boss', nowMs: 1500 });
  assert.equal(repeat.accepted, false);
  assert.equal(repeat.reason, PLAYER_DAMAGE_OUTCOME_V25.CONTACT_COOLDOWN);
  assert.equal(repeat.remainingMs, 400);

  assert.equal(gate.admitHit({ source: 'contact', contactId: 'enemy-2', nowMs: 1500 }).accepted, true);
  assert.equal(gate.admitHit({ source: 'contact', contactId: 'boss', nowMs: 1900 }).accepted, true);
});

test('contact cooldown never suppresses an independent projectile at the same timestamp', () => {
  const gate = createPlayerDamageGateV25({ contactCooldownMs: 900 });
  const contact = gate.admitHit({ source: 'contact', contactId: 'boss', nowMs: 500 });
  const projectile = gate.admitHit({ source: 'projectile', hitId: 'p-same-frame', nowMs: 500 });
  const repeatedContact = gate.admitHit({ source: 'contact', contactId: 'boss', nowMs: 500 });

  assert.equal(contact.accepted, true);
  assert.equal(projectile.accepted, true);
  assert.equal(repeatedContact.accepted, false);
  assert.equal(repeatedContact.reason, PLAYER_DAMAGE_OUTCOME_V25.CONTACT_COOLDOWN);
});

test('gate clock is monotonic and ledgers remain bounded', () => {
  const gate = createPlayerDamageGateV25({
    projectileRetentionMs: 1000,
    maxProjectileLedgerSize: 3,
    maxContactLedgerSize: 2,
  });
  for (let index = 0; index < 6; index += 1) {
    gate.admitHit({ source: 'projectile', hitId: `p-${index}`, nowMs: index * 100 });
  }
  assert.equal(gate.snapshot().projectileLedgerSize, 3);
  gate.admitHit({ source: 'contact', contactId: 'a', nowMs: 1000 });
  gate.admitHit({ source: 'contact', contactId: 'b', nowMs: 1000 });
  gate.admitHit({ source: 'contact', contactId: 'c', nowMs: 1000 });
  assert.equal(gate.snapshot().contactLedgerSize, 2);

  const backwards = gate.admitHit({ source: 'environment', nowMs: 10 });
  assert.equal(backwards.nowMs, 1000);
  assert.equal(gate.snapshot().version, PLAYER_DAMAGE_PIPELINE_VERSION);
});

test('damage outcomes distinguish evade, absorption, damage, fatal and rejected hits', () => {
  const acceptedGate = Object.freeze({ accepted: true, reason: PLAYER_DAMAGE_OUTCOME_V25.ACCEPTED });
  const rejectedGate = Object.freeze({ accepted: false, reason: PLAYER_DAMAGE_OUTCOME_V25.DUPLICATE_PROJECTILE });

  assert.equal(createPlayerDamageOutcomeV25({
    gate: acceptedGate, source: 'projectile', hpBefore: 100, hpAfter: 100, dodged: true,
  }).outcome, PLAYER_DAMAGE_OUTCOME_V25.EVADED);

  assert.equal(createPlayerDamageOutcomeV25({
    gate: acceptedGate, source: 'projectile', hpBefore: 100, hpAfter: 100, absorbed: 50,
  }).outcome, PLAYER_DAMAGE_OUTCOME_V25.ABSORBED);

  const damaged = createPlayerDamageOutcomeV25({
    gate: acceptedGate, source: 'projectile', hpBefore: 100, hpAfter: 70,
  });
  assert.equal(damaged.outcome, PLAYER_DAMAGE_OUTCOME_V25.DAMAGED);
  assert.equal(damaged.hpDamage, 30);

  assert.equal(createPlayerDamageOutcomeV25({
    gate: acceptedGate, source: 'contact', hpBefore: 100, hpAfter: 0,
  }).outcome, PLAYER_DAMAGE_OUTCOME_V25.FATAL);

  assert.equal(createPlayerDamageOutcomeV25({
    gate: rejectedGate, source: 'projectile', hitId: 'p-1', hpBefore: 100, hpAfter: 100,
  }).outcome, PLAYER_DAMAGE_OUTCOME_V25.DUPLICATE_PROJECTILE);
});

test('Campaign and Dungeon use V2.5 projectile IDs and contact cooldown instead of global i-frames', () => {
  const campaign = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  const dungeon = fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js', import.meta.url), 'utf8');

  for (const source of [campaign, dungeon]) {
    assert.match(source, /createPlayerDamageGateV25/);
    assert.match(source, /playerDamageGate\.admitHit/);
    assert.match(source, /createPlayerDamageOutcomeV25/);
    assert.match(source, /_damageHitId/);
    assert.match(source, /_contactHitId/);
    assert.doesNotMatch(source, /invincibleUntil|invincibleMs|INV_DUR/);
  }

  assert.match(campaign, /campaign-enemy-projectile-/);
  assert.match(campaign, /campaign-boss-contact/);
  assert.match(campaign, /guestAbilities\.resolveIncomingHit\(\{/);
  assert.match(dungeon, /dungeon-enemy-projectile-/);
  assert.match(dungeon, /source:'environment'/);
});

test('V2.5 leaves Guest reward and Cloud settlement code outside the damage refactor', () => {
  const campaign = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  assert.match(campaign, /gameAction\('battle\.finish',\{ticketId:gsRef\.current\.activeBattleId,victory:false,kills:verifiedClientKills\}\)/);
  assert.match(campaign, /\+ score \+ \(collectedCoins \* coinMult\)/);
  assert.match(campaign, /recordGuestBattle\(gsRef\.current\.campaignData,\{mode:"campaign",victory:false,kills:verifiedClientKills\}/);
  assert.match(campaign, /if \(saveUserProfile\) saveUserProfile\(\);/);
  assert.match(campaign, /if\(guestAbilityQa\)\{onDefeat\(\);return;\}/);
});

test('V2.5 default contact timing is explicit and tuneable', () => {
  assert.equal(PLAYER_DAMAGE_GATE_DEFAULTS_V25.contactCooldownMs, 900);
  assert.equal(PLAYER_DAMAGE_GATE_DEFAULTS_V25.projectileRetentionMs, 30_000);
});
