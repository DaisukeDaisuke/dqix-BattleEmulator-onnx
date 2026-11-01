// Exhaustive host-side scheduling and observation filtering for common ONNX
// battle/camera transitions. No battle arithmetic or expected state is injected.
const copy=x=>structuredClone(x),U32_MAX=4294967295n,U64_MAX=18446744073709551615n;
const requireData=(ok,message)=>{if(!ok)throw Error(message);};
function integer(value,label,maximum){let n;try{requireData(typeof value==='string'||typeof value==='number'||typeof value==='bigint',label+' must be an integer');if(typeof value==='number')requireData(Number.isSafeInteger(value),label+' must be an exact integer');n=BigInt(value);}catch{throw Error(label+' must be an exact unsigned integer');}requireData(n>=0n&&n<=maximum,label+' is outside its unsigned input domain');return n;}
function range(value,maximum,label){const v=value??{},min=integer(v.min??0,label+'.min',maximum),max=integer(v.max??maximum.toString(),label+'.max',maximum),step=integer(v.step??1,label+'.step',maximum);requireData(step>0n&&min<=max,label+' requires min<=max and positive step');return{min:min.toString(),max:max.toString(),step:step.toString(),count:((max-min)/step+1n).toString(),origin:value===undefined?'complete-unsigned-domain':'explicit-search-condition'};}
function jsonState(value,label='state',active=new Set()){if(value===null||typeof value==='string'||typeof value==='boolean')return;if(typeof value==='number'){requireData(Number.isFinite(value),label+' contains a nonfinite number');return;}requireData(typeof value==='object'&&(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),label+' must contain only JSON values');requireData(!active.has(value),label+' contains a cycle');if(Array.isArray(value))for(let i=0;i<value.length;i++)requireData(Object.hasOwn(value,i),label+' contains a sparse array');active.add(value);for(const[key,item]of Object.entries(value))jsonState(item,label+'.'+key,active);active.delete(value);}
function bump(state,key,by=1n){state.stats[key]=(BigInt(state.stats[key])+BigInt(by)).toString();}
function newId(state){const id='b'+state.nextBranchId;state.nextBranchId=(BigInt(state.nextBranchId)+1n).toString();return id;}
function initialSeedTarget(state,path){requireData(Array.isArray(path)&&path.length&&path.every(k=>typeof k==='string'||Number.isInteger(k)&&k>=0),'seedPath must identify the existing initial seed field');let target=state;for(let i=0;i<path.length;i++){requireData(target!==null&&typeof target==='object'&&Object.hasOwn(target,path[i]),'seedPath does not identify an existing initial seed field');if(i===path.length-1){const bytes=target[path[i]];requireData(Array.isArray(bytes)&&bytes.length===8&&bytes.every(v=>Number.isInteger(v)&&v>=0&&v<=255),'The initial seed must contain eight exact little-endian bytes');return{target,key:path[i]};}target=target[path[i]];}}
function deepEqual(a,b){if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&deepEqual(a[k],b[k]));}

export function createRow4Domain({wordCount=4,words}={}){
  requireData(Number.isInteger(wordCount)&&wordCount>0,'The actual boundary word count is required');if(words!==undefined)requireData(Array.isArray(words)&&words.length===wordCount,'An explicit row+4 domain must cover every boundary word');
  const axes=Array.from({length:wordCount},(_,i)=>range(words?.[i],U32_MAX,'row4['+i+']'));return{kind:'uint32-cartesian-product',wordCount,axes,total:axes.reduce((n,a)=>n*BigInt(a.count),1n).toString()};
}
export function row4CandidateAt(domain,ordinal){
  let index=integer(ordinal,'candidate ordinal',BigInt(domain.total));requireData(domain.kind==='uint32-cartesian-product'&&index<BigInt(domain.total),'Candidate ordinal is outside the declared domain');const words=Array(domain.wordCount);
  for(let i=domain.wordCount-1;i>=0;i--){const axis=domain.axes[i],count=BigInt(axis.count),digit=index%count;index/=count;words[i]=Number(BigInt(axis.min)+digit*BigInt(axis.step));}return words;
}
export function createSeedDomain(spec){return{kind:'uint64-range',...range(spec,U64_MAX,'seed')};}
export function seedCandidateAt(domain,ordinal){const index=integer(ordinal,'seed ordinal',BigInt(domain.count));requireData(index<BigInt(domain.count),'Seed ordinal is outside the declared domain');const value=BigInt(domain.min)+index*BigInt(domain.step);return{hex:'0x'+value.toString(16).padStart(16,'0'),bytes:Array.from({length:8},(_,i)=>Number((value>>BigInt(i*8))&255n))};}

function validateObservations(observations){
  requireData(Array.isArray(observations),'Observations must be a list');const ids=new Set();for(const o of observations){requireData(typeof o.id==='string'&&o.id.length&&!ids.has(o.id),'Observation IDs must be unique nonempty strings');ids.add(o.id);requireData(Array.isArray(o.checks)&&o.checks.length,'An observation needs at least one explicit output check');for(const check of o.checks){requireData(Array.isArray(check.path)&&check.path.length&&check.path.every(k=>typeof k==='string'||Number.isInteger(k)&&k>=0),'Observation paths are explicit read-only field/index lists');const modes=['equals','oneOf','between'].filter(k=>Object.hasOwn(check,k));requireData(modes.length===1,'Each observation check uses exactly one comparison');if(modes[0]==='oneOf')requireData(Array.isArray(check.oneOf)&&check.oneOf.length,'oneOf needs explicit measured alternatives');if(modes[0]==='between')requireData(Array.isArray(check.between)&&check.between.length===2&&check.between.every(Number.isFinite)&&check.between[0]<=check.between[1],'between needs a finite inclusive measurement interval');jsonState(check,'observation check');}}
}
export function matchBattleObservation(snapshot,observation){
  validateObservations([observation]);if(snapshot!==undefined)jsonState(snapshot,'computed observation');
  const unknown=[],failed=[],matched=[];for(const check of observation.checks){let actual=snapshot,present=true;for(const key of check.path){if(actual===null||typeof actual!=='object'||!Object.hasOwn(actual,key)){present=false;break;}actual=actual[key];}if(!present){unknown.push({path:check.path,reason:'output field not produced'});continue;}
    let matches;if(Object.hasOwn(check,'equals'))matches=deepEqual(actual,check.equals);else if(Object.hasOwn(check,'oneOf'))matches=check.oneOf.some(v=>deepEqual(actual,v));else{if(typeof actual!=='number'||!Number.isFinite(actual)){unknown.push({path:check.path,reason:'output is not a finite numeric measurement'});continue;}matches=actual>=check.between[0]&&actual<=check.between[1];}
    (matches?matched:failed).push({path:copy(check.path),actual:copy(actual)});
  }
  return{status:failed.length?'reject':unknown.length?'unknown':'match',failed,unknown,matched};
}

/** Each opaque initial state already contains battle conditions/definitions or
 * their immutable reference. A seed range replaces only its initial seed. */
export function createBattleSearchState({adapterId,initialStates,initialState,seedRange,seedPath=['seed'],domains={},observations=[]}={}){
  requireData(typeof adapterId==='string'&&adapterId.length,'A versioned battle/camera adapter identity is required');validateObservations(observations);jsonState(domains,'row4 search conditions');const s={schema:'dq9-common-battle-search-v1',adapterId,domains:copy(domains),observations:copy(observations),nextBranchId:'0',ready:[],expansions:[],survivors:[],blocked:[],rejectedSamples:[],stats:{seedAssignments:'0',row4Assignments:'0',row4Consumed:'0',adapterLaneSteps:'0',observationMatches:'0',rejectedBranches:'0',completedBranches:'0'},complete:false};
  const branch=state=>{jsonState(state);return{id:newId(s),state:copy(state),choices:[],consumedBoundaries:[],seenObservations:[],matchedObservations:[]};};
  if(seedRange!==undefined){requireData(initialState!==null&&typeof initialState==='object'&&!Array.isArray(initialState)&&initialStates===undefined,'Seed enumeration requires one initialState object template');jsonState(initialState);initialSeedTarget(initialState,seedPath);const domain=createSeedDomain(seedRange);s.expansions.push({kind:'seed',template:copy(initialState),seedPath:copy(seedPath),domain,cursor:'0',total:domain.count});}
  else{requireData(Array.isArray(initialStates)&&initialStates.length,'Provide initialStates or an explicit initialState plus seedRange');s.ready=initialStates.map(state=>({branch:branch(state)}));}
  return s;
}

export function battleSearchProgress(s){return{complete:s.complete,readyBranches:s.ready.length,unexpandedBoundaries:s.expansions.length,pendingAssignmentsAtKnownBoundaries:s.expansions.reduce((n,e)=>n+BigInt(e.total)-BigInt(e.cursor),0n).toString(),survivors:s.survivors.length,blockedBranches:s.blocked.length,stats:copy(s.stats),scope:'Pending assignment count covers currently discovered boundaries. Further boundaries can be discovered by computed continuations; a candidate budget is never a restriction of the declared input domain.'};}

export function createCommonBattleSearch({adapterId,advanceBatch}={}){
  requireData(typeof adapterId==='string'&&typeof advanceBatch==='function','A versioned common ONNX battle/camera batch adapter is required');
  return{
    async run({state:prior,batchSize=64,maxCandidates=1024,maxAdapterCalls=256,maxTransitions=100000,signal,shouldStop,onProgress}={}){
      requireData(prior?.schema==='dq9-common-battle-search-v1'&&prior.adapterId===adapterId,'A search cannot resume with a different battle/camera implementation');for(const[k,v]of Object.entries({batchSize,maxCandidates,maxAdapterCalls,maxTransitions}))requireData(Number.isSafeInteger(v)&&v>=(k==='maxCandidates'?0:1),k+' must be an explicit integer budget');jsonState(prior);validateObservations(prior.observations);const state=copy(prior),observations=new Map(state.observations.map(o=>[o.id,o]));state.complete=false;let assignments=0,calls=0,stopReason=null;
      function block(branch,reason,detail){state.blocked.push({branch,reason,...(detail?{detail:copy(detail)}:{})});}
      function reject(branch,observationId,detail){bump(state,'rejectedBranches');if(state.rejectedSamples.length<32)state.rejectedSamples.push({branchId:branch.id,choices:copy(branch.choices),observationId,detail:copy(detail)});}
      function domainFor(boundary){const conditions=state.domains.boundaries;const condition=conditions&&Object.hasOwn(conditions,boundary.id)?conditions[boundary.id]:state.domains.default;return createRow4Domain({wordCount:boundary.wordCount,words:condition?.words});}
      function candidate(){
        while(state.expansions.length){const e=state.expansions[0];if(BigInt(e.cursor)>=BigInt(e.total)){state.expansions.shift();continue;}if(assignments>=maxCandidates)return null;const ordinal=e.cursor;e.cursor=(BigInt(e.cursor)+1n).toString();assignments++;
          if(e.kind==='seed'){const seed=seedCandidateAt(e.domain,ordinal),computedInitial=copy(e.template),slot=initialSeedTarget(computedInitial,e.seedPath??['seed']);slot.target[slot.key]=seed.bytes;bump(state,'seedAssignments');return{branch:{id:newId(state),state:computedInitial,choices:[],consumedBoundaries:[],seenObservations:[],matchedObservations:[],initialSeed:seed.hex}};}
          const words=row4CandidateAt(e.domain,ordinal),branch=copy(e.parent);branch.parentId=e.parent.id;branch.id=newId(state);branch.choices.push({boundaryId:e.boundary.id,words,ordinal,domain:copy(e.domain)});bump(state,'row4Assignments');return{branch,row4Input:{boundaryId:e.boundary.id,words}};
        }return null;
      }
      while(calls<maxAdapterCalls){
        if(signal?.aborted||shouldStop?.()){stopReason='stopped';break;}
        const jobs=[];while(jobs.length<batchSize){let task=state.ready.shift();if(!task)task=candidate();if(!task)break;jobs.push(task);}if(!jobs.length){stopReason=state.expansions.length?'candidate-budget':null;break;}
        // Adapter receives only computed state and candidate input. Neither the
        // measurements nor expected output values are part of these arguments.
        const lanes=jobs.map(task=>({id:task.branch.id,state:copy(task.branch.state),...(task.row4Input?{row4Input:copy(task.row4Input)}:{})}));let results;
        try{const batch=await advanceBatch(lanes,{maxTransitions});results=Array.isArray(batch)?batch:batch?.lanes;requireData(Array.isArray(results)&&results.length===jobs.length,'Battle/camera adapter changed the batch shape');for(let i=0;i<results.length;i++){const r=results[i];requireData(r&&r.id===jobs[i].branch.id,'Battle/camera adapter changed lane identity');requireData(['needs-row4','observation','complete','unsupported','budget'].includes(r.status),'Unknown battle/camera adapter status');jsonState(r.state);if(r.snapshot!==undefined)jsonState(r.snapshot,'computed observation');if(r.boundary!==undefined)jsonState(r.boundary,'uncertainty boundary');if(jobs[i].row4Input){requireData(typeof r.row4Consumed==='boolean','An input-bearing result must explicitly report row4Consumed');if(r.row4Consumed)requireData(!jobs[i].branch.consumedBoundaries.includes(jobs[i].row4Input.boundaryId),'The same row+4 boundary was consumed twice');}}}
        catch(error){state.ready.unshift(...jobs);stopReason='adapter-error';return{state,complete:false,budgetExhausted:false,error:String(error.message??error),progress:battleSearchProgress(state)};}
        calls++;let runtimeBudget=false;
        for(let i=0;i<jobs.length;i++){
          const task=jobs[i],branch=task.branch,r=results[i];branch.state=copy(r.state);bump(state,'adapterLaneSteps');let unconsumed=task.row4Input;
          if(task.row4Input&&r.row4Consumed){requireData(!branch.consumedBoundaries.includes(task.row4Input.boundaryId),'The same row+4 boundary was consumed twice');branch.consumedBoundaries.push(task.row4Input.boundaryId);bump(state,'row4Consumed');unconsumed=undefined;}
          if(r.status==='budget'){state.ready.push({branch,...(unconsumed?{row4Input:unconsumed}:{})});runtimeBudget=true;continue;}
          if(r.status==='unsupported'){block(branch,r.reason??'A required battle/camera producer is unavailable',{row4Input:unconsumed??null});continue;}
          if(unconsumed){block(branch,'The runtime advanced without consuming its supplied uncertainty input',{row4Input:unconsumed,status:r.status});continue;}
          if(r.status==='needs-row4'){
            const b=r.boundary;if(!b||b.kind!=='camera-row4'||typeof b.id!=='string'||!b.id||!Number.isInteger(b.wordCount)||b.wordCount<1){block(branch,'The runtime did not identify an exact row+4 input boundary');continue;}
            if(branch.consumedBoundaries.includes(b.id)){block(branch,'The runtime requested an already consumed row+4 boundary',{boundary:b});continue;}
            let domain;try{domain=domainFor(b);}catch(error){block(branch,'Invalid explicit search condition',{boundaryId:b.id,error:String(error.message??error)});continue;}state.expansions.push({kind:'row4',parent:branch,boundary:copy(b),domain,cursor:'0',total:domain.total});continue;
          }
          const observationId=r.observationId;
          if(r.status==='observation'&&(typeof observationId!=='string'||!observationId)){block(branch,'An observation boundary requires a stable identity');continue;}
          if(observationId!==undefined){
            if(branch.seenObservations.includes(observationId)){block(branch,'The runtime repeated an already processed observation boundary',{observationId});continue;}
            branch.seenObservations.push(observationId);const measured=observations.get(observationId);if(measured){const checked=matchBattleObservation(r.snapshot,measured);if(checked.status==='reject'){reject(branch,observationId,checked.failed);continue;}if(checked.status==='unknown'){block(branch,'A measured battle/camera output has not been computed',{observationId,unknown:checked.unknown});continue;}branch.matchedObservations.push(observationId);bump(state,'observationMatches');}
            if(r.snapshot!==undefined){jsonState(r.snapshot,'computed observation');branch.lastObservation={id:observationId,snapshot:copy(r.snapshot)};}
          }
          if(r.status==='observation'){state.ready.push({branch});continue;}
          const missing=state.observations.filter(o=>!branch.matchedObservations.includes(o.id)).map(o=>o.id);if(missing.length){block(branch,'The runtime ended before all requested measurements were checked',{missingObservations:missing});continue;}
          state.survivors.push(branch);bump(state,'completedBranches');
        }
        await onProgress?.(battleSearchProgress(state));if(runtimeBudget){stopReason='runtime-budget';break;}
      }
      while(state.expansions.length&&BigInt(state.expansions[0].cursor)>=BigInt(state.expansions[0].total))state.expansions.shift();
      state.complete=state.ready.length===0&&state.expansions.length===0&&state.blocked.length===0;const budgetExhausted=!state.complete&&['candidate-budget','runtime-budget','adapter-call-budget'].includes(stopReason??(calls>=maxAdapterCalls?'adapter-call-budget':null));
      return{state,complete:state.complete,budgetExhausted,stopped:stopReason==='stopped',stopReason:stopReason??(!state.complete&&calls>=maxAdapterCalls?'adapter-call-budget':null),runStats:{assignments,adapterCalls:calls},progress:battleSearchProgress(state)};
    }
  };
}
