// Ordinary target-result semantics. Allocation and command-wide messages are
// composed separately; the operands here are produced by the numerical graph.
import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {buildCommonPresentationCommand} from './build-common-presentation.mjs';
import {ACTOR_FIELDS} from './rules.mjs';
import {COMMON_ORDINARY_ACTION_FIELDS} from '../data/common-ordinary-presentation.mjs';
import {pinOrdinaryAuthority} from './common-ordinary-authority.mjs';

export function buildCommonOrdinaryImpact(){
  const base=buildCommonPresentationCommand().json(),defaults={...base.contract.defaults,
    actionData:[1,0,0,0,1,1,1,2,5,4,7,8,9,140,155,0,0],
    beforeTargetRawStatusU16:[0,0],afterTargetRawStatusU16:[0,0],beforeTargetStatusKinds:0,afterTargetStatusKinds:0,battleMode:0};
  const g=new Graph('rom-common-ordinary-impact',{
    ...base.contract,defaults,inputContractVersion:1,actionDataFields:COMMON_ORDINARY_ACTION_FIELDS,
    authority:pinOrdinaryAuthority([...base.contract.authority,
      {path:'src/Combat/Overlay_24/func_ov024_021da9e0.cpp',role:'primary damage impact and flags'},
      {path:'src/Combat/Overlay_24/func_ov024_021e303c.cpp',role:'severe-poison additional effect before damage'},
      {path:'src/Combat/Overlay_24/func_ov024_021e8ca0.cpp',role:'secondary allocation before primary'},
      {path:'src/Combat/Overlay_0/func_ov000_0215ccbc.cpp',role:'impact36 stores'},
      {path:'src/Combat/Overlay_0/func_ov000_02159eac.cpp',role:'original flag helper shifts upper-word indices by one'}]),
    scope:'Computed ordinary nonlethal damage, miss/guard/dodge, critical, newly applied severe poison and unchanged failed rank/blind/barrier effects produce primary/secondary impact36 payloads and semantic message requests. Action definitions are explicit data. The reused shared state-admission graph rejects auxiliary effects and unsupported actor transitions. No allocator, observed record or camera state is an input.',
    boundaries:['Battle-mode overrides, item/inventory events, successful other state effects, after-action recovery/recoil and command-specific headers are not admitted.','This payload producer does not claim asynchronous message/render completion.']
  });
  const x=Object.fromEntries(base.inputs.map(field=>[field.name,g.input(field.name,field.shape,field.dtype)]));
  const common=g.inline(base,x,'ordinary_admission'),data=g.split(g.input('actionData',['N',COMMON_ORDINARY_ACTION_FIELDS.length]),COMMON_ORDINARY_ACTION_FIELDS.length),r=Object.fromEntries(COMMON_ORDINARY_ACTION_FIELDS.map((name,i)=>[name,data[i]]));
  const rawBefore=g.split(g.input('beforeTargetRawStatusU16',['N',2]),2),rawAfter=g.split(g.input('afterTargetRawStatusU16',['N',2]),2),kindBefore=g.input('beforeTargetStatusKinds'),kindAfter=g.input('afterTargetStatusKinds'),battleMode=g.input('battleMode');
  const before=g.split(x.beforeTargetActor,33),after=g.split(x.afterTargetActor,33),beforeStatus=g.split(x.beforeTargetStatus,7),afterStatus=g.split(x.afterTargetStatus,7),zero=g.mul(x.actionId,0),
    damageLike=g.eq(r.operation,1),poisonIndex=ACTOR_FIELDS.indexOf('poison'),
    poison=g.and(damageLike,g.eq(r.additional,4),g.eq(r.secondaryParameter,1),g.eq(before[poisonIndex],0),g.eq(after[poisonIndex],1),g.eq(beforeStatus[0],0),g.eq(afterStatus[0],2)),
    failed=g.and(g.not(damageLike),g.not(x.operationHit),g.not(x.effectApplied)),blocked=g.or(x.dodged,x.guarded);
  const mod=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n)),bytes16=v=>{const u=mod(v,65536);return[mod(u,256),g.floor(g.mul(u,1/256))];};
  const admitted=g.and(common.supported,g.eq(battleMode,0),g.eq(x.operation,r.operation),g.eq(r.afterAction,0),g.eq(r.specialHeader,0),
    g.or(g.eq(r.additional,0),g.and(g.eq(r.additional,4),g.eq(r.secondaryParameter,1))),
    g.eq(rawAfter[0],g.add(rawBefore[0],g.where(poison,2,0))),g.eq(rawAfter[1],rawBefore[1]),g.eq(kindAfter,g.add(kindBefore,g.where(poison,2,0))),
    g.eq(mod(kindBefore,4),beforeStatus[0]),g.eq(mod(kindAfter,4),afterStatus[0])),active=g.and(x.enabled,admitted);
  const primaryFlags=[g.add(g.where(damageLike,g.where(g.gt(x.damage,0),2,16),0),g.add(g.where(poison,32768,0),g.add(g.where(x.dodged,32,0),g.where(x.guarded,64,0)))),zero,g.where(poison,4096,0),zero];
  const payload=(amount,hp,mp,flags,critical)=>{
    const out=Array(36).fill(zero),store=(at,values)=>values.forEach((v,i)=>out[at+i]=v);
    store(0,flags.flatMap(bytes16));store(12,[amount,hp,mp,after[1],after[3]].flatMap(bytes16));store(24,rawAfter.flatMap(bytes16));
    out[28]=critical;out[29]=mod(g.floor(g.mul(kindAfter,.25)),16);out[30]=mod(kindAfter,4);
    return g.cat(out.map(v=>g.where(active,v,0)));
  };
  const primaryMessage=g.where(x.dodged,0x97,g.where(x.guarded,0x96,g.where(failed,0x1b,0))),targetFlags=g.add(g.where(x.dodged,2,0),g.add(g.where(x.guarded,4,0),g.where(x.critical,128,0)));
  g.output(common.command,'command');g.output(payload(x.damage,after[0],after[2],primaryFlags,g.cast(x.critical,'float32')),'primaryPayloadBytes');
  // The additional effect writes its snapshot before primary HP subtraction.
  g.output(payload(zero,before[0],before[2],[zero,zero,zero,zero],zero),'secondaryPayloadBytes');
  g.output(g.and(active,poison),'secondaryPresent');g.output(primaryMessage,'primaryMessageId');g.output(g.where(poison,0x10a,0),'secondaryMessageId');
  g.output(targetFlags,'targetHitFlags');g.output(g.and(damageLike,g.gt(x.damage,0)),'positiveDamage');g.output(blocked,'blocked');g.output(damageLike,'damageLike');
  g.output(g.or(g.not(x.enabled),admitted),'supported');g.output(active,'wrote');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const saved=await buildCommonOrdinaryImpact().save(new URL('./',import.meta.url));console.log(JSON.stringify({name:saved.name,nodes:saved.nodes,bytes:saved.bytes}));
}
