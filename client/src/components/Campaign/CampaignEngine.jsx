import React, { useEffect, useRef } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { choosePerformancePreset, attachAdaptiveRenderQuality } from '../../game/config/PerformanceProfiles';
import { createCampaignScene } from './CampaignScene';
import { auth } from '../../firebase';
import toast from 'react-hot-toast';
import C15LocalAlpha1 from '../C15LocalAlpha1/index.jsx';
import GuestC15Alpha1QA from './GuestC15Alpha1QA.jsx';
import BattleHud from '../../ui-system/BattleHud.jsx';
import GuestAbilityControls from '../../ui-system/GuestAbilityControls.jsx';
import { resolveGuestCombatQaRuntimeFromViteEnv } from '../../game/combat/GuestCombatQaBuildGateV2.js';
import { cycleGuestCombatQaLoadoutV2 } from '../../game/combat/GuestCombatQaLoadoutV2.js';
import {
  cycleGuestBattleQaSelectionV26A,
  resolveGuestBattleQaResultActionV26A,
  resolveGuestBattleQaSelectionV26A,
} from '../../game/combat/GuestBattleQaNavigationV26A.js';

export default function CampaignEngine(props) {
  const data=props.gsRef?.current?.campaignData;
  const progress=data?.progress||{};
  const c15Eligible=import.meta.env.VITE_C15_RC1B_ENABLED==='true'&&Boolean(auth.currentUser)
    &&Number(progress.currentPlanet||1)===1&&Number(progress.selectedStage||1)===1;
  // Pin the engine lane for this mounted battle screen. RC3 settlement refreshes
  // canonical campaign progress (and may unlock/select stage 2), but that state
  // update must never replace an active/terminal C15 screen with the legacy
  // Campaign engine before the player explicitly presses CONTINUE.
  const c15LaneRef=useRef(c15Eligible);
  const c15Enabled=c15LaneRef.current;
  // Explicit local-development parity lab only: never runs in production builds.
  // Same deterministic C15 kernel/visual renderer, no Firebase or rewards.
  const guestAlpha1ParityQa=import.meta.env.DEV===true
    &&import.meta.env.VITE_GUEST_C15_ALPHA1_PARITY_QA==='true'
    &&!auth.currentUser&&Number(progress.currentPlanet||1)===1
    &&Number(progress.selectedStage||1)===1;
  return guestAlpha1ParityQa
    ? <GuestC15Alpha1QA setScreen={props.setScreen} lang={props.lang}/>
    : c15Enabled
    ? <C15LocalAlpha1 setScreen={props.setScreen} lang={props.lang} refreshCloudProfile={props.refreshCloudProfile}/>
    : <LegacyCampaignEngine {...props}/>;
}

function LegacyCampaignEngine({ gsRef, setScreen, lang, saveUserProfile, getRealTime, gameAction }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef  = useRef(null);
  const retreatLockRef = useRef(false);
  const [retreating, setRetreating] = React.useState(false);
  const [battleHud, setBattleHud] = React.useState({stage:1,wave:1,wavesTotal:5,hp:1,maxHp:1,kills:0,score:0});
  const [battleNotice,setBattleNotice]=React.useState(null);
  const noticeSeq=useRef(0);
  const guestAbilityQa=resolveGuestCombatQaRuntimeFromViteEnv(import.meta.env,{
    authenticated:Boolean(auth.currentUser),
    cloudBattle:Boolean(auth.currentUser),
  });
  const abilityActionRef=useRef(null);
  const [abilityHud,setAbilityHud]=React.useState(null);
  const [abilityFeedback,setAbilityFeedback]=React.useState(null);
  const [qaBattleRevision,setQaBattleRevision]=React.useState(0);
  const [qaResult,setQaResult]=React.useState(null);
  const getQaFallback=React.useCallback(()=>{
    const progress=gsRef.current?.campaignData?.progress||{};
    const planetId=Number(progress.currentPlanet)||1;
    return {
      fallbackPlanetId:planetId,
      fallbackStageId:Number(progress.selectedStage)
        ||Number(progress.planets?.[planetId]?.highestStage)||1,
    };
  },[gsRef]);
  const restartQaBattle=React.useCallback(nextSearch=>{
    if(typeof window==='undefined')return;
    window.history.replaceState(null,'',`${window.location.pathname}${nextSearch}${window.location.hash}`);
    setQaResult(null);
    setAbilityHud(null);
    setAbilityFeedback(null);
    setQaBattleRevision(value=>value+1);
  },[]);
  const cycleQaLoadout=React.useCallback(kind=>{
    if(!guestAbilityQa||typeof window==='undefined')return;
    const next=cycleGuestCombatQaLoadoutV2(window.location.search,kind);
    restartQaBattle(next.search);
  },[guestAbilityQa,restartQaBattle]);
  const cycleQaBattle=React.useCallback(action=>{
    if(!guestAbilityQa||typeof window==='undefined')return;
    const next=cycleGuestBattleQaSelectionV26A(window.location.search,action,getQaFallback());
    restartQaBattle(next.search);
  },[guestAbilityQa,getQaFallback,restartQaBattle]);
  const handleQaResultAction=React.useCallback(action=>{
    if(!guestAbilityQa||!qaResult||typeof window==='undefined')return;
    const next=resolveGuestBattleQaResultActionV26A(window.location.search,qaResult,action);
    if(next.exit){setQaResult(null);setScreen('stage_select');return;}
    restartQaBattle(next.search);
  },[guestAbilityQa,qaResult,restartQaBattle,setScreen]);
  const qaSelection=guestAbilityQa&&typeof window!=='undefined'
    ?resolveGuestBattleQaSelectionV26A(window.location.search,getQaFallback())
    :null;

  useEffect(() => {
    if (!canvasRef.current) return;

    const qualityProfile = choosePerformancePreset({
      userAgent: navigator.userAgent,
      deviceMemory: navigator.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
    // ── Babylon engine ────────────────────────────────────────────────────
    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;
    const performance = attachAdaptiveRenderQuality(engine, scene, qualityProfile, window.devicePixelRatio || 1);


    // ── Callbacks cho CampaignScene ───────────────────────────────────────
    const data = {
      gsRef,
      lang,
      saveUserProfile,
      getRealTime,
      gameAction,
      isCloud: Boolean(auth.currentUser),
      // Only in development Guest, intentionally isolated from trusted online play.
      guestAbilitiesQa:guestAbilityQa,
      onAbilityState:guestAbilityQa?setAbilityHud:null,
      onAbilityFeedback:guestAbilityQa?setAbilityFeedback:null,
      onAbilityController:guestAbilityQa?(activate=>{abilityActionRef.current=activate;}):null,
      onQaResult:guestAbilityQa?(result=>setQaResult(result)):null,

      // Presentation only: Babylon publishes compact HUD snapshots to the same
      // React component used by C15. No extra gameplay state or rewards.
      // Announcements are presentation-only and share the C15 React banner.
      onAnnouncement: notice=>setBattleNotice({...notice,id:`guest-notice-${++noticeSeq.current}`}),
      onHudUpdate: next => setBattleHud(previous => {
        const keys=['stage','wave','wavesTotal','hp','maxHp','kills','score','bossHp','bossMaxHp'];
        return keys.every(key=>previous?.[key]===next[key])?previous:next;
      }),

      /** Chiến thắng → quay về màn chọn ải */
      onVictory: () => {
        setScreen('stage_select');
      },

      /** Tử trận → về HQ (đã lưu coins trong scene trước khi gọi) */
      onDefeat: () => {
        setScreen('hq');
      },
    };

    createCampaignScene(scene, canvasRef.current, engine, {...data, qualityProfile});

    // ── Render loop ───────────────────────────────────────────────────────
    engine.runRenderLoop(() => {
      if (scene && scene.activeCamera) scene.render();
    });

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('resize', onResize);
      abilityActionRef.current=null;
      performance.dispose();
      scene.dispose();
      engine.dispose();
    };
  }, [gsRef, lang, setScreen, saveUserProfile, guestAbilityQa, qaBattleRevision]);

  const retreat=async()=>{
    if(retreatLockRef.current)return;
    retreatLockRef.current=true;
    setRetreating(true);
    try{
      if(auth.currentUser&&gsRef.current.activeBattleId)
        await gameAction('battle.abandon',{ticketId:gsRef.current.activeBattleId});
      setScreen('stage_select');
    }catch(error){
      toast.error(error?.message||(lang==='vi'?'Không thể rút lui, thử lại.':'Retreat failed; retry.'));
    }finally{retreatLockRef.current=false;setRetreating(false);}
  };
  return (
    <div style={{
      position: 'fixed', inset: 0,
      width: '100dvw', height: '100dvh',
      backgroundColor: '#020c1b', zIndex: 50, overflow: 'hidden',
    }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block', width: '100%', height: '100%',
          touchAction: 'none', outline: 'none',
        }}
      />

      {/* Guest shows its actual local score. C15 never invents a trusted score. */}
      <BattleHud lang={lang} {...battleHud} announcement={battleNotice} onRetreat={retreat} retreating={retreating}/>
      {guestAbilityQa&&(abilityHud||qaResult)&&<GuestAbilityControls lang={lang} state={abilityHud}
        feedback={abilityFeedback} onActivate={slot=>abilityActionRef.current?.(slot)}
        onQaCycle={cycleQaLoadout} qaSelection={qaSelection} onQaNavigate={cycleQaBattle}
        qaResult={qaResult} onQaResultAction={handleQaResultAction}/>}

    </div>
  );
}