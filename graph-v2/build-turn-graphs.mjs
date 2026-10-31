// Shared dataflow rules lifted from the pinned matching source. This file owns
// only turn planning/target selection graphs; it does not change graph-builder.
import {writeFile} from 'node:fs/promises';
import {Graph,lcg,normalized,bounded,between} from './graph-builder.mjs';
const reports=[];
const source=(file,address)=>({matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',file,address});
const asFloat=(g,x)=>g.cast(x,'float32');
const sum=(g,xs)=>xs.reduce((a,b)=>g.add(a,b));
function randomDraw(g,seed,position,enabled) {
  const candidate=lcg(g,seed);
  return {seed:g.where(enabled,candidate.seed,seed),position:g.add(position,g.cast(enabled,'int32')),
    unit:normalized(g,candidate.raw),candidate};
}

export function turnOrder2(g,inputs) {
  const {seed,position,agility,actorIds,present,surprise,firstTurn}=inputs;
  const speed=g.split(agility,2),ids=g.split(actorIds,2),exists=g.split(present,2);
  const active0=g.and(exists[0],g.not(g.and(firstTurn,g.eq(surprise,2))));
  const active1=g.and(exists[1],g.not(g.and(firstTurn,g.eq(surprise,1))));
  const first=randomDraw(g,seed,position,active0),second=randomDraw(g,first.seed,first.position,active1);
  const value0=g.mul(speed[0],between(g,first.unit,Math.fround(.51),1));
  const value1=g.mul(speed[1],between(g,second.unit,Math.fround(.51),1));
  // ROM's two-element descending quicksort swaps equality: enemy wins ties.
  const both=g.and(active0,active1),partyFirst=g.gt(value0,value1);
  const firstIndex=g.where(both,g.where(partyFirst,0,1),g.where(active0,0,g.where(active1,1,-1)));
  const secondIndex=g.where(both,g.where(partyFirst,1,0),-1);
  const firstActor=g.where(both,g.where(partyFirst,ids[0],ids[1]),g.where(active0,ids[0],g.where(active1,ids[1],-1)));
  const secondActor=g.where(both,g.where(partyFirst,ids[1],ids[0]),-1);
  return {nextSeed:second.seed,nextPosition:second.position,
    order:g.cat([firstActor,secondActor]),orderIndices:g.cat([firstIndex,secondIndex]),
    initiative:g.cat([g.where(active0,value0,0),g.where(active1,value1,0)]),
    count:g.add(asFloat(g,active0),asFloat(g,active1)),
    nextFirstTurn:g.lt(g.add(asFloat(g,active0),asFloat(g,active1)),0),
    consumed:g.sub(second.position,position)};
}
{
  const g=new Graph('rom-turn-order2',{
    authority:[source('src/Combat/Overlay_0/ProcessCombatTurn.cpp','overlay0:0x0215edbc'),source('src/Combat/Main/func_020749ac.cpp','ram:0x02075b38')],
    scope:'Exact initial initiative order for one party actor and one enemy actor; not a 16-actor sorting approximation.',
    actorIds:'[N,2] integer IDs: column0 party, column1 enemy; output order has -1 padding.',
    agility:'[N,2] already recalculated integer 0..999; all f32 rounding sites retained.',
    surprise:'0 normal, 1 party surprise, 2 enemy surprise. Exclusion applies only when firstTurn is true.',
    tie:'Two-element ROM descending quicksort exchanges equal initiatives, placing the second actor first.',
    exclusions:'No scripted encounter override, action-priority repositioning, command generation, or multi-actor surprise 67% gate.',
    seed:'Current 64-bit LCG state in 8 little-endian base256 float32 limbs; position is an int32 counter.',
    example:'Bilyouma LV15 initial agility58/50 from the attached original main.cpp; first-turn normal encounter. Actor IDs use party0/enemy192.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,agility:[58,50],actorIds:[0,192],present:[true,true],surprise:0,firstTurn:true},
    labels:{agility:'2人の素早さ',actorIds:'2人のアクターID',present:'参加中のアクター',surprise:'不意打ちの種類（0通常・1味方・2敵）',firstTurn:'1ターン目'},
    feedback:{seed:'nextSeed',position:'nextPosition',firstTurn:'nextFirstTurn'},
    inputDomains:{seed:{min:0,max:255,integer:true},position:{min:1,max:4990,integer:true},agility:{min:0,max:999,integer:true},actorIds:{min:0,max:65535,integer:true},surprise:{values:[0,1,2],integer:true}}});
  const inputs={seed:g.input('seed',['N',8]),position:g.input('position',['N',1],'int32'),
    agility:g.input('agility',['N',2]),actorIds:g.input('actorIds',['N',2]),
    present:g.input('present',['N',2],'bool'),surprise:g.input('surprise'),firstTurn:g.input('firstTurn',['N',1],'bool')};
  for(const [name,value] of Object.entries(turnOrder2(g,inputs)))g.output(value,name);
  reports.push(await g.save());
}

export function partyTarget4(g,inputs) {
  const {seed,position,ids,hp,present,excluded,candidate,baseHalf,attracted,
    priorityEnabled,revengeId,previousId,rageEnabled,rageId}=inputs;
  const columns={};for(const [name,value] of Object.entries({ids,hp,present,excluded,candidate,baseHalf,attracted}))columns[name]=g.split(value,4);
  const live=[],eligible=[],rawWeights=[],weights=[],rageMatches=[];
  for(let i=0;i<4;i++) {
    live.push(g.and(columns.present[i],g.gt(columns.hp[i],0),g.not(columns.excluded[i])));
    eligible.push(g.and(live[i],columns.candidate[i]));
    rageMatches.push(g.and(live[i],g.eq(columns.ids[i],rageId)));
    let weight=g.where(columns.baseHalf[i],1,2);
    weight=g.add(weight,g.where(g.and(priorityEnabled,g.eq(columns.ids[i],revengeId)),2,0));
    weight=g.add(weight,g.where(g.and(priorityEnabled,g.eq(columns.ids[i],previousId)),1,0));
    rawWeights.push(g.where(eligible[i],weight,0));
    weights.push(g.where(eligible[i],g.where(columns.attracted[i],g.floor(g.mul(weight,.5)),weight),0));
  }
  const rage=g.and(rageEnabled,g.or(...rageMatches)),count=sum(g,eligible.map(x=>asFloat(g,x))),
    total=sum(g,rawWeights),active=g.and(g.not(rage),g.gt(count,0));
  const first=randomDraw(g,seed,position,active),roll=g.add(bounded(g,first.unit,g.max(total,1)),1);
  const cumulative=[];let acc=g.constant(0);
  for(const weight of weights){acc=g.add(acc,weight);cumulative.push(acc);}
  let selected=g.constant(-1);
  for(let i=3;i>=0;i--)selected=g.where(g.and(eligible[i],g.le(roll,cumulative[i])),columns.ids[i],selected);
  const fallback=g.and(active,g.lt(selected,0)),second=randomDraw(g,first.seed,first.position,fallback);
  const uniform=bounded(g,second.unit,g.max(count,1));
  let uniformSelected=g.constant(-1),rank=g.constant(0);
  for(let i=0;i<4;i++) {
    uniformSelected=g.where(g.and(eligible[i],g.eq(rank,uniform)),columns.ids[i],uniformSelected);
    rank=g.add(rank,asFloat(g,eligible[i]));
  }
  const targetId=g.where(rage,rageId,g.where(active,g.where(fallback,uniformSelected,selected),-1));
  return {nextSeed:second.seed,nextPosition:second.position,targetId,
    consumed:g.sub(second.position,position),eligibleCount:count,
    weightTotalBeforeAttraction:total,weights:g.cat(weights),
    usedFallback:g.cast(fallback,'int32'),usedRage:g.cast(rage,'int32')};
}
{
  const g=new Graph('rom-party-target4',{
    authority:source('src/Combat/Overlay_0/func_ov000_02154f30.cpp','overlay0:0x021566b0'),
    scope:'One invocation of the actual weighted party target selector; includes conditional second RNG and valid anger target bypass.',
    ids:'Four distinct party ID slots in source candidate-list order. Include the full party population; absent slots use present=false.',
    candidate:'Boolean mask selecting source candidate-list membership. A valid angry target can be outside this candidate subset.',
    hp:'Current integer HP. present/excluded/baseHalf/attracted are directly decoded actor fields, not guessed chance parameters.',
    baseHalf:'Base actor row +0x3c bit30, reducing default weight from2 to1.',
    priorityEnabled:'Monster row flag bit26; revengeId +2 and previousId +1 are counted before attraction halving.',
    attraction:'The total is formed BEFORE each attracted target weight is shifted right. Leftover mass draws a uniform eligible target.',
    seed:'Current 64-bit LCG state in 8 little-endian base256 float32 limbs; position is an int32 counter.',
    example:'Isolated selector example with one living party actor0 (HP89), no attraction, anger, row flag, or recent-target preference. It consumes a target draw even for one eligible actor.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,ids:[0,1,2,3],hp:[89,0,0,0],present:[true,false,false,false],excluded:[false,false,false,false],candidate:[true,false,false,false],baseHalf:[false,false,false,false],attracted:[false,false,false,false],priorityEnabled:false,revengeId:-1,previousId:-1,rageEnabled:false,rageId:-1},
    labels:{ids:'候補スロットのアクターID',hp:'現在HP',present:'存在するアクター',excluded:'対象から除外中',candidate:'対象候補リストに含む',baseHalf:'基本重みを1にする行フラグ',attracted:'魅了による重み半減',priorityEnabled:'最近の攻撃者を優先',revengeId:'最後の攻撃者ID',previousId:'その前の攻撃者ID',rageEnabled:'怒りの対象が有効',rageId:'怒りの対象ID'},
    feedback:{seed:'nextSeed',position:'nextPosition'},
    inputDomains:{seed:{min:0,max:255,integer:true},position:{min:1,max:4990,integer:true},ids:{min:0,max:3,integer:true},hp:{min:0,max:32767,integer:true},revengeId:{min:-1,max:3,integer:true},previousId:{min:-1,max:3,integer:true},rageId:{min:-1,max:3,integer:true}}});
  const inputs={seed:g.input('seed',['N',8]),position:g.input('position',['N',1],'int32'),ids:g.input('ids',['N',4]),hp:g.input('hp',['N',4])};
  for(const name of ['present','excluded','candidate','baseHalf','attracted'])inputs[name]=g.input(name,['N',4],'bool');
  for(const name of ['priorityEnabled','rageEnabled'])inputs[name]=g.input(name,['N',1],'bool');
  for(const name of ['revengeId','previousId','rageId'])inputs[name]=g.input(name);
  for(const [name,value] of Object.entries(partyTarget4(g,inputs)))g.output(value,name);
  reports.push(await g.save());
}

export const AI_WEIGHTS=[[43,42,43,43,42,43],[68,58,48,38,27,17],[210,29,10,4,2,1],[70,70,70,16,15,15]];
export function weightedAiCandidates(g,{seed,position,profile,actions,enabled}) {
  const draw=randomDraw(g,seed,position,enabled),roll=bounded(g,draw.unit,256),action=g.split(actions,6);
  let requested=g.constant(0),cumulative=g.constant(0);
  for(let j=0;j<5;j++) {
    let weight=g.constant(AI_WEIGHTS[0][j]);
    for(let p=1;p<4;p++)weight=g.where(g.eq(profile,p),AI_WEIGHTS[p][j],weight);
    cumulative=g.add(cumulative,weight);requested=g.add(requested,asFloat(g,g.ge(roll,cumulative)));
  }
  const ranks=Array.from({length:6},(_,j)=>g.where(g.le(j,requested),g.sub(requested,j),j));
  const slots=[],queue=[];
  for(let rank=0;rank<6;rank++) {
    let slot=g.constant(-1),id=g.constant(-1);
    for(let j=0;j<6;j++){const match=g.eq(ranks[j],rank);slot=g.where(match,j,slot);id=g.where(match,action[j],id);}
    slots.push(g.where(enabled,slot,-1));queue.push(g.where(enabled,id,-1));
  }
  return {nextSeed:draw.seed,nextPosition:draw.position,consumed:g.sub(draw.position,position),
    requestedSlot:g.where(enabled,requested,-1),candidateSlots:g.cat(slots),candidateActions:g.cat(queue)};
}
{
  const g=new Graph('rom-weighted-ai6',{
    authority:[source('src/Combat/Main/func_0208a370.cpp','ram:0x0208ac64'),{weights:'data_020e8caa (JPN ram0x020e8dc6)'}],
    scope:'Weighted AI draw and exact candidate acceptance order. This is a resumable candidate queue, not a substitute for the acceptance callback.',
    profile:'0..3 selects uniform/weighted/skewed/three-heavy ROM weight profile; these correspond to AI schemes0,1,2,4.',
    actions:'[N,6] ROM action IDs from the actual monster AI table. Repeated IDs are retained as distinct slots.',
    enabled:'false preserves seed/position and outputs -1 queue entries.',
    acceptance:'Consumer must process requested slot, descending lower slots, ascending upper slots. Acceptance and target selection may consume RNG. They are not precomputed or silently omitted.',
    fallback:'If every candidate rejects, caller invokes actual fallback target selection and returns ROM action2.',
    exclusions:'Cyclic AI schemes3,5,6,7, table transitions, MP/status/limited-slot checks, and target callback remain outside this candidate kernel.',
    example:'Actual monster303 病魔パンデルム ROM AI row: profile1, actions[1,275,1,48,44,228]. This example shows candidate order; acceptance callbacks must still execute.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,profile:1,actions:[1,275,1,48,44,228],enabled:true},
    labels:{profile:'AIの重みプロファイル',actions:'6枠のROM技ID',enabled:'この抽選を実行する'},
    feedback:{seed:'nextSeed',position:'nextPosition'},
    inputDomains:{seed:{min:0,max:255,integer:true},position:{min:1,max:4990,integer:true},profile:{values:[0,1,2,3],integer:true},actions:{min:0,max:65535,integer:true}}});
  const inputs={seed:g.input('seed',['N',8]),position:g.input('position',['N',1],'int32'),profile:g.input('profile'),
    actions:g.input('actions',['N',6]),enabled:g.input('enabled',['N',1],'bool')};
  for(const [name,value] of Object.entries(weightedAiCandidates(g,inputs)))g.output(value,name);
  reports.push(await g.save());
}

export function actionPriority4(g,{actions,sources,priority,weaponFirst,present}) {
  const acts=g.split(actions,4),actors=g.split(sources,4),priorities=g.split(priority,4),
    weapon=g.split(weaponFirst,4),exists=g.split(present,4);
  const keys=priorities.map((p,i)=>{
    const category=g.where(g.eq(p,1),0,g.where(g.eq(p,5),1,g.where(g.eq(p,10),2,g.where(g.eq(p,32),4,3))));
    return g.add(g.mul(category,2),g.where(weapon[i],0,1));
  });
  const ranks=[];
  for(let i=0;i<4;i++){
    let rank=g.constant(0);
    for(let j=0;j<4;j++)if(i!==j) {
      const before=j<i?g.le(keys[j],keys[i]):g.lt(keys[j],keys[i]);
      rank=g.add(rank,asFloat(g,g.and(exists[j],before)));
    }
    ranks.push(rank);
  }
  const sortedActions=[],sortedSources=[],indices=[];
  for(let rank=0;rank<4;rank++) {
    let action=g.constant(-1),sourceId=g.constant(-1),index=g.constant(-1);
    for(let i=0;i<4;i++) {
      const selected=g.and(exists[i],g.eq(ranks[i],rank));
      action=g.where(selected,acts[i],action);sourceId=g.where(selected,actors[i],sourceId);index=g.where(selected,i,index);
    }
    sortedActions.push(action);sortedSources.push(sourceId);indices.push(index);
  }
  return {actions:g.cat(sortedActions),sources:g.cat(sortedSources),orderIndices:g.cat(indices),count:sum(g,exists.map(x=>asFloat(g,x)))};
}
{
  const g=new Graph('rom-action-priority4',{
    authority:source('src/Combat/Overlay_0/func_ov000_0215f1ac.cpp','overlay0 priority repositioning; ROM constants front[10,5,1], back32'),
    scope:'Exact stable action-priority repositioning of up to four already-generated commands, sufficient for a 1v1 turn with up to three enemy commands.',
    priority:'Each command supplies the actual ROM action priority field (word2c>>14)&63.',
    weaponFirst:'Resolved predicate: source is party, action word10 bit0x80000 is set, and party weapon-first equipment predicate is true.',
    order:'The ROM first stably moves weapon-first commands to front, then priority10,5,1 in separate stable passes, then priority32 to back. Equal final keys retain the incoming initiative/command order.',
    exclusions:'The scripted encounter override at the end of the ROM function is outside this graph. No RNG is consumed here.',
    example:'Isolated priority example using real ROM actions: normal attack1, mercurial thrust69, last batter117, paladin guard513. This is not a supplied battle configuration.',
    defaults:{inputActions:[1,69,117,513],inputSources:[0,1,2,3],priority:[0,10,32,5],weaponFirst:[false,false,false,false],present:[true,true,true,true]},
    labels:{inputActions:'並べ替えるROM技ID',inputSources:'各行動のアクターID',priority:'技レコードの優先度',weaponFirst:'装備による先行条件を満たす',present:'有効な行動'},
    feedback:{},
    inputDomains:{inputActions:{min:0,max:65535,integer:true},inputSources:{min:0,max:65535,integer:true},priority:{min:0,max:63,integer:true}}});
  const inputs={actions:g.input('inputActions',['N',4]),sources:g.input('inputSources',['N',4]),priority:g.input('priority',['N',4]),
    weaponFirst:g.input('weaponFirst',['N',4],'bool'),present:g.input('present',['N',4],'bool')};
  for(const [name,value] of Object.entries(actionPriority4(g,inputs)))g.output(value,name);
  reports.push(await g.save());
}
await writeFile(new URL('turn-models.json',import.meta.url),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports.map(({name,bytes,nodes})=>({name,bytes,nodes})),null,2));
