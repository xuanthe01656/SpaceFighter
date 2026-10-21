import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { assertSameAuthUser, retrySameAuthUser } from '../src/utils/authRequestGuards.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(base,'..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const checks=[];
const check=(desc,ok)=>{checks.push([desc,Boolean(ok)]);console.log(`${ok?'PASS':'FAIL'} ${desc}`)};
const clientFiles=[];
const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(js|jsx)$/.test(p))clientFiles.push(p)}};
walk(path.join(base,'src'));
const source=clientFiles.map(p=>fs.readFileSync(p,'utf8')).join('\n');
const auth=read('client/src/hooks/useAuth.jsx');
const api=read('client/src/services/gameApi.js');
const shop=read('client/src/components/ShopCampaign/index.jsx');
const server=read('server/server.js');
const econ=read('server/lib/economy.cjs');
const service=read('server/lib/gameService.cjs');
const rules=read('security/firestore.rules');

// V3 delegates retries to retrySameAuthUser. Execute the REAL gameApi command
// with a simulated timeout and inspect both HTTP bodies: this catches ID
// regeneration even if the source is reformatted or retry code is refactored.
async function verifyCommandRetryIdempotency(gameApiSource) {
  let generatedIds = 0;
  const submitted = [];
  const fakeApiUrl = 'https://example.invalid/api/v1';
  const sandbox = {
    auth: {
      currentUser: {
        uid: 'security-check-user',
        getIdToken: async () => 'fake-id-token'
      }
    },
    secureStorage: { getItem: key => key === 'astro_session_id' ? 'fake-session' : null },
    assertSameAuthUser,
    retrySameAuthUser,
    __viteEnv: { VITE_GAME_API_URL: fakeApiUrl, PROD: true },
    crypto: { randomUUID: () => `security-check-id-${++generatedIds}` },
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      if (url !== `${fakeApiUrl}/command` || options.method !== 'POST') {
        throw new Error('Unexpected API call in idempotency probe');
      }
      submitted.push(JSON.parse(options.body));
      if (submitted.length === 1) {
        const error = new Error('Simulated network timeout');
        error.code = 'TIMEOUT';
        throw error;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
  };

  // Only strip ESM syntax and replace Vite's compile-time env in this test copy.
  // All command/retry logic below is the original implementation from gameApi.js.
  const executable = gameApiSource
    .replace(/^import[^\r\n]*;[ \t]*$/gm, '')
    .replace(/import\.meta\.env/g, '__viteEnv')
    .replace(/^export\s+/gm, '') +
    '\n;globalThis.__securityCheckCommand = executeGameCommand;';

  vm.runInNewContext(executable, sandbox, { filename: 'gameApi.js', timeout: 1500 });
  const result = await sandbox.__securityCheckCommand('inventory.lock', { itemId: 'probe-item' });
  return result?.ok === true &&
    generatedIds === 1 &&
    submitted.length === 2 &&
    submitted[0].requestId === 'security-check-id-1' &&
    submitted[1].requestId === submitted[0].requestId &&
    submitted.every(body => body.command === 'inventory.lock' && body.payload?.itemId === 'probe-item');
}

check('Client has no Firestore document writes', !/\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\s*\(/.test(source));
check('Auth cloud economic calls use server commands', /gameAction = useCallback/.test(auth) && /executeGameCommand/.test(auth));
check('API sends Firebase ID token and session', /getIdToken\(\)/.test(api) && /X-Game-Session/.test(api));
let retryIdempotencyOk = false;
try {
  retryIdempotencyOk = await verifyCommandRetryIdempotency(api);
} catch (error) {
  console.error(`Idempotency probe failed: ${error?.message || error}`);
}
check('Network retries use the same idempotency ID', retryIdempotencyOk);
check('IAP cannot create gems in client', /const handleTopup = \(\) =>/.test(shop) && !/grantGemsSuccess|purchasePackage|\[Web Test\]|\[Dev Test\]/.test(shop));
check('Cloud gacha server settled', /gameAction\('gacha.open'/.test(shop));
check('Server verifies Firebase ID token', /verifyIdToken\(header.slice\(7\),true\)/.test(server));
check('Server command uses Firestore transaction and immutable ledger', /db.runTransaction/.test(service) && /t.create\(opRef/.test(service));
check('Server economy uses secure RNG', /randomInt/.test(econ) && !/Math.random/.test(econ));
check('Server limits battle and gacha daily', /battleStarts/.test(econ) && /gachaCount/.test(econ));
check('Strict owner read/deny-write rules exist', /allow get: if request.auth/.test(rules) && /allow list, create, update, delete: if false/.test(rules));
check('API feature disabled unless explicitly enabled', /GAME_API_ENABLED==='true'/.test(server));
check('Dungeon cloud victory can claim server-rolled rewards', /isVictory && \(earnedRewards.length > 0 \|\| auth.currentUser\)/.test(read('client/src/components/DungeonResult/index.jsx')));
check('No cleartext guest campaign storage in battle scene', !/localStorage\.setItem\('astro_guest_campaign'/.test(read('client/src/components/Campaign/CampaignScene.js')));
const failed=checks.filter(([,ok])=>!ok).length;
console.log(`Phase1 static security checks: ${checks.length-failed}/${checks.length} PASS`);
if(failed)process.exit(1);
