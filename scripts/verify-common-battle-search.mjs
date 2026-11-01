import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {
  createRow4Domain,row4CandidateAt,createSeedDomain,seedCandidateAt,
  matchBattleObservation,createBattleSearchState,createCommonBattleSearch
} from '../runtime/common-battle-search.mjs';

// These deterministic fixtures verify scheduling/filtering/resume semantics.
// They are not an oracle for game arithmetic or a whole-battle accuracy claim.
const reports=[];
async function check(name,fn){await fn();reports.push({name,passed:true});}
const fixed=v=>({min:v,max:v});
const fourWords=(min,max)=>({words:[{min,max},fixed(0),fixed(0),fixed(0)]});
const roundTrip=value=>JSON.parse(JSON.stringify(value));
const adapterId='search-control-fixture-v1';

await check('Complete uint32 domain is represented exactly and lazily',()=>{
  const d=createRow4Domain();assert.equal(d.total,(1n<<128n).toString());
  assert.deepEqual(row4CandidateAt(d,0),[0,0,0,0]);
  assert.deepEqual(row4CandidateAt(d,4294967296n),[0,0,1,0]);
  assert.deepEqual(row4CandidateAt(d,BigInt(d.total)-1n),Array(4).fill(4294967295));
  assert.throws(()=>row4CandidateAt(d,d.total),/outside/);
  assert.deepEqual(roundTrip(d),d);
});

await check('Explicit ranges enumerate every Cartesian candidate once',()=>{
  const d=createRow4Domain({words:[{min:4294967293,max:4294967295},{min:2,max:6,step:2},fixed(9),{min:0,max:1}]});
  const actual=Array.from({length:Number(d.total)},(_,i)=>row4CandidateAt(d,i));
  const expected=[];for(let a=4294967293;a<=4294967295;a++)for(const b of[2,4,6])for(const z of[0,1])expected.push([a,b,9,z]);
  assert.deepEqual(actual,expected);assert.equal(new Set(actual.map(JSON.stringify)).size,18);
  assert.throws(()=>createRow4Domain({words:[fixed(0)]}),/every/);
  assert.throws(()=>createRow4Domain({words:[{min:-1},fixed(0),fixed(0),fixed(0)]}),/outside/);
  assert.throws(()=>createRow4Domain({words:[{step:0},fixed(0),fixed(0),fixed(0)]}),/positive/);
});

await check('Unsigned 64-bit seed enumeration preserves all bits',()=>{
  const d=createSeedDomain({min:'18446744073709551613',max:'18446744073709551615'});
  assert.equal(d.count,'3');assert.deepEqual(seedCandidateAt(d,2),{hex:'0xffffffffffffffff',bytes:Array(8).fill(255)});
  assert.equal(createSeedDomain().count,(1n<<64n).toString());
  assert.throws(()=>createSeedDomain({min:Number.MAX_SAFE_INTEGER+1}),/exact/);
});

await check('Nested adapter states receive the seed only at their declared existing field',async()=>{
  const initialState={battle:{seed:Array(8).fill(0),position:11,actors:[{hp:77}]},phase:'numeric'};
  assert.throws(()=>createBattleSearchState({adapterId,initialState,seedRange:{min:1,max:2}}),/existing initial seed/);
  assert.throws(()=>createBattleSearchState({adapterId,initialState:{seed:[0]},seedRange:{min:1,max:2}}),/eight exact/);
  const state=createBattleSearchState({adapterId,initialState,seedPath:['battle','seed'],seedRange:{min:'0x1000000000000001',max:'0x1000000000000002'}});
  const runner=createCommonBattleSearch({adapterId,advanceBatch:async lanes=>lanes.map(l=>({id:l.id,state:l.state,status:'complete'}))});
  const result=await runner.run({state});assert.equal(result.complete,true);
  assert.deepEqual(result.state.survivors.map(b=>b.state.battle.seed),[[1,0,0,0,0,0,0,16],[2,0,0,0,0,0,0,16]]);
  assert.ok(result.state.survivors.every(b=>!Object.hasOwn(b.state,'seed')&&b.state.battle.position===11&&b.state.battle.actors[0].hp===77));
  assert.deepEqual(initialState.battle.seed,Array(8).fill(0));
});

await check('Measurements use exact comparisons and missing fields stay unknown',()=>{
  const s={actors:[{hp:91}],camera:{kind:2},float:1.25};
  const o={id:'turn:1',checks:[{path:['actors',0,'hp'],equals:91},{path:['camera','kind'],oneOf:[1,2]},{path:['float'],between:[1.24,1.26]}]};
  assert.equal(matchBattleObservation(s,o).status,'match');
  assert.equal(matchBattleObservation(s,{id:'a',checks:[{path:['float'],equals:1.2500001}]}).status,'reject');
  assert.equal(matchBattleObservation(s,{id:'a',checks:[{path:['damage'],equals:0}]}).status,'unknown');
  assert.equal(matchBattleObservation(s,{id:'a',checks:[{path:['damage'],equals:0},{path:['actors',0,'hp'],equals:92}]}).status,'reject');
  assert.equal(matchBattleObservation(undefined,o).status,'unknown');
});

const observations=[
  {id:'turn:1',checks:[{path:['parity'],equals:1}]},
  {id:'turn:2',checks:[{path:['residue'],equals:2}]}
];
const initial={stage:0,hidden:100,seed:[1,2,3,4,5,6,7,8],position:17,actors:[{hp:90,buffs:[3,2]}],choices:[]};
const seenCalls=[];
async function syntheticTransitions(lanes,options){
  assert.deepEqual(Object.keys(options),['maxTransitions']);
  return lanes.map(lane=>{
    assert.deepEqual(Object.keys(lane).sort(),lane.row4Input?['id','row4Input','state']:['id','state']);
    assert.ok(!JSON.stringify(lane).includes('checks'));seenCalls.push(roundTrip(lane));
    const s=roundTrip(lane.state),base={id:lane.id};
    if(s.stage===0){s.stage=1;return{...base,status:'needs-row4',state:s,boundary:{id:'turn:1:camera:0',kind:'camera-row4',wordCount:4}};}
    if(s.stage===1){assert.equal(lane.row4Input.boundaryId,'turn:1:camera:0');const x=lane.row4Input.words[0];s.hidden+=x;s.seed[0]=x;s.position++;s.choices.push(x);s.stage=2;return{...base,status:'observation',state:s,row4Consumed:true,observationId:'turn:1',snapshot:{parity:x%2}};}
    if(s.stage===2){assert.equal(lane.row4Input,undefined);s.stage=3;return{...base,status:'needs-row4',state:s,boundary:{id:'turn:2:camera:0',kind:'camera-row4',wordCount:4}};}
    if(s.stage===3){assert.equal(lane.row4Input.boundaryId,'turn:2:camera:0');const y=lane.row4Input.words[0];s.hidden=s.hidden*10+y;s.seed[1]=y;s.position+=2;s.choices.push(y);s.stage=4;return{...base,status:'observation',state:s,row4Consumed:true,observationId:'turn:2',snapshot:{residue:s.hidden%3}};}
    assert.equal(s.stage,4);assert.equal(lane.row4Input,undefined);s.stage=5;return{...base,status:'complete',state:s};
  });
}
const newSyntheticState=()=>createBattleSearchState({adapterId,initialStates:[initial],domains:{default:fourWords(0,3)},observations});
const search=createCommonBattleSearch({adapterId,advanceBatch:syntheticTransitions});
let completeReference;
await check('Ambiguous observation retains all computed states for the next turn',async()=>{
  const before=newSyntheticState(),first=await search.run({state:before,maxAdapterCalls:2});
  assert.equal(first.complete,false);assert.equal(first.state.ready.length,2);
  assert.deepEqual(first.state.ready.map(x=>x.branch.state.hidden),[101,103]);
  assert.deepEqual(before,newSyntheticState());assert.deepEqual(initial.seed,[1,2,3,4,5,6,7,8]);
  const end=await search.run({state:roundTrip(first.state)});completeReference=end;
  assert.equal(end.complete,true);assert.equal(end.state.blocked.length,0);assert.equal(end.state.survivors.length,3);
  assert.deepEqual(end.state.survivors.map(b=>b.state.choices),[[1,0],[1,3],[3,1]]);
  assert.deepEqual(end.state.survivors.map(b=>b.state.hidden),[1010,1013,1031]);
  assert.ok(end.state.survivors.every(b=>b.state.position===20&&b.matchedObservations.length===2&&b.consumedBoundaries.length===2));
  assert.equal(end.state.stats.row4Assignments,'12');assert.equal(end.state.stats.row4Consumed,'12');
  assert.equal(end.state.stats.rejectedBranches,'7');
});

await check('One-candidate JSON resumes and wide batches produce identical branches',async()=>{
  let state=newSyntheticState(),runs=0,result;do{result=await search.run({state,batchSize:1,maxCandidates:1,maxAdapterCalls:1});assert.equal(result.error,undefined);state=roundTrip(result.state);assert.ok(++runs<100);}while(!result.complete);
  const canonical=s=>s.survivors.map(b=>JSON.stringify({state:b.state,choices:b.choices,consumed:b.consumedBoundaries,matched:b.matchedObservations})).sort();
  assert.deepEqual(canonical(state),canonical(completeReference.state));
});

await check('A finite budget never silently narrows the full row+4 domain',async()=>{
  const runner=createCommonBattleSearch({adapterId,advanceBatch:async lanes=>lanes.map(l=>l.row4Input?{id:l.id,state:{words:l.row4Input.words},status:'complete',row4Consumed:true}:{id:l.id,state:l.state,status:'needs-row4',boundary:{id:'all',kind:'camera-row4',wordCount:4}})});
  const result=await runner.run({state:createBattleSearchState({adapterId,initialStates:[{}]}),maxCandidates:7});
  assert.equal(result.complete,false);assert.equal(result.stopReason,'candidate-budget');assert.equal(result.state.survivors.length,7);
  assert.equal(result.progress.pendingAssignmentsAtKnownBoundaries,((1n<<128n)-7n).toString());
  assert.equal(result.state.expansions[0].domain.axes[0].origin,'complete-unsigned-domain');
});

await check('Runtime budgets before and after consumption never inject a candidate twice',async()=>{
  const inputs=[];const runner=createCommonBattleSearch({adapterId,advanceBatch:async lanes=>lanes.map(l=>{
    const s=roundTrip(l.state);inputs.push({stage:s.stage,input:l.row4Input??null});
    if(s.stage===0)return{id:l.id,state:{stage:1},status:'needs-row4',boundary:{id:'a',kind:'camera-row4',wordCount:4}};
    if(s.stage===1){assert.ok(l.row4Input);return{id:l.id,state:{stage:2},status:'budget',row4Consumed:false};}
    if(s.stage===2){assert.ok(l.row4Input);return{id:l.id,state:{stage:3,words:l.row4Input.words},status:'budget',row4Consumed:true};}
    assert.equal(l.row4Input,undefined);return{id:l.id,state:s,status:'complete'};
  })});
  let s=createBattleSearchState({adapterId,initialStates:[{stage:0}],domains:{default:fourWords(17,17)}}),r;
  for(let i=0;i<3;i++){r=await runner.run({state:s});s=roundTrip(r.state);}
  assert.equal(r.complete,true);assert.equal(s.stats.row4Assignments,'1');assert.equal(s.stats.row4Consumed,'1');
  assert.deepEqual(inputs.map(x=>Boolean(x.input)),[false,true,true,false]);
});

await check('Adapter failure preserves queued candidate work for exact retry',async()=>{
  let fail=true;const runner=createCommonBattleSearch({adapterId,advanceBatch:async lanes=>{if(fail){fail=false;throw Error('transient inference failure');}return lanes.map(l=>({id:l.id,state:l.state,status:'complete'}));}});
  const before=createBattleSearchState({adapterId,initialState:{seed:Array(8).fill(0),position:99},seedRange:{min:'18446744073709551613',max:'18446744073709551615'}});
  const failure=await runner.run({state:before,batchSize:2});assert.match(failure.error,/transient/);assert.equal(failure.state.ready.length,2);assert.equal(failure.complete,false);
  const result=await runner.run({state:roundTrip(failure.state)});assert.equal(result.complete,true);assert.equal(result.state.stats.seedAssignments,'3');
  assert.deepEqual(result.state.survivors.map(b=>b.state.seed[0]),[253,254,255]);assert.ok(result.state.survivors.every(b=>b.state.position===99));
});

await check('Missing outputs and unsupported transitions remain blocked, never rejected',async()=>{
  const runner=createCommonBattleSearch({adapterId,advanceBatch:async lanes=>lanes.map(l=>l.state.type==='unsupported'?{id:l.id,state:l.state,status:'unsupported',reason:'required calculation missing'}:{id:l.id,state:l.state,status:'observation',observationId:'t',snapshot:{}})});
  const result=await runner.run({state:createBattleSearchState({adapterId,initialStates:[{type:'unsupported'},{type:'unknown'}],observations:[{id:'t',checks:[{path:['camera','selection'],equals:1}]}]})});
  assert.equal(result.complete,false);assert.equal(result.state.blocked.length,2);assert.equal(result.state.stats.rejectedBranches,'0');assert.equal(result.budgetExhausted,false);
});

await check('Required observations cannot disappear at terminal completion',async()=>{
  const runner=createCommonBattleSearch({adapterId,advanceBatch:async lanes=>lanes.map(l=>({id:l.id,state:l.state,status:'complete'}))});
  const result=await runner.run({state:createBattleSearchState({adapterId,initialStates:[{}],observations:[{id:'missing',checks:[{path:['damage'],equals:1}]}]})});
  assert.equal(result.complete,false);assert.equal(result.state.survivors.length,0);assert.equal(result.state.blocked.length,1);
});

await check('Cancellation and implementation identity are explicit resume boundaries',async()=>{
  const controller=new AbortController();controller.abort();const state=newSyntheticState();
  const result=await search.run({state,signal:controller.signal});assert.equal(result.stopped,true);assert.equal(result.complete,false);assert.equal(result.state.ready.length,1);
  await assert.rejects(()=>search.run({state:{...state,adapterId:'different'}}),/different/);
});

const report={schema:'dq9-common-battle-search-control-proof-v1',createdAt:new Date().toISOString(),scope:'Host enumeration, measurement filtering and computed-state continuation only. Synthetic transitions are not game accuracy evidence.',tests:reports.length,failed:0,cases:reports};
if(process.argv[2]){await mkdir(dirname(process.argv[2]),{recursive:true});await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
