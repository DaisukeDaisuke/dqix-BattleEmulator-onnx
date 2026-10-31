// Exact cut of the new six-action preparation DAG, retaining tension. Deferred
// AI runs between appeal and primary recovery, with every frontier explicit.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Graph} from '../graph-builder.mjs';
import {makeGiyumeiRow} from './giyumei-profiles.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
function reachable(ir,outputs){const keep=new Set(outputs.map(d=>d.name)),nodes=[];for(let i=ir.nodes.length-1;i>=0;i--){const n=ir.nodes[i];if(n.outputs.some(k=>keep.has(k))){nodes.push(n);n.inputs.forEach(k=>keep.add(k));}}return{...ir,nodes:nodes.reverse(),outputs,inputs:ir.inputs.filter(d=>keep.has(d.name)),initializers:ir.initializers.filter(d=>keep.has(d.name)),values:Object.fromEntries(Object.entries(ir.values).filter(([k])=>keep.has(k)))};}
function finish(g){const names=new Set(g.inputs.map(d=>d.name));for(const key of['inputDomains','fieldDomains','defaults','feedback'])for(const n of Object.keys(g.contract[key]??{}))if(!names.has(n))delete g.contract[key][n];g.contract.relations=(g.contract.relations??[]).filter(r=>names.has(r.left.input)&&names.has(r.right.input));return g;}
export async function buildGiyumeiPreparation(){
  const originalName='rom-giyumei-preparation-unsplit2',onnx=await readFile(new URL(originalName+'.onnx',dir)),original=JSON.parse(await readFile(new URL(originalName+'.json',dir))),row=makeGiyumeiRow();
  const variant={ir:original,proof:null},ir=structuredClone(original),primary=JSON.parse(await readFile(new URL('../rom-primary-recovery2.json',dir)));
  for(const d of ir.inputs)if(row[d.name]!==undefined)ir.contract.defaults[d.name]=row[d.name];
  Object.assign(ir.contract.defaults,{sourceIndex:1,actionId:569,targetCount:1,enabled:true});
  const primaryPrefix='prepare_primary_',cut=ir.nodes.findIndex(n=>n.outputs.some(k=>k.startsWith(primaryPrefix)));
  if(cut<0)throw Error('Missing exact primary inline boundary');
  const primaryNames=new Set(primary.inputs.map(d=>d.name)),primaryFeeds={};
  for(let i=0;i<primary.nodes.length;i++){const a=primary.nodes[i],b=ir.nodes[cut+i];if(a.op!==b.op||a.outputs.some((k,j)=>primaryPrefix+k!==b.outputs[j]))throw Error('Immutable primary topology differs');a.inputs.forEach((name,j)=>{if(primaryNames.has(name)){if(primaryFeeds[name]&&primaryFeeds[name]!==b.inputs[j])throw Error('Inconsistent primary feed');primaryFeeds[name]=b.inputs[j];}});}
  const constantNames=new Set(ir.initializers.map(c=>c.name)),constantNodes=[];
  for(const n of ir.nodes.slice(0,cut))if(n.inputs.every(k=>constantNames.has(k))){n.outputs.forEach(k=>constantNames.add(k));constantNodes.push(n);}
  const produced=new Set(ir.nodes.slice(0,cut).flatMap(n=>n.outputs)),external=new Set(ir.nodes.slice(cut).flatMap(n=>n.inputs).filter(k=>produced.has(k)&&!constantNames.has(k)));
  for(const key of['seed','position','enabled']){if(!primaryFeeds[key])throw Error('Missing primary boundary '+key);external.add(primaryFeeds[key]);}
  const diagnostic=['appealSuccess','appealType','appealConsumed'],diagnosticGraph=reachable(ir,diagnostic.map(k=>ir.values[k]));
  if(diagnosticGraph.nodes.some(n=>n.outputs.some(k=>k.startsWith(primaryPrefix))))throw Error('Appeal depends on primary');
  const preNodes=[...ir.nodes.slice(0,cut),...diagnosticGraph.nodes.filter(n=>!n.outputs.every(k=>produced.has(k)))],front=[...external].map((name,i)=>({original:name,name:`bridge${i}`,descriptor:ir.values[name]}));
  const prefixRaw=reachable({...ir,nodes:preNodes},[...front.map(f=>ir.values[f.original]),...diagnostic.map(k=>ir.values[k])]);
  const prefix=new Graph('rom-giyumei-prepare-appeal2',{...structuredClone(ir.contract),feedback:{},scope:'Exact new six-action preparation prefix through appeal, with raw high-tension eligibility, before deferred AI and primary. All existing actor bounds and relations remain in force.',scopeJa:'テンションを保ちながら魅了までの準備を実行し、AI再選択の直前の状態を保持します。元の現在HPと最大HPをそのまま保持します。',cutAuthority:'JPN02158dfc: appeal, judgment2 AI/reselection, primary recovery and cleanup.'});
  const px=Object.fromEntries(prefixRaw.inputs.map(d=>[d.name,prefix.input(d.name,d.shape,d.dtype)])),po=prefix.inline(prefixRaw,px,'prefix');
  for(const f of front)prefix.output(po[f.original],f.name);for(const key of diagnostic)prefix.output(po[key],key);
  prefix.output(po[primaryFeeds.seed],'nextSeed');prefix.output(po[primaryFeeds.position],'nextPosition');prefix.output(po[primaryFeeds.enabled],'active');prefix.output(px.position,'entryPosition');finish(prefix);
  const suffixRaw={...ir,nodes:structuredClone([...constantNodes,...ir.nodes.slice(cut)]),inputs:[...ir.inputs,...front.map(f=>({...f.descriptor,name:f.original})),{name:'seedAfterAi',shape:['N',8],dtype:'float32'},{name:'positionAfterAi',shape:['N',1],dtype:'int32'}],values:{...ir.values,seedAfterAi:{name:'seedAfterAi',shape:['N',8],dtype:'float32'},positionAfterAi:{name:'positionAfterAi',shape:['N',1],dtype:'int32'}}};
  for(const n of suffixRaw.nodes.slice(constantNodes.length,constantNodes.length+primary.nodes.length))n.inputs=n.inputs.map(k=>k===primaryFeeds.seed?'seedAfterAi':k===primaryFeeds.position?'positionAfterAi':k);
  const pruned=reachable(suffixRaw,ir.outputs),suffix=new Graph('rom-giyumei-prepare-primary2',{...structuredClone(ir.contract),feedback:{},scope:'Exact new six-action primary/cleanup/tension suffix after deferred AI. Initial appeal intermediates are explicit prefix outputs; AI supplies only its seed/position and chosen command. No numerical preparation rule is introduced by the cut. A failed finite AI budget is masked, not counted as a completed decision.',scopeJa:'AI再選択後の乱数・行動と、先に実行した魅了の中間状態から準備処理を再開します。',inputDomains:{...ir.contract.inputDomains,seedAfterAi:{width:8,min:0,max:255,integer:true},positionAfterAi:{width:1,min:1,max:4990,integer:true},continueEnabled:{values:[false,true,0,1]}}});
  const sx={};for(const d of pruned.inputs){const f=front.find(v=>v.original===d.name),name=f?.name??d.name;sx[d.name]=suffix.input(name,d.shape,d.dtype);if(f){suffix.contract.defaults[name]=Array(d.shape[1]).fill(d.dtype==='bool'?false:0);suffix.contract.inputDomains[name]=d.dtype==='bool'?{width:d.shape[1],values:[false,true,0,1]}:d.dtype==='int32'?{width:d.shape[1],min:-2147483648,max:2147483647,integer:true}:{width:d.shape[1],min:-3.4028234663852886e38,max:3.4028234663852886e38};}}
  const cont=suffix.input('continueEnabled',['N',1],'bool');Object.assign(suffix.contract.defaults,{continueEnabled:true,seedAfterAi:row.seed,positionAfterAi:1});sx[primaryFeeds.enabled]=suffix.and(sx[primaryFeeds.enabled],cont);
  const so=suffix.inline(pruned,sx,'suffix');for(const[n,v]of Object.entries(so))suffix.output(v,n);finish(suffix);
  const mapping={schema:'dq9-giyumei-deferred-preparation-cut-v1',authority:'Actual JPN02158dfc/matchingfunc0215767c',originalName,originalSha256:hash(onnx),uncutName:variant.ir.name,uncutNodes:ir.nodes.length,cutIndex:cut,primaryPrefix,primaryNodes:primary.nodes.length,primaryFeeds,frontier:front.map(f=>({input:f.name,original:f.original,dtype:f.descriptor.dtype,width:f.descriptor.shape[1]})),prefix:prefix.name,suffix:suffix.name,admissionProof:variant.proof,contract:'Runtime-generated frontier only. Deferred AI may update definition/cursors and seed/position, then supplies the selected action/target count. It does not change actors or tension. Prefix entryPosition is retained for consumed diagnostics. Component observed states are not substituted for initial whole-combat input.'};
  return{prefix,suffix,mapping};
}
export async function writeGiyumeiPreparation(){const{prefix,suffix,mapping}=await buildGiyumeiPreparation(),models=[];for(const g of[prefix,suffix]){const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}models.push({name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length});}const report={...mapping,models};await writeFile(new URL('giyumei-preparation-cut.json.tmp',dir),JSON.stringify(report,null,2)+'\n');await rename(new URL('giyumei-preparation-cut.json.tmp',dir),new URL('giyumei-preparation-cut.json',dir));return report;}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await writeGiyumeiPreparation();console.log(JSON.stringify({models:r.models,frontier:r.frontier.length,admission:r.admissionProof},null,2));}

