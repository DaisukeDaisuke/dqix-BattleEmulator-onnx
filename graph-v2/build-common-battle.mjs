import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Graph,lcg,normalized,bounded} from './graph-builder.mjs';
import {buildStatus9Target} from './encounter-expansion/build-status9-targets.mjs';
import {jadamaTarget} from './encounter-expansion/build-jadama-ai.mjs';
import {buildCommonTargetCallbacks,buildCommonAiStep} from './common-target-callbacks.mjs';
import {ACTOR_FIELDS} from './rules.mjs';
import {COMMON_RAW_TIMER_FIELDS,COMMON_RAW_TIMER_OFFSETS} from './common-modifier-rules.mjs';
import {COMMON_PRESENTATION_MODELS} from '../runtime/common-presentation.mjs';
import {COMMON_PRESENTATION_FRAME_MODELS,COMMON_PRESENTATION_FRAME_INPUTS} from '../runtime/common-presentation-frame.mjs';
const directory=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');

export function buildCommonRandom(){
  const g=new Graph('rom-common-random',{scope:'One exact bounded draw, conditionally committed. A nonpositive bound consumes no RNG.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,maximum:100,enabled:true},
    authority:'matching src/Util/Random.cpp; exact base256 LCG and binary32 normalized quotient.'});
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),maximum=g.input('maximum'),enabled=g.input('enabled',['N',1],'bool');
  const gate=g.and(enabled,g.gt(maximum,0)),draw=lcg(g,seed);
  g.output(g.where(gate,draw.seed,seed),'nextSeed');g.output(g.add(position,g.cast(gate,'int32')),'nextPosition');
  g.output(g.where(gate,bounded(g,normalized(g,draw.raw),g.max(maximum,1)),0),'value');return g;
}
export function buildCommonTurnBegin(){
  const g=new Graph('rom-common-turn-begin',{scope:'Turn-entry reset of combo identity and the three group limited-slot masks. Actor and group AI cursors remain caller state.',
    authority:{file:'src/Combat/Overlay_0/func_ov000_0215d588.cpp',reset:'src/Combat/Overlay_0/func_ov000_0215d090.cpp',address:'JPN0215ed08'},
    defaults:{combo:[0,0,0,-1,0,0],context:[1,0],usedSlots:Array(18).fill(false)},inputContractVersion:1});
  const combo=g.input('combo',['N',6]),context=g.input('context',['N',2]),used=g.input('usedSlots',['N',18],'bool');
  g.output(g.add(g.mul(combo,0),g.constant([0,0,0,-1,0,0],'float32',[1,6])),'nextCombo');
  g.output(g.add(g.mul(context,0),g.constant([1,0],'float32',[1,2])),'nextContext');
  g.output(g.and(used,g.eq(0,1)),'nextUsedSlots');return g;
}
export async function buildCommonAi(){
  const previous=await buildStatus9Target(),g=new Graph('rom-common-ai-target-base',{
    ...structuredClone(previous.contract),scope:'Shared target callbacks composed by their meanings, for the full party and enemy roster. No encounter identity or program selection exists.',
    defaults:{...structuredClone(previous.contract.defaults),enemyStatus9:Array(8).fill(false)}});
  const x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  x.enemyStatus9=g.input('enemyStatus9',['N',8],'bool');
  for(const [name,value]of Object.entries(jadamaTarget(g,x,previous)))g.output(value,name);
  const target=await buildCommonTargetCallbacks(g),step=await buildCommonAiStep(target);
  Object.assign(step.contract,{scope:'One shared AI step. The six action records, scheme, judgment, slot limits, current state and roster are inputs. New definition IDs do not require another model.',
    scopeJa:'行動表・判断方式・現在状態と編成を入力する共通AIです。定義IDによる専用プログラムはありません。',
    definitionTransitions:'After operation34, the common runtime resolves its signed destination in the input definition table and restarts decision-local state while retaining RNG and actor/group cursor state.',
    inputOnlyDefinitions:true});
  return[target,step];
}
export const COMMON_OPERATIONS={turnBegin:'rom-common-turn-begin',random:'rom-common-random',initiative:'rom-common-initiative',stateView:'rom-common-state-view',ai:'rom-common-ai-step',target:'rom-common-ai-target',
  extraActions:'rom-extra-actions',planningPreprocess:'rom-common-planning-preprocess',appeal:'rom-common-appeal',primaryRecovery:'rom-common-primary-recovery',prepareRoute:'rom-common-prepare-route',confusion:'rom-common-confusion-selection',confusionTarget:'rom-common-confusion-target',
  commandBegin:'rom-common-command-begin',coverTarget:'rom-common-cover-target',redirectTarget:'rom-common-redirect-target',redirectCritical:'rom-common-redirect-critical',targetEffect:'rom-common-target-effect',enemyReaction:'rom-common-command-enemy-reaction',afterAction:'rom-common-after-action',bladeRecoil:'rom-common-blade-recoil',commandEnd:'rom-common-command-end',
  populationRequest:'rom-common-population-request',populationPlan:'rom-common-population-plan',populationInsert:'rom-common-population-insert',populationRoster:'rom-common-population-roster',
  postStatus:'rom-common-post-status',periodic:'rom-common-periodic',turnStatus:'rom-common-turn-status',
  presentationCommand:'rom-common-presentation-command',presentationStack:'rom-common-presentation-stack',presentationAdvance:'rom-common-presentation-advance'};
export async function writeCommonProgram(){
  const modules=[];
  for(const name of [...new Set([...Object.values(COMMON_OPERATIONS),...COMMON_PRESENTATION_MODELS,...COMMON_PRESENTATION_FRAME_MODELS])]){
    let found;
    for(const relative of ['./','./encounter-expansion/']){
      try{const base=new URL(relative,import.meta.url),bytes=await readFile(new URL(name+'.onnx',base));found={name,onnx:relative+name+'.onnx',ir:relative+name+'.json',sha256:hash(bytes)};break;}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(!found)throw Error('Missing shared module '+name);modules.push(found);
  }
  const program={schema:'dq9-common-battle-program-v1',runtimeVersion:1,name:'dq9-common-battle',
    population:{party:4,enemies:8,groups:3,targetBuffer:8,executionTargetBuffer:32,authority:'ROM combat object, initial selection and expanded command-target layouts; action and retry loops use explicit runtime budgets.',insertion:'Enemy operation11/12 uses one common slot/group insertion graph. enemyPopulation supplies the original108-byte roster, four loaded resource IDs, eight164-byte backing slots and a separate global BT random state. The saved operation-entry seed places insertion before the conditional effect callback tail.'},
    actorFields:ACTOR_FIELDS,rawTimerFields:COMMON_RAW_TIMER_FIELDS,rawTimerOffsets:COMMON_RAW_TIMER_OFFSETS,operations:COMMON_OPERATIONS,modules,
    phases:[
      {op:'turn-begin',order:'clear combo and group limited-slot masks; preserve AI cursors'},
      {op:'initiative',order:'party-roster then enemy-group-roster',sort:'rom-first-pivot-descending-quicksort'},
      {op:'planning',loop:'each ordered actor; first command, extra-count draw once, then requested additional commands',deferredJudgment:2},
      {op:'planning-preprocess',order:'all planned commands; prepayment and defend state before priority sorting'},
      {op:'priority',order:'stable ROM categories 1,5,10,normal,32; weapon-first within each category'},
      {op:'commands',loop:'every planned command and every current target',order:['appeal','deferred-ai','primary-recovery','target-rebuild','command-begin','shared-hit-draw','cover-target','redirect-target','redirect-critical','target-effects','enemy-reactions','after-action','blade-recoil','command-end','population-recount','post-status']},
      {op:'finish',order:['living-spawn-pending-clear','entry-cleanup','party-hp','party-mp','party-poison','enemy-mp','enemy-poison','shared-status-roll','actor-status','population-recount','turn-increment']},
      {op:'presentation',order:'all numerical commands and finish precede the generated presentation record queue'}
    ],
    limits:{transitionBudget:'explicit input; exhaustion is unresolved',turnBudget:'explicit input; exhaustion is not a victory or loss'},
    definitions:'Input tables only. Neither the program nor runtime may switch an execution program by monster name or ID.',
    seedRepresentation:'Eight base256 float32 limbs preserve uint64 LCG exactly.',
    presentation:{mode:'camera-projection',factory:'runtime/common-presentation.mjs',outerCalls:'Dynamic computed command queue with explicit advances; no three-command limit.',externalInput:'Correlated initial row+4 and initial visual/program/ABI state.',boundary:'Async resource/frame readiness and auxiliary event production are explicit unresolved boundaries. A projection cannot silently start the next numeric turn.',frameImplementation:{factory:'runtime/common-presentation-frame.mjs',models:COMMON_PRESENTATION_FRAME_MODELS,enabledByDefault:false,inputContract:'dq9-script-static-font-functional-frame-v2',acceptedInputContracts:COMMON_PRESENTATION_FRAME_INPUTS,scope:'The component-frame path computes original initializer stores, linked opcode dispatch, supported state opcodes, actor-resource prechecks and mandatory quiet animation tails. Explicit original message/font bytes, stack ABI and initialized mutable state are required. The retained shared allocator map is keyed by actual pointers. Unsupported opcode, resource, feedback and active timeline producers remain explicit boundaries. Actual UI, camera, script, scene and turn state determine progress; physical rendering and hardware timing are outside this functional schedule.'}},
    completeGameClaim:false};
  await writeFile(new URL('common-battle-program.json',directory),JSON.stringify(program,null,2)+'\n');
  return {program,sha256:hash(JSON.stringify(program))};
}
export async function buildCommonBattle(){
  const generated=[];for(const g of[buildCommonTurnBegin(),buildCommonRandom(),...await buildCommonAi()])generated.push(await g.save(directory));
  const result=await writeCommonProgram();return{models:generated.map(x=>({name:x.name,nodes:x.nodes,bytes:x.bytes})),programSHA256:result.sha256};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonBattle()));
