import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {ACTOR_FIELDS} from './rules.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';

const directory=new URL('./',import.meta.url);
const evidence=path=>({path,sha256:sourceSHA256(path)});
const common={inputContractVersion:1,inputDomains:{},defaults:{}};

export function buildCommonPresentationAdvance(){
  const g=new Graph('rom-common-presentation-advance',{...common,
    authority:[{path:'src/Combat/Overlay_25/func_ov025_021def30.cpp',sha256:'9cdd2dc7e074f0ef5750baca6515c279dc051fc9fb469d0781e76a57f11a181e'}],
    scope:'One explicitly scheduled presentation advance. Empty auxiliary FIFO increments the command index; every advance sets presentationState=1 and clears the override pointer. No RNG or rendering completion is inferred.',
    defaults:{queueCount:0,currentIndex:0,presentationState:1,overridePresent:false,enabled:true},
    inputDomains:{queueCount:{width:1,min:0,max:5,integer:true},currentIndex:{width:1,min:0,max:2147483000,integer:true},presentationState:{width:1,min:0,max:255,integer:true}},
    feedback:{currentIndex:'nextCurrentIndex',presentationState:'nextPresentationState',overridePresent:'nextOverridePresent'}});
  const count=g.input('queueCount'),index=g.input('currentIndex',['N',1],'int32'),state=g.input('presentationState'),override=g.input('overridePresent',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
  g.output(g.add(index,g.cast(g.and(enabled,g.eq(count,0)),'int32')),'nextCurrentIndex');
  g.output(g.where(enabled,1,state),'nextPresentationState');
  g.output(g.and(override,g.not(enabled)),'nextOverridePresent');
  g.output(g.and(enabled,g.gt(count,0)),'requiresAuxiliaryProducer');
  return g;
}

export function buildCommonPresentationStack(){
  const g=new Graph('rom-common-presentation-stack',{...common,
    authority:[evidence('evidence-v2/ghidra/camera-planner-defined/response.json'),evidence('evidence-v2/ghidra/camera-selector-defined-v2/response.json'),evidence('src/Combat/Overlay_25/func_ov025_021db8d8.cpp'),evidence('src/Combat/Overlay_0/func_ov000_0216e678.cpp'),evidence('src/GameState/GameStateInstance.cpp')],
    scope:'Four selector stack words as eight exact u16 limbs. Forced source auxiliary-node stores and quiet preservation of the preceding planner second visual-object pointer share one rule. Pointer identities are explicit initial ABI inputs, independent of monster definitions.',
    plannerAuthority:'func_ov025_021e1048/JPN021e1958 stores each ordered visual roster record pointer at record+8; func_ov025_021e0638/JPN021e0f48 does not reorder the twelve-byte records. The second record pointer occupies selectorSP+0xc. At least two planner records and the same stack ABI are required for quiet continuation.',
    defaults:{priorU16:[0,0,0,0,0,0,0,0],programProjection:[1,10],currentActionIndex:0,sourceAuxiliaryNode:255,sourcePresent:true,sourceVisualPresent:true,programPresent:true,selectorReached:true,callFreeCamera:true,forced:true,freeCameraSelected:true,plannerReached:true,plannerSecondPresent:true,plannerSecondAddressU16:[0,0],gameStateSingletonU16:[0x33d8,0x020f],enabled:true},
    inputDomains:{priorU16:{width:8,min:0,max:65535,integer:true},programProjection:{width:2,min:0,max:65535,integer:true},currentActionIndex:{width:1,min:0,max:2147483000,integer:true},sourceAuxiliaryNode:{width:1,min:0,max:255,integer:true},plannerSecondAddressU16:{width:2,min:0,max:65535,integer:true},gameStateSingletonU16:{width:2,min:0,max:65535,integer:true}},
    feedback:{priorU16:'nextU16'}});
  const prior=g.split(g.input('priorU16',['N',8]),8),projection=g.split(g.input('programProjection',['N',2]),2),index=g.input('currentActionIndex'),aux=g.input('sourceAuxiliaryNode'),second=g.split(g.input('plannerSecondAddressU16',['N',2]),2),singleton=g.split(g.input('gameStateSingletonU16',['N',2]),2),b={};
  for(const name of ['sourcePresent','sourceVisualPresent','programPresent','selectorReached','callFreeCamera','forced','freeCameraSelected','plannerReached','plannerSecondPresent','enabled'])b[name]=g.input(name,['N',1],'bool');
  const admitted=g.and(b.selectorReached,b.callFreeCamera,g.or(b.forced,g.and(b.plannerReached,b.plannerSecondPresent))),active=g.and(b.enabled,admitted),
    bit=(v,n)=>g.eq(g.sub(g.floor(g.mul(v,1/n)),g.mul(g.floor(g.mul(v,1/(n*2))),2)),1),var5=g.not(g.and(bit(projection[0],1),bit(projection[0],2))),next=[...prior];
  const store=(row,low,high,condition=active)=>{next[row*2]=g.where(condition,low,prior[row*2]);next[row*2+1]=g.where(condition,high,prior[row*2+1]);};
  // The nested free-camera function can promote its stack argument4 to1.
  // JPN0216fe74 stores that decision at SP+0x98, the same physical row0+4.
  // Carry the computed selection, including counter/random promotion, not just
  // the earlier caller's forced flag. No new random value is drawn here.
  store(0,g.cast(b.freeCameraSelected,'float32'),0);
  store(1,g.where(b.forced,g.where(g.and(b.sourcePresent,b.sourceVisualPresent),aux,255),second[0]),g.where(b.forced,0,second[1]));
  store(2,singleton[0],singleton[1],g.and(active,g.not(g.eq(index,0))));
  store(3,g.cast(var5,'float32'),0,g.and(active,b.programPresent));
  g.output(g.cat(next),'nextU16');g.output(g.or(g.not(b.enabled),admitted),'supported');g.output(active,'active');return g;
}

export function buildCommonPresentationCommand(){
  const defaults={actionId:1,operation:1,sourceId:0,targetId:192,participantCount:1,targetCount:1,damage:1,comboCount:0,comboEnabled:true,critical:false,dodged:false,guarded:false,auxiliaryEvent:false,terminal:false,partyWeaponMessage:false,enabled:true};
  for(const who of ['Source','Target'])for(const when of ['before','after']){
    defaults[when+who+'Actor']=ACTOR_FIELDS.map(name=>({hp:100,maxHp:100,mp:10,maxMp:10,baseAttack:40,baseDefense:30,baseAgility:20,level:15,id:who==='Source'?0:192,party:who==='Source'?1:0})[name]??0);
    defaults[when+who+'Aux']=[0,0,0,0,0,0,-1,...Array(14).fill(0)];defaults[when+who+'Status']=Array(7).fill(0);defaults[when+who+'WakeSkip']=0;defaults[when+who+'Tension']=[0,0,0];
  }
  defaults.afterTargetActor[0]=99;
  const g=new Graph('rom-common-presentation-command',{...common,defaults,actorFields:ACTOR_FIELDS,
    authority:[{path:'src/Combat/Overlay_0/func_ov000_02160030.cpp',sha256:'03389919486632ccf069412b3c3b72feb0376db208ddfdd7bd9825f707c93ef7'},
      {path:'src/Combat/Overlay_0/func_ov000_02157d14.cpp',role:'command population'},
      {path:'src/Combat/Overlay_24/func_ov024_021e6a90.cpp',role:'computed hit record and combo byte'}],
    scope:'Shared damage-command metadata from a computed target impact and before/after actor operands. Operation1, nonlethal damage including zero damage, computed critical/dodge/guard flags and up to eight targets use the same rule. Multiple target metadata is folded in original target order by the common runner. Auxiliary records, state changes and unrepresented snapshot subtypes remain explicit boundaries. Action IDs and encounter population do not select a producer.',
    commandFields:['actionId','messageId','sourceId','targetId','flagsA','flagsB'],
    inputDomains:{actionId:{width:1,min:0,max:65535,integer:true},damage:{width:1,min:0,max:65535,integer:true},comboCount:{width:1,min:0,max:127,integer:true}}});
  const action=g.input('actionId'),operation=g.input('operation'),sourceId=g.input('sourceId'),targetId=g.input('targetId'),participants=g.input('participantCount'),targets=g.input('targetCount'),damage=g.input('damage'),combo=g.input('comboCount'),b={};
  for(const name of ['comboEnabled','critical','dodged','guarded','auxiliaryEvent','terminal','partyWeaponMessage','enabled'])b[name]=g.input(name,['N',1],'bool');
  const state={};for(const who of ['Source','Target'])for(const when of ['before','after'])for(const [type,width]of [['Actor',33],['Aux',21],['Status',7],['WakeSkip',1],['Tension',3]])state[when+who+type]=g.split(g.input(when+who+type,['N',width]),width);
  const bs=state.beforeSourceActor,as=state.afterSourceActor,bt=state.beforeTargetActor,at=state.afterTargetActor,
    checks=[g.eq(operation,1),g.eq(participants,1),g.ge(targets,1),g.le(targets,8),g.ge(damage,0),g.gt(at[0],0),g.eq(g.sub(bt[0],damage),at[0]),g.eq(bs[32],sourceId),g.eq(bt[32],targetId),g.not(g.eq(bs[17],bt[17])),g.not(b.auxiliaryEvent),g.not(b.terminal),g.not(b.partyWeaponMessage)];
  for(const name of ['attackRank','defenseRank','blind','sleep','confusion','paralysis','skip','defend','acrobat','doubleDodge','doubleGuard','hpRegen','mpRegen','poison','agilityRank','hpEquipmentRegen'])for(const row of [bs,bt])checks.push(g.eq(row[ACTOR_FIELDS.indexOf(name)],0));
  for(let i=0;i<33;i++){checks.push(g.eq(bs[i],as[i]));if(i!==0)checks.push(g.eq(bt[i],at[i]));}
  for(const who of ['Source','Target']){
    for(const type of ['Aux','Status','WakeSkip'])for(let i=0;i<state['before'+who+type].length;i++)checks.push(g.eq(state['before'+who+type][i],state['after'+who+type][i]));
    for(let i=0;i<6;i++)checks.push(g.eq(state['before'+who+'Aux'][i],0));
    for(const when of ['before','after'])for(const value of state[when+who+'Tension'])checks.push(g.eq(value,0));
    checks.push(g.eq(state['before'+who+'Status'][0],0),g.eq(state['before'+who+'WakeSkip'][0],0));
  }
  // USA021eb5d0 initializes command+0xb bit3. Positive combo-eligible
  // postprocess021e6a90 clears it, then writes a nonzero combo in bits5..7.
  // The per-target critical branch sets command+0xa bit0 independently.
  const admitted=g.and(...checks),active=g.and(b.enabled,admitted),zero=g.mul(action,0),flagsB=g.where(g.and(b.comboEnabled,g.gt(damage,0)),g.mul(g.min(combo,3),32),8),
    flagsA=g.add(g.cast(b.critical,'float32'),g.add(g.mul(g.cast(b.guarded,'float32'),2),g.mul(g.cast(b.dodged,'float32'),4)));
  g.output(g.cat([action,zero,sourceId,targetId,flagsA,flagsB]),'command');g.output(g.or(g.not(b.enabled),admitted),'supported');g.output(active,'wrote');return g;
}

export async function buildCommonPresentation(){
  const reports=[];for(const g of [buildCommonPresentationAdvance(),buildCommonPresentationStack(),buildCommonPresentationCommand()])reports.push(await g.save(directory));
  return reports.map(x=>({name:x.name,nodes:x.nodes,bytes:x.bytes}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonPresentation()));
