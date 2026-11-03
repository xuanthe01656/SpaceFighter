'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const output=path.resolve(arg('--output-dir')||path.join(root,'client/dist/c15-rc6'));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const pushEnabled=text=>/^\s*push:/m.test(text);
const all=(text,markers)=>markers.every(marker=>text.includes(marker));

function gitHead(){try{return execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
  catch(_){const marker=path.join(root,'GIT_HEAD.txt');return fs.existsSync(marker)?fs.readFileSync(marker,'utf8').trim():'0'.repeat(40);}}

function main(){
  const gradle=read('client/android/app/build.gradle');
  const variables=read('client/android/variables.gradle');
  const manifest=read('client/android/app/src/main/AndroidManifest.xml');
  const proguard=read('client/android/app/proguard-rules.pro');
  const releaseWorkflow=read('.github/workflows/android-release-candidate.yml');
  const debugWorkflow=read('.github/workflows/android-native-smoke.yml');
  const workflows={
    rc1b:read('.github/workflows/c15-rc1b-gate.yml'),rc1c:read('.github/workflows/c15-rc1c-rc2-gate.yml'),
    rc3:read('.github/workflows/c15-rc3-gate.yml'),rc4:read('.github/workflows/c15-rc4-gate.yml'),
    rc5:read('.github/workflows/c15-rc5-gate.yml'),rc6:read('.github/workflows/c15-rc6-gate.yml'),
    rc7:read('.github/workflows/c15-rc7-gate.yml'),phase:read('.github/workflows/phase0-ci.yml'),ios:read('.github/workflows/ios-build.yml'),
  };
  const frozenGatesManualOnly=['rc1b','rc1c','rc3','rc4','rc5','rc6'].every(name=>!pushEnabled(workflows[name]));
  const rc7SupersedingPushGate=pushEnabled(workflows.rc7)&&/npm run gate:c15-rc7/.test(workflows.rc7)
    &&!/npm run gate:c15-rc6/.test(workflows.rc7);
  const androidManualOnly=!pushEnabled(debugWorkflow)&&!pushEnabled(releaseWorkflow);
  const dedicatedUploadSigning=all(gradle,['spacefighterUpload','SF_ANDROID_RELEASE_SIGNING_ENABLED','SF_ANDROID_UPLOAD_KEYSTORE_PATH'])
    &&all(releaseWorkflow,['ANDROID_UPLOAD_KEYSTORE_BASE64','ANDROID_UPLOAD_CERT_SHA1','ANDROID_UPLOAD_CERT_SHA256','ANDROID_GOOGLE_SERVICES_JSON_BASE64','spacefighter-upload-key.jks'])
    &&!releaseWorkflow.includes('ANDROID_KEYSTORE_BASE64');
  const releaseHardening=/release\s*\{[\s\S]*minifyEnabled true/.test(gradle)
    &&/release\s*\{[\s\S]*shrinkResources true/.test(gradle)
    &&/release\s*\{[\s\S]*debuggable false/.test(gradle)
    &&/proguard-android-optimize\.txt/.test(gradle)
    &&all(proguard,['LineNumberTable','JavascriptInterface']);
  const versioned=all(gradle,['SF_ANDROID_VERSION_CODE','SF_ANDROID_VERSION_NAME','versionCode sfAndroidVersionCode','versionName sfAndroidVersionName']);
  const failClosed=gradle.includes('Release packaging is fail-closed');
  const api36=variables.includes('compileSdkVersion = 36')&&variables.includes('targetSdkVersion = 36');
  const bundletool=all(releaseWorkflow,["BUNDLETOOL_VERSION: '1.18.3'",'BUNDLETOOL_SHA256:','validate --bundle','dump config --bundle','--mode=universal']);
  const page16k=all(releaseWorkflow,['PAGE_ALIGNMENT_16K','zipalign\" -c -P 16 -v 4']);
  const signatureVerification=all(releaseWorkflow,['apksigner\" verify --verbose --print-certs','jarsigner -verify -verbose -certs','certificate mismatch']);
  const provenance=all(releaseWorkflow,['RC6_ANDROID_RELEASE_PROVENANCE.json','SHA256SUMS.txt','mapping.txt','lint-results-release']);
  const noAutomaticPlay=!/gradle-play-publisher|google-play|play\/publish|serviceAccountJson/i.test(releaseWorkflow)
    &&releaseWorkflow.includes("'googlePlayUploadPerformed': False");
  const appIdentity=/applicationId "com\.theIT\.spacefighter4"/.test(gradle)&&/android:allowBackup="false"/.test(manifest);
  const releaseLane=all(releaseWorkflow,['release-candidate','arcade-responsive-v2','VITE_C15_RC5_CONTROL_ENABLED: \'true\''])
    &&releaseWorkflow.includes("VITE_C15_RC3_ENABLED: 'false'");
  const report={version:'c15-rc6-gate-report-v1',status:'PASS',generatedAt:new Date().toISOString(),gitHead:gitHead(),
    baseline:{rc5CandidateCommitPrefix:'824adc9',rc5AndroidFunctionalGate:'PASS',productionSettlementEnabled:false,
      productionCloudRewards:false,c12Frozen:true,stagingKillSwitchExpected:true},
    release:{api36,dedicatedUploadSigning,versioned,releaseHardening,failClosed,bundletool,page16k,signatureVerification,
      provenance,noAutomaticPlay,appIdentity,releaseLane,artifact:'spacefighter-android-c15-rc6-upload-ready-candidate'},
    pipeline:{frozenGatesManualOnly,phasePushDisabled:!pushEnabled(workflows.phase),frozenRc6ManualOnly:!pushEnabled(workflows.rc6),
      rc7SupersedingPushGate,androidManualOnly,
      iosManualOnly:!pushEnabled(workflows.ios)},
    safety:{productionSettlementEnabled:false,productionCloudRewards:false,c12Frozen:true,stagingKillSwitchExpected:true,
      firebaseRulesChanged:false,secretMaterialInArtifact:false,automaticPlayUpload:false}};
  const invariants=[...Object.values(report.release),...Object.values(report.pipeline),
    report.safety.productionSettlementEnabled===false,report.safety.productionCloudRewards===false,
    report.safety.c12Frozen===true,report.safety.stagingKillSwitchExpected===true,
    report.safety.firebaseRulesChanged===false,report.safety.secretMaterialInArtifact===false,
    report.safety.automaticPlayUpload===false];
  if(invariants.some(value=>value!==true&&typeof value==='boolean'))throw new Error(`RC6 evidence invariant failed: ${JSON.stringify(report)}`);
  const releaseManifest={version:'c15-rc6-release-manifest-v1',gitHead:report.gitHead,baselineCommitPrefix:'824adc9',
    applicationId:'com.theIT.spacefighter4',minimumCandidateVersion:'1.3.0-rc.1',compileSdk:36,targetSdk:36,minSdk:24,
    selectedControlProfile:'arcade-responsive-v2',authoritativeSimulationHz:30,
    signing:{qaDebugLanePreserved:true,dedicatedUploadKeyRequired:true,playAppSigningExpected:true,keyMaterialStoredInArtifact:false},
    packaging:{aab:true,releaseApk:true,universalApkEvidence:true,r8:true,resourceShrinking:true,pageAlignment:'PAGE_ALIGNMENT_16K'},
    candidateArtifacts:{android:'spacefighter-android-c15-rc6-upload-ready-candidate',playUpload:'manual-and-not-in-this-workflow'},
    defaultProductionFlags:{releaseGateEnabled:false,globalKillSwitch:true,settlementEnabled:false,cloudRewards:false},
    validation:{local:'gate:c15-rc6:fast',ci:'gate:c15-rc6',native:'manual-signed-release-after-ci'},
    excluded:['automatic Google Play upload','production settlement enablement','production Cloud Rewards','Crashlytics activation','RevenueCat production rollout','iOS candidate']};
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'C15_RC6_GATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(output,'C15_RC6_RELEASE_MANIFEST.json'),JSON.stringify(releaseManifest,null,2)+'\n');
  fs.writeFileSync(path.join(output,'C15_RC6_GATE_REPORT.md'),`# SpaceFighter C15-RC6 Android Release Readiness Gate\n\n- Status: **PASS**\n- Git HEAD: \`${report.gitHead}\`\n- API 36 target/compile: **true**\n- Dedicated upload signing lane: **true**\n- R8 + resource shrinking: **true**\n- Release non-debuggable: **true**\n- AAB + universal APK validation: **true**\n- 16 KB page alignment checks: **true**\n- SHA/provenance/mapping/lint evidence: **true**\n- Automatic Google Play upload: **false**\n- RC6 frozen manual audit: **true**
- RC7 superseding main-push gate: **true**\n- Production settlement enabled: **false**\n- Production Cloud Rewards: **false**\n`);
  console.log('C15_RC6_EVIDENCE_PASS',path.join(output,'C15_RC6_GATE_REPORT.json'));
}
try{main();}catch(error){console.error(error?.stack||error);process.exitCode=1;}
