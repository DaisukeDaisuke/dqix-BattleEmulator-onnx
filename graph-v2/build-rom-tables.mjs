// ROM records become ONNX initializer weights. Inference performs Gather;
// no JavaScript lookup supplies the selected enemy/action metadata at runtime.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Graph} from './graph-builder.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';
const root=new URL('./',import.meta.url),sha=x=>createHash('sha256').update(x).digest('hex');
const monsters=new Map(rom.monsters.map(m=>[m.id,m])),actions=new Map();
for(const a of rom.actions)if(!actions.has(a.id))actions.set(a.id,a); // ROM searches archive A before B.
const monsterMax=Math.max(...monsters.keys()),actionMax=Math.max(...actions.keys());
const authority={romSHA256:rom.romSha256,source:'restored/dq9-unified/data/rom.mjs',
  auditedMonsterRecords:'graph-v2/rom-tables-audit.json',auditedActionRecords:'evidence-v2/ghidra/action-records-audit.json',
  matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10'};
function gather(g,values,index,width=1) {
  return g.op('Gather',[g.constant(values,'float32',[values.length]),index],{axis:0},{shape:['N',width],dtype:'float32'});
}
function safeIndex(g,id,maximum) {
  return {index:g.cast(g.min(g.max(g.floor(id),0),maximum),'int32'),
    valid:g.and(g.eq(id,g.floor(id)),g.ge(id,0),g.le(id,maximum))};
}
const monsterColumn=field=>Array.from({length:monsterMax+1},(_,id)=>monsters.has(id)?field(monsters.get(id)):0);
const actionColumn=field=>Array.from({length:actionMax+1},(_,id)=>actions.has(id)?field(actions.get(id)):0);

export function monsterAiTable(g,monsterId) {
  const {index,valid:validIndex}=safeIndex(g,monsterId,monsterMax),
    get=f=>gather(g,monsterColumn(f),index),
    valid=g.and(validIndex,g.gt(get(()=>1),0)),scheme=get(m=>m.scheme),judgment=get(m=>m.judgment),
    actionIds=g.cat(Array.from({length:6},(_,i)=>get(m=>m.actions[i]))),
    limited=g.cast(g.cat(Array.from({length:6},(_,i)=>get(m=>(m.limitedSlots>>i)&1))),'bool'),
    weightedSupported=g.and(valid,g.or(g.eq(scheme,0),g.eq(scheme,1),g.eq(scheme,2),g.eq(scheme,4))),
    weightedProfile=g.where(weightedSupported,g.where(g.eq(scheme,4),3,scheme),-1);
  return {valid,scheme,judgment,turnBehavior:get(m=>m.turnBehavior),actionIds,limited,weightedProfile,weightedSupported,
    stats:g.cat(['hp','mp','attack','defense','agility'].map(field=>get(m=>m[field])))};
}

export function actionAiTable(g,actionIds) {
  const {index,valid:validIndex}=safeIndex(g,actionIds,actionMax),get=f=>gather(g,actionColumn(f),index,6),
    valid=g.and(validIndex,g.gt(get(()=>1),0));
  return {valid,mpCosts:get(a=>a.mpCost),operations:get(a=>a.operation),spell:g.gt(get(a=>a.w10&1),0),ability:g.gt(get(a=>(a.w10>>1)&1),0),
    smartTarget:get(a=>Buffer.from(a.raw,'hex').readUInt16LE(12)),wiseTarget:get(a=>Buffer.from(a.raw,'hex').readUInt16LE(14)),
    targetSide:get(a=>(a.w08>>>8)&3),targetScope:get(a=>Buffer.from(a.raw,'hex').readUInt32LE(20)>>>28),
    repeatCode:get(a=>(Buffer.from(a.raw,'hex').readUInt32LE(28)>>>14)&31)};
}

const common={authority,proof:'A deterministic ROM-record lookup, not learned parameters. Initializers contain exact small integer fields. Record verification alone does not establish complete action/battle behavior.'};
export function buildMonsterTable() {
  const g=new Graph('rom-monster-ai-table',{...common,
    scope:`AI metadata and base stats for ${monsters.size} ROM monster records; IDs are sparse through${monsterMax}.`,
    outputs:'stats columns are HP,MP,attack,defense,agility. weightedProfile is0/1/2/3 for schemes0/1/2/4; other schemes output-1 and weightedSupported=false.',
    defaults:{monsterId:303},labels:{monsterId:'ROMモンスターID'},feedback:{},inputDomains:{monsterId:{min:0,max:monsterMax,integer:true}},
    example:'Monster303 病魔パンデルム from the actual ROM table, not a generated encounter configuration.'});
  const input=g.input('monsterId');for(const [name,value] of Object.entries(monsterAiTable(g,input)))g.output(value,name);return g;
}
export function buildActionTable() {
  const g=new Graph('rom-action-ai-table',{...common,
    scope:`Target-dispatch and eligibility metadata for${actions.size} unique ROM action IDs (${rom.actions.length} records).`,
    outputs:'smartTarget/wiseTarget are judgment1/2 dispatch indices from word0c/0e, not implemented callbacks. targetSide=word08 bits8..9; targetScope=word14 bits28..31; repeatCode=word1c bits14..18. valid must be checked before using any row.',
    defaults:{actionIds:[1,275,1,48,44,228]},labels:{actionIds:'6スロットのROM行動ID'},feedback:{},inputDomains:{actionIds:{min:0,max:actionMax,integer:true}},
    example:'The actual six ROM action records for monster303.'});
  const input=g.input('actionIds',['N',6]);for(const [name,value] of Object.entries(actionAiTable(g,input)))g.output(value,name);return g;
}
export async function buildMonsterWeightedPrefix() {
  const prefix=JSON.parse(await readFile(new URL('rom-weighted-ai6.json',root),'utf8'));
  const g=new Graph('rom-monster-weighted-ai',{...common,
    scope:'ROM monster/action initializer tables connected to the actual weighted six-slot candidate generator. No host lookup is used for any selected record.',
    acceptance:'Outputs actionIds/mpCosts/operations/spell/ability/limited/judgment feed rom-ai-acceptance6; initial candidateSlots start cursor0. Callbacks and actor/group state remain explicit inputs to the acceptance step.',
    exclusions:'Schemes3/5/6/7 require resumable cyclic selection and are explicitly unsupported here: supported=false, no RNG consumed, candidate slots/actions=-1. This model is a weighted selection prefix, not a complete enemy action.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,monsterId:303,enabled:true},
    labels:{monsterId:'ROMモンスターID'},feedback:{seed:'nextSeed',position:'nextPosition'},
    inputDomains:{seed:{min:0,max:255,integer:true},position:{min:1,max:4990,integer:true},monsterId:{min:0,max:monsterMax,integer:true}},
    example:'Actual 病魔パンデルム records, weighted scheme1 and limited slots58. Initial slot selection is the same primitive covered by actual ARM prefix fixtures.'});
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),monsterId=g.input('monsterId'),enabled=g.input('enabled',['N',1],'bool'),
    m=monsterAiTable(g,monsterId),a=actionAiTable(g,m.actionIds),validActions=g.and(...g.split(a.valid,6)),supported=g.and(m.weightedSupported,validActions),
    selected=g.inline(prefix,{seed,position,profile:g.max(m.weightedProfile,0),actions:m.actionIds,enabled:g.and(enabled,supported)},'weighted');
  for(const [name,value] of Object.entries({...selected,supported,monsterValid:m.valid,actionValid:a.valid,scheme:m.scheme,judgment:m.judgment,limited:m.limited,
    actionIds:m.actionIds,mpCosts:a.mpCosts,operations:a.operations,spell:a.spell,ability:a.ability,smartTarget:a.smartTarget,wiseTarget:a.wiseTarget}))g.output(value,name);
  return g;
}

export async function auditMonsterRecords() {
  // Optional local research audit. The release build uses pinned numeric source
  // records and does not require a ROM or the extraction tool.
  const {NitroFS}=await import('../restored/dq9-unified/vendor/nitro-fs.js');
  const bytes=await readFile(new URL('../restored/dq9.nds',root)),nitro=NitroFS.fromRom(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),
    raw=Buffer.from(nitro.readFile('data/prm/mons_btl_data2.nat')),count=raw.readUInt32LE(0)&4095,differences=[];
  for(let i=0;i<count;i++) {
    const row=raw.subarray(4+i*132,4+(i+1)*132),id=row.readUInt16LE(0)&32767,record=monsters.get(id);
    if(!record||record.raw!==row.toString('hex'))differences.push({record:i,id,reason:'raw record mismatch'});
    else {
      const flags=row.readUInt32LE(16),decoded={scheme:(flags>>>5)&7,judgment:(flags>>>3)&3,limitedSlots:(flags>>>20)&63,
        hp:row.readUInt16LE(92),mp:row.readUInt16LE(94),attack:row.readUInt16LE(96),defense:row.readUInt16LE(98),agility:row.readUInt16LE(100)};
      for(const [key,value] of Object.entries(decoded))if(record[key]!==value)differences.push({record:i,id,key,rom:value,restored:record[key]});
      for(let slot=0;slot<6;slot++)if(record.actions[slot]!==row.readUInt16LE(24+slot*2))differences.push({record:i,id,slot,reason:'action mismatch'});
    }
  }
  const report={authority:'Direct NitroFS extraction from restored user ROM; all bytes compared to the premined records before compiling weights',romSHA256:sha(bytes),path:'data/prm/mons_btl_data2.nat',archiveSHA256:sha(raw),records:count,restoredRecords:monsters.size,differences};
  if(report.romSHA256!==rom.romSha256||count!==monsters.size||differences.length)throw Error(JSON.stringify(report));
  await writeFile(new URL('rom-tables-audit.json',root),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const audit=process.argv.includes('--audit-rom')?await auditMonsterRecords():null,
    models=[buildMonsterTable(),buildActionTable(),await buildMonsterWeightedPrefix()],reports=[];
  for(const graph of models)reports.push(await graph.save());
  await writeFile(new URL('table-models.json',root),JSON.stringify(reports,null,2)+'\n');
  console.log(JSON.stringify({audit,models:reports.map(({name,nodes,bytes})=>({name,nodes,bytes}))},null,2));
}
