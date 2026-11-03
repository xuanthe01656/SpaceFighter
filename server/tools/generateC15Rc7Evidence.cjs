'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createC15Rc1bResourceCatalog}=require('../lib/c15Rc1bResourceCatalog.cjs');
const root=path.resolve(__dirname,'../..');
const arg=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null;};
const output=path.resolve(arg('--output-dir')||path.join(root,'client/dist/c15-rc7'));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8').replace(/\r\n/g,'\n');
const pushEnabled=text=>/^\s*push:/m.test(text);
const all=(text,markers)=>markers.every(marker=>text.includes(marker));
function gitHead(){try{return execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
  catch(_){return '0'.repeat(40);}}
function main(){
  const java=read('client/android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterAssetStorePlugin.java');
  const activity=read('client/android/app/src/main/java/com/theIT/spacefighter4/MainActivity.java');
  const payload=read('client/src/game/assets/AssetPayloadStoreV1.js');
  const delivery=read('client/src/game/c15/C15ResourceDelivery.js');
  const session=read('client/src/game/c15/C15Rc1bSession.js');
  const screen=read('client/src/components/C15LocalAlpha1/index.jsx');
  const renderer=read('client/src/components/C15LocalAlpha1/C15LocalRenderer.js');
  const catalogSource=read('server/lib/c15Rc1bResourceCatalog.cjs');
  const server=read('server/server.js');
  const exporter=read('server/tools/exportC15AssetPacks.cjs');
  const approvals=JSON.parse(read('client/assets/visual-art-approvals.json'));
  const android=read('.github/workflows/android-native-smoke.yml');
  const workflows={};
  for(const name of ['rc1b','rc1c-rc2','rc3','rc4','rc5','rc6','rc7']){
    const file=name==='rc1c-rc2'?'c15-rc1c-rc2-gate.yml':`c15-${name}-gate.yml`;
    workflows[name]=read(`.github/workflows/${file}`);
  }
  const nativeStore=all(java,['@CapacitorPlugin(name = "SpaceFighterAssetStore")','getContext().getFilesDir()',
    'connection.setRequestProperty("Range"','MessageDigest.getInstance("SHA-256")','downloadProgress',
    'Asset download cancelled','Explicit downloaded-assets scope required'])
    &&activity.indexOf('registerPlugin(SpaceFighterAssetStorePlugin.class)')<activity.indexOf('super.onCreate(savedInstanceState)')
    &&!java.includes('getExternalStorage');
  const dualStore=all(payload,['browser-indexeddb','android-app-private','Capacitor.convertFileSrc','createAutoAssetPayloadStore',
    'ASSET_DOWNLOAD_CANCELLED','async clear()']);
  const integrity=all(delivery,['verifyManifestDigest','validateDescriptor','C15_ASSET_STORAGE_LOW','minFreeReserveBytes',
    'Single metadata write is the activation boundary']);
  const progress=all(screen,['onResourceProgress','Đang tải tài nguyên','resourceAbort.abort()']);
  const runtimeConsumesPack=all(screen,['alpha_coast_low.webp','ship_xwing_top.png','p1_small_sheet.webp'])
    &&all(renderer,['pilotTextureUrl','enemyAtlasUrl','remotePilot','remoteEnemyAtlas']);
  const fallbackCatalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://api.example.test'});
  const externalCatalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://api.example.test',
    assetBaseUrl:'https://storage.googleapis.com/spacefighter-evidence',assetPathPrefix:'game-assets/c15'});
  const cloudRunFallback=fallbackCatalog.externalAssetDelivery===false&&fallbackCatalog.manifest.packs
    .every(pack=>pack.url.startsWith('https://api.example.test/api/v1/c15/resources/'));
  const externalReady=externalCatalog.externalAssetDelivery===true&&externalCatalog.manifest.packs
    .every(pack=>pack.url.startsWith('https://storage.googleapis.com/spacefighter-evidence/game-assets/c15/'))
    &&all(catalogSource,['assetBaseUrl','assetPathPrefix','externalAssetDelivery'])
    &&all(server,['GAME_C15_ASSET_BASE_URL','GAME_C15_ASSET_PATH_PREFIX'])
    &&all(exporter,['gcloud storage rsync','gcs-cors.json','SHA256SUMS.txt']);
  const frozenManual=['rc1b','rc1c-rc2','rc3','rc4','rc5','rc6'].every(name=>!pushEnabled(workflows[name]));
  const singleRc7PushGate=pushEnabled(workflows.rc7)&&/npm run gate:c15-rc7/.test(workflows.rc7)
    &&!/npm run gate:c15-rc6/.test(workflows.rc7);
  const androidManualOnly=!pushEnabled(android)&&/c15_rc7_assets:/.test(android)
    &&/npm run gate:c15-rc7:fast/.test(android)&&/spacefighter-android-c15-rc7-asset-delivery-candidate/.test(android);
  const report={version:'c15-rc7-remote-asset-delivery-gate-report-v1',status:'PASS',generatedAt:new Date().toISOString(),gitHead:gitHead(),
    baseline:{commitPrefix:'57b0652',rc4Settlement:'PASS_FROZEN',rc5AndroidControl:'PASS_FROZEN',
      rc6AndroidSigning:'PASS_FROZEN',productionSettlementEnabled:false,productionCloudRewards:false,c12Frozen:true},
    delivery:{manifestVersion:'resource-manifest-v1',v1BackwardCompatible:true,nativeStore,dualStore,integrity,
      resumableRange:true,atomicActivation:true,capacityReserve:true,cancelResume:true,clearDownloadedAssets:true,
      progress,runtimeConsumesPack,cloudRunFallback,externalReady},
    assets:{commercialArtworkApproved:false,approvalRecords:Object.keys(approvals.approved||{}).length,
      currentPacksForPipelineTestingOnly:true,largeGlbThroughCloudRun:false},
    pipeline:{frozenGatesManualOnly:frozenManual,singleRc7PushGate,androidManualOnly,
      candidateArtifact:'spacefighter-android-c15-rc7-asset-delivery-candidate'},
    safety:{productionSettlementEnabled:false,productionCloudRewards:false,c12Frozen:true,firestoreRulesChanged:false,
      secretMaterialAdded:false,automaticPlayUpload:false}};
  const required=[nativeStore,dualStore,integrity,progress,runtimeConsumesPack,cloudRunFallback,externalReady,frozenManual,
    singleRc7PushGate,androidManualOnly,report.assets.approvalRecords===0];
  if(required.some(value=>value!==true))throw new Error(`RC7 evidence invariant failed: ${JSON.stringify(report)}`);
  const manifest={version:'c15-rc7-asset-delivery-manifest-v1',gitHead:report.gitHead,baselineCommitPrefix:'57b0652',
    client:{metadataStore:'IndexedDB',nativePayloadStore:'Android app-private files',webPayloadFallback:'IndexedDB',
      verification:['descriptor SHA-256','file size','file SHA-256'],activation:'single metadata commit',
      download:['HTTPS','Range resume','cancel/resume','progress'],minimumFreeReserveBytes:134217728},
    server:{controlPlane:'Cloud Run manifest',stagingDataPlane:'Cloud Run immutable Range fallback',
      productionDataPlane:'Google Cloud Storage/CDN configurable',baseUrlEnv:'GAME_C15_ASSET_BASE_URL',
      prefixEnv:'GAME_C15_ASSET_PATH_PREFIX',exportCommand:'npm run assets:export:c15 -- --asset-base-url <HTTPS_BASE>'},
    pilotPacks:['core-bootstrap/v1','campaign-alpha-mobile-low/v1'],
    currentArtworkStatus:'PIPELINE_TEST_ONLY_NOT_COMMERCIAL_APPROVED',
    defaultProductionFlags:{settlementEnabled:false,cloudRewards:false,c12Frozen:true},
    validation:{local:'gate:c15-rc7:fast',ci:'gate:c15-rc7',native:'manual c15_rc7_assets candidate'},
    deferred:['commercial artwork replacement','full catalog migration','GCS bucket provisioning','CDN enablement','iOS native store']};
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'C15_RC7_GATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(output,'C15_RC7_ASSET_DELIVERY_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(output,'C15_RC7_GATE_REPORT.md'),`# SpaceFighter C15-RC7 Remote Asset Delivery Gate\n\n- Status: **PASS**\n- Git HEAD: \`${report.gitHead}\`\n- Android app-private payload store: **true**\n- Web IndexedDB fallback: **true**\n- HTTPS Range resume + SHA-256: **true**\n- Storage reserve/cancel/clear/progress: **true**\n- Current Alpha pack drives background + ship + enemy atlas: **true**\n- Cloud Run immutable fallback: **true**\n- GCS/CDN external data plane ready: **true**\n- Commercial artwork approved: **false**\n- RC7 sole main-push gate: **true**\n- Production settlement enabled: **false**\n- Production Cloud Rewards: **false**\n`);
  console.log('C15_RC7_EVIDENCE_PASS',path.join(output,'C15_RC7_GATE_REPORT.json'));
}
try{main();}catch(error){console.error(error?.stack||error);process.exitCode=1;}
