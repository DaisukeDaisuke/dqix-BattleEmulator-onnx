import {buildBossActionCore} from './build-boss-action.mjs';
import {buildCommonCommandBegin,buildCommonTargetEffect,buildCommonCommandEnemyReaction,buildCommonCommandEnd,COMMON_ACTION_RULES} from './build-common-action.mjs';
import {NativeGraphWasmSession} from '../poc-v2/native-graph-wasm-prototype.mjs';
import {commonAuxDefault,ACTOR_FIELDS} from './common-battle-schema.mjs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Regression at the supported old one-target boundary, plus new common
// command invariants. This is not a replacement for independent ROM evidence.
const rowOf=output=>Object.fromEntries(Object.entries(output).map(([name,tensor])=>[name,Array.from(tensor.data)]));
export function projectLegacyAction(row){
  const source=row.sourceIndex,target=1-source,actors=[row.actors.slice(0,33),row.actors.slice(33)],aux=[commonAuxDefault(),commonAuxDefault()];
  aux[0].splice(0,3,...row.aux.slice(0,3));aux[1].splice(3,4,...row.aux.slice(3,7));aux[0].splice(7,14,...row.aux.slice(7,21));aux[1].splice(7,14,...row.aux.slice(21,35));
  return{sourceActor:actors[source],targetActor:actors[target],sourceAux:aux[source],targetAux:aux[target],sourceStatus:row.status.slice(source*7,source*7+7),targetStatus:row.status.slice(target*7,target*7+7),sourceWakeSkip:row.wakeSkip[source],targetWakeSkip:row.wakeSkip[target],sourceConfig:row.config,targetConfig:row.config,sourceTension:[0,0,0],targetTension:[0,0,0],sourcePreparation:[0,0,0,0,0],targetPreparation:[0,0,0,0,0],resistances:Array(22).fill(100),sourceWeapon:[0,0,10,0],chargedPartyCount:row.aux[0],coupBlocked:false,seed:row.seed,position:row.position,actionId:row.actionId,enabled:true,combo:row.combo,context:row.context};
}
export async function verifyCommonActions({seeds=64}={}){
  const legacy=buildBossActionCore(),builders=[legacy,buildCommonCommandBegin(),buildCommonTargetEffect(),buildCommonCommandEnemyReaction(),buildCommonCommandEnd()],sessions=[];
  const oldHash=createHash('sha256').update(legacy.model()).digest('hex');
  if(oldHash!=='d668727fc595e66fdd6876192f1234c6794127890f7efe62d3bc828879c417c0')throw Error('Compatibility default changed');
  for(const graph of builders)sessions.push(await NativeGraphWasmSession.create({onnx:graph.model(),ir:graph.json()}));
  const run=(index,row)=>rowOf(sessions[index].runRows([row]));
  let checked=0;const differences=[];
  for(const actionId of[1,44,48,228,275])for(const sourceIndex of actionId===1?[0,1]:[1])for(let seed=1;seed<=seeds;seed++){
    const row={...structuredClone(legacy.contract.defaults),sourceIndex,actionId,seed:[seed&255,seed>>>8,0,0,0,0,0,0]},want=run(0,row),x=projectLegacyAction(row);
    const begin=run(1,{...x,targets:[x.targetActor[32],-1,-1,-1,-1,-1,-1,-1],targetCount:1,targetsAlreadyRepeated:false});
    const target=run(2,{...x,seed:begin.nextSeed,position:begin.nextPosition,sourceActor:begin.nextSourceActor,commandCritical:begin.commandCritical});
    let currentSeed=target.nextSeed,currentPosition=target.nextPosition,sourceAux=target.nextSourceAux,targetAux=target.nextTargetAux;
    if(sourceIndex===0){const reaction=run(3,{...x,seed:currentSeed,position:currentPosition,sourceActor:target.nextSourceActor,targetActor:target.nextTargetActor,targetAux,critical:target.critical});currentSeed=reaction.nextSeed;currentPosition=reaction.nextPosition;targetAux=reaction.nextTargetAux;}
    const end=run(4,{...x,seed:currentSeed,position:currentPosition,sourceActor:target.nextSourceActor,sourceAux,sourceTension:target.nextSourceTension,opponentsAlive:target.nextTargetActor[0]>0,chargedPartyCount:sourceIndex===0?sourceAux[0]:targetAux[0]});sourceAux=end.nextSourceAux;
    const actors=sourceIndex===0?[...target.nextSourceActor,...target.nextTargetActor]:[...target.nextTargetActor,...target.nextSourceActor],partyAux=sourceIndex===0?sourceAux:targetAux,enemyAux=sourceIndex===0?targetAux:sourceAux;
    const got={nextSeed:end.nextSeed,nextPosition:end.nextPosition,nextActors:actors,nextAux:[...partyAux.slice(0,3),...enemyAux.slice(3,7),...partyAux.slice(7),...enemyAux.slice(7)],nextStatus:sourceIndex===0?[...target.nextSourceStatus,...target.nextTargetStatus]:[...target.nextTargetStatus,...target.nextSourceStatus],nextWakeSkip:sourceIndex===0?[...target.nextSourceWakeSkip,...target.nextTargetWakeSkip]:[...target.nextTargetWakeSkip,...target.nextSourceWakeSkip],nextCombo:target.nextCombo,nextContext:end.nextContext,damage:target.damage,internalDamage:target.internalDamage,critical:target.critical};
    for(const[key,value]of Object.entries(got))if(JSON.stringify(value)!==JSON.stringify(want[key]))differences.push({actionId,sourceIndex,seed,key,want:want[key],got:value});
    checked++;
  }
  const sample=projectLegacyAction({...structuredClone(legacy.contract.defaults),sourceIndex:1,actionId:1});
  const zero=run(2,{...sample,enabled:false,commandCritical:false});
  if(JSON.stringify(zero.nextSeed)!==JSON.stringify(sample.seed)||zero.nextPosition[0]!==sample.position||JSON.stringify(zero.nextSourceActor)!==JSON.stringify(sample.sourceActor)||JSON.stringify(zero.nextTargetActor)!==JSON.stringify(sample.targetActor))throw Error('Disabled target effect mutated state');
  const deadTarget=[...sample.targetActor];deadTarget[0]=0;
  const dead=run(2,{...sample,targetActor:deadTarget,commandCritical:false});
  if(dead.nextPosition[0]!==sample.position+1||dead.damage[0]!==0)throw Error('Already dead target must consume only the shared target roll');
  const pre=run(1,{...sample,targets:[0,-1,-1,-1,-1,-1,-1,-1],targetCount:1,targetsAlreadyRepeated:false});
  const reused=run(1,{...sample,targets:[0,-1,-1,-1,-1,-1,-1,-1],targetCount:1,targetsAlreadyRepeated:true});
  if(pre.nextPosition[0]!==reused.nextPosition[0]+2)throw Error('Reconstructed targets consumed repeat-table RNG twice');
  const index=Object.fromEntries(ACTOR_FIELDS.map((name,i)=>[name,i]));
  const missing=run(2,{...sample,targetPresent:false,commandCritical:false});
  if(missing.nextPosition[0]!==sample.position+1||missing.damage[0]!==0||JSON.stringify(missing.nextSourceActor)!==JSON.stringify(sample.sourceActor)||JSON.stringify(missing.nextTargetActor)!==JSON.stringify(sample.targetActor))throw Error('Missing target lost its shared roll or changed an actor');
  const confusedSource=[...sample.sourceActor];confusedSource[index.confusion]=1;
  const blockedConfusion=run(2,{...sample,sourceActor:confusedSource,actionId:219,preparedConfusion:false,commandCritical:false}),preparedConfusion=run(2,{...sample,sourceActor:confusedSource,actionId:219,preparedConfusion:true,commandCritical:false});
  if(blockedConfusion.supported[0]!==0||blockedConfusion.nextPosition[0]!==sample.position||preparedConfusion.supported[0]!==1||preparedConfusion.nextPosition[0]<=sample.position||preparedConfusion.nextSourceActor[index.confusion]!==1)throw Error('Prepared confusion and ordinary command admission were conflated');
  const escapeAux=commonAuxDefault();escapeAux[0]=1;escapeAux[1]=7;escapeAux[2]=1;escapeAux[3]=1;escapeAux[4]=5;escapeAux[5]=3;escapeAux[6]=0;
  const escape=run(2,{...sample,sourceActor:confusedSource,targetActor:confusedSource,sourceAux:escapeAux,targetAux:escapeAux,sourceWakeSkip:1,targetWakeSkip:1,actionId:917,commandCritical:false});
  if(escape.escaped[0]!==1||escape.nextSourceActor[index.hp]!==0||escape.nextSourceActor[index.confusion]!==0||escape.nextTargetWakeSkip[0]!==1||escape.nextTargetAux[2]!==1||escape.nextTargetAux[6]!==0||escape.nextTargetAux.some((v,i)=>![2,6].includes(i)&&v!==0))throw Error('Escape must exclude and clear effects while preserving wakeSkip/coupSkip/angerTarget');
  const mpRule=COMMON_ACTION_RULES.find(rule=>rule.id===44),partySource=[...sample.targetActor],discountCost=Math.floor(Math.fround(Math.fround(mpRule.mpCost*.75)+.75));partySource[index.mp]=discountCost;
  const discounted=run(1,{...sample,sourceActor:partySource,actionId:44,mpDiscount:true,targets:[192,-1,-1,-1,-1,-1,-1,-1],targetCount:1}),unprotected=run(1,{...sample,sourceActor:partySource,actionId:44,mpDiscount:false,targets:[192,-1,-1,-1,-1,-1,-1,-1],targetCount:1});
  if(discounted.supported[0]!==1||discounted.nextSourceActor[index.mp]!==0||unprotected.supported[0]!==0)throw Error('Party MP discount must apply before affordability and expenditure');
  partySource[index.mp]=0;
  const protectedMp=run(1,{...sample,sourceActor:partySource,actionId:44,mpProtected:true,targets:[192,-1,-1,-1,-1,-1,-1,-1],targetCount:1}),prepaidMp=run(1,{...sample,sourceActor:partySource,actionId:134,targets:[192,-1,-1,-1,-1,-1,-1,-1],targetCount:1});
  if(protectedMp.supported[0]!==1||protectedMp.nextSourceActor[index.mp]!==0||prepaidMp.supported[0]!==1||prepaidMp.nextSourceActor[index.mp]!==0)throw Error('Protected or prepaid MP was charged again');
  const finiteEnemy=[...sample.sourceActor];finiteEnemy[index.mp]=27;
  const fullMp=run(1,{...sample,sourceActor:finiteEnemy,actionId:583,targets:[0,-1,-1,-1,-1,-1,-1,-1],targetCount:1});
  if(fullMp.supported[0]!==1||fullMp.nextSourceActor[index.mp]!==0)throw Error('Cost255 must consume all finite enemy MP');
  const unknown=run(2,{...sample,actionId:65,commandCritical:false});
  if(unknown.supported[0]!==0||unknown.nextPosition[0]!==sample.position)throw Error('Unimplemented after-action effects must not silently succeed');
  for(const[actionId,field,offset]of[[37,'sleep',3],[36,'paralysis',1],[404,'confusion',5]]){
    const targetActor=[...sample.targetActor],targetStatus=Array(7).fill(0);targetActor[index[field]]=1;targetStatus[offset]=3;targetStatus[offset+1]=2;
    const cured=run(2,{...sample,actionId,targetActor,targetStatus,commandCritical:false});
    if(cured.supported[0]!==1||cured.nextTargetActor[index[field]]!==0||cured.nextTargetStatus[offset]!==0||cured.nextTargetStatus[offset+1]!==0||cured.nextTargetWakeSkip[0]!==1)throw Error('Primary cure must clear its own counters and set wakeSkip: '+actionId);
  }
  const injured=[...sample.targetActor];injured[index.hp]=1;
  for(const actionId of[33,784]){
    const healed=run(2,{...sample,actionId,targetActor:injured,commandCritical:false});
    if(healed.supported[0]!==1||healed.nextTargetActor[index.hp]!==injured[index.maxHp]||healed.recoveryAmount[0]!==injured[index.maxHp])throw Error('Full HP restoration must use target maxHP: '+actionId);
  }
  const strongParty=[...sample.targetActor],fragileEnemy=[...sample.sourceActor];strongParty[index.baseAttack]=200;strongParty[index.criticalThreshold]=0;fragileEnemy[index.hp]=1;fragileEnemy[index.baseDefense]=0;fragileEnemy[index.dodgeRate]=0;fragileEnemy[index.guardRate]=0;
  const lethal=run(2,{...sample,sourceActor:strongParty,targetActor:fragileEnemy,sourceHistory:[-1,-1],targetHistory:[2,3],actionId:1,commandCritical:false});
  if(lethal.nextTargetActor[index.hp]!==0||JSON.stringify(lethal.nextTargetHistory)!==JSON.stringify([strongParty[index.id],-1]))throw Error('Death clear must precede the party-source target-history update');
  for(const session of sessions)await session.release();
  return{schema:'dq9-common-action-verification-v1',legacyHash:oldHash,checked,differences:differences.length,examples:differences.slice(0,12),invariants:['disabled identity','dead target shared roll','missing target shared roll','no repeated target reconstruction','prepared confusion admission','escape exclusion and flag preservation','MP discount/protection/prepayment/full-cost boundaries','unimplemented after-action rejection','primary cure timers and wakeSkip','full HP restoration','history shift after lethal damage'],independentRomVerification:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const result=await verifyCommonActions();console.log(JSON.stringify(result,null,2));if(result.differences)process.exitCode=1;}
