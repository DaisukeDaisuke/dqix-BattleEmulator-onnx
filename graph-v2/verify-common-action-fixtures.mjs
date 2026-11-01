// Compare the shared source/target pipeline against previously captured,
// independently executed ROM caller fixtures. Only fixture.inputs supplies
// state; expected snapshots are comparison-only. Fixture files are arguments
// and are deliberately not shipped in the source repository.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildCommonCommandBegin,buildCommonTargetEffect,buildCommonCommandEnemyReaction,buildCommonCommandEnd,COMMON_ACTION_RULES} from './build-common-action.mjs';
import {commonAuxDefault,ACTOR_FIELDS} from './common-battle-schema.mjs';
import {NativeGraphWasmSession} from '../poc-v2/native-graph-wasm-prototype.mjs';
import {Graph} from './graph-builder.mjs';
import {RandomGraph} from './transition-graphs.mjs';

const scalar=x=>Array.isArray(x)||ArrayBuffer.isView(x)?x[0]:x;
const rowOf=output=>Object.fromEntries(Object.entries(output).map(([name,tensor])=>[name,Array.from(tensor.data)]));
const rules=new Map(COMMON_ACTION_RULES.map(rule=>[rule.id,rule]));
const split=(array,width)=>[array.slice(0,width),array.slice(width)];
const fields=Object.fromEntries(ACTOR_FIELDS.map((name,i)=>[name,i]));

export async function createCommonActionFixtureRunner(){
  const graphs=[buildCommonCommandBegin(),buildCommonTargetEffect(),buildCommonCommandEnemyReaction(),buildCommonCommandEnd()],sessions=[];
  for(const graph of graphs)sessions.push(await NativeGraphWasmSession.create({onnx:graph.model(),ir:graph.json()}));
  // The self-rank reference cohort contains exactly one eligible enemy and
  // an empty planned list. Its scope2 collection therefore performs the real
  // uniform bounded1 draw before command-begin repetition. No expected seed
  // or observed count is used to synthesize that initial collection.
  const selection=new Graph('fixture-uniform-one-enemy',{defaults:{seed:[1,0,0,0,0,0,0,0],position:1,enabled:true}}),selectionSeed=selection.input('seed',['N',8]),selectionPosition=selection.input('position',['N',1],'int32'),selectionEnabled=selection.input('enabled',['N',1],'bool'),selectionRng=new RandomGraph(selection,selectionSeed,selectionPosition);
  selectionRng.bounded(selectionEnabled,1);selection.output(selectionRng.seed,'nextSeed');selection.output(selectionRng.position,'nextPosition');sessions.push(await NativeGraphWasmSession.create({onnx:selection.model(),ir:selection.json()}));
  const run=(index,row)=>rowOf(sessions[index].runRows([row]));
  return{
    hashes:Object.fromEntries(graphs.map(graph=>[graph.name,createHash('sha256').update(graph.model()).digest('hex')])),
    release:async()=>{for(const session of sessions)await session.release();},
    executeActors(input){
      const world=structuredClone(input.actors),source=world.find(a=>a.actor[fields.id]===input.sourceId),byId=id=>world.find(a=>a.actor[fields.id]===id),alive=a=>a.actor[fields.hp]>0&&!a.excluded;
      if(!source)throw Error('Fixture source is absent from the initial actor table');
      let seed=input.seed,position=scalar(input.position??1),combo=input.combo??[0,0,0,-1,0,0],critical=false,supported=1;const startPosition=position,context=input.context??[1,0],effects=[];
      const charged=()=>world.filter(a=>a.actor[fields.party]&&alive(a)&&a.aux[0]).length;
      const commit=(actor,out,prefix)=>{
        for(const[key,suffix]of Object.entries({actor:'Actor',aux:'Aux',status:'Status',tension:'Tension',preparation:'Preparation',history:'History',rawStatusBytes:'RawStatusBytes',rawFlagsBytes:'RawFlagsBytes',rawRanks:'RawRanks',statusKindsBytes:'StatusKindsBytes',rawTimers:'RawTimers'}))if(out['next'+prefix+suffix])actor[key]=out['next'+prefix+suffix];
        for(const[key,suffix]of Object.entries({wakeSkip:'WakeSkip',state3c:'State3c'}))if(out['next'+prefix+suffix])actor[key]=scalar(out['next'+prefix+suffix]);
      };
      const feed=target=>({seed,position,actionId:input.actionId,enabled:input.enabled??true,sourceActor:source.actor,targetActor:target.actor,sourceAux:source.aux,targetAux:target.aux,sourceStatus:source.status,targetStatus:target.status,sourceConfig:source.config,targetConfig:target.config,sourceTension:source.tension,targetTension:target.tension,sourcePreparation:source.preparation,targetPreparation:target.preparation,sourceWakeSkip:source.wakeSkip,targetWakeSkip:target.wakeSkip,sourceHistory:source.history,targetHistory:target.history,sourceState3c:source.state3c,targetState3c:target.state3c,sourceMagic:source.magic??[0,0],sourcePackedScale:source.packedScale??[0,0],sourceRawFlagsBytes:source.rawFlagsBytes,sourceStatusKindsBytes:source.statusKindsBytes,sourceRawTimers:source.rawTimers,targetRawTimers:target.rawTimers,targetRawStatusBytes:target.rawStatusBytes,targetRawFlagsBytes:target.rawFlagsBytes,targetStatusKindsBytes:target.statusKindsBytes,targetRawRanks:target.rawRanks,sourceSpecies:source.species??0,resistances:target.resistances??Array(22).fill(100),sourceWeapon:[...(source.weapon??[0,0,10,0]).slice(0,3),target.species??source.weapon?.[3]??0],targetMetal:!!target.metal,chargedPartyCount:charged(),coupBlocked:false,combo,context});
      const begin=run(0,{...feed(source),targets:[...input.targets,...Array(8-input.targets.length).fill(-1)],targetCount:input.targets.length,targetsAlreadyRepeated:input.targetsAlreadyRepeated??false});
      seed=begin.nextSeed;position=scalar(begin.nextPosition);commit(source,begin,'Source');supported=Math.min(supported,scalar(begin.supported));
      const targets=begin.nextTargets.slice(0,scalar(begin.nextTargetCount));
      for(const id of targets){
        const target=byId(id);if(!target)throw Error('Fixture target is absent from the initial actor table');
        const effect=run(1,{...feed(target),commandCritical:begin.commandCritical,preparedConfusion:!!input.preparedConfusion});
        seed=effect.nextSeed;position=scalar(effect.nextPosition);commit(source,effect,'Source');commit(target,effect,'Target');if(scalar(effect.escaped))target.excluded=true;
        combo=effect.nextCombo;critical||=!!scalar(effect.critical);supported=Math.min(supported,scalar(effect.supported));effects.push(effect);
      }
      if(source.actor[fields.party])for(const enemy of world.filter(a=>!a.actor[fields.party]&&alive(a))){
        const out=run(2,{...feed(enemy),critical,otherAngerChances:enemy.otherAngerChances??[0,0]});seed=out.nextSeed;position=scalar(out.nextPosition);commit(enemy,out,'Target');
      }
      const end=run(3,{...feed(source),opponentsAlive:world.some(a=>a.actor[fields.party]!==source.actor[fields.party]&&alive(a))});seed=end.nextSeed;position=scalar(end.nextPosition);commit(source,end,'Source');supported=Math.min(supported,scalar(end.supported));
      return{actors:world,nextSeed:seed,nextPosition:[position],consumed:[position-startPosition],nextCombo:combo,nextContext:end.nextContext,targets,effects,supported:[supported]};
    },
    execute(input,{selfTarget=false}={}){
      const actionId=scalar(input.actionId),rule=rules.get(actionId),source=scalar(input.sourceIndex),target=selfTarget?source:1-source,initialActors=split(input.actors,33),actors=initialActors.map(a=>[...a]),aux=[commonAuxDefault(),commonAuxDefault()],status=split(input.status??Array(14).fill(0),7),wake=[...(input.wakeSkip??[0,0])],tension=split(input.tension??Array(6).fill(0),3),preparation=split(input.preparationState??Array(10).fill(0),5);
      aux[0].splice(0,3,...input.aux.slice(0,3));aux[1].splice(3,4,...input.aux.slice(3,7));aux[0].splice(7,14,...input.aux.slice(7,21));aux[1].splice(7,14,...input.aux.slice(21,35));
      const resistance=Array(22).fill(100),oldResistance=input.resistances??[100,100,100,100,100];
      resistance[18]=oldResistance[0];resistance[19]=oldResistance[1];resistance[15]=oldResistance[3];
      if(rule?.effectElement)resistance[rule.effectElement-1]=oldResistance[2];
      if(rule?.damageElement)resistance[rule.damageElement-1]=oldResistance[4];
      if(input.elementResistances)resistance.splice(0,7,...input.elementResistances.slice(target*7,target*7+7));
      const x={seed:input.seed,position:scalar(input.position),sourceActor:actors[source],targetActor:actors[target],sourceAux:aux[source],targetAux:aux[target],sourceStatus:status[source],targetStatus:status[target],sourceConfig:input.config,targetConfig:input.config,sourceTension:tension[source],targetTension:tension[target],sourcePreparation:preparation[source],targetPreparation:preparation[target],sourceWakeSkip:wake[source],targetWakeSkip:wake[target],resistances:resistance,sourceWeapon:input.weapon??[0,0,10,0],chargedPartyCount:aux[0][0],coupBlocked:false,actionId,enabled:scalar(input.enabled??true),combo:input.combo,context:input.context};
      x.sourceMagic=input.magic?.slice(source*2,source*2+2)??[0,0];x.sourcePackedScale=input.packedScale?.slice(source*2,source*2+2)??[0,0];
      x.sourceHistory=input.history?.slice(source*2,source*2+2)??[-1,-1];x.targetHistory=input.history?.slice(target*2,target*2+2)??[-1,-1];x.sourceState3c=input.state3c?.[source]??0;x.targetState3c=input.state3c?.[target]??0;
      if(input.resistances22)x.resistances=input.resistances22.slice(target*22,target*22+22);
      const residualConfusion=source===0&&actors[source][fields.confusion]>0,selfCollectionEarly=selfTarget&&residualConfusion&&rule?.targetScope===1;
      if(selfTarget&&rule?.targetScope===2&&scalar(input.targetCount)===0){const selection=run(4,x);x.seed=selection.nextSeed;x.position=selection.nextPosition;}
      const begin=run(0,{...x,targets:[actors[target][fields.id],-1,-1,-1,-1,-1,-1,-1],targetCount:1,targetsAlreadyRepeated:selfCollectionEarly});
      const effect=run(1,{...x,seed:begin.nextSeed,position:begin.nextPosition,sourceActor:begin.nextSourceActor,targetActor:selfTarget?begin.nextSourceActor:actors[target],commandCritical:begin.commandCritical,preparedConfusion:residualConfusion});
      for(const[slot,prefix]of[[source,'Source'],[target,'Target']]){
        actors[slot]=effect['next'+prefix+'Actor'];aux[slot]=effect['next'+prefix+'Aux'];status[slot]=effect['next'+prefix+'Status'];wake[slot]=effect['next'+prefix+'WakeSkip'][0];tension[slot]=effect['next'+prefix+'Tension'];preparation[slot]=effect['next'+prefix+'Preparation'];
      }
      let seed=effect.nextSeed,position=effect.nextPosition;
      if(source===0){const reaction=run(2,{...x,seed,position,sourceActor:actors[0],targetActor:actors[1],targetAux:aux[1],critical:effect.critical});seed=reaction.nextSeed;position=reaction.nextPosition;aux[1]=reaction.nextTargetAux;}
      const end=run(3,{...x,seed,position,sourceActor:actors[source],sourceAux:aux[source],sourceTension:tension[source],opponentsAlive:actors[1-source][fields.hp]>0,chargedPartyCount:aux[0][0]});actors[source]=end.nextSourceActor;aux[source]=end.nextSourceAux;tension[source]=end.nextSourceTension;
      const values={nextSeed:end.nextSeed,nextPosition:end.nextPosition,consumed:[end.nextPosition[0]-scalar(input.position)],nextActors:actors.flat(),nextAux:[...aux[0].slice(0,3),...aux[1].slice(3,7),...aux[0].slice(7),...aux[1].slice(7)],nextStatus:status.flat(),nextWakeSkip:wake,nextPreparationState:preparation.flat(),nextTension:tension.flat(),nextCombo:effect.nextCombo,nextContext:end.nextContext,damage:effect.damage,internalDamage:effect.internalDamage,recoveryAmount:effect.recoveryAmount,healed:[actors[target][fields.hp]-initialActors[target][fields.hp]],drainedAmount:effect.drainedAmount,recoveredMp:[actors[source][fields.mp]-begin.nextSourceActor[fields.mp]],critical:effect.critical,supported:[Math.min(begin.supported[0],effect.supported[0],end.supported[0])],active:effect.active,escaped:effect.escaped};
      const history=split(input.history??[-1,-1,-1,-1],2),state3c=[...(input.state3c??[0,0])];history[source]=effect.nextSourceHistory;history[target]=effect.nextTargetHistory;state3c[source]=effect.nextSourceState3c[0];state3c[target]=effect.nextTargetState3c[0];values.nextHistory=history.flat();values.nextState3c=state3c;
      for(const[i,key]of['comboSide','comboCount','comboAction','comboTarget'].entries())values[key]=[effect.nextCombo[i]];
      values.mpRecovered=effect.mpRecovered;
      for(const key of['selectorDamage','currentDefense','currentAgility'])values[key]=effect[key];
      return values;
    }
  };
}

export async function verifyCommonActionFixtures(paths){
  const runner=await createCommonActionFixtureRunner(),report={schema:'dq9-common-action-actual-fixture-comparison-v1',models:runner.hashes,files:[],cases:0,checkedFields:0,mismatches:0,differences:[],excluded:[],uncomparedFields:new Set(),authority:'Previously captured actual ROM caller outputs. Initial fixture.inputs is the sole state source; reference outputs never become graph inputs. Selection outside the supplied target boundary is explicitly listed.'};
  try{for(const path of paths){
    const bytes=await readFile(path),data=JSON.parse(bytes);report.files.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),source:data.source,sourceSha256:data.sourceSha256});
    for(const row of data.cases??[]){
      if(!row.inputs||!row.expected){report.excluded.push({id:row.id,reason:'Fixture is not one direct action caller'});continue;}
      const rule=rules.get(scalar(row.inputs.actionId));
      const selfTarget=/self|event|idle577/.test(row.model??'')||(rule?.targetSide===2&&rule?.targetScope===1);
      if(row.inputs.targetCount!==undefined&&scalar(row.inputs.targetCount)===0&&rule?.targetScope!==1&&!(selfTarget&&rule?.targetScope===2)){report.excluded.push({id:row.id,reason:'Target selection precedes the supplied-target command boundary'});continue;}
      const output=runner.execute(row.inputs,{selfTarget});report.cases++;
      if(!output.supported[0]){report.mismatches++;report.differences.push({id:row.id,key:'supported',expected:1,actual:0});continue;}
      for(const[key,want]of Object.entries(row.expected)){
        if(!(key in output)){report.uncomparedFields.add(key);continue;}
        want.forEach((value,column)=>{report.checkedFields++;if(!Object.is(value,output[key][column])){report.mismatches++;if(report.differences.length<100)report.differences.push({id:row.id,key,column,expected:value,actual:output[key][column]});}});
      }
    }
  }}finally{await runner.release();}
  report.uncomparedFields=[...report.uncomparedFields];return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.length<3)throw Error('Pass one or more actual-ROM *-browser-records.json fixture paths.');
  const report=await verifyCommonActionFixtures(process.argv.slice(2));console.log(JSON.stringify(report,null,2));if(report.mismatches)process.exitCode=1;
}
