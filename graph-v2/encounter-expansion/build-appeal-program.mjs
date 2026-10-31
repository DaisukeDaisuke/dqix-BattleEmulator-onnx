// Add the actual enemy preparation appeal phase to the immutable gate0
// schedule. The verified action kernels and original schedule remain intact.
import{Graph}from'../graph-builder.mjs';
import{RandomGraph}from'../transition-graphs.mjs';
import{resistanceFraction}from'../boss-action-rules.mjs';
import{makeBurudogaAppealRow,BURUDOGA_APPEAL_PROVENANCE}from'./profile-records.mjs';
import{readFile,writeFile,rename}from'node:fs/promises';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
const directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const APPEAL_FIELDS=[{name:'partyCurrentCharm',min:0,max:65535,integer:true},{name:'partyBaseCharm',min:0,max:65535,integer:true},{name:'partyEquipmentCharm',min:0,max:1023,integer:true},{name:'enemyAppealResistance',min:0,max:255,integer:true}];
const effective=(g,parts)=>g.add(g.sub(parts[0],parts[1]),parts[2]);
const supportedCharm=(g,parts)=>g.or(g.eq(parts[3],0),g.le(effective(g,parts),100));
export function buildNonpositiveAppeal(){
  const g=new Graph('rom-nonpositive-appeal2',{
    scope:'Actual enemy preparation helper JPN021587cc / matching func_ov000_0215704c, restricted to one living eligible party actor and a present, alive enemy that is not excluded/paralyzed/asleep/skipping. Party-source calls return immediately. Nonzero currentStats+0x53 consumes one bounded100 draw even when the appeal chance is negative or zero. The successful-appeal branch is outside this model and is reported unsupported before consuming state.',
    scopeJa:'敵の行動準備にある魅了判定。成功率0以下の入力で、耐性byteが非zeroなら乱数1回を正確に消費します。魅了成功は未対応として停止します。',
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215704c.cpp',jpnAddress:'overlay0:0x021587cc'},
      {file:'src/Combat/Overlay_0/func_ov000_0215641c.cpp',formula:'F(F((currentCharm-baseCharm+equipmentCharm-100)*F(0.02))*F(resistance/100))'},
      {file:'src/Combat/Overlay_0/func_ov000_0215767c.cpp',ordering:'Appeal helper precedes primary recovery. It is reached only after the enclosing execution-loop gates.'}],
    fieldDomains:{appeal:APPEAL_FIELDS},inputDomains:{seed:{width:8,min:0,max:255,integer:true},position:{min:1,max:4950,integer:true},sourceIndex:{min:0,max:1,integer:true},enabled:{values:[false,true,0,1]}},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,sourceIndex:1,enabled:true,appeal:makeBurudogaAppealRow().appeal},
    feedback:{seed:'nextSeed',position:'nextPosition'},
    proof:'Current/base charm are u16 and equipment charm is10-bit. Their exact integer difference and sum have magnitude<2^17. Multiplying a nonpositive value by positive0.02f and a nonnegative byte/100 preserves sign, so no bounded100 output can satisfy chance>roll. The unused bounded output is eliminated; its single RNG state transition is retained.',
    inputMeaning:'enabled is the caller gate after presence, roster membership, live/death and inability checks. Those checks are owned by the surrounding turn graph. appeal is immutable while no charm-changing action is supported.',
    labels:{appeal:'現在魅力・基礎魅力・装備魅力・敵の魅了係数'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),source=g.input('sourceIndex'),enabled=g.input('enabled',['N',1],'bool'),a=g.split(g.input('appeal',['N',4]),4),supported=supportedCharm(g,a),active=g.and(enabled,supported,g.eq(source,1),g.gt(a[3],0)),rng=new RandomGraph(g,seed,position);
  rng.raw(active);
  const chance=g.mul(g.mul(g.sub(effective(g,a),100),Math.fround(.02)),resistanceFraction(g,a[3]));
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),supported,attempted:active,success:g.and(enabled,g.eq(0,1)),chance}))g.output(value,name);
  return g;
}

export async function buildAppealTurnOpen(){
  const old=JSON.parse(await readFile(new URL('../rom-boss-route-turn-open.json',import.meta.url),'utf8'));
  const g=new Graph('rom-duel-route-turn-open-appeal',{
    ...old.contract,scope:'The original turn-open connection, with its appeal-disabled restriction replaced by an exact explicit nonpositive-appeal contract. The actual preparation RNG is performed by rom-nonpositive-appeal2 before primary recovery.',
    scopeJa:'成功率0以下の魅了判定を含む1対1ターンの開始。旧モデルの魅了省略条件を、明示入力との整合判定に置き換えます。',
    defaults:{...old.contract.defaults,appeal:makeBurudogaAppealRow().appeal},fieldDomains:{...old.contract.fieldDomains,appeal:APPEAL_FIELDS},
    appealContract:'config.enemyAppealGate must equal (enemyAppealResistance!=0); resistance must be0 or current-base+equipment<=100. The legacy inline turn-open sees gate0 only after this new contract has been checked. The old model and program remain byte-identical.'
  });
  const x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),a=g.split(g.input('appeal',['N',4]),4),cfg=g.split(x.config,7),valid=g.and(x.viewSupported,supportedCharm(g,a),g.eq(cfg[6],g.cast(g.gt(a[3],0),'float32')));
  const result=g.inline(old,{...x,viewSupported:valid,config:g.cat([...cfg.slice(0,6),g.mul(cfg[6],0)])},'old_turn_open');
  for(const d of old.outputs)g.output(result[d.name],d.name);
  return g;
}

export async function buildAppealProgram(){
  const oldBytes=await readFile(new URL('burudoga-resident-program.json',directory)),program=JSON.parse(oldBytes),profile=makeBurudogaAppealRow(),generated=[];
  for(const g of[buildNonpositiveAppeal(),await buildAppealTurnOpen()]){const info=await g.save(directory);generated.push({...info,sha256:hash(g.model())});}
  const oldSlotNames=new Set(program.slots.map(s=>s.name));
  const add=(name,dtype,width,initial={kind:'zero'})=>{if(oldSlotNames.has(name))throw Error(`Duplicate slot ${name}`);oldSlotNames.add(name);program.slots.push({name,dtype,width,initial});return name;};
  const appeal=add('state.appeal','float32',4,{kind:'input',path:['appeal'],default:profile.appeal});program.inputs.appeal=appeal;program.outputs.appeal=appeal;
  const helper=JSON.parse(await readFile(new URL('rom-nonpositive-appeal2.json',directory),'utf8'));
  const helperOutputs={nextSeed:'state.seed',nextPosition:'state.position'};
  for(const d of helper.outputs)if(!(d.name in helperOutputs))helperOutputs[d.name]=add(`work.rom-nonpositive-appeal2.${d.name}`,d.dtype,d.shape[1]);
  const transform=steps=>steps.flatMap(step=>{
    if(step.op==='repeat')return[{...step,body:transform(step.body)}];
    if(step.op==='capture'&&step.id==='turn-end')return[{...step,tensors:{...step.tensors,appeal}}];
    if(step.op!=='call')return[step];
    if(step.id==='turn:open')return[{...step,model:'rom-duel-route-turn-open-appeal',inputs:{...step.inputs,appeal}}];
    if(/^turn:command[01]:primary$/.test(step.id))return[{op:'call',id:step.id.replace(/:primary$/,':appeal'),model:'rom-nonpositive-appeal2',inputs:{seed:'state.seed',position:'state.position',sourceIndex:step.inputs.sourceIndex,enabled:step.inputs.enabled,appeal},outputs:helperOutputs},step];
    return[step];
  });program.steps=transform(program.steps);
  const path=(o,p)=>p.reduce((v,k)=>v?.[k],o);
  for(const slot of program.slots)if(slot.initial.kind==='input'){const value=path(profile,slot.initial.path);if(value!==undefined)slot.initial.default=Array.isArray(value)?value:[value];}
  program.modules=program.modules.filter(m=>m.name!=='rom-boss-route-turn-open');
  for(const m of generated)program.modules.push({name:m.name,onnx:`${m.name}.onnx`,ir:`${m.name}.json`,sha256:m.sha256,nodes:m.nodes,bytes:m.bytes,routingOnly:m.name==='rom-duel-route-turn-open-appeal'});
  Object.assign(program,{name:'dq9-monster300-appeal-combat-resident',version:2,scope:program.scope+' The original monster300 appeal resistance10 is included before every eligible enemy primary preparation. Exact nonpositive charm chance only; successful appeal remains unsupported.',provenance:{...program.provenance,priorAppealDisabledProgramSha256:hash(oldBytes),appeal:BURUDOGA_APPEAL_PROVENANCE}});
  const text=JSON.stringify(program,null,2)+'\n';await writeFile(new URL('burudoga-appeal-resident-program.json.tmp',directory),text);await rename(new URL('burudoga-appeal-resident-program.json.tmp',directory),new URL('burudoga-appeal-resident-program.json',directory));
  const report={schema:'dq9-appeal-profile-correction-v1',program:program.name,sha256:hash(text),historicalProgramSha256:hash(oldBytes),models:generated,provenance:BURUDOGA_APPEAL_PROVENANCE};
  await writeFile(new URL('burudoga-appeal-program-build.json.tmp',directory),JSON.stringify(report,null,2)+'\n');await rename(new URL('burudoga-appeal-program-build.json.tmp',directory),new URL('burudoga-appeal-program-build.json',directory));
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildAppealProgram(),null,2));
