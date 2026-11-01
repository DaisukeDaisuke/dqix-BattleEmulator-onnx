// One definition-independent controller for the shared ONNX module set.
// This file owns lists, lookup, scheduling and tensor wiring. Damage, recovery,
// RNG, AI decisions and effect arithmetic are executed by ONNX graphs.
const clone=value=>globalThis.structuredClone?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));
const scalar=value=>Array.isArray(value)||ArrayBuffer.isView(value)?value[0]:value;
const array=value=>Array.isArray(value)||ArrayBuffer.isView(value)?Array.from(value):[value];
const yes=value=>!!scalar(value);
const pad=(values,width,fill=0)=>Array.from({length:width},(_,i)=>values[i]??fill);
const emptyTargets=()=>Array(8).fill(-1);
const bytes32=value=>Array.from({length:4},(_,i)=>(Number(value)>>>i*8)&255);
const wordBytes=values=>values.reduce((n,b,i)=>n+b*2**(8*i),0);
const rawHex=value=>typeof value==='string'?Array.from(value.match(/../g)??[],byte=>parseInt(byte,16)):value;
const EVENT_ACTIONS=new Set([503,504,900,901,914,937,938]);
class Boundary extends Error{constructor(reason,details={}){super(reason);this.details=details;}}
class Budget extends Error{constructor(message){super(message);this.code='DQ9_BUDGET';}}

export function romInitiativeSort(rows){
  // Matching func_020749ac, descending first-pivot Hoare partition. Equal
  // speeds swap endpoints; JavaScript stable sort has different tie behavior.
  const out=rows.map(value=>({...value}));
  function sort(lo,hi){let i=lo,j=hi,pivot=out[i].initiative;
    for(;;){while(out[i].initiative>pivot)i++;while(out[j].initiative<pivot)j--;if(i>=j)break;[out[i],out[j]]=[out[j],out[i]];i++;j--;}
    if(lo<i-1)sort(lo,i-1);if(j+1<hi)sort(j+1,hi);
  }
  if(out.length>1)sort(0,out.length-1);return out;
}
export async function commonProgramHash(program){
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(program)));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}

export async function createCommonBattleRunner({program,definitions,getModel,runGraph,presentationRunner}={}){
  if(program?.schema!=='dq9-common-battle-program-v1')throw Error('A common battle program is required');
  if(!definitions?.actions||!definitions?.monsters)throw Error('Action and monster definition tables are required');
  if(typeof getModel!=='function'||typeof runGraph!=='function')throw Error('getModel and runGraph are required');
  const fields=program.actorFields,idx=Object.fromEntries(fields.map((key,i)=>[key,i])),rawTimerWidth=program.rawTimerFields?.length??10;
  const models=new Map(),modelPending=new Map(),ops=program.operations;
  const model=async name=>{if(models.has(name))return models.get(name);if(!modelPending.has(name))modelPending.set(name,Promise.resolve(getModel(name)).then(value=>{models.set(name,value);return value;}));return modelPending.get(name);};
  const programHash=await commonProgramHash(program),moduleHashes=Object.fromEntries(program.modules.map(x=>[x.name,x.sha256]));
  const value=(a,key)=>a?.actor[idx[key]]??0,party=a=>value(a,'party')!==0;
  const exists=a=>!!a&&a.present!==false,member=a=>exists(a)&&a.roster!==false;
  const alive=a=>member(a)&&!a.dead&&!a.excluded;
  const actorById=(s,id)=>s.actors.find(a=>a.actorId===id);
  const parties=s=>s.actors.filter(a=>party(a)&&a.roster!==false);
  const populationRosterIds=s=>{const raw=s.enemyPopulation?.rosterRaw;if(!raw)return null;return Array.from({length:(raw[1]>>>4)&3},(_,group)=>raw.slice(6+group*24,6+group*24+(raw[14+group*24]&15)).map(slot=>192+slot)).flat();};
  const enemies=s=>s.enemyPopulation?populationRosterIds(s).map(id=>actorById(s,id)).filter(a=>a&&!party(a)&&a.roster!==false):[0,1,2].flatMap(group=>s.actors.filter(a=>!party(a)&&a.roster!==false&&a.group===group));
  const roster=s=>[...parties(s),...enemies(s)];
  const definition=a=>definitions.monsters[String(a.definitionId)];
  const action=id=>definitions.actions[String(id)];
  const charged=s=>parties(s).filter(a=>alive(a)&&a.aux[0]>0).length;
  const tensorActor=a=>({actor:a.actor,aux:a.aux,status:a.status,tension:a.tension,preparation:a.preparation,wakeSkip:a.wakeSkip,rawTimers:a.rawTimers,present:exists(a)});
  const presentationSnapshot=a=>a?clone({actor:a.actor,aux:a.aux,status:a.status,wakeSkip:a.wakeSkip,tension:a.tension,rawStatus:a.rawStatus,rawFlags:a.rawFlags,rawRanks:a.rawRanks,statusKinds:a.statusKinds,rawTimers:a.rawTimers}):null;
  const identityInput=(s,a)=>({...tensorActor(a),rawStatusBytes:bytes32(a.rawStatus??0),rawFlagBytes:bytes32(a.rawFlags??0),rawRanks:a.rawRanks,statusKindsBytes:[(a.statusKinds??0)&255,(a.statusKinds??0)>>>8],seed:s.seed,position:s.position,enabled:true});
  function commitRandom(s,out){if(out.nextSeed)s.seed=Array.from(out.nextSeed);if(out.nextPosition)s.position=scalar(out.nextPosition);}
  function commitActor(a,out,prefix=''){
    const oldHp=value(a,'hp');
    for(const[key,suffix]of Object.entries({actor:'Actor',aux:'Aux',status:'Status',tension:'Tension',preparation:'Preparation',rawTimers:'RawTimers'}))if(out['next'+prefix+suffix])a[key]=Array.from(out['next'+prefix+suffix]);
    if(out['next'+prefix+'WakeSkip'])a.wakeSkip=scalar(out['next'+prefix+'WakeSkip']);
    if(value(a,'hp')<=0){a.dead=true;if(oldHp>0){a.deathResetPending=true;if(a.ai){a.ai.revengeId=-1;a.ai.previousId=-1;}}}
    if(out['next'+prefix+'History']&&a.ai){[a.ai.revengeId,a.ai.previousId]=Array.from(out['next'+prefix+'History']);}
    if(out['next'+prefix+'State3c'])a.state3c=scalar(out['next'+prefix+'State3c']);
    for(const [suffix,key]of [['RawStatusBytes','rawStatus'],['RawFlagsBytes','rawFlags'],['RawFlagBytes','rawFlags'],['StatusKindsBytes','statusKinds']])if(out['next'+prefix+suffix])a[key]=out['next'+prefix+suffix].reduce((n,b,i)=>n+b*2**(8*i),0);
    if(out['next'+prefix+'RawRanks'])a.rawRanks=Array.from(out['next'+prefix+'RawRanks']);
  }
  function outcome(s){
    const p=parties(s).some(a=>alive(a)&&value(a,'hp')>0),e=enemies(s).some(a=>alive(a)&&value(a,'hp')>0);
    s.outcome=p?(e?0:1):2;s.finished=s.outcome!==0;return s.outcome;
  }
  function populationMembership(s){if(!s.enemyPopulation)return;const ids=new Set(populationRosterIds(s));for(const a of s.actors)if(!party(a))a.roster=ids.has(a.actorId);}
  function populationStats(a){
    // Repack graph-computed fields into their aliased original byte storage.
    // This is a representation view: derived stats and effect arithmetic are
    // already outputs of the common numeric graphs, never recomputed here.
    const raw=Uint8Array.from(a.populationRawStats),view=new DataView(raw.buffer),u16=(at,v)=>view.setUint16(at,v,true),u32=(at,v)=>view.setUint32(at,v>>>0,true);
    for(const[name,at]of[['hp',0],['mp',2],['maxHp',4],['maxMp',6]])u16(at,value(a,name));
    if(a.currentStats)a.currentStats.forEach((v,i)=>u16(8+i*2,v));
    u32(0x10,(view.getUint32(0x10,true)&0xc00003ff)|(a.magic[0]<<10)|(a.magic[1]<<20));
    u32(0x14,(a.rawStatus&~1)|Number(!!a.dead));u32(0x18,(a.rawFlags&~0x2000)|(a.excluded?0x2000:0));
    raw[0x21]=value(a,'defend');u16(0x22,a.statusKinds);raw[0x24]=a.tension[0];
    for(const[at,v]of[[0x28,a.preparation[1]],[0x2a,a.coverTargetId],[0x2c,a.coverById],[0x2e,a.aux[6]],[0x32,a.ai.revengeId??-1],[0x34,a.ai.previousId??-1]])u16(at,v);
    raw[0x38]=a.ai.cursor;raw[0x3a]=a.aux[2];raw[0x3b]=(raw[0x3b]&4)|(a.wakeSkip&1)|((a.preparation[3]&1)<<1)|((a.aux[0]&1)<<3)|((a.aux[1]&15)<<4);raw[0x3c]=a.state3c;
    raw.set(a.resistances,0x3e);let ranks=view.getUint32(0x58,true)&0xc0000000;for(let i=0;i<10;i++)ranks|=(a.rawRanks[i]&7)<<(i*3);u32(0x58,ranks);
    for(const[at,i]of[[0x5c,1],[0x7f,2],[0x5d,3],[0x80,4],[0x5e,5],[0x81,6]])raw[at]=a.status[i];
    for(const[at,name]of[[0x69,'hpDuration'],[0x8c,'hpRecovery'],[0x68,'mpDuration'],[0x8b,'mpRecovery']])raw[at]=value(a,name);
    const auxOffsets=[0x5f,0x82,0x6e,0x91,0x6f,0x92,0x70,0x93,0x76,0x99,0x77,0x9a,0x79,0x9c];auxOffsets.forEach((at,i)=>raw[at]=a.aux[7+i]);raw[0x7e]=a.aux[4];raw[0xa1]=a.aux[5];
    const timerOffsets=program.rawTimerOffsets??[0x74,0x97,0x75,0x98,0x6c,0x8f,0x6d,0x90,0x6a,0x8d,0x61,0x84,0x6b,0x8e,0x7b,0x9e];a.rawTimers.forEach((v,i)=>raw[timerOffsets[i]]=v);
    return Array.from(raw);
  }
  function refreshPopulationStorage(s){
    if(!s.enemyPopulation)return;
    for(const a of s.actors.filter(a=>!party(a))){a.populationRawStats=populationStats(a);if(a.populationStored)s.enemyPopulation.storageRawStats.splice((a.actorId-192)*164,164,...a.populationRawStats);}
  }
  function populationInputs(s){
    refreshPopulationStorage(s);
    const state=s.enemyPopulation,slots=Array.from({length:8},(_,i)=>actorById(s,192+i)),raw=[...state.rosterRaw];
    // These are byte/field views of the same caller-owned state, not a
    // recomputation of capacity or insertion decisions in the host.
    s.groups.forEach((group,i)=>{raw[15+i*24]=group.usedSlots.reduce((bits,value,j)=>bits|(value?1<<j:0),0);raw[16+i*24]=group.cursor;});
    return{rosterRaw:raw,actorPresent:slots.map(a=>Number(exists(a))),actorSpawnPending:slots.map(a=>a?.spawnPending??0),actorMonsterIds:slots.map(a=>a?.originalMonsterId??0),actorGroups:slots.map(a=>a?.group??0),
      actorRawStats:slots.flatMap(a=>a?a.populationRawStats:Array(164).fill(0)),
      storageRawStats:state.storageRawStats,globalSeed:state.globalSeed,globalPosition:state.globalPosition,
      ...Object.fromEntries([['pendingMonsterIds','pendingMonsterId'],['pendingHp','pendingHp'],['pendingMp','pendingMp'],['pendingGroups','pendingGroup'],['pendingLetters','pendingLetter']].map(([name,property])=>[name,slots.map(a=>a?.[property]??0)]))};
  }
  function commitPopulation(s,out,monster){
    const population=s.enemyPopulation;population.rosterRaw=Array.from(out.nextRosterRaw);population.storageRawStats=Array.from(out.nextStorageRawStats);population.globalSeed=Array.from(out.nextGlobalSeed);population.globalPosition=scalar(out.nextGlobalPosition);
    s.groups.forEach((group,i)=>{group.cursor=population.rosterRaw[16+i*24];group.usedSlots=Array.from({length:6},(_,j)=>!!(population.rosterRaw[15+i*24]&(1<<j)));});
    if(yes(out.inserted)){
      const id=scalar(out.actorId),slot=id-192,reused=yes(out.reused);let a=actorById(s,id);
      if(!a){a={actorId:id};s.actors.push(a);}
      const m=reused?definition(a):monster;
      Object.assign(a,{actorId:id,actor:Array.from(out.insertedActor),aux:Array.from(out.insertedAux),status:Array.from(out.insertedStatus),tension:Array.from(out.insertedTension),preparation:Array.from(out.insertedPreparation),wakeSkip:0,
        rawStatus:wordBytes(out.insertedRawStatusBytes),rawFlags:wordBytes(out.insertedRawFlagsBytes),statusKinds:wordBytes(out.insertedStatusKindsBytes),rawRanks:Array.from(out.insertedRawRanks),rawTimers:Array.from(out.insertedRawTimers),magic:Array.from(out.insertedMagic),resistances:Array.from(out.insertedResistances),state3c:scalar(out.insertedState3c),populationRawStats:Array.from(out.insertedStatsRaw),
        populationStored:reused?!!a.populationStored:true,currentStats:[wordBytes(out.insertedStatsRaw.slice(8,10)),wordBytes(out.insertedStatsRaw.slice(10,12)),wordBytes(out.insertedStatsRaw.slice(12,14))],
        present:true,roster:true,dead:false,excluded:false,deathResetPending:false,escapeResetPending:false,group:out.nextActorGroups[slot],originalMonsterId:out.nextActorMonsterIds[slot],definitionId:reused?a.definitionId:monster.id,
        config:[...m.config],species:reused?a.species:m.species,metal:reused?a.metal:m.metal,weapon:[0,0,10,0],charm:[0,0,0],packedScale:[0,0],auxiliaryBytes:Array(9).fill(0),criticalBaseRate:-1,weaponWide:0,job:0,coverById:-1,coverTargetId:-1,
        ai:{cursor:0,alternate:false,revengeId:-1,previousId:-1,previousTargetCount:0,previousTargets:emptyTargets()},commands:[]});
    }
    for(let slot=0;slot<8;slot++){const a=actorById(s,192+slot);if(!a)continue;a.spawnPending=out.nextActorSpawnPending[slot];for(const[property,name]of[['pendingMonsterId','nextPendingMonsterIds'],['pendingHp','nextPendingHp'],['pendingMp','nextPendingMp'],['pendingGroup','nextPendingGroups'],['pendingLetter','nextPendingLetters']])a[property]=out[name][slot];}
    populationMembership(s);
  }
  function validate(s){
    if(s.budgetExhausted&&!s.requestedTurnsComplete)throw Error('A budget-stopped prefix must be replayed from the saved initial input; it is not a turn-boundary state');
    if(!Array.isArray(s.seed)||s.seed.length!==8||s.seed.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('seed: eight exact byte limbs required');
    if(!Number.isInteger(s.position)||s.position<0||s.position>2147483000)throw Error('position: int32 RNG counter required');
    if(!Array.isArray(s.actors)||!s.actors.length)throw Error('actors: nonempty actor array required');
    const used=new Set();
    for(const a of s.actors){
      for(const[key,width]of Object.entries({actor:33,aux:21,status:7,tension:3,preparation:5,config:7,resistances:22,weapon:4,charm:3}))if(!Array.isArray(a[key])||a[key].length!==width||a[key].some(x=>!Number.isFinite(x)))throw Error(`actor ${a.actorId}: ${key} must have ${width} finite values`);
      if(!Number.isInteger(a.actorId)||used.has(a.actorId)||value(a,'id')!==a.actorId)throw Error('Actor IDs must be unique and agree with actor.id');used.add(a.actorId);
      if(party(a)?a.actorId<0||a.actorId>3:a.actorId<192||a.actorId>199)throw Error('Actor ID outside the ROM party0..3/enemy192..199 lookup');
      if(!party(a)&&(!Number.isInteger(a.group)||a.group<0||a.group>2))throw Error('Enemy group outside0..2');
      if(!party(a)&&!definition(a))throw Error(`Missing monster definition ${a.definitionId}`);
      if(value(a,'level')<0||value(a,'level')>99)throw Error('Current periodic graph requires level0..99');
      a.state3c??=0;a.magic??=[0,0];a.packedScale??=[0,0];for(const key of ['magic','packedScale'])if(!Array.isArray(a[key])||a[key].length!==2||a[key].some(x=>!Number.isInteger(x)||x<0||x>1023))throw Error(key+' must contain two values in0..1023');
      a.weaponSpeciesTenths??=[a.weapon[2],...Array(11).fill(10)];
      if(!Array.isArray(a.weaponSpeciesTenths)||a.weaponSpeciesTenths.length!==12||a.weaponSpeciesTenths.some(x=>!Number.isInteger(x)||x<-32||x>31))throw Error('weaponSpeciesTenths must contain twelve signed six-bit coefficients in species1..12 order');
      a.ai??={};a.ai.cursor??=0;a.ai.alternate??=!!(a.state3c&1);a.ai.previousTargetCount??=0;a.ai.previousTargets??=emptyTargets();
      a.wakeSkip??=0;a.rawStatus??=0;a.rawFlags??=0;a.rawRanks??=Array(10).fill(0);a.auxiliaryBytes??=Array(9).fill(0);
      a.rawTimers??=Array(rawTimerWidth).fill(0);
      // Old snapshots can add zero timers only when none of the newly
      // represented effects is active. Active effects need explicit timers.
      if(Array.isArray(a.rawTimers)&&a.rawTimers.length===10&&rawTimerWidth>=16&&!(a.rawStatus&0x200)&&!(a.rawFlags&0x18)&&(!(a.rawStatus&0x100)||rawTimerWidth<18))a.rawTimers=pad(a.rawTimers,rawTimerWidth);
      if(Array.isArray(a.rawTimers)&&a.rawTimers.length===16&&rawTimerWidth===18&&!(a.rawStatus&0x100))a.rawTimers=pad(a.rawTimers,rawTimerWidth);
      if(!Array.isArray(a.rawTimers)||a.rawTimers.length!==rawTimerWidth||a.rawTimers.some((x,i)=>!Number.isInteger(x)||x<0||x>(i%2?4:255)))throw Error(`rawTimers must contain ${rawTimerWidth} explicit modifier duration0..255 and recovery0..4 values in the program field order`);
      a.statusKinds??=a.status[0]&3;
      for(const key of ['rawStatus','rawFlags'])if(!Number.isInteger(a[key])||a[key]<0||a[key]>4294967295)throw Error(key+' must be uint32');
      if(!Number.isInteger(a.statusKinds)||a.statusKinds<0||a.statusKinds>65535)throw Error('statusKinds must be uint16');
      a.coverById??=-1;a.coverTargetId??=-1;
      a.job??=0;a.weaponWide??=(a.weaponGroupTargets?1:0)|(a.weaponAllTargets?2:0);if(!Number.isInteger(a.job)||a.job<0||a.job>12)throw Error('job must be an original job-table index0..12');
      if(!Number.isInteger(a.weaponWide)||a.weaponWide<0||a.weaponWide>3)throw Error('weaponWide must contain the original weapon property low2 bits');
      a.criticalBaseRate??=-1;if(!Number.isFinite(a.criticalBaseRate)||a.criticalBaseRate<-1||a.criticalBaseRate>100)throw Error('criticalBaseRate must be a resolved binary32 base percentage0..100 or -1 for the legacy threshold input');
    }
    if(s.enemyPopulation){
      const p=s.enemyPopulation,byteVector=(v,width)=>Array.isArray(v)&&v.length===width&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=255);
      for(const[key,width]of[['rosterRaw',108],['storageRawStats',1312],['globalSeed',8]])if(!byteVector(p[key],width))throw Error('enemyPopulation.'+key+' requires '+width+' explicit byte values');
      if(!Number.isInteger(p.globalPosition)||p.globalPosition<0||p.globalPosition>2147483000)throw Error('enemyPopulation.globalPosition requires an explicit int32 counter');
      if(!Array.isArray(p.loadedMonsterIds)||p.loadedMonsterIds.length!==4||p.loadedMonsterIds.some(x=>!Number.isInteger(x)||x< -1||x>32767))throw Error('enemyPopulation.loadedMonsterIds requires the four original resource slots');
      for(const a of s.actors.filter(a=>!party(a)))if(!byteVector(a.populationRawStats,164))throw Error('Enemy population actor '+a.actorId+' requires the original164-byte numeric backing state');
      populationMembership(s);
    }
    if(parties(s).length>4||enemies(s).length>8)throw Error('Actor population exceeds ROM lookup limits');
    s.groups??=Array.from({length:3},()=>({cursor:0,usedSlots:Array(6).fill(false)}));
    if(s.groups.length!==3)throw Error('Three ROM group state slots are required');
    s.turn??=1;s.completedTurns??=0;s.firstTurn??=s.turn===1;s.surprise??=0;s.scenarioId??=-1;
    s.combo??=[0,0,0,-1,0,0];s.context??=[1,0];s.camera??={mode:'pending-input',row4Words:[],records:[]};s.nowstate??=[];s.unresolvedEffects=[];
    s.supported=true;s.budgetExhausted=false;s.transitions=0;s.requestedTurnsComplete=false;s.phase='initial';
  }

  async function run({rows,maxTurns=1,maxTransitions=100000,trace=false,onProgress,shouldStop,boundary='turn'}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('A nonempty batch is required');
    if(!['turn','numeric-turn','command-effects'].includes(boundary))throw Error('Unknown common execution boundary');
    if(!Number.isInteger(maxTurns)||maxTurns<1||!Number.isInteger(maxTransitions)||maxTransitions<1)throw Error('Budgets must be positive integers');
    if(boundary==='numeric-turn'&&maxTurns!==1)throw Error('The explicit numerical-turn boundary accepts exactly one turn before presentation');
    const states=rows.map(clone);states.forEach(validate);
    const inputHash=await commonProgramHash({definitions,rows}),traces=states.map(()=>[]),queues=new Map();let flushQueued=false,graphCalls=0,batchRows=0;
    // Independent battles that reach the same graph in the same microtask are
    // evaluated as one N-row invocation. There is no per-seed JS numeric kernel.
    async function flush(){flushQueued=false;const pending=[...queues.entries()];queues.clear();
      for(const[name,jobs]of pending){try{const outputs=await runGraph(name,jobs.map(job=>job.input),{phase:'common-battle'});graphCalls++;batchRows+=jobs.length;if(outputs.length!==jobs.length)throw Error(name+': output batch length changed');jobs.forEach((job,i)=>job.resolve(outputs[i]));}catch(error){jobs.forEach(job=>job.reject(error));}}
    }
    async function call(s,lane,operation,values){
      if(shouldStop?.())throw new Budget('User stopped the run');
      if(++s.transitions>maxTransitions)throw new Budget('Transition budget exhausted');
      const name=ops[operation]??operation,ir=await model(name),input={};
      for(const d of ir.inputs){const v=values[d.name]??ir.contract?.defaults?.[d.name];if(v===undefined)throw Error(`${name}.${d.name}: missing input`);input[d.name]=array(v);if(input[d.name].length!==d.shape[1])throw Error(`${name}.${d.name}: expected ${d.shape[1]} values`);}
      const out=await new Promise((resolve,reject)=>{const jobs=queues.get(name)??[];jobs.push({input,resolve,reject});queues.set(name,jobs);if(!flushQueued){flushQueued=true;queueMicrotask(flush);}});
      if(trace)traces[lane].push({turn:s.turn,phase:s.phase,model:name,input:clone(input),output:clone(out)});
      return out;
    }
    async function draw(s,lane,maximum){const out=await call(s,lane,'random',{seed:s.seed,position:s.position,maximum,enabled:true});commitRandom(s,out);return scalar(out.value??out.result);}
    async function populationRoster(s,lane,{recount=true,clearPending=false}={}){
      if(!s.enemyPopulation)return;const slots=Array.from({length:8},(_,i)=>actorById(s,192+i)),out=await call(s,lane,'populationRoster',{rosterRaw:populationInputs(s).rosterRaw,actorPresent:slots.map(a=>Number(exists(a))),actorDead:slots.map(a=>Number(!!a?.dead)),actorExcluded:slots.map(a=>Number(!!a?.excluded)),actorSpawnPending:slots.map(a=>a?.spawnPending??0),recount,clearPending});
      if(!yes(out.supported))throw new Boundary('population-roster-layout');s.enemyPopulation.rosterRaw=Array.from(out.nextRosterRaw);slots.forEach((a,i)=>{if(a)a.spawnPending=out.nextActorSpawnPending[i];});
    }
    async function preparePopulation(s,lane,a,record){
      const request=await call(s,lane,'populationRequest',{enabled:true,actionId:record.id,operation:record.operation,sourceMonsterId:a.originalMonsterId,sourceGroup:a.group,loadedMonsterIds:s.enemyPopulation.loadedMonsterIds});
      if(!yes(request.supported))throw new Boundary('population-request',{actor:a.actorId,actionId:record.id});
      if(!yes(request.attempt))return{attempt:false,inserted:false};
      const id=scalar(request.monsterId),m=definitions.monsters[id],raw=rawHex(m?.raw),initial=populationInputs(s),input={...initial,seed:s.seed,position:s.position,enabled:true,monsterId:id,requestedGroup:scalar(request.requestedGroup),resourceLoaded:yes(request.resourceLoaded),definitionPresent:!!raw&&raw.length===132,auxiliaryPresent:!!m,definitionRaw:raw?.length===132?raw:Array(132).fill(0),definitionLevel:m?.level??0,definitionDodgeRate:m?.dodgeRate??0,definitionGuardRate:m?.guardRate??0};
      const plan=await call(s,lane,'populationPlan',input);if(!yes(plan.supported))throw new Boundary('population-insertion-layout',{monsterId:id});
      if(yes(plan.reused)){
        const old=actorById(s,scalar(plan.actorId));
        if(['Attack','Defense','Agility'].some(key=>value(old,'base'+key)!==m[key.toLowerCase()]))throw new Boundary('population-stale-base-stats',{actor:old.actorId,monsterId:id,reasonDetail:'Reused object base stats and the requested definition must describe the same derived-stat state.'});
        input.definitionLevel=value(old,'level');input.definitionDodgeRate=value(old,'dodgeRate');input.definitionGuardRate=value(old,'guardRate');
      }
      return{attempt:true,inserted:yes(plan.inserted),monster:m,input};
    }
    async function views(s,lane){
      const result=new Map();for(const a of roster(s)){
        a.state3c=((a.state3c??0)&~65)|(a.ai.alternate?1:0)|(a.preparation[4]?64:0);
        a.statusKinds=(a.statusKinds&~3)|(a.status[0]&3);
        const out=await call(s,lane,'stateView',{...identityInput(s,a),rawStatusBytes:bytes32((a.rawStatus&~1)|Number(!!a.dead)),rawFlagBytes:bytes32((a.rawFlags&~0x2000)|(a.excluded?0x2000:0)),rawRanks:a.rawRanks,deathReset:!!a.deathResetPending,escapeReset:!!a.escapeResetPending});
        if(out.statusBytes)a.rawStatus=out.statusBytes.reduce((n,b,i)=>n+b*2**(8*i),0);if(out.flagBytes)a.rawFlags=out.flagBytes.reduce((n,b,i)=>n+b*2**(8*i),0);if(out.ranks)a.rawRanks=Array.from(out.ranks);if(out.nextRawTimers)a.rawTimers=Array.from(out.nextRawTimers);if(out.nextStatusKindsBytes)a.statusKinds=out.nextStatusKindsBytes.reduce((n,b,i)=>n+b*2**(8*i),0);a.deathResetPending=false;a.escapeResetPending=false;
        a.currentStats=[scalar(out.attack),scalar(out.defense),scalar(out.agility)];
        result.set(a.actorId,Object.fromEntries(Object.entries(out).map(([key,v])=>[key,v.length===1?scalar(v):Array.from(v)])));
      }refreshPopulationStorage(s);return result;
    }
    function tableInputs(a){
      const m=definition(a);if(!m)throw new Boundary('monster-definition',{actor:a.actorId,definitionId:a.definitionId});
      const records=m.actions.map(id=>action(id));if(records.some(x=>!x))throw new Boundary('action-definition',{actor:a.actorId,actions:m.actions});
      const fallback=action(2);return{scheme:m.scheme,judgment:m.judgment,mp:value(a,'mp'),actionIds:m.actions,mpCosts:records.map(x=>x.mpCost),operations:records.map(x=>x.operation),spell:records.map(x=>x.spell),ability:records.map(x=>x.ability),limited:records.map((_,i)=>!!(m.limitedSlots&(1<<i))),smartTarget:records.map(x=>x.smartTarget),wiseTarget:records.map(x=>x.wiseTarget),targetSide:records.map(x=>x.targetSide),targetScope:records.map(x=>x.targetScope),repeatCode:records.map(x=>x.repeatCode),fallbackTargetSide:fallback.targetSide,fallbackTargetScope:fallback.targetScope,fallbackRepeatCode:fallback.repeatCode};
    }
    function population(s,a,view){
      const pp=pad(parties(s),4,null),ee=pad(enemies(s),8,null),v=x=>x?view.get(x.actorId)??{}:{};
      const populationRaw=s.enemyPopulation?.rosterRaw??Array(108).fill(0);
      const status=x=>x?v(x).statusBytes??bytes32(x.rawStatus):[0,0,0,0],flags=x=>x?v(x).flagBytes??bytes32(x.rawFlags):[0,0,0,0];
      return{ids:pp.map((x,i)=>x?.actorId??i),hp:pp.map(x=>value(x,'hp')),present:pp.map(exists),candidate:pp.map(member),excluded:pp.map(x=>!!x?.excluded),dead:pp.map(x=>!!x?.dead),baseHalf:pp.map(x=>!!x?.baseHalf),attracted:pp.map(x=>x?.attracted??!!(x?.rawStatus&0x08000000)),
        populationContextAvailable:!!s.enemyPopulation,populationBtPresent:s.enemyPopulation?.btPresent!==false,populationLiveCount:populationRaw[1]&15,populationGroupCount:(populationRaw[1]>>>4)&3,populationGroupMonsterIds:Array.from({length:3},(_,i)=>populationRaw[4+i*24]|populationRaw[5+i*24]<<8),populationGroupLiveCounts:Array.from({length:3},(_,i)=>populationRaw[14+i*24]>>>4),populationLoadedMonsterIds:s.enemyPopulation?.loadedMonsterIds??Array(4).fill(-1),actorOriginalMonsterId:a.originalMonsterId??-1,
        priorityEnabled:a.ai.priorityEnabled??!!(definition(a)?.flags&0x04000000),revengeId:a.ai.revengeId??-1,previousId:a.ai.previousId??-1,rageEnabled:a.aux[3]>0,rageId:a.aux[6],actorId:a.actorId,
        paralyzed:pp.map(x=>value(x,'paralysis')>0),asleep:pp.map(x=>value(x,'sleep')>0),status26:pp.map(x=>!!(x?.rawStatus&0x4000000)),status9:pp.map(x=>!!(x?.rawStatus&0x200)),
        defense:pp.map(x=>v(x).defense??0),agility:pp.map(x=>v(x).agility??0),defenseRank:pp.map(x=>value(x,'defenseRank')),agilityRank:pp.map(x=>value(x,'agilityRank')),
        actorDead:!!a.dead,actorPresent:exists(a),actorExcluded:!!a.excluded,actorParalyzed:value(a,'paralysis')>0,actorAttack:v(a).attack??0,actorDefense:v(a).defense??0,actorBlind:value(a,'blind')>0,actorHp:value(a,'hp'),actorMaxHp:value(a,'maxHp'),
        enemyIds:ee.map((x,i)=>x?.actorId??192+i),enemyPresent:ee.map(exists),enemyCandidate:ee.map(member),enemyDead:ee.map(x=>!!x?.dead),enemyExcluded:ee.map(x=>!!x?.excluded),enemyGroups:ee.map(x=>x?.group??0),actorGroup:a.group,
        enemyOriginalMonsterIds:ee.map(x=>x?.originalMonsterId??-1),enemyCoverSources:ee.map(x=>x?.coverById??-1),enemyHp:ee.map(x=>value(x,'hp')),enemyMaxHp:ee.map(x=>value(x,'maxHp')),actorBarrierRank:a.rawRanks[6],actorBreathJudgment:!!(a.state3c&4),enemyBreathBarrierRank:ee.map(x=>x?.rawRanks?.[7]??0),
        partyStatusBytes:pp.flatMap(status),partyStatusKinds:pp.map(x=>x?.statusKinds??0),partyRawPoisonResistance:pp.map(x=>x?.resistances?.[15]??100),enemyStatusBytes:ee.flatMap(status),enemyStatusKinds:ee.map(x=>x?.statusKinds??0),partyFlagBytes:pp.flatMap(flags),partyRankFields:pp.flatMap(x=>x?v(x).ranks??x.rawRanks:Array(10).fill(0)),actorType400:a.actorType400!==false,actorStatusBytes:status(a),actorFlagBytes:flags(a),
        enemyDefense:ee.map(x=>v(x).defense??0),enemyDefenseRank:ee.map(x=>value(x,'defenseRank')),enemyBarrierRank:ee.map(x=>x?.rawRanks?.[6]??0),enemyGroupCount:enemies(s).reduce((count,x)=>Math.max(count,x.group+1),0),
        partyMp:pp.map(x=>value(x,'mp')),partyAuxiliaryPresent:pp.map(x=>exists(x)&&x.auxiliaryPresent!==false),partyAuxiliaryBytes:pp.flatMap(x=>x?.auxiliaryBytes??Array(9).fill(0)),enemyStatus9:ee.map(x=>!!(x?.rawStatus&0x200))};
    }
    async function ai(s,lane,a){
      const view=await views(s,lane),group=s.groups[a.group],name=ops.ai,ir=await model(name);
      let state={initialized:false,attempt:0,phase:0,selectedAction:-1,selectedSlot:-1,weightedQueue:[0,1,2,3,4,5],pairOther:0,blockBase:0,blockOffset:0,blockRemaining:0,actorCursor:a.ai.cursor,groupCursor:group.cursor,usedSlots:group.usedSlots,previousTargetCount:0,previousTargets:[-1,0,0,0,0,0,0,0]};
      for(;;){
        const out=await call(s,lane,'ai',{...population(s,a,view),...tableInputs(a),...state,seed:s.seed,position:s.position,enabled:true,
          levelUnlocked:a.ai.levelUnlocked??Array(6).fill(true),judgeSpell:a.ai.judgeSpell??!!(a.state3c&8),judgeAbility:a.ai.judgeAbility??!!(a.state3c&16),judgeOther:a.ai.judgeOther??!!(a.state3c&32),silenced:a.ai.silenced??!!(a.rawStatus&0x100),suppressFlee:s.suppressFlee??(s.firstTurn&&s.surprise===2),legacyRestricted:!!a.ai.legacyRestricted});
        if(!yes(out.supported))throw new Boundary('AI-callback',{actor:a.actorId,definitionId:a.definitionId,selector:scalar(out.unsupportedSelector),repeatCode:scalar(out.unsupportedRepeatCode)});
        commitRandom(s,out);for(const[input,output]of Object.entries(ir.contract.feedback??{}))if(out[output])state[input]=out[output].length===1?scalar(out[output]):Array.from(out[output]);
        a.ai.cursor=scalar(state.actorCursor);group.cursor=scalar(state.groupCursor);group.usedSlots=array(state.usedSlots);a.ai.previousTargetCount=scalar(out.targetCount);a.ai.previousTargets=Array.from(out.targets);
        if(!yes(out.finished))continue;
        const id=scalar(out.nextSelectedAction),record=action(id);if(!record)throw new Boundary('action-definition',{actionId:id});
        if(record.operation===34){
          const destination=record.parameter===0?a.ai.storedTransitionId:record.parameter;
          if(definitions.monsters[destination]){a.ai.storedTransitionId=destination;a.definitionId=destination;}
          a.ai.previousTargets=emptyTargets();a.ai.previousTargetCount=0;
          state={...state,initialized:false,attempt:0,phase:0,selectedAction:-1,selectedSlot:-1,pairOther:0,blockBase:0,blockOffset:0,blockRemaining:0,previousTargets:emptyTargets(),previousTargetCount:0};continue;
        }
        return{sourceId:a.actorId,sources:[a.actorId],actionId:id,targets:Array.from(out.targets),targetCount:scalar(out.targetCount),deferred:false,selectedSlot:scalar(out.nextSelectedSlot)};
      }
    }
    async function turnBegin(s,lane){
      const out=await call(s,lane,'turnBegin',{combo:s.combo,context:s.context,usedSlots:s.groups.flatMap(g=>g.usedSlots)});
      s.combo=Array.from(out.nextCombo);s.context=Array.from(out.nextContext);s.groups.forEach((g,i)=>g.usedSlots=out.nextUsedSlots.slice(i*6,i*6+6));
      for(const a of roster(s)){a.coverById=-1;a.coverTargetId=-1;}
    }
    async function initiative(s,lane){
      const order=[];let acceptedEnemies=0;
      for(const a of roster(s)){
        if(!alive(a))continue;
        if(s.firstTurn&&((s.surprise===1&&!party(a))||(s.surprise===2&&party(a))))continue;
        if(s.firstTurn&&s.surprise===2&&!party(a)&&acceptedEnemies>0&&await draw(s,lane,100)>=67)continue;
        const out=await call(s,lane,'initiative',identityInput(s,a));commitRandom(s,out);order.push({actorId:a.actorId,initiative:scalar(out.initiative)});if(!party(a))acceptedEnemies++;
      }s.initiative=romInitiativeSort(order);
    }
    async function planCommand(s,lane,a,number){
      if(['sleep','paralysis','confusion','skip'].some(key=>value(a,key)>0))return{sourceId:a.actorId,sources:[a.actorId],actionId:503,targets:emptyTargets(),targetCount:0,deferred:false};
      if(party(a)){
        const commands=a.commands??[],selected=commands[Math.min(s.completedTurns,Math.max(0,commands.length-1))];
        if(!selected)throw new Boundary('party-command',{actor:a.actorId,turn:s.turn});
        return{sourceId:a.actorId,sources:[a.actorId],actionId:selected.actionId,targets:pad(selected.targets??[selected.target??192],8,-1),targetCount:selected.targetCount??selected.targets?.length??1,targetGroup:selected.targetGroup??actorById(s,selected.target??192)?.group??0,selectedKind:selected.kind??0,deferred:false};
      }
      if(definition(a).judgment===2)return{sourceId:a.actorId,sources:[a.actorId],actionId:2,targets:emptyTargets(),targetCount:0,deferred:true};
      return ai(s,lane,a);
    }
    async function planning(s,lane){
      const commands=[],append=command=>{commands.push(command);if(command.actionId===146||command.actionId===929){const source=actorById(s,command.sourceId),target=actorById(s,command.targets[0]);if(source&&target&&command.targetCount>0){source.coverTargetId=target.actorId;target.coverById=source.actorId;}}};
      for(const entry of s.initiative){const a=actorById(s,entry.actorId);append(await planCommand(s,lane,a,0));
        const out=await call(s,lane,'extraActions',{seed:s.seed,position:s.position,party:party(a),mode:party(a)?0:definition(a).extraActionMode,alternate:!!a.ai.alternate,enabled:true});commitRandom(s,out);a.ai.alternate=yes(out.nextAlternate);a.state3c=(a.state3c&~1)|Number(a.ai.alternate);
        for(let n=0;n<scalar(out.extraCount);n++)append(await planCommand(s,lane,a,n+1));
      }commands.forEach((c,i)=>c.planningIndex=i);s.pendingCommands=commands;
    }
    async function planningPreprocess(s,lane){
      for(const command of s.pendingCommands){const a=actorById(s,command.sourceId),record=action(command.actionId);if(!record)throw new Boundary('action-definition',{actionId:command.actionId});
        const out=await call(s,lane,'planningPreprocess',{...identityInput(s,a),actionId:command.actionId,targetCount:command.targetCount,prepaid:!!record.prepaid,mpCost:record.mpCost,mpDiscount:!!a.mpDiscount,actionCategory:record.planningCategory,spellFlag:!!record.spell,rawFlagBytes:bytes32(a.rawFlags),priorMotion:a.motion??0,priorState3c:a.state3c??0,enabled:!s.scriptBattleMode});
        commitActor(a,out);command.actionId=scalar(out.nextAction);command.targetCount=scalar(out.nextTargetCount);a.motion=scalar(out.nextMotion);a.state3c=scalar(out.nextState3c);a.rawFlags=out.nextRawFlagBytes.reduce((n,b,i)=>n+b*2**(8*i),0);
      }
    }
    function priority(s){
      const rank=p=>p===1?0:p===5?1:p===10?2:p===32?4:3;
      s.pendingCommands.sort((a,b)=>{const ra=action(a.actionId),rb=action(b.actionId),d=rank(ra?.priority)-rank(rb?.priority);if(d)return d;
        const fast=c=>!!actorById(s,c.sourceId)?.firstStrikeWeapon&&!!action(c.actionId)?.weaponFirstEligible;
        return Number(fast(b))-Number(fast(a))||a.planningIndex-b.planningIndex;});
    }
    async function targets(s,lane,a,command,record){
      // matching0215440c returns party0 before target lookup and before both
      // repetition-table draws in these original context modes.
      if(!party(a)&&[0x320,0x321].includes(s.scenarioId))return{list:[0],already:true};
      let list=[],already=false;const view=await views(s,lane),own=party(a)?parties(s):enemies(s),other=party(a)?enemies(s):parties(s);
      if(command.confused&&party(a)){
        const pp=pad(own,4,null),out=await call(s,lane,'confusionTarget',{...identityInput(s,a),candidateIds:pp.map((x,i)=>x?.actorId??i),candidatePresent:pp.map(alive),targetScope:record.targetScope});
        if(!yes(out.supported))throw new Boundary('confusion-target',{actionId:record.id,sourceId:a.actorId});commitRandom(s,out);return{list:scalar(out.targetCount)?[scalar(out.targetId)]:[],already:true};
      }
      if(party(a)){
        let scope=record.targetScope;if(scope===6)scope=a.groupAttackPassive?3:2;if(scope===5)scope=a.weaponWide&2?3:a.weaponWide&1?4:2;
        const chosen=command.targets[0],group=command.targetGroup??actorById(s,chosen)?.group??0;
        if(scope===1)list=[a.actorId];
        else if(record.targetSide===1){
          let selectedGroup=group;
          const liveGroups=[0,1,2].filter(g=>other.some(x=>x.group===g&&alive(x)));
          if(scope===2){const target=actorById(s,chosen);if(!target)list=[chosen];else if(alive(target))list=[chosen];else{
              if(!other.some(x=>x.group===selectedGroup&&alive(x)))selectedGroup=liveGroups[await draw(s,lane,liveGroups.length)]??0;
              const candidates=other.filter(x=>x.group===selectedGroup&&alive(x));list=[candidates[await draw(s,lane,candidates.length)]?.actorId??0];}}
          else if(scope===4){if(!other.some(x=>x.group===selectedGroup&&alive(x)))selectedGroup=liveGroups[await draw(s,lane,liveGroups.length)]??0;list=other.filter(x=>x.group===selectedGroup&&alive(x)).map(x=>x.actorId);}
          else if(scope===3)list=other.filter(alive).map(x=>x.actorId);
        }else if(record.targetSide===2){
          if([2,7,8].includes(scope))list=[record.operation===18?chosen:alive(actorById(s,chosen))?chosen:a.actorId];
          else if(scope===3||scope===4)list=own.filter(x=>member(x)&&!x.excluded&&(record.operation===33||!x.dead)).map(x=>x.actorId);
        }
      }else{
        const rage=actorById(s,a.aux[6]),judgment=definition(a).judgment;
        if(judgment!==2&&a.aux[3]&&[2,5].includes(record.targetScope)&&record.targetSide===1&&alive(rage))list=[rage.actorId];
        else if([3,4].includes(record.targetScope)){
          if(record.operation===33)throw new Boundary('group-revival-capacity',{actionId:record.id});
          const group=actorById(s,command.targets[0])?.group??a.group;
          list=(record.targetSide===2?own.filter(x=>record.targetScope!==4||x.group===group):other).filter(x=>member(x)&&!x.excluded&&([18,33].includes(record.operation)||!x.dead)).map(x=>x.actorId);
        }else list=command.targets.slice(0,command.targetCount).filter(id=>{const x=actorById(s,id);return exists(x)&&([18,33].includes(record.operation)||!x.dead&&!x.excluded);});
        if(!list.length){
          const out=await call(s,lane,'target',{...population(s,a,view),seed:s.seed,position:s.position,selectorIndex:0,targetSide:record.targetSide,targetScope:record.targetScope,repeatCode:record.repeatCode,previousTargets:command.targets,previousTargetCount:0,enabled:true});
          if(!yes(out.supported))throw new Boundary('execution-target',{actionId:record.id,actor:a.actorId,targetSide:record.targetSide,targetScope:record.targetScope});commitRandom(s,out);list=out.targets.slice(0,scalar(out.targetCount));already=true;
        }
      }
      return{list,already};
    }
    async function appeal(s,lane,a){
      if(party(a))return false;
      for(const p of parties(s).filter(alive)){
        const out=await call(s,lane,'appeal',{seed:s.seed,position:s.position,partyActor:p.actor,enemyActor:a.actor,partyObjectFlags:[Number(exists(p)),Number(!!p.dead),Number(!!p.excluded),Number(p.mentalImmune??p.tension[2]>0)],enemyObjectFlags:[Number(exists(a)),Number(!!a.dead),Number(!!a.excluded),Number(a.mentalImmune??a.tension[2]>0)],charm:p.charm,preparation:a.preparation,resistance21:a.resistances[21],effectResistances:[a.resistances[16],a.resistances[12]],enabled:true});
        commitRandom(s,out);if(out.nextPreparation)a.preparation=Array.from(out.nextPreparation);if(yes(out.success))return true;
      }return false;
    }
    async function coverTarget(s,lane,targetId,record,priorCovered){
      const population=pad(roster(s),12,null),target=actorById(s,targetId),side=target?(party(target)?parties(s):enemies(s)):[];
      const out=await call(s,lane,'coverTarget',{seed:s.seed,position:s.position,
        actors:population.flatMap(a=>a?.actor??fields.map(key=>key==='id'?-1:0)),actorPresent:population.map(exists),
        rawStatusBytes:population.flatMap(a=>bytes32(a?.rawStatus??0)),rawFlagBytes:population.flatMap(a=>bytes32(a?.rawFlags??0)),
        coverTargetIds:population.map(a=>a?.coverTargetId??-1),rosterIds:pad(side.filter(alive).map(a=>a.actorId),8,-1),rosterCount:side.filter(alive).length,
        targetId,hitPresent:true,coverAllowed:!!record.coverAllowed,priorCovered,enabled:true});
      if(!yes(out.supported))throw new Boundary('cover-target',{actionId:record.id,targetId});
      commitRandom(s,out);return{targetId:scalar(out.nextTargetId),covered:yes(out.covered),priorCovered:yes(out.nextCovered),skipTarget:yes(out.skipTarget),routeKind:scalar(out.routeKind)};
    }
    async function repeatedHitTarget(s,lane,targetId,record){
      // Matching func_ov000_02154c68 is called for each hit after shared100.
      // It may replace a dead/excluded area target; the command's selected
      // target list and its repetition draws are not replayed here.
      const target=actorById(s,targetId);
      if(exists(target)&&!target.dead&&!target.excluded)return targetId;
      const partyTarget=targetId>=0&&targetId<=3;
      if(!partyTarget&&!exists(target))return targetId;
      const candidates=(partyTarget?parties(s):enemies(s)).filter(a=>alive(a)&&(partyTarget||record.targetScope!==4||a.group===target.group));
      return candidates.length?candidates[await draw(s,lane,candidates.length)].actorId:targetId;
    }
    const needsRedirect=(a,record)=>!!a&&([4,5,9].includes(value(a,'defend'))||!!(a.rawFlags&0x400)||!!a.counterSkill||
      (!!record.magicReflectable&&(!!(a.rawStatus&0x200)||!!a.equipmentReflect))||!!record.breathReflectable&&!!(a.rawStatus&0x4000000));
    async function redirectTarget(s,lane,source,targetId,record,sharedRoll,cache){
      const target=actorById(s,targetId),script=[0x320,0x321].includes(s.scenarioId),pp=parties(s).filter(a=>alive(a)&&(!script||a.actorId===0)),ee=enemies(s).filter(alive);
      const out=await call(s,lane,'redirectTarget',{seed:s.seed,position:s.position,enabled:true,sourceId:source.actorId,targetId,targetPresent:exists(target),hitPresent:true,
        targetRawStatusBytes:bytes32(target?.rawStatus??0),targetRawFlagsBytes:bytes32(target?.rawFlags??0),targetDefend:value(target,'defend'),actionId:record.id,targetSide:record.targetSide,
        magicReflectable:!!record.magicReflectable,breathReflectable:!!record.breathReflectable,counterable:!!record.counterAllowed,sourceWideWeapon:party(source)&&source.weaponWide>0,
        targetMagicReflectEquipment:!!target?.equipmentReflect,targetCounterSkill:!!target?.counterSkill,targetJob:target?.job??0,scenarioId:s.scenarioId,sharedRoll,
        priorCounterState:cache.counterState,priorRedirectTarget:cache.targetId,allowTension:true,substitute:false,specialReflect:false,
        partyRosterIds:pad(pp.map(a=>a.actorId),4,-1),partyRosterCount:pp.length,enemyRosterIds:pad(ee.map(a=>a.actorId),8,-1),enemyRosterCount:ee.length,combo:s.combo});
      if(!yes(out.supported))throw new Boundary('redirect-target',{actor:source.actorId,targetId,actionId:record.id});
      commitRandom(s,out);cache.counterState=scalar(out.nextCounterState);cache.targetId=scalar(out.nextRedirectTarget);s.combo=Array.from(out.nextCombo);return out;
    }
    async function execute(s,lane,command){
      let a=actorById(s,command.sourceId);if(!alive(a)||a.wakeSkip)return;
      const beforePosition=s.position,skipPostBefore=!!(a.rawFlags&0x100),appealed=await appeal(s,lane,a);
      const unable=['sleep','paralysis','confusion','skip'].some(key=>value(a,key)>0);
      if(!party(a)&&!appealed&&((command.actionId===503&&!unable)||definition(a).judgment===2))Object.assign(command,await ai(s,lane,a));
      const recovered=await call(s,lane,'primaryRecovery',{...identityInput(s,a),actionId:command.actionId,targetCount:command.targetCount,pendingRecoveryMessage:!!a.preparation[4],recoveryMessage:!!command.recoveryMessage});
      commitRandom(s,recovered);commitActor(a,recovered);command.actionId=scalar(recovered.nextAction);command.targetCount=scalar(recovered.nextTargetCount);command.recoveryMessage=yes(recovered.nextRecoveryMessage);
      let record=action(command.actionId);const targetIr=await model(ops.targetEffect),supported=targetIr.contract.actionIds.includes(command.actionId)||EVENT_ACTIONS.has(command.actionId);
      const prepared=await call(s,lane,'prepareRoute',{...identityInput(s,a),actionId:command.actionId,targetCount:command.targetCount,mpCost:record?.mpCost??0,prepaid:!!record?.prepaid,actionCategory:record?.planningCategory??0,spellFlag:!!record?.spell,rawStatusBytes:bytes32(a.rawStatus),rawFlagBytes:bytes32(a.rawFlags),mpDiscount:!!a.mpDiscount,priorState3c:a.state3c??0,actionSupported:supported,appealSuccess:appealed,recovered:yes(recovered.recovered)});
      commitActor(a,prepared);command.actionId=scalar(prepared.nextAction);command.targetCount=scalar(prepared.nextTargetCount);
      if(prepared.nextState3c)a.state3c=scalar(prepared.nextState3c);
      if(yes(prepared.needsConfusionSelection)){
        const out=await call(s,lane,'confusion',{seed:s.seed,position:s.position,actor:a.actor,sameSideAliveCount:(party(a)?parties(s):enemies(s)).filter(alive).length,scenarioId:s.scenarioId,enabled:true});commitRandom(s,out);command.actionId=scalar(out.actionId??out.nextAction);command.targetCount=0;command.targets=emptyTargets();command.confused=true;
      }
      if(!yes(prepared.supported)&&!command.confused)throw new Boundary('common-action',{actor:a.actorId,actionId:command.actionId,definitionId:a.definitionId});
      const occurrence=await commandEffects(s,lane,command,beforePosition),capture=s.camera.mode!=='numeric-only';
      await populationRoster(s,lane);
      const skipPost=skipPostBefore&&!['sleep','paralysis','confusion','skip'].some(key=>value(a,key)>0);
      if(!s.finished&&!skipPost)for(const sourceId of command.sources){const source=actorById(s,sourceId);if(!exists(source))continue;
        const beforeModifiers=[source.rawStatus,source.rawFlags,source.statusKinds,...source.rawRanks];
        const out=await call(s,lane,'postStatus',{...identityInput(s,source),targetValid:alive(actorById(s,source.aux[6]))});commitRandom(s,out);commitActor(source,out);
        const afterModifiers=[source.rawStatus,source.rawFlags,source.statusKinds,...source.rawRanks];occurrence.auxiliaryEvent||=afterModifiers.some((value,i)=>value!==beforeModifiers[i]);
      }
      if(capture)occurrence.presentationAfter={source:presentationSnapshot(a),target:presentationSnapshot(actorById(s,occurrence.impacts[0]?.targetId??occurrence.targets[0]))};
      occurrence.comboCount=s.combo[1];occurrence.endPosition=s.position;occurrence.outcome=s.outcome;s.turnRecords.push(occurrence);
    }
    async function commandEffects(s,lane,command,beforePosition=s.position){
      const a=actorById(s,command.sourceId);if(!alive(a))throw new Boundary('command-source',{actor:command.sourceId});
      let record=action(command.actionId),critical=false,consumeTension=false,counterOccurred=false;
      const occurrence={turn:s.turn,sourceId:a.actorId,participants:[...command.sources],actionId:command.actionId,targets:[],impacts:[],startPosition:beforePosition,event:EVENT_ACTIONS.has(command.actionId),auxiliaryEvent:false};
      const capture=s.camera.mode!=='numeric-only';if(capture)occurrence.presentationBefore={source:presentationSnapshot(a)};
      {
        if(!record)throw new Boundary('action-definition',{actionId:command.actionId});
        if(party(a)&&record.planningCategory===3)throw new Boundary('party-item-inventory',{actor:a.actorId,actionId:command.actionId,reasonDetail:'Party item effects require inventory state and the original item-consumption tail.'});
        if([11,12].includes(record.operation)&&(!s.enemyPopulation||party(a)))throw new Boundary('population-caller-state',{actor:a.actorId,actionId:record.id,reasonDetail:'Enemy summoning requires explicit group/type bytes, resource slots, numeric backing storage and the separate global BT random state.'});
        const selected=await targets(s,lane,a,command,record),begun=await call(s,lane,'commandBegin',{seed:s.seed,position:s.position,sourceActor:a.actor,sourceCriticalBaseRate:a.criticalBaseRate,sourceWideWeapon:party(a)&&a.weaponWide>0,sourceDoubleHitWeapon:!!a.doubleHitWeapon,sourceExtraHitSkill:!!a.extraHitSkill,sourceJob:a.job,actionId:command.actionId,targets:pad(selected.list,8,-1),targetCount:selected.list.length,targetsAlreadyRepeated:selected.already,mpDiscount:!!a.mpDiscount,mpProtected:!!(a.rawFlags&0x200),enabled:true});
        if(!yes(begun.supported))throw new Boundary('common-command-begin',{actor:a.actorId,actionId:command.actionId,reason:scalar(begun.reason)});
        commitRandom(s,begun);commitActor(a,begun,'Source');command.targets=Array.from(begun.nextTargets);command.targetCount=scalar(begun.nextTargetCount);occurrence.targets=command.targets.slice(0,command.targetCount);
        let priorCovered=false,previousTargetId=-1;const redirectCache=new Map(),needsAfterAction=[1,3,4].includes(record.afterAction),needsBladeRecoil=record.counterAllowed&&s.actors.some(actor=>(actor.rawFlags&0x20)||actor.armorRecoil),resultRecords=[];occurrence.routes=[];
        for(const [hitIndex,originalTargetId]of occurrence.targets.entries()){
          if(!alive(a)||value(a,'hp')<=0)break;
          // The original caller allocates and clears its current target record
          // before the shared draw and every target/cover eligibility check.
          // A skipped iteration therefore supplies an empty final record.
          const resultRecord=needsAfterAction||needsBladeRecoil?{recordAllocated:1,recordAppended:0,recordPrimaryPresent:0,recordPrimaryDamage:0,recordDamage:0,recordCounter:0,recordPostprocessed:0,recordEffectiveAction:record.id,recordScratchWritten:0,recordScratch:0,recordTargetId:-1}:null;
          if(resultRecord)resultRecords.push(resultRecord);
          let targetId=originalTargetId,sharedAlreadyDrawn=false,sharedRoll=0,coverResolved=false,effectSource=a,effectiveRecord=record,routingResolved=false,allowTension=true,resetCombo=false,isCounter=false,extraCritical=false,originalHitCritical=false,criticalAlreadyDrawn=yes(begun.commandCriticalMode),suppliedCritical=yes(begun.commandCritical);
          const repeatingArea=[3,4,5,7,8,11].includes(record.repeatCode)&&[3,4].includes(record.targetScope)&&[1,2].includes(record.targetSide);
          const coverState=roster(s).some(candidate=>value(candidate,'defend')>=6&&value(candidate,'defend')<=8);
          const redirectState=roster(s).some(candidate=>needsRedirect(candidate,record));
          if(priorCovered||coverState||repeatingArea||redirectState){
            // The caller's shared draw precedes cover selection. Forward it
            // to the effect graph so a selected guard never draws it twice.
            sharedRoll=await draw(s,lane,100);sharedAlreadyDrawn=true;
          }
          if(repeatingArea)targetId=await repeatedHitTarget(s,lane,targetId,record);
          const preCoverTarget=actorById(s,targetId);
          if(![18,33].includes(record.operation)&&(!exists(preCoverTarget)||preCoverTarget.dead)){
            if(!sharedAlreadyDrawn)await draw(s,lane,100);
            occurrence.routes.push({originalTargetId,targetId,skipped:true,reason:'missing-or-dead-target'});continue;
          }
          if(targetId!==previousTargetId){priorCovered=false;previousTargetId=targetId;}
          if(priorCovered||coverState){
            const preCoverTargetId=targetId,route=await coverTarget(s,lane,targetId,record,priorCovered);priorCovered=route.priorCovered;coverResolved=true;
            occurrence.routes.push({originalTargetId,preCoverTargetId,...route});
            if(route.skipTarget)continue;
            targetId=route.targetId;if(route.covered)occurrence.auxiliaryEvent=true;
          }
          const preRedirectTargetId=targetId;
          if(redirectState){
            const cache=redirectCache.get(targetId)??{counterState:0,targetId:-1};redirectCache.set(targetId,cache);
            const route=await redirectTarget(s,lane,a,targetId,record,sharedRoll,cache);routingResolved=true;allowTension=yes(route.nextAllowTension);resetCombo=yes(route.resetCombo);isCounter=yes(route.counter);counterOccurred||=isCounter;
            effectSource=actorById(s,scalar(route.nextSourceId));targetId=scalar(route.nextTargetId);effectiveRecord=isCounter?action(1):record;extraCritical=isCounter||yes(route.nextSubstitute)||yes(route.nextSpecialReflect);
            if(resultRecord){resultRecord.recordCounter=Number(isCounter);resultRecord.recordEffectiveAction=effectiveRecord.id;}
            occurrence.routes.push({originalTargetId,preRedirectTargetId,sourceId:effectSource?.actorId,targetId,kind:scalar(route.routeKind),counter:isCounter,substitute:yes(route.nextSubstitute),spellReflected:yes(route.nextSpecialReflect)});
            occurrence.auxiliaryEvent||=scalar(route.routeCount)>0;
            if(!exists(effectSource)||(![18,33].includes(record.operation)&&!alive(actorById(s,targetId))))continue;
          }
          const actualTarget=actorById(s,targetId),targetPresent=exists(actualTarget);
          const target=targetPresent?actualTarget:{actor:fields.map(key=>key==='maxHp'?1:key==='id'?255:0),aux:[0,0,0,0,0,0,-1,...Array(14).fill(0)],status:Array(7).fill(0),tension:[0,0,0],wakeSkip:0,config:Array(7).fill(0),preparation:Array(5).fill(0),resistances:Array(22).fill(100),species:0};
          if(capture&&!occurrence.presentationBefore.target)occurrence.presentationBefore.target=presentationSnapshot(target);
          const impactBefore=capture?{source:presentationSnapshot(effectSource),target:presentationSnapshot(target)}:null;
          if(routingResolved){
            const checked=await call(s,lane,'redirectCritical',{seed:s.seed,position:s.position,enabled:true,originalActionId:command.actionId,effectiveActionId:effectiveRecord.id,originalCriticalThreshold:value(a,'criticalThreshold'),effectiveCriticalThreshold:value(effectSource,'criticalThreshold'),originalCriticalBaseRate:a.criticalBaseRate,effectiveCriticalBaseRate:effectSource.criticalBaseRate,criticalHitCount:command.targetCount,commandCriticalMode:yes(begun.commandCriticalMode),commandCritical:yes(begun.commandCritical),extraCritical});
            commitRandom(s,checked);criticalAlreadyDrawn=true;suppliedCritical=yes(checked.critical);originalHitCritical=yes(checked.originalCritical);
          }
          const spawn=[11,12].includes(effectiveRecord.operation)?await preparePopulation(s,lane,effectSource,effectiveRecord):null;
          const out=await call(s,lane,'targetEffect',{seed:s.seed,position:s.position,scenarioId:s.scenarioId,populationContextAvailable:!!spawn,populationInsertionPossible:spawn?.inserted??false,sourceActor:effectSource.actor,sourceCriticalBaseRate:effectSource.criticalBaseRate,criticalHitCount:command.targetCount,hitIndex,sourceWideWeapon:party(effectSource)&&effectSource.weaponWide>0,targetActor:target.actor,targetPresent,targetMetal:!!target.metal,coverResolved,sharedAlreadyDrawn,sharedRoll,routingResolved,allowTension,resetCombo,skipComboUpdate:hitIndex>0&&yes(begun.suppressRepeatedCombo),isCounter,criticalAlreadyDrawn,suppliedCritical,originalSourceId:a.actorId,originalActionId:command.actionId,sourceMagic:effectSource.magic,sourcePackedScale:effectSource.packedScale,
            sourceWeaponClearGuard:party(effectSource)&&!!effectSource.weaponClearGuard,sourceWeaponAlwaysOne:party(effectSource)&&!!effectSource.weaponAlwaysOne,sourceWeaponSpeciesTenths:effectSource.weaponSpeciesTenths??[effectSource.weapon[2],...Array(11).fill(10)],sourceWeaponSpeciesProvided:true,
            sourceSpecies:effectSource.species??0,sourceEnemyMpDrain:!party(a)&&!!(definition(a)?.flags&0x80000),sourceWeaponMetalBonus:party(effectSource)&&!!effectSource.weaponMetalBonus,sourceRawFlagsBytes:bytes32(effectSource.rawFlags),sourceStatusKindsBytes:[effectSource.statusKinds&255,effectSource.statusKinds>>>8],sourceRawTimers:effectSource.rawTimers,targetRawTimers:target.rawTimers??Array(rawTimerWidth).fill(0),targetRawStatusBytes:bytes32(target.rawStatus??0),targetRawFlagsBytes:bytes32(target.rawFlags??0),targetRawRanks:target.rawRanks??Array(10).fill(0),targetStatusKindsBytes:[(target.statusKinds??0)&255,(target.statusKinds??0)>>>8],
            sourceHistory:[effectSource.ai.revengeId??-1,effectSource.ai.previousId??-1],targetHistory:[target.ai?.revengeId??-1,target.ai?.previousId??-1],sourceState3c:effectSource.state3c??0,targetState3c:target.state3c??0,sourceAux:effectSource.aux,targetAux:target.aux,sourceStatus:effectSource.status,targetStatus:target.status,sourceTension:effectSource.tension,targetTension:target.tension,sourceWakeSkip:effectSource.wakeSkip,targetWakeSkip:target.wakeSkip,sourceConfig:effectSource.config,targetConfig:target.config,sourcePreparation:effectSource.preparation,targetPreparation:target.preparation,resistances:target.resistances,sourceWeapon:[...effectSource.weapon.slice(0,3),target.species??effectSource.weapon[3]],chargedPartyCount:charged(s),coupBlocked:!!s.coupBlocked,actionId:effectiveRecord.id,commandCritical:yes(begun.commandCritical),preparedConfusion:!!command.confused,combo:s.combo,context:s.context,enabled:true});
          if(!yes(out.supported))throw new Boundary('common-target-effect',{actor:a.actorId,targetId,actionId:command.actionId});
          if(resultRecord){
            const primary=effectiveRecord.operation===1&&yes(out.active);
            Object.assign(resultRecord,{recordTargetId:targetId,recordAppended:Number(primary),recordPrimaryPresent:Number(primary),recordPrimaryDamage:scalar(out.damage),recordDamage:scalar(out.internalDamage),recordPostprocessed:Number(effectiveRecord.operation===1&&yes(out.accuracyPassed)),recordScratchWritten:Number(yes(out.afterActionScratchWritten)),recordScratch:scalar(out.afterActionScratch)});
          }
          commitRandom(s,out);commitActor(effectSource,out,'Source');if(targetPresent)commitActor(target,out,'Target');if(targetPresent&&yes(out.escaped)){target.excluded=true;target.dead=false;target.deathResetPending=false;target.escapeResetPending=true;target.ai.revengeId=-1;target.ai.previousId=-1;}if(out.nextCombo)s.combo=Array.from(out.nextCombo);if(out.nextContext)s.context=Array.from(out.nextContext);critical||=extraCritical?originalHitCritical:yes(out.critical);consumeTension||=yes(out.tensionUsed);
          if(spawn){
            let inserted=false,newActorId=-1;
            if(spawn.attempt){
              const insertion=await call(s,lane,'populationInsert',{...spawn.input,enabled:yes(out.operationHit),seed:out.populationSeed,position:out.populationPosition});
              if(!yes(insertion.supported)||yes(insertion.inserted)!==yes(out.populationInserted))throw Error('Population plan and operation commit disagree');
              // The main effect already advanced this same context draw at
              // its original operation position. Only the independent global
              // stream and population tensors are committed here.
              commitPopulation(s,insertion,spawn.monster);inserted=yes(insertion.inserted);newActorId=scalar(insertion.actorId);
            }
            occurrence.populationEvents??=[];occurrence.populationEvents.push({operation:effectiveRecord.operation,actionId:effectiveRecord.id,sourceId:effectSource.actorId,inserted,actorId:newActorId,entrySeed:Array.from(out.populationSeed),entryPosition:scalar(out.populationPosition)});occurrence.auxiliaryEvent=true;
          }
          occurrence.impacts.push({sourceId:effectSource.actorId,originalSourceId:a.actorId,targetId,originalTargetId,preRedirectTargetId,effectiveActionId:effectiveRecord.id,damage:scalar(out.damage),internalDamage:scalar(out.internalDamage),recovery:scalar(out.recoveryAmount),critical:yes(out.critical),originalCritical:extraCritical?originalHitCritical:yes(out.critical),hp:value(target,'hp'),mp:value(target,'mp'),effectApplied:yes(out.effectApplied),
            comboCount:s.combo[1],...(out.accuracyPassed?{accuracyPassed:yes(out.accuracyPassed)}:{}),...(out.dodged?{dodged:yes(out.dodged)}:{}),...(out.guarded?{guarded:yes(out.guarded)}:{}),...(out.blindMiss?{blindMiss:yes(out.blindMiss)}:{}),...(out.operationHit?{operationHit:yes(out.operationHit)}:{}),
            ...(capture?{presentationBefore:impactBefore,presentationAfter:{source:presentationSnapshot(effectSource),target:presentationSnapshot(target)}}:{})});
          occurrence.auxiliaryEvent||=yes(out.charged)||yes(out.angerActivated)||yes(out.escaped)||scalar(out.weaponMpDrained??0)>0||value(target,'hp')<=0;
        }
        for(const enemy of enemies(s).filter(alive)){
          const out=await call(s,lane,'enemyReaction',{seed:s.seed,position:s.position,sourceActor:a.actor,targetActor:enemy.actor,targetAux:enemy.aux,targetConfig:enemy.config,otherAngerChances:definition(enemy)?.otherAngerChances??[0,0],actionId:command.actionId,critical,enabled:true});commitRandom(s,out);commitActor(enemy,out,'Target');occurrence.auxiliaryEvent||=yes(out.angerActivated);
        }
        if(needsAfterAction){
          const ir=await model(ops.afterAction),recordInputs=Object.fromEntries(ir.contract.recordFields.map(name=>[name,pad(resultRecords.map(row=>row[name]),ir.contract.recordCapacity)])),before=capture?presentationSnapshot(a):null;
          const out=await call(s,lane,'afterAction',{seed:s.seed,position:s.position,enabled:true,present:exists(a),counterOccurred,actionId:command.actionId,
            sourceActor:a.actor,sourceAux:a.aux,sourceStatus:a.status,sourceTension:a.tension,sourcePreparation:a.preparation,sourceHistory:[a.ai.revengeId??-1,a.ai.previousId??-1],sourceWakeSkip:a.wakeSkip,sourceState3c:a.state3c,
            sourceRawStatusBytes:bytes32(a.rawStatus),sourceRawFlagsBytes:bytes32(a.rawFlags),sourceStatusKindsBytes:[a.statusKinds&255,a.statusKinds>>>8],sourceRawRanks:a.rawRanks,sourceRawTimers:a.rawTimers,...recordInputs});
          if(!yes(out.supported))throw new Boundary('common-after-action',{actor:a.actorId,actionId:command.actionId});
          commitRandom(s,out);commitActor(a,out,'Source');occurrence.auxiliaryEvent||=yes(out.eventCreated);
          occurrence.afterAction={records:resultRecords,recoveryAmount:scalar(out.recoveryAmount),hpRecovered:scalar(out.hpRecovered),mpRecovered:scalar(out.mpRecovered),selfDamage:scalar(out.selfDamage),deathReset:yes(out.deathReset),eventCreated:yes(out.eventCreated),...(capture?{presentationBefore:before,presentationAfter:presentationSnapshot(a)}:{})};
        }
        if(needsBladeRecoil){
          const ir=await model(ops.bladeRecoil),recordInputs=Object.fromEntries(ir.contract.recordFields.map(name=>[name,pad(resultRecords.map(row=>row[name]),ir.contract.recordCapacity,name==='recordTargetId'?-1:0)])),ids=[0,1,2,3,...Array.from({length:8},(_,i)=>192+i)],actors=ids.map(id=>actorById(s,id)),before=capture?presentationSnapshot(a):null;
          const out=await call(s,lane,'bladeRecoil',{seed:s.seed,position:s.position,enabled:true,present:exists(a),recoilAllowed:!!record.counterAllowed,scriptRestricted:[0x320,0x321].includes(s.scenarioId),sourceMetal:!!a.metal,
            sourceActor:a.actor,sourceAux:a.aux,sourceStatus:a.status,sourceTension:a.tension,sourcePreparation:a.preparation,sourceHistory:[a.ai.revengeId??-1,a.ai.previousId??-1],sourceWakeSkip:a.wakeSkip,sourceState3c:a.state3c,
            sourceRawStatusBytes:bytes32(a.rawStatus),sourceRawFlagsBytes:bytes32(a.rawFlags),sourceStatusKindsBytes:[a.statusKinds&255,a.statusKinds>>>8],sourceRawRanks:a.rawRanks,sourceRawTimers:a.rawTimers,...recordInputs,
            actorIds:ids,actorPresent:actors.map(actor=>Number(exists(actor))),actorDead:actors.map(actor=>Number(!!actor?.dead)),actorExcluded:actors.map(actor=>Number(!!actor?.excluded)),actorBladeDefense:actors.map(actor=>Number(!!(actor?.rawFlags&0x20))),actorArmorRecoil:actors.map(actor=>Number(!!actor?.armorRecoil)),actorParty:ids.map(id=>Number(id<4))});
          if(!yes(out.supported))throw new Boundary('common-blade-recoil',{actor:a.actorId,actionId:command.actionId});
          commitRandom(s,out);commitActor(a,out,'Source');occurrence.auxiliaryEvent||=yes(out.eventCreated);
          occurrence.bladeRecoil={selfDamage:scalar(out.selfDamage),amounts:Array.from(out.recoilAmounts),targetIds:Array.from(out.recoilTargetIds),applied:Array.from(out.recoilApplied),deathReset:yes(out.deathReset),eventCreated:yes(out.eventCreated),...(capture?{presentationBefore:before,presentationAfter:presentationSnapshot(a)}:{})};
        }
      }
      const end=await call(s,lane,'commandEnd',{seed:s.seed,position:s.position,scenarioId:s.scenarioId,sourceActor:a.actor,sourceAux:a.aux,sourceConfig:a.config,sourceTension:a.tension,sourceRawStatusBytes:bytes32(a.rawStatus),consumeTension,counterOccurred,actionId:command.actionId,context:s.context,opponentsAlive:(party(a)?enemies(s):parties(s)).some(alive),chargedPartyCount:charged(s),coupBlocked:!!s.coupBlocked,enabled:true});
      commitRandom(s,end);commitActor(a,end,'Source');s.context=Array.from(end.nextContext);occurrence.auxiliaryEvent||=yes(end.charged);outcome(s);
      if(capture)occurrence.presentationAfter={source:presentationSnapshot(a),target:presentationSnapshot(actorById(s,occurrence.impacts[0]?.targetId??occurrence.targets[0]))};
      occurrence.comboCount=s.combo[1];occurrence.endPosition=s.position;occurrence.outcome=s.outcome;return occurrence;
    }
    async function commands(s,lane){
      const unknown=roster(s).filter(a=>alive(a)&&(value(a,'defend')<0||value(a,'defend')>9));
      if(unknown.length)throw new Boundary('unknown-defend-state',{actors:unknown.map(a=>({actorId:a.actorId,defend:value(a,'defend')}))});
      for(const command of s.pendingCommands){if(s.finished)break;await execute(s,lane,command);}
    }
    async function finishTurn(s,lane){
      if(!s.finished){
        await populationRoster(s,lane,{recount:false,clearPending:true});
        const apply=async(a,operation)=>{
          const capture=s.camera.mode!=='numeric-only',before=capture?presentationSnapshot(a):null,selected=s.pendingCommands.filter(c=>c.sourceId===a.actorId),out=await call(s,lane,'periodic',{...identityInput(s,a),operation,defendMpRecovery:!!a.defendMpRecovery,selectedCommandCount:selected.length,selectedCommandKind:selected[0]?.selectedKind??0});commitRandom(s,out);commitActor(a,out);
          if(capture){
            const after=presentationSnapshot(a),changed=JSON.stringify(before)!==JSON.stringify(after),side=party(a)?'party':'enemy';
            s.periodicPresentationRecords.push({groupKey:side+'-'+['entry','hp','mp','poison'][operation],side,operation,actorId:a.actorId,order:s.periodicPresentationRecords.length,before,after,output:clone(out)});
            if(changed){if(operation===0)s.presentationExtraEvents=true;else s.periodicPresentationRequired=true;}
          }
        };
        for(const a of roster(s).filter(alive))await apply(a,0);
        const partySnapshot=parties(s).filter(alive);for(const operation of[1,2,3])for(const a of partySnapshot)await apply(a,operation);
        const enemySnapshot=enemies(s).filter(alive);for(const operation of[2,3])for(const a of enemySnapshot)await apply(a,operation);
        outcome(s);
        if(!s.finished){await draw(s,lane,100);for(const a of roster(s).filter(alive)){const out=await call(s,lane,'turnStatus',identityInput(s,a));commitRandom(s,out);commitActor(a,out);}}
        await populationRoster(s,lane);
      }
      s.completedTurns++;s.turn++;s.firstTurn=false;outcome(s);await views(s,lane);
      s.nowstate.push({turn:s.turn-1,seed:[...s.seed],position:s.position,outcome:s.outcome,actors:s.actors.map(a=>({actorId:a.actorId,hp:value(a,'hp'),mp:value(a,'mp'),actor:[...a.actor],aux:[...a.aux],status:[...a.status],tension:[...a.tension],dead:a.dead})),records:clone(s.turnRecords)});
    }
    async function presentation(s,lane){
      s.camera.records??=[];s.camera.records.push(...clone(s.turnRecords));
      if(s.camera.mode==='numeric-only'){s.camera.complete=false;s.camera.scope='Numerical transition only; camera RNG has intentionally not been applied.';return;}
      if(typeof presentationRunner==='function'){
        const result=await presentationRunner({state:clone(s),records:clone(s.turnRecords),runGraph:(name,inputs)=>Promise.all(inputs.map(input=>call(s,lane,name,input))),getModel:model});
        if(result?.seed)s.seed=Array.from(result.seed);if(result?.position!==undefined)s.position=scalar(result.position);if(result?.camera)s.camera=clone(result.camera);
        if(result?.budgetExhausted)throw new Budget(result.stopReason??'Presentation transition budget exhausted');
        if(s.periodicPresentationRequired&&result?.periodicComplete!==true)throw new Boundary('periodic-presentation',{reasonDetail:'Periodic before/after groups have not been admitted by the shared event producer.'});
        if(!result?.complete)throw new Boundary('presentation',{details:result?.unresolvedEffects??'Incomplete presentation transition'});return;
      }
      throw new Boundary('presentation-initial-state',{row4Words:s.camera.row4Words,reason:'The shared camera requires an initial visual/program state and event schedule; numeric-only is an explicit separate mode.'});
    }
    const handlers={'turn-begin':turnBegin,initiative,planning,'planning-preprocess':planningPreprocess,priority:async(s)=>priority(s),commands,finish:finishTurn,presentation};
    await Promise.all(states.map(async(s,lane)=>{try{
      outcome(s);if(s.finished&&boundary!=='command-effects'){s.phase='terminal';s.requestedTurnsComplete=true;s.requestedCommandsComplete=true;return;}
      if(boundary==='command-effects'){
        // The exact production command loop is also an explicit lower-level
        // API. It excludes planning, primary/post recovery and turn finish.
        if(!Array.isArray(s.pendingCommands)||!s.pendingCommands.length)throw Error('command-effects requires explicit initial commands');
        s.turnRecords=[];s.phase='command-effects';
        // This explicit lower-level caller can be invoked even when the
        // enclosing battle would already be terminal. The original command
        // entry has no battle-outcome gate; subsequent supplied commands
        // still stop after the first command computes a terminal outcome.
        for(const command of s.pendingCommands){s.turnRecords.push(await commandEffects(s,lane,command));if(s.finished)break;}
        s.phase='command-effects-complete';s.requestedCommandsComplete=true;return;
      }
      for(let n=0;n<maxTurns;n++){
        if(s.camera.mode!=='numeric-only'&&s.camera.nextNumericTurnReady===false&&s.completedTurns>0)throw new Boundary('presentation-to-next-turn',{reasonDetail:'The asynchronous presentation lifecycle has not yet returned to the numerical turn boundary.'});
        s.turnRecords=[];s.presentationExtraEvents=false;s.periodicPresentationRecords=[];s.periodicPresentationRequired=false;
        for(const phase of program.phases){s.phase=phase.op??phase.id??phase.name;if(boundary==='numeric-turn'&&s.phase==='presentation')break;const handler=handlers[s.phase];if(!handler)throw Error('Unknown common phase '+s.phase);await handler(s,lane);}
        if(boundary==='numeric-turn'&&s.camera.mode!=='numeric-only'){s.camera.nextNumericTurnReady=false;s.camera.complete=false;s.camera.numericTurnPending=true;}
        await onProgress?.({lane,turn:s.turn,completedTurns:s.completedTurns,position:s.position,outcome:s.outcome,graphCalls,transitions:s.transitions});if(s.finished)break;
      }s.phase=boundary==='numeric-turn'?'numeric-turn-complete':'ready';s.requestedTurnsComplete=true;
    }catch(error){
      if(error instanceof Budget){s.budgetExhausted=true;s.stopReason=error.message;}
      else if(error instanceof Boundary){s.supported=false;s.unresolvedEffects.push({phase:s.phase,reason:error.message,...error.details});}
      else throw error;
    }}));
    const unresolvedEffects=states.flatMap((s,lane)=>s.unresolvedEffects.map(value=>({lane,...value}))),complete=states.every(s=>(boundary==='command-effects'?s.requestedCommandsComplete:s.requestedTurnsComplete)&&s.supported&&!s.budgetExhausted);
    return{rows:states,traces:trace?traces:undefined,complete,boundary,wholeBattleComplete:boundary==='turn'&&complete&&states.every(s=>s.finished&&s.camera.complete),numericOnly:states.every(s=>s.camera.mode==='numeric-only'),unresolvedEffects,budgetExhausted:states.some(s=>s.budgetExhausted),programHash,moduleHashes,inputHash,graphCalls,batchRows,scope:'One common actor-array controller and the same ONNX modules for all input definitions. complete means the requested bounded scope completed, not all game actions or camera states are covered.'};
  }
  return{run,runCommandEffects:options=>run({...options,boundary:'command-effects'}),runNumericTurn:options=>run({...options,boundary:'numeric-turn',maxTurns:1}),programHash,moduleHashes,program};
}
