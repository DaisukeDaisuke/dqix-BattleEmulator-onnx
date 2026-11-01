import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {buildCommonPresentationStack} from './build-common-presentation.mjs';

const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],integer=(width,min,max)=>({width,min,max,integer:true});
const authority=[
  {path:'src/Combat/Overlay_25/func_ov025_021e1048.cpp',jpn:'021e1958; pointer store021e19fc'},
  {path:'src/Combat/Overlay_0/func_ov000_0215e9fc.cpp',jpn:'0216017c; actual ordered party enumeration'},
  {path:'src/Combat/Overlay_0/func_ov000_0215ec1c.cpp',jpn:'0216039c; actual enemy enumeration'},
  {path:'src/Combat/Overlay_0/func_ov000_02153c0c.cpp',meaning:'current stats flags18 bit2000 excludes a party entry'},
  {path:'src/Combat/Main/func_020114ec.cpp',meaning:'actual GameState party order/count'},
  {path:'src/Combat/Main/func_020a35e0.cpp',meaning:'BattleData+34 party mask'},
  {path:'src/Combat/Main/func_0200ff1c.cpp',meaning:'GameObject type flag100'},
  {path:'src/Combat/Main/func_0200fea4.cpp',meaning:'GameObject type flag400'},
  {path:'src/GameState/GameStateObjects.cpp',meaning:'combatant lookup additionally requires type flag80'},
  {path:'src/Combat/Overlay_25/func_ov025_021db8d8.cpp',jpn:'021dc1d4; existing common selector stack stores'},
];

/** Actual visual roster order and the four pointer stores overlapping row+4. */
export function buildCommonPresentationVisualRosterStack(){
  const defaults={priorU16:Array(8).fill(0),partyOrder:[0,1,2,3],partyCount:0,battlePartyMask:0,context81fe:0,actorLookupPresent:Array(12).fill(false),actorTypeFlagsLow16:Array(12).fill(0),actorFlags18Low16:Array(12).fill(0),actorModelPresent:Array(12).fill(false),actorAddressU16:Array(24).fill(0),plannerReached:false,enabled:true};
  const domains={priorU16:integer(8,0,65535),partyOrder:integer(4,0,3),partyCount:integer(1,0,4),battlePartyMask:integer(1,0,255),context81fe:integer(1,0,65535),actorTypeFlagsLow16:integer(12,0,65535),actorFlags18Low16:integer(12,0,65535),actorAddressU16:integer(24,0,65535)};
  const g=new Graph('rom-common-presentation-visual-roster-stack',{
    inputContractVersion:1,authority,actorOrder:IDS,defaults,inputDomains:domains,
    stackAbi:'jpn-component-outer-visual-roster-v1',
    scope:'Original021e1958 enumerates the actual party list followed by enemy IDs192..199, then compacts only combatant objects with a nonnull Object3D model. Party list membership, raw type flags, exclusion bit and supplied object pointer identities are initial or computed state. No observed roster or endpoint pointer is an input. Its twelve-byte records store the object pointer at+8; the first four such words alias nested presentation row+4 under this explicit caller stack ABI. Other record bytes and later script/camera stack stores are separate producers.',
    layout:{recordStride:12,objectPointerOffset:8,nestedRowOffsetWithinRecord:4,outerSpFromComponentSp:-0x30,nestedRowBaseFromComponentSp:-0x174},
    feedback:{priorU16:'nextU16'},
  });
  const input=(name,width=1,type='float32')=>g.input(name,['N',width],type),prior=g.split(input('priorU16',8),8),order=g.split(input('partyOrder',4),4),partyCount=input('partyCount'),mask=input('battlePartyMask'),scenario=input('context81fe'),present=input('actorLookupPresent',12,'bool'),types=input('actorTypeFlagsLow16',12),flags=input('actorFlags18Low16',12),models=input('actorModelPresent',12,'bool'),addresses=input('actorAddressU16',24),planner=input('plannerReached',1,'bool'),enabled=input('enabled',1,'bool');
  const mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),bit=(x,n)=>g.gt(mod(g.floor(g.mul(x,1/n)),2),0),pick=(x,i)=>g.op('GatherElements',[x,g.cast(i,'int32')],{axis:1},{shape:['N',1]}),yes=g.constant(true,'bool'),zero=g.mul(partyCount,0);
  const normal=g.and(g.not(g.eq(scenario,0x320)),g.not(g.eq(scenario,0x321))),orderValid=g.and(...order.map((id,i)=>g.or(g.le(partyCount,i),g.and(g.ge(id,0),g.le(id,3))))),valid=g.and(g.ge(partyCount,0),g.le(partyCount,4),orderValid),active=g.and(enabled,planner,valid);
  let count=zero;const compactIds=Array.from({length:12},()=>g.add(zero,255)),compactPointers=Array.from({length:24},()=>zero);
  for(let position=0;position<12;position++){
    const isParty=position<4,index=isParty?g.min(g.max(order[position],0),3):g.add(zero,position),id=isParty?index:g.add(zero,IDS[position]),type=pick(types,index),lookup=pick(present,index),model=pick(models,index),partyMask=bit(mask,1);
    let member;
    if(isParty){
      let inBattle=g.constant(false,'bool');for(let id=0;id<4;id++)inBattle=g.or(inBattle,g.and(g.eq(index,id),bit(mask,2**id)));
      member=g.and(g.gt(partyCount,position),g.or(normal,g.eq(index,0)),inBattle,lookup,bit(type,0x100),g.not(bit(pick(flags,index),0x2000)));
    }else member=g.and(lookup,bit(type,0x400));
    const accepted=g.and(member,bit(type,0x80),model),low=pick(addresses,g.mul(index,2)),high=pick(addresses,g.add(g.mul(index,2),1));
    for(let slot=0;slot<12;slot++){
      const write=g.and(accepted,g.eq(count,slot));compactIds[slot]=g.where(write,id,compactIds[slot]);compactPointers[2*slot]=g.where(write,low,compactPointers[2*slot]);compactPointers[2*slot+1]=g.where(write,high,compactPointers[2*slot+1]);
    }
    count=g.add(count,g.cast(accepted,'float32'));
  }
  const next=prior.map((value,i)=>g.where(g.and(active,g.gt(count,Math.floor(i/2))),compactPointers[i],value));
  g.output(g.cat(next),'nextU16');g.output(g.cat(compactIds),'orderedActorIds');g.output(g.cat(compactPointers),'orderedActorAddressU16');g.output(count,'rosterCount');g.output(g.or(g.not(g.and(enabled,planner)),valid),'supported');g.output(active,'active');g.output(g.cat(Array.from({length:4},(_,i)=>g.cast(g.and(active,g.gt(count,i)),'float32'))),'wordWritten');
  return g;
}

/** Compose the real preceding roster writes with the proved selector stores. */
export function buildCommonPresentationAdmissionStack(){
  const roster=buildCommonPresentationVisualRosterStack(),selector=buildCommonPresentationStack(),defaults={...selector.contract.defaults,...roster.contract.defaults},inputDomains={...selector.contract.inputDomains,...roster.contract.inputDomains};
  for(const name of['plannerSecondPresent','plannerSecondAddressU16']){delete defaults[name];delete inputDomains[name];}
  const g=new Graph('rom-common-presentation-admission-stack',{
    inputContractVersion:1,authority,defaults,inputDomains,
    stackAbi:'jpn-component-outer-visual-roster-v1',
    scope:'The actual shared outer-call order: visual-roster pointer stores, followed only when reached by the existing common selector stack stores. A no-program outer may return after the roster and resource request, preserving these computed pointer words. Selector branches outside the established free-camera store proof remain explicitly unsupported. The roster and pointer identities derive from runtime actor data plus the supplied address ABI, never from original final-memory observations.',
    feedback:{priorU16:'nextU16'},
  });
  const feeds={},names=new Set();for(const model of[roster,selector])for(const item of model.json().inputs)if(!names.has(item.name)&&!['plannerSecondPresent','plannerSecondAddressU16'].includes(item.name)){names.add(item.name);feeds[item.name]=g.input(item.name,item.shape,item.dtype);}
  const planned=g.inline(roster,feeds,'visualRoster'),pointers=g.split(planned.orderedActorAddressU16,24),selectorEnabled=g.and(feeds.enabled,feeds.selectorReached),selected=g.inline(selector,{...feeds,priorU16:planned.nextU16,plannerSecondPresent:g.ge(planned.rosterCount,2),plannerSecondAddressU16:g.cat([pointers[2],pointers[3]]),enabled:selectorEnabled},'selectorStores');
  g.output(selected.nextU16,'nextU16');g.output(g.and(planned.supported,selected.supported),'supported');g.output(planned.orderedActorIds,'orderedActorIds');g.output(planned.orderedActorAddressU16,'orderedActorAddressU16');g.output(planned.rosterCount,'rosterCount');g.output(planned.wordWritten,'plannerWordWritten');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){const saved=[];for(const build of[buildCommonPresentationVisualRosterStack,buildCommonPresentationAdmissionStack])saved.push(await build().save());console.log(JSON.stringify(saved.map(({name,nodes,bytes})=>({name,nodes,bytes})),null,2));}
