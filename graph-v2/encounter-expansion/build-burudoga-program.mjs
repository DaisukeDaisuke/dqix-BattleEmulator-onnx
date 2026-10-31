// A second exact encounter schedule. Reuses immutable AI, initiative, primary,
// event, status and tail graphs, and the shared action-core generator.
import{Graph}from'../graph-builder.mjs';
import{buildBossCommandRoute}from'../boss-phases.mjs';
import{decodeBossActionRule}from'../boss-action-rules.mjs';
import{makeBurudogaRow,MONSTER300,PROFILE_LIMITS,BURUDOGA_SOURCES}from'./profiles.mjs';
import rom from'../../restored/dq9-unified/data/rom.mjs';
import{readFile,writeFile,rename}from'node:fs/promises';
import{createHash}from'node:crypto';
const directory=new URL('./',import.meta.url),oldDirectory=new URL('../',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const originals=new Map();async function load(name){if(!originals.has(name))originals.set(name,JSON.parse(await readFile(new URL(`${name}.json`,oldDirectory),'utf8')));return originals.get(name);}
const choose=(g,values,index,fallback=0)=>values.reduce((value,x,i)=>g.where(g.eq(index,i),x,value),g.constant(fallback));

async function buildLayout(){
  const old=await load('rom-boss-plan-layout3'),priority=await load('rom-action-priority4'),g=new Graph('rom-duel-plan-layout2',{
    ...old.contract,scope:'Exactly one party and one enemy command, in two-actor initiative order, followed by the same audited stable ROM priority passes. ABI retains three command columns; the third is an inert padding row and is never scheduled.',
    scopeJa:'味方1行動と敵1行動を先攻順とROM優先度で並べます。互換配列の第3列は未実行paddingです。',
    constraints:'Two living participants, one command each. enemyActions[1], enemyTargetCounts[1] and the second enemy target row are ignored because no second AI decision is made. The returned third column must never be executed.',
    outputs:'Three-column ABI with exactly two valid commands. planLength=2 identifies the valid prefix. No RNG is consumed.',
    defaults:{...old.contract.defaults,enemyActions:[546,1],enemyTargetCounts:[1,0],enemyTargets:[0,-1,-1,-1,-1,-1,-1,-1,...Array(8).fill(-1)]}
  });
  const x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),order=g.split(x.orderIndices,2),enemy=g.split(x.enemyActions,2),enemyCounts=g.split(x.enemyTargetCounts,2),enemyTargets=g.op('Gather',[x.enemyTargets,g.constant([0,1,2,3,4,5,6,7],'int32',[8])],{axis:1},{shape:['N',8]}),partyFirst=g.eq(order[0],0),
    actions=[g.where(partyFirst,x.partyAction,enemy[0]),g.where(partyFirst,enemy[0],x.partyAction)],indices=[g.where(partyFirst,0,1),g.where(partyFirst,1,0)],sources=indices.map(index=>g.where(g.eq(index,0),0,192)),
    counts=[g.where(partyFirst,x.partyTargetCount,enemyCounts[0]),g.where(partyFirst,enemyCounts[0],x.partyTargetCount)],targets=[g.where(partyFirst,x.partyTargets,enemyTargets),g.where(partyFirst,enemyTargets,x.partyTargets)],
    maxId=Math.max(...rom.actions.map(a=>a.id)),priorityTable=Array(maxId+1).fill(-1),weaponTable=Array(maxId+1).fill(0);
  for(const a of rom.actions){const v=new DataView(Uint8Array.from(a.raw.match(/../g),x=>parseInt(x,16)).buffer);priorityTable[a.id]=(v.getUint32(44,true)>>>14)&63;weaponTable[a.id]=Number(!!(a.w10&0x80000));}
  const table=(values,id)=>g.op('Gather',[g.constant(values,'float32',[values.length]),g.cast(id,'int32')],{axis:0},{shape:['N',1]}),priorities=actions.map(action=>table(priorityTable,action)),zero=g.mul(x.partyAction,0),
    weapon=actions.map((action,i)=>g.and(x.partyWeaponFirst,g.eq(indices[i],0),g.gt(table(weaponTable,action),0))),
    sorted=g.inline(priority,{inputActions:g.cat([...actions,zero,zero]),inputSources:g.cat([...sources,zero,zero]),priority:g.cat([...priorities,zero,zero]),weaponFirst:g.cat([...weapon,g.gt(zero,0),g.gt(zero,0)]),present:g.gt(g.cat([g.add(zero,1),g.add(zero,1),zero,zero]),0)},'priority'),
    outputOrder=g.split(sorted.orderIndices,4),outActions=[],outSources=[],outIndices=[],outCounts=[],outTargets=[],outOriginal=[];
  for(let i=0;i<2;i++){
    outActions.push(choose(g,actions,outputOrder[i],1));outSources.push(choose(g,sources,outputOrder[i]));outIndices.push(choose(g,indices,outputOrder[i]));outCounts.push(choose(g,counts,outputOrder[i]));outOriginal.push(choose(g,indices,outputOrder[i]));
    outTargets.push(g.where(g.eq(outputOrder[i],0),targets[0],targets[1]));
  }
  const padding=g.add(zero,1),empty=g.add(g.mul(x.partyTargets,0),-1);
  for(const[name,value]of Object.entries({planActions:g.cat([...outActions,padding]),planSources:g.cat([...outSources,zero]),sourceIndices:g.cat([...outIndices,zero]),planTargetCounts:g.cat([...outCounts,zero]),planTargets:g.cat([...outTargets,empty]),originalCommandIndices:g.cat([...outOriginal,g.add(zero,-1)]),planLength:g.add(zero,2),
    supported:g.and(g.or(g.and(g.eq(order[0],0),g.eq(order[1],1)),g.and(g.eq(order[0],1),g.eq(order[1],0))),...priorities.map(value=>g.ge(value,0)))}))g.output(value,name);
  return g;
}
async function buildExtraCheck(){
  const old=await load('rom-boss-route-extra-check'),g=new Graph('rom-duel-route-extra-check',{
    ...old.contract,scope:'Validate the ROM monster300 mode0 extra-action helper result0. This is a schedule assertion, not an alternative random rule.',scopeJa:'追加行動数0を確認する接続グラフ。乱数計算は実ROM共通helper側です。'
  }),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),failed=g.and(x.gate,g.not(g.eq(x.extraCount,0)));
  g.output(g.where(failed,0,x.supported),'nextSupported');g.output(g.where(failed,1,x.finished),'nextFinished');return g;
}

const oldProgramBytes=await readFile(new URL('boss-resident-program.json',oldDirectory)),program=JSON.parse(oldProgramBytes),profile=makeBurudogaRow(),generated=[];
const originalRouter=await readFile(new URL('rom-boss-command-route2.onnx',oldDirectory));
if(hash(originalRouter)!==hash(buildBossCommandRoute().model()))throw Error('Original command router changed.');
const route=buildBossCommandRoute({name:'rom-rubble-command-route2',actionIds:[1,546],actionRules:[1,546].map(decodeBossActionRule),contract:{
  scope:'The shared primary-event/MP/source-status command router for party normal1 and enemy normal1/rubble546. The complete original router is regenerated byte-identically by its default options.',scopeJa:'通常攻撃とガレキ落としを行動本体へ接続し、主状態回復・行動不能イベントを共通処理へ渡します。',
  defaults:{actors:profile.actors,aux:profile.aux,sourceIndex:0,actionId:1,targetCount:1,recovered:false,enabled:true}
}});
for(const g of[route,await buildLayout(),await buildExtraCheck()]){const result=await g.save(directory);generated.push({...result,sha256:hash(g.model()),routingOnly:g.name!=='rom-rubble-command-route2'});}
const replacements={'rom-boss-action-core2':'rom-rubble-action-core2','rom-boss-command-route2':'rom-rubble-command-route2','rom-boss-plan-layout3':'rom-duel-plan-layout2','rom-boss-route-extra-check':'rom-duel-route-extra-check'};
const modelByName=new Map();for(const m of program.modules){const name=replacements[m.name]??m.name,dir=replacements[m.name]?directory:oldDirectory;modelByName.set(name,JSON.parse(await readFile(new URL(`${name}.json`,dir),'utf8')));}
const slotByName=new Map(program.slots.map(s=>[s.name,s]));
// Add an explicit mode0 constant. Do not change a deduplicated constant slot:
// the old mode2 slot may also be the third command-index constant elsewhere.
const mode0={name:'constant.duel-mode0',dtype:'float32',width:1,initial:{kind:'constant',values:[0]}};program.slots.push(mode0);slotByName.set(mode0.name,mode0);
function transform(steps){return steps.filter(step=>!step.id?.startsWith('turn:ai1:')&&!step.id?.startsWith('turn:command2:')&&step.id!=='command2').map(step=>{
  if(step.op==='repeat')return{...step,body:transform(step.body)};
  if(step.op!=='call')return step;
  const result={...step,model:replacements[step.model]??step.model,inputs:{...step.inputs},outputs:{...step.outputs}};
  if(step.id==='turn:extra')result.inputs.mode=mode0.name;
  if(step.id==='turn:layout'){
    const extraOutput='work.rom-duel-plan-layout2.planLength';result.outputs.planLength=extraOutput;
    const d={name:extraOutput,dtype:'float32',width:1,initial:{kind:'zero'}};program.slots.push(d);slotByName.set(extraOutput,d);
  }
  return result;
});}
program.steps=transform(program.steps);
const getPath=(object,path)=>path.reduce((v,key)=>v?.[key],object);
for(const slot of program.slots)if(slot.initial.kind==='input'){const value=getPath(profile,slot.initial.path);if(value!==undefined)slot.initial.default=Array.isArray(value)?value:[value];}
// Unproduced second-enemy scratch inputs have explicit inert defaults. Their
// values are ignored by the two-command layout; they are never candidate draws.
for(const name of['enemy1.action','enemy1.count','enemy1.targets']){const s=slotByName.get(name);s.initial={kind:'constant',values:name.endsWith('targets')?Array(8).fill(-1):[name.endsWith('action')?1:0]};}
const required=new Set();function visit(steps){for(const s of steps){if(s.op==='call')required.add(s.model);else if(s.op==='repeat')visit(s.body);}}visit(program.steps);
program.modules=[];for(const name of required){const original=!Object.values(replacements).includes(name),dir=original?oldDirectory:directory,ir=modelByName.get(name),binary=await readFile(new URL(`${name}.onnx`,dir));program.modules.push({name,onnx:`${original?'../':''}${name}.onnx`,ir:`${original?'../':''}${name}.json`,sha256:hash(binary),nodes:ir.nodes.length,bytes:binary.length,routingOnly:!!ir.contract.routingOnly});}
Object.assign(program,{name:'dq9-monster300-combat-resident',version:1,scope:'One party normal command and ROM monster300 with one action. All6 real AI slots, limited-slot rules and the mandatory extra-action draw are retained. Normal1 and rubble546 are the only ordinary effects. Primary/event/status/tail and terminal masking reuse the original verified modules. Camera and general party menu remain outside.',
  provenance:{baseProgramSha256:hash(oldProgramBytes),monster:MONSTER300,originalProfiles:BURUDOGA_SOURCES.map(x=>({id:`${x.branch}/${x.variant}`,source:x.source,actors:x.actors})),defaultProfile:'burudoga_v9_new_arugo/burudoga_v9_no_tate',limits:PROFILE_LIMITS},
  scheduleDifference:'No second enemy AI decision and no third command are scheduled. The layout keeps three-column ABI only to reuse checked connection graphs; its planLength is2 and the padding command is never executed.'});
function validateCalls(steps){for(const s of steps){if(s.op==='repeat'){validateCalls(s.body);continue;}if(s.op!=='call')continue;const m=modelByName.get(s.model);for(const d of m.inputs){const slot=slotByName.get(s.inputs[d.name]);if(!slot||slot.dtype!==d.dtype||slot.width!==d.shape[1])throw Error(`${s.id}.${d.name}: invalid input binding`);}for(const d of m.outputs){const slot=slotByName.get(s.outputs[d.name]);if(!slot||slot.dtype!==d.dtype||slot.width!==d.shape[1])throw Error(`${s.id}.${d.name}: invalid output binding`);}}}validateCalls(program.steps);
for(const[name,value]of[['burudoga-resident-program.json',program],['burudoga-program-build.json',{generated,unchangedRouterSha256:hash(originalRouter),baseProgramSha256:hash(oldProgramBytes),modules:program.modules.map(x=>({name:x.name,sha256:x.sha256})),profileLimits:PROFILE_LIMITS}]]){await writeFile(new URL(`${name}.tmp`,directory),JSON.stringify(value,null,2)+'\n');await rename(new URL(`${name}.tmp`,directory),new URL(name,directory));}
console.log(JSON.stringify({program:program.name,modules:program.modules.length,newModels:generated.map(x=>({name:x.name,nodes:x.nodes,bytes:x.bytes})),slots:program.slots.length},null,2));
