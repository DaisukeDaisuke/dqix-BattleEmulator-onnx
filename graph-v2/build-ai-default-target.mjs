// Default AI callback, standard self/party/empty routing, repetition mode0.
// The ROM performs the two repeat-count draws even though mode0 returns0.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Graph,lcg} from './graph-builder.mjs';
const root=new URL('./',import.meta.url);
export function aiDefaultTarget4(g,x,partyGraph) {
  const self=g.eq(x.targetScope,1),party=g.eq(x.targetSide,1),
    single=g.and(party,g.or(g.eq(x.targetScope,2),g.eq(x.targetScope,5))),
    all=g.and(party,g.or(g.eq(x.targetScope,3),g.eq(x.targetScope,4))),
    enemyOther=g.and(g.eq(x.targetSide,2),g.or(g.eq(x.targetScope,2),g.eq(x.targetScope,3),g.eq(x.targetScope,4),g.eq(x.targetScope,8))),
    supported=g.and(g.eq(x.repeatCode,0),g.or(self,g.not(enemyOther))),active=g.and(x.enabled,supported),doSingle=g.and(active,single);
  const partyInputs=Object.fromEntries(partyGraph.inputs.map(input=>[input.name,x[input.name]]));
  partyInputs.candidate=g.gt(g.where(doSingle,g.cast(x.candidate,'float32'),0),0);
  partyInputs.rageEnabled=g.and(doSingle,x.rageEnabled);
  const chosen=g.inline(partyGraph,partyInputs,`default_target_${g.index}`),ids=g.split(x.ids,4),hp=g.split(x.hp,4),present=g.split(x.present,4),excluded=g.split(x.excluded,4),candidate=g.split(x.candidate,4),
    live=ids.map((_,i)=>g.and(present[i],g.gt(hp[i],0),g.not(excluded[i]),candidate[i]));
  const packed=Array(4).fill(g.constant(-1));let count=g.constant(0);
  for(let i=0;i<4;i++) {for(let rank=0;rank<4;rank++)packed[rank]=g.where(g.and(live[i],g.eq(count,rank)),ids[i],packed[rank]);count=g.add(count,g.cast(live[i],'float32'));}
  const targetCount=g.where(active,g.where(self,1,g.where(single,1,g.where(all,count,0))),0),targets=[];
  for(let i=0;i<8;i++) {
    const actual=g.where(self,i===0?x.actorId:-1,g.where(single,i===0?chosen.targetId:-1,g.where(all,i<4?packed[i]:-1,-1)));
    targets.push(g.where(active,actual,-1));
  }
  const first=lcg(g,chosen.nextSeed),second=lcg(g,first.seed),nextSeed=g.where(active,second.seed,x.seed),
    nextPosition=g.where(active,g.add(chosen.nextPosition,g.constant(2,'int32')),x.position);
  return {nextSeed,nextPosition,consumed:g.sub(nextPosition,x.position),supported,callbackSuccess:active,targetCount,targets:g.cat(targets)};
}
export async function buildAiDefaultTargetGraph() {
  const partyGraph=JSON.parse(await readFile(new URL('rom-party-target4.json',root),'utf8'));
  const g=new Graph('rom-ai-default-target4',{
    authority:[{file:'src/Combat/Overlay_24/func_ov024_021edf6c.cpp',address:'overlay24:0x021ee738'},
      {file:'src/Combat/Overlay_0/func_ov000_02154a04.cpp',address:'overlay0:0x02156184'},
      {file:'src/Combat/Overlay_0/func_ov000_0215fbe0.cpp',address:'overlay0:0x02161360'},
      {file:'src/Combat/Overlay_0/func_ov000_02154f30.cpp',address:'overlay0:0x021566b0'}].map(x=>({...x,matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10'})),
    scope:'Actual default AI callback0 for standard self, party-single, party-all and empty routes with repetition mode0. The callback always succeeds even for an empty target list, and always consumes the two repeat-count RNG calls after target selection.',
    routing:'targetScope1 targets actorId; side1 scopes2/5 use the exact weighted party selector, scopes3/4 collect all eligible party IDs. Other implemented routes return no targets. An empty weighted-party selection still sets targetCount1 and its single target to-1, matching the source.',
    exclusions:'Enemy-side group/uniform selectors at side2 scopes2/3/4/8 and repeatCode1..31 are not implemented by this model. supported=false freezes RNG and callbackSuccess=false; callers must inspect supported, not treat it as an ordinary game rejection. Nonzero AI judgment callback indices are separate handlers.',
    partyPopulation:'present/candidate/excluded must reflect the actual party-list eligibility flags, battle participation, scripted solo exclusion and live combatants. ids must be distinct party0..3 in source roster order. This projection does not inspect arbitrary actor memory.',
    padding:'targets has8 slots. Only its first targetCount entries are semantic. Remaining-1 values are diagnostic padding, not a claim about unused raw stack bytes.',
    defaults:{...partyGraph.contract.defaults,actorId:192,targetSide:1,targetScope:5,repeatCode:0,enabled:true},
    labels:{...partyGraph.contract.labels,actorId:'行動するアクターID',targetSide:'対象側のROMフィールド',targetScope:'対象範囲のROMフィールド',repeatCode:'対象繰返しコード'},
    feedback:{seed:'nextSeed',position:'nextPosition'},
    inputDomains:{...partyGraph.contract.inputDomains,actorId:{min:0,max:65535,integer:true},targetSide:{min:0,max:3,integer:true},targetScope:{min:0,max:15,integer:true},repeatCode:{min:0,max:31,integer:true}},
    example:'Normal action1 target fields side1/scope5/repeat0 from ROM record1; one living party actor0. The acting enemy ID192 follows the actual ROM full-caller combatant-ID convention.'});
  const x=Object.fromEntries(partyGraph.inputs.map(input=>[input.name,g.input(input.name,input.shape,input.dtype)]));
  for(const name of ['actorId','targetSide','targetScope','repeatCode'])x[name]=g.input(name);x.enabled=g.input('enabled',['N',1],'bool');
  for(const [name,value] of Object.entries(aiDefaultTarget4(g,x,partyGraph)))g.output(value,name);return g;
}
export async function buildAiTargetCallbackGraph() {
  const base=await buildAiDefaultTargetGraph();
  const g=new Graph('rom-ai-target-callback4',{
    authority:[...base.contract.authority,{file:'src/Combat/Overlay_24/func_ov024_021ee454.cpp',address:'overlay24:0x021eec20',matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10'},
      {file:'src/Combat/Overlay_24/func_ov024_021edf00.cpp',matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10'}],
    scope:'Actual callback0 standard self/party/empty routes with repeat0, plus the complete early-rejection path of callback9 when fewer than2 non-paralyzed candidates remain. The callback9 rejection consumes no RNG.',
    routing:base.contract.routing,
    selector9:'An existing living anger target takes precedence, even outside the party candidate subset, and is not replaced by the full party if it leaves fewer than2 candidates. Otherwise enumerate the eligible party, remove paralyzed actors, and reject if fewer than2 remain. If no initial candidate exists the source returns before clearing its count, so previousTargetCount/previousTargets are preserved.',
    exclusions:base.contract.exclusions+' Additionally, callback9 with2+ non-paralyzed candidates and callback indices other than0/9 require unimplemented handlers and explicitly return supported=false. selectorIndex must be the resolved judgment dispatch index; judgment0 resolves to0.',
    partyPopulation:base.contract.partyPopulation+' Anger lookup checks present/live independently of candidate/excluded, matching its separate helper. Full angry-target population is limited to these four party IDs in this projection.',
    defaults:{...base.contract.defaults,selectorIndex:0,paralyzed:[false,false,false,false],previousTargetCount:0,previousTargets:Array(8).fill(-1)},
    labels:{...base.contract.labels,selectorIndex:'判断力で解決済みのAI対象関数ID',paralyzed:'麻痺している味方（stats+0x14:0x8）',previousTargetCount:'呼出し前の対象数',previousTargets:'呼出し前の対象ID列'},
    feedback:{seed:'nextSeed',position:'nextPosition',previousTargetCount:'targetCount',previousTargets:'targets'},
    inputDomains:{...base.contract.inputDomains,selectorIndex:{min:0,max:65535,integer:true},previousTargetCount:{min:0,max:8,integer:true},previousTargets:{min:-1,max:65535,integer:true}},
    example:base.contract.example});
  const x=Object.fromEntries(base.inputs.map(input=>[input.name,g.input(input.name,input.shape,input.dtype)]));
  x.selectorIndex=g.input('selectorIndex');x.paralyzed=g.input('paralyzed',['N',4],'bool');x.previousTargetCount=g.input('previousTargetCount');x.previousTargets=g.input('previousTargets',['N',8]);
  const selector0=g.eq(x.selectorIndex,0),selector9=g.eq(x.selectorIndex,9),
    standard=g.inline(base,{...x,enabled:g.and(x.enabled,selector0)},`callback_zero_${g.index}`),
    ids=g.split(x.ids,4),hp=g.split(x.hp,4),present=g.split(x.present,4),excluded=g.split(x.excluded,4),candidate=g.split(x.candidate,4),paralysis=g.split(x.paralyzed,4),
    live=ids.map((_,i)=>g.and(present[i],g.gt(hp[i],0))),
    rage=ids.map((id,i)=>g.and(x.rageEnabled,live[i],g.eq(id,x.rageId))),hasRage=g.or(...rage),
    eligible=ids.map((_,i)=>g.and(live[i],g.not(excluded[i]),candidate[i]));
  const sum=xs=>xs.map(v=>g.cast(v,'float32')).reduce((a,b)=>g.add(a,b)),
    initialCount=g.where(hasRage,1,sum(eligible)),
    unparalyzedCount=g.where(hasRage,sum(rage.map((v,i)=>g.and(v,g.not(paralysis[i])))),sum(eligible.map((v,i)=>g.and(v,g.not(paralysis[i]))))),
    earlyRejection=g.and(selector9,g.lt(unparalyzedCount,2)),supported=g.or(g.and(selector0,standard.supported),earlyRejection),
    doingZero=g.and(x.enabled,selector0,standard.supported),doingNine=g.and(x.enabled,earlyRejection),
    targetCount=g.where(doingZero,standard.targetCount,g.where(g.and(doingNine,g.gt(initialCount,0)),0,x.previousTargetCount)),
    targets=g.where(doingZero,standard.targets,x.previousTargets);
  const result={nextSeed:standard.nextSeed,nextPosition:standard.nextPosition,consumed:standard.consumed,supported,
    callbackSuccess:g.and(doingZero,standard.callbackSuccess),targetCount,targets,
    filteredCount:g.where(selector9,unparalyzedCount,-1),rageCandidateUsed:g.cast(g.and(selector9,hasRage),'int32')};
  for(const [name,value] of Object.entries(result))g.output(value,name);return g;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const graphs=[await buildAiDefaultTargetGraph(),await buildAiTargetCallbackGraph()],reports=[];
  for(const graph of graphs)reports.push(await graph.save());
  await writeFile(new URL('ai-target-models.json',root),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports.map(({name,nodes,bytes})=>({name,nodes,bytes}))));
}
