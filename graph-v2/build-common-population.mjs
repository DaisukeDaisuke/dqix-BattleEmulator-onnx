// Original shared enemy-slot insertion. Monster IDs select input definitions,
// never an encounter-specific execution program.
import {Graph} from './graph-builder.mjs';
import {RandomGraph} from './transition-graphs.mjs';
import {ACTOR_FIELDS,COMMON_AUX_FIELDS,COMMON_STATUS_FIELDS,COMMON_PREPARATION_FIELDS,commonAuxDefault} from './common-battle-schema.mjs';
import {COMMON_RAW_TIMER_FIELDS} from './common-modifier-rules.mjs';
import {COMMON_SUMMON_ROWS,COMMON_SUMMON_AUTHORITY} from './common-summon-rules.mjs';
import {fileURLToPath} from 'node:url';

export const COMMON_POPULATION_ROSTER_BYTES=108;
export const COMMON_POPULATION_STATS_BYTES=164;
export const COMMON_POPULATION_PENDING_FIELDS=Object.freeze(['pendingMonsterIds','pendingHp','pendingMp','pendingGroups','pendingLetters']);
const byte={min:0,max:255,integer:true},u16={min:0,max:65535,integer:true};

export function buildCommonPopulationInsert({planOnly=false}={}){
  const g=new Graph(planOnly?'rom-common-population-plan':'rom-common-population-insert',{
    inputContractVersion:1,
    scope:'One complete original enemy population insertion helper, including cached roster counts, group/type records, excluded-before-dead reuse, letters, stat initialization and both random states. Visual activation and enclosing action/event construction are separate phases.',
    authority:{helper:'JPN02162aec / matching func_ov000_02161380',stats:'JPN02089f2c / matching func_02089630',finalHp:'JPN02049754 / matching func_02048934',globalRandom:'JPN0207535c returns original global02108d20'},
    layouts:{rosterBytes:COMMON_POPULATION_ROSTER_BYTES,groupOffset:4,groupStride:24,typeOffset:76,typeStride:8,statsBytes:COMMON_POPULATION_STATS_BYTES,slots:8},
    random:'Successful insertion advances the battle-context stream once for final HP and the separate global BT stream once for an intermediate HP value. The latter is overwritten before return. Both stream states remain explicit.',
    pending:'The original helper sets spawnPending. Reused actors retain their current object definition/group here; numeric turn finish clears living roster members pending flags before periodic processing.',
    boundary:'Caller supplies original record availability and resource-loaded state. Initial group lists must contain valid slot indices; letter allocation must have a free bit within one original18-step cycle. Unknown visual/world side effects are outside these numeric outputs.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,globalSeed:[1,0,0,0,0,0,0,0],globalPosition:1,enabled:true,monsterId:1,requestedGroup:-1,resourceLoaded:true,definitionPresent:true,auxiliaryPresent:true,rosterRaw:Array(108).fill(0),actorPresent:Array(8).fill(0),actorSpawnPending:Array(8).fill(0),actorMonsterIds:Array(8).fill(0),actorGroups:Array(8).fill(0),actorRawStats:Array(1312).fill(0),storageRawStats:Array(1312).fill(0),definitionRaw:Array(132).fill(0),...Object.fromEntries(COMMON_POPULATION_PENDING_FIELDS.map(name=>[name,Array(8).fill(0)]))},inputDomains:{},feedback:{seed:'nextSeed',position:'nextPosition',globalSeed:'nextGlobalSeed',globalPosition:'nextGlobalPosition',rosterRaw:'nextRosterRaw',actorPresent:'nextActorPresent',actorSpawnPending:'nextActorSpawnPending',actorMonsterIds:'nextActorMonsterIds',actorGroups:'nextActorGroups',actorRawStats:'nextActorRawStats',storageRawStats:'nextStorageRawStats',...Object.fromEntries(COMMON_POPULATION_PENDING_FIELDS.map(name=>[name,'next'+name[0].toUpperCase()+name.slice(1)]))}
  });
  const input=(name,width=1,dtype='float32',domain=byte)=>{g.contract.inputDomains[name]={...domain,width};return g.input(name,['N',width],dtype);};
  const bool=name=>input(name,1,'bool',{values:[false,true,0,1]}),mod=(n,m)=>g.sub(n,g.mul(g.floor(g.mul(n,1/m)),m)),bit=(n,b)=>mod(g.floor(g.mul(n,2**-b)),2),num=b=>g.cast(b,'float32');
  const word=(values,offset)=>g.add(values[offset],g.mul(values[offset+1],256));
  const first=conditions=>conditions.reduceRight((value,condition,i)=>g.where(condition,i,value),g.constant(-1));
  const choose=(values,index,fallback=0)=>values.reduceRight((value,item,i)=>g.where(g.eq(index,i),item,value),typeof fallback==='number'?g.constant(fallback):fallback);
  // GatherElements does not broadcast its batch axis. Even a fixed offset
  // therefore needs one index row per input lane.
  const select=(values,index,width=1)=>g.op('GatherElements',[values,g.cast(g.add(index,g.mul(monster,0)),'int32')],{axis:1},{shape:['N',width]});
  const slice=(values,index,width)=>select(values,g.add(index,g.constant(Array.from({length:width},(_,i)=>i),'float32',[1,width])),width);
  const seed=input('seed',8),position=input('position',1,'int32',{min:0,max:2147483000,integer:true}),globalSeed=input('globalSeed',8),globalPosition=input('globalPosition',1,'int32',{min:0,max:2147483000,integer:true}),enabled=bool('enabled'),monster=input('monsterId',1,'float32',{min:0,max:32767,integer:true}),requested=input('requestedGroup',1,'float32',{min:-1,max:2,integer:true}),loaded=bool('resourceLoaded'),definitionPresent=bool('definitionPresent'),auxiliaryPresent=bool('auxiliaryPresent');
  const rosterInput=input('rosterRaw',108),original=g.split(rosterInput,108),presentInput=input('actorPresent',8,'float32',{min:0,max:1,integer:true}),present=g.split(presentInput,8),pendingInput=input('actorSpawnPending',8),pending=g.split(pendingInput,8),ids=g.split(input('actorMonsterIds',8,'float32',u16),8),groups=g.split(input('actorGroups',8),8),actorStats=input('actorRawStats',1312),storageStats=input('storageRawStats',1312),definition=g.split(input('definitionRaw',132),132),pendingFields=Object.fromEntries(COMMON_POPULATION_PENDING_FIELDS.map(name=>[name,g.split(input(name,8,'float32',u16),8)]));
  const live=mod(original[1],16),groupCount=mod(g.floor(g.mul(original[1],1/16)),4),typeCount=g.floor(g.mul(original[1],1/64)),capacity=g.where(g.eq(monster,266),8,5),initialGate=g.and(enabled,loaded,g.lt(live,capacity));
  const groupRows=Array.from({length:3},(_,i)=>original.slice(4+i*24,28+i*24)),groupIds=groupRows.map(row=>word(row,0)),groupRegistered=groupRows.map(row=>mod(row[10],16)),groupLive=groupRows.map(row=>g.floor(g.mul(row[10],1/16))),emptySlot=first(present.map(p=>g.eq(p,0)));
  const matchingGroup=first(groupIds.map((id,i)=>g.and(g.lt(i,groupCount),g.eq(monster,id)))),existing=g.or(g.ge(requested,0),g.ge(matchingGroup,0)),append=g.and(g.not(existing),g.lt(groupCount,3)),retire=g.and(g.not(existing),g.ge(groupCount,3)),emptyGroup=first(groupLive.map((count,i)=>g.and(g.lt(i,groupCount),g.eq(count,0)))),group=g.where(existing,g.where(g.ge(requested,0),requested,matchingGroup),g.where(append,groupCount,emptyGroup)),groupAvailable=g.ge(group,0);
  const selectedOldGroup=Array.from({length:24},(_,offset)=>choose(groupRows.map(row=>row[offset]),group)),oldRegistered=mod(selectedOldGroup[10],16),replaceSlot=g.and(retire,g.lt(emptySlot,0)),freeSlot=g.where(replaceSlot,selectedOldGroup[2],emptySlot),retiredSkip=num(replaceSlot);
  const typeRows=Array.from({length:4},(_,i)=>original.slice(76+i*8,84+i*8)),typeIds=typeRows.map(row=>word(row,2)),desiredTypeId=g.where(existing,choose(groupIds,group),monster),foundType=first(typeIds.map((id,i)=>g.and(g.lt(i,typeCount),g.eq(id,desiredTypeId)))),createType=g.or(append,g.and(retire,g.lt(foundType,0))),type=g.where(createType,typeCount,foundType);
  // A packed type count increments modulo4 in the original. Preserve that
  // byte-level behavior, including a subsequent -1 type index into the last
  // eight bytes of the third group record; no invented saturation is applied.
  const listsValid=g.and(...groupRows.flatMap((row,gi)=>[g.le(groupRegistered[gi],8),...row.slice(2,10).map((slot,i)=>g.or(g.ge(i,groupRegistered[gi]),g.lt(slot,8)))])),requestedValid=g.or(g.lt(requested,0),g.lt(requested,groupCount)),supportedInitial=g.and(listsValid,requestedValid),prepare=g.and(initialGate,groupAvailable,supportedInitial),newGroup=g.and(prepare,g.not(existing)),newType=g.and(prepare,createType);
  let roster=original.map(value=>value);
  const nextGroupCount=g.where(append,g.add(groupCount,1),groupCount),nextTypeCount=g.where(createType,mod(g.add(typeCount,1),4),typeCount);
  roster[1]=g.where(prepare,g.add(live,g.add(g.mul(nextGroupCount,16),g.mul(nextTypeCount,64))),roster[1]);
  for(let gi=0;gi<3;gi++){
    const change=g.and(newGroup,g.eq(group,gi)),fresh=Array.from({length:24},()=>g.constant(0));fresh[0]=mod(monster,256);fresh[1]=g.floor(g.mul(monster,1/256));
    for(let i=0;i<8;i++)fresh[13+i]=g.where(g.and(retire,g.lt(i,g.sub(oldRegistered,retiredSkip))),choose(selectedOldGroup.slice(2,10),g.add(i,retiredSkip)),0);
    fresh[21]=g.where(retire,g.sub(oldRegistered,retiredSkip),0);
    for(let offset=0;offset<24;offset++)roster[4+gi*24+offset]=g.where(change,fresh[offset],roster[4+gi*24+offset]);
  }
  for(let ti=0;ti<4;ti++)for(let offset=0;offset<8;offset++){
    const value=offset===0?g.constant(1):offset===2?mod(monster,256):offset===3?g.floor(g.mul(monster,1/256)):g.constant(0),at=76+ti*8+offset;roster[at]=g.where(g.and(newType,g.eq(type,ti)),value,roster[at]);
  }
  const preparedRoster=g.cat(roster),selectedGroup=g.split(slice(preparedRoster,g.add(4,g.mul(g.max(group,0),24)),24),24),registered=mod(selectedGroup[10],16),slots=selectedGroup.slice(2,10);
  const actorField=(slot,offset)=>select(actorStats,g.add(g.mul(g.max(0,g.min(slot,7)),164),offset));
  const eligibleSlots=slots.map((slot,i)=>g.and(g.lt(i,registered),g.gt(choose(present,slot),0),g.eq(choose(pending,slot),0))),excluded=slots.map((slot,i)=>g.and(eligibleSlots[i],g.gt(bit(actorField(slot,0x19),5),0))),dead=slots.map((slot,i)=>g.and(eligibleSlots[i],g.gt(bit(actorField(slot,0x14),0),0))),excludedIndex=first(excluded),deadIndex=first(dead),reuseIndex=g.where(g.ge(excludedIndex,0),excludedIndex,deadIndex),reuse=g.ge(reuseIndex,0),slot=g.where(reuse,choose(slots,reuseIndex),freeSlot),hasSlot=g.and(g.ge(slot,0),g.lt(slot,8));
  const typeStart=g.add(76,g.mul(type,8)),selectedType=g.split(slice(preparedRoster,typeStart,8),8),used=selectedType.slice(4,8),power=g.constant([1,2,4,8,16,32,64,128],'float32',[8]);
  const usedBit=letter=>{const index=g.floor(g.mul(letter,1/8)),weight=g.op('Gather',[power,g.cast(mod(letter,8),'int32')],{axis:0},{shape:['N',1]}),value=choose(used,index);return mod(g.floor(g.op('Div',[value,weight])),2);};
  let letter=selectedType[0];for(let i=0;i<18;i++)letter=g.where(g.gt(usedBit(letter),0),g.where(g.ge(g.add(letter,1),18),1,g.add(letter,1)),letter);
  const letterValid=g.and(g.ge(selectedType[0],0),g.lt(selectedType[0],18),g.eq(usedBit(letter),0)),wouldInsert=g.and(prepare,definitionPresent,auxiliaryPresent,hasSlot),supported=g.and(supportedInitial,g.or(g.not(wouldInsert),letterValid)),success=g.and(wouldInsert,supported),newSlot=g.and(success,g.not(reuse)),reused=g.and(success,reuse),actualLetter=g.where(g.and(g.not(reuse),g.eq(letter,1)),0,letter);
  if(planOnly){
    g.contract.scope='Pure insertion eligibility and slot plan from initial population state. It consumes no random state and commits no roster mutation. The common effect caller uses this result solely to place the successful insertion draw before its conditional callback tail.';
    g.contract.feedback={};
    for(const[name,value]of Object.entries({supported,inserted:success,reused,actorId:g.where(success,g.add(slot,192),-1)}))g.output(value,name);
    return g;
  }
  const rng=new RandomGraph(g,seed,position),globalRng=new RandomGraph(g,globalSeed,globalPosition),hpRange=rng.range(success,Math.fround(.8),1);globalRng.range(success,Math.fround(.8),1);
  const hp=mod(g.floor(g.add(.5,g.mul(word(definition,0x5c),hpRange))),65536),mp=word(definition,0x5e),selectedOld=g.split(slice(actorStats,g.mul(g.max(slot,0),164),164),164),selectedStorage=g.split(slice(storageStats,g.mul(g.max(slot,0),164),164),164),initialStats=selectedOld.map((value,i)=>g.where(reuse,value,selectedStorage[i]));
  const reset=initialStats.map(value=>value),scalar=value=>g.add(g.mul(monster,0),value),writeWord=(at,value)=>{reset[at]=mod(value,256);reset[at+1]=g.floor(g.mul(value,1/256));};
  for(let i=0;i<14;i++)reset[i]=scalar(0);
  for(let i=0x14;i<=0x21;i++)reset[i]=scalar(0);
  reset[0x22]=scalar(0);reset[0x23]=g.mul(g.floor(g.mul(initialStats[0x23],1/128)),128);reset[0x24]=scalar(0);reset[0x25]=g.where(reuse,0,actualLetter);reset[0x26]=scalar(0);
  for(let i=0x28;i<=0x2f;i++)reset[i]=scalar(255);
  reset[0x30]=reset[0x31]=scalar(0);for(let i=0x32;i<=0x35;i++)reset[i]=scalar(255);for(let i=0x36;i<=0x3a;i++)reset[i]=scalar(0);
  // Actual JPN initialization clears the whole charge byte. The resistance
  // copy is24 bytes: its two tail bytes follow the22 elemental columns.
  reset[0x3b]=scalar(0);reset[0x3c]=g.mul(g.floor(g.mul(initialStats[0x3c],1/64)),64);reset[0x3d]=scalar(0);
  for(let i=0;i<24;i++)reset[0x3e+i]=definition[0x6c+i];for(let i=0x58;i<=0xa1;i++)reset[i]=scalar(0);
  writeWord(0,hp);writeWord(2,mp);writeWord(4,hp);writeWord(6,mp);for(let i=0;i<6;i++)reset[8+i]=definition[0x60+i];
  for(let i=0;i<3;i++)reset[0x10+i]=definition[0x68+i];reset[0x13]=g.add(mod(definition[0x6b],64),g.mul(g.floor(g.mul(initialStats[0x13],1/64)),64));
  const resetStats=g.cat(reset),oldLetter=selectedOld[0x25],nextCounter=g.where(g.ge(g.add(letter,1),18),1,g.add(letter,1));
  const definitionLevel=input('definitionLevel',1,'float32',{min:0,max:127,integer:true}),definitionDodge=input('definitionDodgeRate',1,'float32',{min:0,max:100}),definitionGuard=input('definitionGuardRate',1,'float32',{min:0,max:100});
  Object.assign(g.contract.defaults,{definitionLevel:0,definitionDodgeRate:0,definitionGuardRate:0});
  const insertedActor={hp,maxHp:hp,mp,maxMp:mp,baseAttack:word(definition,0x60),baseDefense:word(definition,0x62),baseAgility:word(definition,0x64),level:definitionLevel,dodgeRate:definitionDodge,guardRate:definitionGuard,id:g.add(slot,192)};
  const magicMight=g.add(g.floor(g.mul(reset[0x11],1/4)),g.mul(mod(reset[0x12],16),64)),magicMending=g.add(g.floor(g.mul(reset[0x12],1/16)),g.mul(mod(reset[0x13],64),16));
  g.contract.insertedActorFields=ACTOR_FIELDS;g.contract.insertedAuxFields=COMMON_AUX_FIELDS;g.contract.insertedStatusFields=COMMON_STATUS_FIELDS;g.contract.insertedPreparationFields=COMMON_PREPARATION_FIELDS;
  for(const[name,value]of Object.entries({insertedActor:g.cat(ACTOR_FIELDS.map(name=>insertedActor[name]??scalar(0))),insertedAux:g.add(scalar(0),g.constant(commonAuxDefault(),'float32',[1,COMMON_AUX_FIELDS.length])),insertedStatus:g.add(scalar(0),g.constant(Array(COMMON_STATUS_FIELDS.length).fill(0),'float32',[1,COMMON_STATUS_FIELDS.length])),insertedPreparation:g.cat([scalar(0),scalar(-1),scalar(0),scalar(0),bit(reset[0x3c],6)]),insertedTension:g.add(scalar(0),g.constant([0,0,0],'float32',[1,3])),insertedHistory:g.add(scalar(0),g.constant([-1,-1],'float32',[1,2])),insertedRawStatusBytes:g.cat(reset.slice(0x14,0x18)),insertedRawFlagsBytes:g.cat(reset.slice(0x18,0x1c)),insertedStatusKindsBytes:g.cat(reset.slice(0x22,0x24)),insertedRawRanks:g.add(scalar(0),g.constant(Array(10).fill(0),'float32',[1,10])),insertedRawTimers:g.add(scalar(0),g.constant(Array(COMMON_RAW_TIMER_FIELDS.length).fill(0),'float32',[1,COMMON_RAW_TIMER_FIELDS.length])),insertedMagic:g.cat([magicMight,magicMending]),insertedResistances:g.cat(reset.slice(0x3e,0x54)),insertedState3c:reset[0x3c],insertedStatsRaw:resetStats}))g.output(value,name);
  const updatedUsed=used.map((value,byteIndex)=>{let result=value;for(let bitIndex=0;bitIndex<8;bitIndex++){const mask=2**bitIndex,newBit=g.and(success,g.eq(actualLetter,byteIndex*8+bitIndex)),oldBit=g.and(reused,g.eq(oldLetter,byteIndex*8+bitIndex));result=g.where(newBit,g.add(result,g.mul(g.sub(1,bit(result,bitIndex)),mask)),result);result=g.where(oldBit,g.sub(result,g.mul(bit(result,bitIndex),mask)),result);}return result;});
  roster[0]=g.where(newSlot,mod(g.add(roster[0],1),256),roster[0]);roster[1]=g.where(success,g.add(roster[1],1),roster[1]);
  for(let gi=0;gi<3;gi++){
    const change=g.and(success,g.eq(group,gi)),count=roster[4+gi*24+10];roster[4+gi*24+10]=g.where(change,g.add(count,g.where(reuse,16,17)),count);
    for(let i=0;i<8;i++){const at=4+gi*24+2+i;roster[at]=g.where(g.and(newSlot,g.eq(group,gi),g.eq(registered,i)),slot,roster[at]);}
  }
  // The actual selected type may start at68 after original count wrap. The
  // write address, rather than a guessed type-count repair, controls updates.
  for(let i=0;i<108;i++){roster[i]=g.where(g.and(success,g.eq(typeStart,i)),nextCounter,roster[i]);for(let j=0;j<4;j++)roster[i]=g.where(g.and(success,g.eq(g.add(typeStart,4+j),i)),updatedUsed[j],roster[i]);}
  const nextStats=[],nextStorage=[];for(let i=0;i<8;i++){nextStats.push(g.where(g.and(success,g.eq(slot,i)),resetStats,slice(actorStats,g.constant(i*164),164)));nextStorage.push(g.where(g.and(newSlot,g.eq(slot,i)),resetStats,slice(storageStats,g.constant(i*164),164)));}
  const guard=value=>g.where(supported,value,rosterInput),updatedFields=Object.fromEntries(COMMON_POPULATION_PENDING_FIELDS.map((name,field)=>['next'+name[0].toUpperCase()+name.slice(1),g.cat(pendingFields[name].map((value,i)=>g.where(g.and(success,g.eq(slot,i)),[monster,hp,mp,group,actualLetter][field],value)))]));
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,nextGlobalSeed:globalRng.seed,nextGlobalPosition:globalRng.position,consumed:g.sub(rng.position,position),globalConsumed:g.sub(globalRng.position,globalPosition),supported,inserted:success,reused,actorId:g.where(success,g.add(slot,192),-1),slot:g.where(success,slot,-1),group:g.where(success,group,-1),letter:g.where(success,actualLetter,-1),nextRosterRaw:guard(g.cat(roster)),nextActorRawStats:g.cat(nextStats),nextStorageRawStats:g.cat(nextStorage),nextActorPresent:g.cat(present.map((value,i)=>g.where(g.and(success,g.eq(slot,i)),1,value))),nextActorSpawnPending:g.cat(pending.map((value,i)=>g.where(g.and(success,g.eq(slot,i)),1,value))),nextActorMonsterIds:g.cat(ids.map((value,i)=>g.where(g.and(newSlot,g.eq(slot,i)),monster,value))),nextActorGroups:g.cat(groups.map((value,i)=>g.where(g.and(newSlot,g.eq(slot,i)),group,value))),...updatedFields}))g.output(value,name);
  return g;
}

export const buildCommonPopulationPlan=()=>buildCommonPopulationInsert({planOnly:true});

export function buildCommonPopulationRequest(){
  const g=new Graph('rom-common-population-request',{inputContractVersion:1,scope:'Shared operation11/12 request decoder and original resource lookup. Unknown operation12 rows produce no insertion attempt.',authority:COMMON_SUMMON_AUTHORITY,
    defaults:{enabled:true,actionId:344,operation:12,sourceMonsterId:1,sourceGroup:0,loadedMonsterIds:[-1,-1,-1,-1]}});
  const enabled=g.input('enabled',['N',1],'bool'),action=g.input('actionId'),operation=g.input('operation'),source=g.input('sourceMonsterId'),group=g.input('sourceGroup'),loaded=g.split(g.input('loadedMonsterIds',['N',4]),4);
  let monster=g.constant(-2),count=g.constant(-1);for(const row of COMMON_SUMMON_ROWS){const match=g.eq(action,row.actionId);monster=g.where(match,row.monsterId,monster);count=g.where(match,row.count,count);}
  const own=g.eq(operation,11),supported=g.or(own,g.eq(operation,12)),id=g.where(own,source,monster),attempt=g.and(enabled,supported,g.or(own,g.gt(count,0)));
  for(const[name,value]of Object.entries({supported,monsterId:id,requestedGroup:g.where(g.eq(action,242),group,-1),attempt,resourceLoaded:g.and(attempt,g.or(...loaded.map(value=>g.eq(value,id))))}))g.output(value,name);return g;
}

export function buildCommonPopulationRoster(){
  const g=new Graph('rom-common-population-roster',{inputContractVersion:1,scope:'Original cached live-count recount and turn-finish living-member spawnPending clear. Registered/type/retired records stay byte-identical.',
    authority:{recount:'JPN02157614 / matching func_ov000_02155e94',afterCommand:'matching func_ov000_02157d3c',finish:'JPN0215fe68 / matching func_ov000_0215e6e8'},
    defaults:{rosterRaw:Array(108).fill(0),actorPresent:Array(8).fill(0),actorDead:Array(8).fill(0),actorExcluded:Array(8).fill(0),actorSpawnPending:Array(8).fill(0),recount:true,clearPending:false},feedback:{rosterRaw:'nextRosterRaw',actorSpawnPending:'nextActorSpawnPending'}});
  const raw=g.input('rosterRaw',['N',108]),rows=g.split(raw,108),present=g.split(g.input('actorPresent',['N',8]),8),dead=g.split(g.input('actorDead',['N',8]),8),excluded=g.split(g.input('actorExcluded',['N',8]),8),pending=g.split(g.input('actorSpawnPending',['N',8]),8),recount=g.input('recount',['N',1],'bool'),clear=g.input('clearPending',['N',1],'bool');
  const mod=(n,m)=>g.sub(n,g.mul(g.floor(g.mul(n,1/m)),m)),pick=(values,index)=>values.reduce((v,item,i)=>g.where(g.eq(index,i),item,v),g.constant(0)),count=mod(g.floor(g.mul(rows[1],1/16)),4),liveBySlot=present.map((p,i)=>g.and(g.gt(p,0),g.eq(dead[i],0),g.eq(excluded[i],0))),registered=Array.from({length:8},()=>g.eq(0,1));let total=g.constant(0),valid=g.eq(0,0);
  for(let group=0;group<3;group++){
    const at=4+group*24,n=mod(rows[at+10],16),active=g.gt(count,group);let live=g.constant(0);valid=g.and(valid,g.or(g.not(active),g.le(n,8)));
    for(let i=0;i<8;i++){const slot=rows[at+2+i],member=g.and(active,g.gt(n,i));valid=g.and(valid,g.or(g.not(member),g.lt(slot,8)));const living=g.and(member,g.gt(pick(liveBySlot.map(v=>g.cast(v,'float32')),slot),0));live=g.add(live,g.cast(living,'float32'));for(let j=0;j<8;j++)registered[j]=g.or(registered[j],g.and(living,g.eq(slot,j)));}
    total=g.add(total,live);rows[at+10]=g.where(g.and(recount,active),g.add(n,g.mul(live,16)),rows[at+10]);
  }
  rows[1]=g.where(recount,g.add(g.mul(g.floor(g.mul(rows[1],1/16)),16),total),rows[1]);
  g.output(valid,'supported');g.output(g.where(valid,g.cat(rows),raw),'nextRosterRaw');g.output(g.cat(pending.map((value,i)=>g.where(g.and(valid,clear,registered[i]),0,value))),'nextActorSpawnPending');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){const results=[];for(const g of[buildCommonPopulationRequest(),buildCommonPopulationPlan(),buildCommonPopulationInsert(),buildCommonPopulationRoster()]){const saved=await g.save();results.push({name:saved.name,nodes:saved.nodes,bytes:saved.bytes});}console.log(JSON.stringify(results));}
