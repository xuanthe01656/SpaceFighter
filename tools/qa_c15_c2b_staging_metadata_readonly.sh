#!/usr/bin/env bash
set -euo pipefail
# Cloud Run and GitHub metadata only. No POST calls, secrets, writes or deploys.
PROJECT='distributed-inn-482605-c6'
REGION='asia-southeast1'
SERVICE='spacefighter-api-staging'
if ! command -v gcloud >/dev/null 2>&1; then
  echo 'C2B_STAGING_METADATA=NOT_CHECKED_GCLOUD_MISSING'
else
  TMP="$(mktemp -t sf-c2b-staging-meta.XXXXXXXX)"
  chmod 600 "$TMP"
  trap 'rm -f "$TMP"' EXIT
  if gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$TMP"; then
    node - "$TMP" <<'JS'
const fs=require('node:fs');
const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const cont=source?.spec?.template?.spec?.containers?.[0] || source?.template?.containers?.[0] || {};
const env=cont.env||[];
const names=new Set(env.map(v=>v.name));
const flag=env.find(v=>v.name==='GAME_C15_DUNGEON_C2B_ENABLED');
const flagLiteral=typeof flag?.value==='string'?flag.value:null;
console.log('C2B_STAGING_SERVICE_METADATA=AVAILABLE');
console.log('C2B_STAGING_READY_REVISION='+String(source?.status?.latestReadyRevisionName||'UNKNOWN'));
console.log('C2B_STAGING_FLAG='+(!flag?'NOT_PRESENT':flagLiteral==='false'?'OFF':flagLiteral==='true'?'ON_REQUIRES_REVIEW':'SET_VIA_REFERENCE_OR_UNKNOWN'));
console.log('C2B_STAGING_APPROVAL_VAR_PRESENT='+names.has('GAME_C15_DUNGEON_C2B_APPROVED'));
console.log('C2B_STAGING_ALLOWLIST_VAR_PRESENT='+names.has('GAME_C15_DUNGEON_C2B_ALLOW_UIDS'));
console.log('C2B_STAGING_HMAC_VAR_PRESENT='+names.has('GAME_C15_DUNGEON_C2B_HMAC_KEY_HEX'));
console.log('C2B_STAGING_NO_AUTHORIZED_SAME_RUN_REPLAY=NOT_VERIFIED');
console.log('C2B_STAGING_METADATA_IS_NOT_DEPLOYED_CODE_ATTESTATION');
JS
  else
    echo 'C2B_STAGING_METADATA=NOT_CHECKED_PERMISSION_OR_SERVICE_ERROR'
  fi
fi
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  if gh api 'repos/xuanthe01656/SpaceFighter/actions/artifacts?per_page=100' --jq \
    '{total_count,listed_count:(.artifacts|length),listed_bytes:(.artifacts|map(.size_in_bytes)|add // 0)}'; then
    echo 'C2B_GH_ARTIFACT_LIST=READONLY_LIMIT_100_NOT_BILLING_QUOTA'
  else
    echo 'C2B_GH_ARTIFACT_LIST=UNAVAILABLE'
  fi
else
  echo 'C2B_GH_ARTIFACT_LIST=NOT_CHECKED_NO_AUTHENTICATED_GH'
fi
echo 'NO_GIT_WRITE_NO_CLOUD_RUN_WRITE_NO_FIRESTORE_WRITE'
