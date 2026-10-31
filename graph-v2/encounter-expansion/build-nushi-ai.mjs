import {sourceSHA256} from '../../data/source-authority.mjs';
// Add callback62 without rewriting or regenerating the checked monster303
// graphs. The shared candidate/gate state machine remains common to all AI.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Graph} from '../graph-builder.mjs';
import {buildDecisionGraph} from '../build-ai-decision.mjs';
import {aiClosedStep} from '../build-ai-closed.mjs';
import {monsterAiInputs} from './profiles.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
const directory=new URL('./',import.meta.url),shared=new URL('../',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const selectBool=(g,c,a,b)=>g.gt(g.where(c,g.cast(a,'float32'),g.cast(b,'float32')),0);
async function readModel(name){return JSON.parse(await readFile(new URL(`${name}.json`,shared),'utf8'));}
function validateContractShape(g){
  const old=g.contract.inputDomains??{};g.contract.inputDomains=Object.fromEntries(g.inputs.filter(d=>old[d.name]||d.dtype==='bool').map(d=>[d.name,{...(old[d.name]??{values:[false,true,0,1]}),width:d.shape[1]}]));g.contract.inputContractVersion=1;return g;
}
export async function buildNushiTargetGraph(){
  const base=await readModel('rom-ai-boss-target4'),source='src/Combat/Overlay_24/func_ov024_021f18a0.cpp';
  const g=new Graph('rom-ai-nushi-target4',{
    ...base.contract,
    authority:[...base.contract.authority,{file:source,address:'overlay24:0x021f206c',matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sha256:sourceSHA256(source),dispatchTable:'evidence-v2/ghidra/smart-target-table161.json',dispatchIndex:62}],
    scope:'The immutable checked callbacks0/9/24/32/61/158 plus actual callback62. Callback62 enumerates the eligible party in source roster order (maximum4), rejects an empty list without changing previous count/targets, and otherwise returns the whole list without consuming RNG.',
    scopeJa:'既存対象関数に、なぎはらいの判断力1/2で用いられる実callback62を追加します。対象となる味方全員を列挙し、0人なら以前の対象を保持して不採用にします。乱数は消費しません。',
    selector62:'Calls the shared eligible-party enumeration with maximum4 and flag1, then returns0 if count<=0. Success writes count and copies4shorts. It ignores anger, repeat code and packed side/scope. Death is the actual flag bit0x1; HP alone is not used to infer it.',
    padding:'On success, only first targetCount IDs are semantic; remaining output slots use diagnostic-1 padding. Actual callback62 clears its local4short array to0 and copies all4shorts while preserving the caller last4shorts. This normalized output does not claim raw unused buffer bytes. Failure preserves all8 previousTargets exactly.',
    exclusions:base.contract.exclusions+' Callback62 itself supports all repeat/side/scope values because it does not read those inputs. Its represented population is still the explicit four party slots.',
    defaultMonsterNote:'Raw monster305 has judgment0, so its default AI uses callback0 even though action94 smart/wise indices are62. This direct example explicitly invokes callback62; it is not a claim that monster305 uses judgment1.',
    defaults:{...base.contract.defaults,selectorIndex:62,targetSide:1,targetScope:4,hp:[98,0,0,0],defense:[96,0,0,0],agility:[65,0,0,0]},
    example:'Direct action94 smart/wise callback62 with one eligible party actor0. Original LV17 numerical HP98/DEF96/AGI65 are declared examples; raw monster305 default judgment remains0 in the separate closed AI graph.',
    sharedBase:{model:base.name,sha256:hash(await readFile(new URL(`${base.name}.onnx`,shared)))}
  });
  const x=Object.fromEntries(base.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),is62=g.eq(x.selectorIndex,62),old=g.inline(base,{...x,enabled:g.and(x.enabled,g.not(is62))},'nushi_base'),ids=g.split(x.ids,4),present=g.split(x.present,4),dead=g.split(x.dead,4),excluded=g.split(x.excluded,4),candidate=g.split(x.candidate,4),eligible=ids.map((_,i)=>g.and(present[i],g.not(dead[i]),g.not(excluded[i]),candidate[i]));
  const packed=Array(4).fill(g.constant(-1));let count=g.constant(0);
  for(let i=0;i<4;i++){for(let rank=0;rank<4;rank++)packed[rank]=g.where(g.and(eligible[i],g.eq(count,rank)),ids[i],packed[rank]);count=g.add(count,g.cast(eligible[i],'float32'));}
  const accepted=g.and(x.enabled,g.gt(count,0)),targets=g.cat([...packed,...Array(4).fill(g.add(g.mul(count,0),-1))]),zeroInt=g.constant(0,'int32'),replacement={
    nextSeed:x.seed,nextPosition:x.position,consumed:zeroInt,supported:g.eq(0,0),callbackSuccess:accepted,targetCount:g.where(accepted,count,x.previousTargetCount),targets:g.where(accepted,targets,x.previousTargets),filteredCount:count,rageCandidateUsed:zeroInt,partyCount:count,affectableCount:count
  };
  for(const d of base.outputs){const value=d.dtype==='bool'?selectBool(g,is62,replacement[d.name],old[d.name]):g.where(is62,replacement[d.name],old[d.name]);g.output(value,d.name);}
  return validateContractShape(g);
}
export async function buildNushiAiStepGraph(){
  const previous=await readModel('rom-ai-boss-step'),target=await buildNushiTargetGraph(),prefix=await readModel('rom-weighted-ai6'),decision=buildDecisionGraph(prefix),monster=rom.monsters.find(x=>x.id===305),defaults={...previous.contract.defaults,...monsterAiInputs(monster),hp:[98,0,0,0],defense:[96,0,0,0],agility:[65,0,0,0]};
  const g=new Graph('rom-ai-nushi-step',{
    ...previous.contract,authority:[...decision.contract.authority,...target.contract.authority],
    scope:'Closed bounded AI decision for all8 schemes with shared MP/status/limited/legacy gates and callbacks0/9/24/32/61/62/158. One invocation selects, evaluates, targets and accepts or schedules retry. The actual monster305 raw six-record table is the default.',
    scopeJa:'ぬしさまの実6行動表から候補選択・使用条件・対象判定・採用または再探索まで進めるグラフです。通常の判断力0に加え、明示入力の判断力1/2ではcallback62も処理します。',
    callbacks:target.contract.scope,exclusions:target.contract.exclusions+' Action effects, appeal/prepare, turn lifecycle and camera are separate phases.',
    defaults,labels:{...previous.contract.labels,...target.contract.labels},inputDomains:{...previous.contract.inputDomains,...target.contract.inputDomains},
    defaultMonsterId:305,defaultMonsterName:monster.name,defaultSteps:7,
    example:'Raw monster305: scheme1, judgment0, MP32, actions[1,1,548,1,94,1], limited mask20. Original product profile supplies MP255 as an explicit initial override; do not relabel that as the ROM record MP. One eligible party actor0.',
    rawMonster:monster,proof:'Separate direct callback and closed-sequence source/actual-ROM reports; frozen monster303 models remain byte-identical.'
  });
  const x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  for(const [name,value]of Object.entries(aiClosedStep(g,x,decision,target)))g.output(value,name);
  return validateContractShape(g);
}
async function save(graph){const data=graph.model();for(const[extension,contents]of[['onnx',data],['json',JSON.stringify(graph.json(),null,2)+'\n']]){const name=`${graph.name}.${extension}`,temp=new URL(`${name}.pending-${process.pid}`,directory);await writeFile(temp,contents);await rename(temp,new URL(name,directory));}return {model:graph.name,sha256:hash(data),nodes:graph.nodes.length,bytes:data.length};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const reports=[];for(const g of[await buildNushiTargetGraph(),await buildNushiAiStepGraph()])reports.push(await save(g));
  const name='nushi-ai-models.json',temp=new URL(`${name}.pending-${process.pid}`,directory);await writeFile(temp,JSON.stringify(reports,null,2)+'\n');await rename(temp,new URL(name,directory));console.log(JSON.stringify(reports,null,2));
}
