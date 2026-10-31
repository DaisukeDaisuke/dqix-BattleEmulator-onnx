import {sourceSHA256} from '../../data/source-authority.mjs';
// Add callbacks19/138 by composition over frozen target and decision graphs.
// Their candidate loops share one packing/uniform-selection rule; no learned data.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Graph,lcg,normalized,bounded} from '../graph-builder.mjs';
import {buildDecisionGraph} from '../build-ai-decision.mjs';
import {aiClosedStep} from '../build-ai-closed.mjs';
const dir=new URL('./',import.meta.url),shared=new URL('../',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
const load=async(name,base=dir)=>JSON.parse(await readFile(new URL(`${name}.json`,base)));
const boolSelect=(g,c,a,b)=>g.gt(g.where(c,g.cast(a,'float32'),g.cast(b,'float32')),0);
const sum=(g,values)=>values.reduce((v,x)=>g.add(v,g.cast(x,'float32')),g.constant(0));
const bit=(g,bytes,index)=>{const v=g.floor(g.mul(bytes[index>>>3],2**-(index&7)));return g.gt(g.sub(v,g.mul(g.floor(g.mul(v,.5)),2)),0);};
function finish(g){const names=new Set(g.inputs.map(d=>d.name));for(const k of Object.keys(g.contract.inputDomains))if(!names.has(k))delete g.contract.inputDomains[k];for(const d of g.inputs)if(g.contract.inputDomains[d.name]||d.dtype==='bool')g.contract.inputDomains[d.name]={...(g.contract.inputDomains[d.name]??{values:[false,true,0,1]}),width:d.shape[1]};g.contract.inputContractVersion=1;return g;}

export function jadamaTarget(g,x,previous){
  const enemySelector=g.eq(x.selectorIndex,19),partySelector=g.eq(x.selectorIndex,138),selected=g.or(enemySelector,partySelector),active=g.and(x.enabled,selected);
  const old=g.inline(previous,{...x,enabled:g.and(x.enabled,g.not(selected))},`jadama_previous_${g.index}`);
  const partyIds=g.split(x.ids,4),present=g.split(x.present,4),candidate=g.split(x.candidate,4),status=g.split(x.partyStatusBytes,16),flags=g.split(x.partyFlagBytes,16),mp=g.split(x.partyMp,4);
  const partyEligible=partyIds.map((_,i)=>g.and(present[i],candidate[i],g.not(bit(g,status.slice(i*4,i*4+4),0)),g.not(bit(g,flags.slice(i*4,i*4+4),13))));
  const partyAccepted=partyEligible.map((v,i)=>g.and(v,g.gt(mp[i],0),g.not(bit(g,status.slice(i*4,i*4+4),9))));
  const enemyIds=g.split(g.cast(x.enemyIds,'float32'),8),enemyPresent=g.split(x.enemyPresent,8),enemyCandidate=g.split(x.enemyCandidate,8),dead=g.split(x.enemyDead,8),excluded=g.split(x.enemyExcluded,8),groups=g.split(g.cast(x.enemyGroups,'float32'),8),defense=g.split(x.enemyDefense,8),rank=g.split(x.enemyDefenseRank,8),status9=g.split(x.enemyStatus9,8);
  const enemyEligible=enemyIds.map((_,i)=>g.and(enemyPresent[i],enemyCandidate[i],g.not(dead[i]),g.not(excluded[i]),g.lt(groups[i],x.enemyGroupCount)));
  const enemyAccepted=enemyEligible.map((v,i)=>g.and(v,g.lt(defense[i],65535),g.lt(rank[i],2),g.not(status9[i])));
  const prior=[...g.split(x.previousTargets,8)],packed=[...prior];let packedCount=g.constant(0);
  function append(id,accept){for(let j=0;j<8;j++)packed[j]=g.where(g.and(accept,g.eq(packedCount,j)),id,packed[j]);packedCount=g.add(packedCount,g.cast(accept,'float32'));}
  for(let group=0;group<3;group++)for(let i=0;i<8;i++)append(enemyIds[i],g.and(enemySelector,enemyAccepted[i],g.eq(groups[i],group)));
  for(let i=0;i<4;i++)append(partyIds[i],g.and(partySelector,partyAccepted[i]));
  const eligibleCount=g.where(enemySelector,sum(g,enemyEligible),sum(g,partyEligible));
  const consume=g.and(active,g.gt(packedCount,0)),draw=lcg(g,x.seed),index=bounded(g,normalized(g,draw.raw),g.max(packedCount,1));
  const chosen=packed.reduce((v,t,i)=>g.where(g.eq(index,i),t,v),packed[0]);
  const count=g.where(active,g.where(g.gt(eligibleCount,0),g.where(consume,1,0),x.previousTargetCount),x.previousTargetCount);
  const targets=g.where(active,g.cat(packed.map((v,i)=>i===0?g.where(consume,chosen,v):v)),x.previousTargets);
  return {
    nextSeed:g.where(selected,g.where(consume,draw.seed,x.seed),old.nextSeed),
    nextPosition:g.where(selected,g.add(x.position,g.cast(consume,'int32')),old.nextPosition),
    consumed:g.where(selected,g.cast(consume,'int32'),old.consumed),
    supported:boolSelect(g,selected,g.eq(0,0),old.supported),callbackSuccess:boolSelect(g,selected,consume,old.callbackSuccess),
    targetCount:g.where(selected,count,old.targetCount),targets:g.where(selected,targets,old.targets),
    filteredCount:g.where(selected,packedCount,old.filteredCount),rageCandidateUsed:g.where(selected,g.constant(0,'int32'),old.rageCandidateUsed),
    partyCount:g.where(selected,sum(g,partyEligible),old.partyCount),affectableCount:g.where(selected,packedCount,old.affectableCount)
  };
}

export async function buildJadamaTargetGraph(){
  const previous=await load('rom-ai-transition-target4');
  const files=['021eef68','021f567c','021eda60','021ed890'];
  const authority=await Promise.all(files.map(async id=>{const path=`src/Combat/Overlay_24/func_ov024_${id}.cpp`;return{path,sha256:sourceSHA256(path)};}));
  const g=new Graph('rom-ai-jadama-target4',{
    ...structuredClone(previous.contract),authority:[...previous.contract.authority,...authority],
    scope:'Immutable earlier callbacks plus19 and138.19 enumerates enemy group0/1/2 in roster order, accepts currentDEF<65535 and signedDEF rank<2 without raw status0x200.138 enumerates eligible party with currentMP>0 and no status0x200. A nonempty filtered prefix consumes one bounded draw even for one candidate and overwrites its first short. Empty roster preserves prior count; nonempty all-rejected roster sets count0. All8 shorts are retained exactly. Source and repeat are unused in these two handlers.',
    scopeJa:'スカラとマホトラの対象選択を追加します。ROMの候補順・守備力と段階・MP・状態bitを検査し、候補が1人でも1回抽選します。候補なしの場合の件数と8枠の保持規則も再現します。',
    callbackRules:{...previous.contract.callbackRules,19:'Eligible enemy order; DEF<65535, rank<2, no status0x200; one uniform selection from packed candidates.',138:'Eligible party order; MP>0, no status0x200; one uniform selection from packed candidates.'},
    rawProjection:previous.contract.rawProjection+' enemyStatus9 is the initial enemy status14 bit9, independent of current HP and of defense rank; caller must derive all typed views from the same memory.',
    defaults:{...previous.contract.defaults,selectorIndex:19,enemyStatus9:Array(8).fill(false)},
    labels:{...previous.contract.labels,enemyStatus9:'敵8体の状態word14 bit9'},
    inputDomains:{...previous.contract.inputDomains,enemyStatus9:{values:[false,true,0,1]}},
    sharedBase:{name:previous.name,sha256:hash(await readFile(new URL(`${previous.name}.onnx`,dir)))},
    actualAuthority:'evidence-v2/ghidra/emulation-target19-138-run/response.json',staticAuthority:'evidence-v2/ghidra/target19-138-defined/response.json'
  });
  const x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));x.enemyStatus9=g.input('enemyStatus9',['N',8],'bool');
  for(const[name,value]of Object.entries(jadamaTarget(g,x,previous)))g.output(value,name);return finish(g);
}
export async function buildJadamaStepGraph(target){
  target??=await buildJadamaTargetGraph();const previous=await load('rom-ai-transition-step'),decision=buildDecisionGraph(await load('rom-weighted-ai6',shared));
  const g=new Graph('rom-ai-jadama-step',{
    ...structuredClone(previous.contract),authority:[...decision.contract.authority,...target.contract.authority],
    scope:'One bounded candidate/gate/target step using unchanged decision rules with additive19/138 handlers. This graph does not itself move AI from planning to preparation; the deferred schedule is a separate program.',
    scopeJa:'共通AIの候補選択・使用条件・対象選択に、スカラとマホトラの判定を加えて1回進めます。行動準備時に選び直す順序は接続プログラムが担当します。',
    callbackRules:target.contract.callbackRules,rawProjection:target.contract.rawProjection,
    defaults:{...previous.contract.defaults,enemyStatus9:Array(8).fill(false)},labels:{...previous.contract.labels,...target.contract.labels},
    inputDomains:{...previous.contract.inputDomains,...target.contract.inputDomains},
    sharedBase:{name:previous.name,sha256:hash(await readFile(new URL(`${previous.name}.onnx`,dir)))}
  });
  const x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));x.enemyStatus9=g.input('enemyStatus9',['N',8],'bool');
  for(const[name,value]of Object.entries(aiClosedStep(g,x,decision,target)))g.output(value,name);return finish(g);
}
async function save(g){const bytes=g.model();for(const[ext,value]of[['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${ext}`,tmp=new URL(`${name}.pending-${process.pid}`,dir);await writeFile(tmp,value);await rename(tmp,new URL(name,dir));}return{name:g.name,sha256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const target=await buildJadamaTargetGraph(),step=await buildJadamaStepGraph(target),models=[];for(const g of[target,step])models.push(await save(g));const temp=new URL(`jadama-ai-models.json.pending-${process.pid}`,dir);await writeFile(temp,JSON.stringify(models,null,2)+'\n');await rename(temp,new URL('jadama-ai-models.json',dir));console.log(JSON.stringify(models,null,2));}
