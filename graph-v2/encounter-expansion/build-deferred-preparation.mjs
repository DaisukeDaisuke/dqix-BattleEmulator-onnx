// Cut the existing generated preparation DAG at its actual primary-helper
// boundary. The intervening AI may advance seed/position and choose a command;
// all appeal state is passed explicitly as typed tensors, without host rules.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Graph} from '../graph-builder.mjs';
import {buildNushiPreparation} from './build-nushi-preparation.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {makeJadamaRow} from './jadama-profiles.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const JADAMA_ACTION_IDS=[1,41,469,285,18,462];
function reachable(ir,outputs){const keep=new Set(outputs.map(d=>d.name)),nodes=[];for(let i=ir.nodes.length-1;i>=0;i--){const n=ir.nodes[i];if(n.outputs.some(k=>keep.has(k))){nodes.push(n);n.inputs.forEach(k=>keep.add(k));}}return{...ir,nodes:nodes.reverse(),outputs,inputs:ir.inputs.filter(d=>keep.has(d.name)),initializers:ir.initializers.filter(d=>keep.has(d.name)),values:Object.fromEntries(Object.entries(ir.values).filter(([k])=>keep.has(k)))};}
function finish(g){const names=new Set(g.inputs.map(d=>d.name));for(const key of['inputDomains','fieldDomains','defaults','feedback'])for(const n of Object.keys(g.contract[key]??{}))if(!names.has(n))delete g.contract[key][n];return g;}
export async function buildDeferredPreparation(){
  const row=makeJadamaRow(),full=await buildNushiPreparation({name:'rom-jadama-preparation-unsplit2',row,actionIds:JADAMA_ACTION_IDS,actionRules:JADAMA_ACTION_IDS.map(decodeBossActionRule),contract:{constraints:'One party0/enemy192, tension0, no excluded/immunity/force/counter/reflection or unrepresented confusion replacement. Original304 actions1/41/469/285/18/462. This generated reference is split before primary recovery to insert deferred AI after appeal.',defaults:{seed:row.seed,position:1,actors:row.actors,aux:row.aux,status:row.status,preparationState:row.preparationState,appeal:row.appeal,effectResistances:row.effectResistances,sourceIndex:1,actionId:41,targetCount:1,enabled:true}}});
  const ir=full.json(),primary=JSON.parse(await readFile(new URL('../rom-primary-recovery2.json',dir))),cut=ir.nodes.findIndex(n=>n.outputs.some(k=>k.startsWith('primary_')));
  if(cut<0)throw Error('Missing primary boundary');
  const primaryNames=new Set(primary.inputs.map(d=>d.name)),primaryFeeds={};
  for(let i=0;i<primary.nodes.length;i++){const a=primary.nodes[i],b=ir.nodes[cut+i];if(a.op!==b.op||a.outputs.some((k,j)=>'primary_'+k!==b.outputs[j]))throw Error('Primary inline topology changed');a.inputs.forEach((name,j)=>{if(primaryNames.has(name)){if(primaryFeeds[name]&&primaryFeeds[name]!==b.inputs[j])throw Error('Inconsistent primary feed');primaryFeeds[name]=b.inputs[j];}});}
  const constantNames=new Set(ir.initializers.map(c=>c.name)),constantNodes=[];for(const n of ir.nodes.slice(0,cut))if(n.inputs.every(k=>constantNames.has(k))){n.outputs.forEach(k=>constantNames.add(k));constantNodes.push(n);}
  const produced=new Set(ir.nodes.slice(0,cut).flatMap(n=>n.outputs)),external=new Set(ir.nodes.slice(cut).flatMap(n=>n.inputs).filter(k=>produced.has(k)&&!constantNames.has(k)));
  for(const key of['seed','position','enabled'])if(!primaryFeeds[key])throw Error('Missing boundary '+key);
  external.add(primaryFeeds.seed);external.add(primaryFeeds.position);external.add(primaryFeeds.enabled);
  // Public appeal aliases are after the suffix, but their complete dependency
  // cones are in the prefix. Appending aliases does not execute primary nodes.
  const diagnostic=['appealSuccess','appealType','appealConsumed'];
  const diagnosticGraph=reachable(ir,diagnostic.map(k=>ir.values[k]));
  if(diagnosticGraph.nodes.some(n=>n.outputs.some(k=>k.startsWith('primary_'))))throw Error('Appeal diagnostic crosses primary boundary');
  const preNodes=[...ir.nodes.slice(0,cut),...diagnosticGraph.nodes.filter(n=>!n.outputs.every(k=>produced.has(k)))];
  const front=[...external].map((name,i)=>({original:name,name:`bridge${i}`,descriptor:ir.values[name]}));
  const prefixRaw=reachable({...ir,nodes:preNodes},[...front.map(f=>ir.values[f.original]),...diagnostic.map(k=>ir.values[k])]);
  const prefix=new Graph('rom-jadama-prepare-appeal2',{...structuredClone(ir.contract),feedback:{},routingOnly:false,scope:'Generated preparation prefix through actual appeal, before deferred AI and primary recovery. Every frontier tensor is copied from the original DAG. No AI/primary RNG is performed in this module.',scopeJa:'魅了までの準備処理を実行し、その直後の状態を保持します。この後に準備時AIを挟み、主状態回復へ進みます。',cutAuthority:'JPN02158dfc: appeal, judgment2 AI/reselection, primary recovery, cleanup and incapacity replacement.'});
  const px=Object.fromEntries(prefixRaw.inputs.map(d=>[d.name,prefix.input(d.name,d.shape,d.dtype)])),po=prefix.inline(prefixRaw,px,'prefix');
  for(const f of front)prefix.output(po[f.original],f.name);for(const key of diagnostic)prefix.output(po[key],key);
  prefix.output(po[primaryFeeds.seed],'nextSeed');prefix.output(po[primaryFeeds.position],'nextPosition');prefix.output(po[primaryFeeds.enabled],'active');prefix.output(px.position,'entryPosition');finish(prefix);
  const suffixRaw={...ir,nodes:structuredClone([...constantNodes,...ir.nodes.slice(cut)]),inputs:[...ir.inputs,...front.map(f=>({...f.descriptor,name:f.original})),{name:'seedAfterAi',shape:['N',8],dtype:'float32'},{name:'positionAfterAi',shape:['N',1],dtype:'int32'}],values:{...ir.values,seedAfterAi:{name:'seedAfterAi',shape:['N',8],dtype:'float32'},positionAfterAi:{name:'positionAfterAi',shape:['N',1],dtype:'int32'}}};
  for(const n of suffixRaw.nodes.slice(constantNodes.length,constantNodes.length+primary.nodes.length))n.inputs=n.inputs.map(k=>k===primaryFeeds.seed?'seedAfterAi':k===primaryFeeds.position?'positionAfterAi':k);
  const pruned=reachable(suffixRaw,ir.outputs),suffix=new Graph('rom-jadama-prepare-primary2',{...structuredClone(ir.contract),feedback:{},scope:'Generated original preparation suffix after deferred AI. AI supplies seedAfterAi/positionAfterAi and chosen actionId/targetCount. All earlier appeal values are explicit frontier inputs from the prefix. continueEnabled only masks a failed finite AI computation; no success or random result is inferred on host.',scopeJa:'準備時AIの結果と、先に実行した魅了状態から主状態回復・行動置換を続けます。',inputDomains:{...ir.contract.inputDomains,seedAfterAi:{width:8,min:0,max:255,integer:true},positionAfterAi:{width:1,min:1,max:4990,integer:true},continueEnabled:{values:[false,true,0,1]}}});
  const sx={};for(const d of pruned.inputs){const frontier=front.find(f=>f.original===d.name);const name=frontier?.name??d.name;sx[d.name]=suffix.input(name,d.shape,d.dtype);if(frontier){suffix.contract.defaults[name]=Array(d.shape[1]).fill(d.dtype==='bool'?false:0);suffix.contract.inputDomains[name]=d.dtype==='bool'?{width:d.shape[1],values:[false,true,0,1]}:d.dtype==='int32'?{width:d.shape[1],min:-2147483648,max:2147483647,integer:true}:{width:d.shape[1],min:-3.4028234663852886e38,max:3.4028234663852886e38};}}
  const cont=suffix.input('continueEnabled',['N',1],'bool');suffix.contract.defaults.continueEnabled=true;suffix.contract.defaults.seedAfterAi=row.seed;suffix.contract.defaults.positionAfterAi=1;
  sx[primaryFeeds.enabled]=suffix.and(sx[primaryFeeds.enabled],cont);const so=suffix.inline(pruned,sx,'suffix');for(const[n,v]of Object.entries(so))suffix.output(v,n);finish(suffix);
  const mapping={schema:'dq9-deferred-preparation-cut-v1',authority:'ActualJPN02158dfc/matchingfunc0215767c',uncutName:full.name,uncutNodes:ir.nodes.length,cutIndex:cut,primaryNodes:primary.nodes.length,primaryFeeds,frontier:front.map(f=>({input:f.name,original:f.original,dtype:f.descriptor.dtype,width:f.descriptor.shape[1]})),prefix:prefix.name,suffix:suffix.name,contract:'Only the runtime-generated frontier may be fed to suffix. seedAfterAi/positionAfterAi and actionId/targetCount come from the independent AI module run at this boundary. The original position input remains preparation-entry position for consumed diagnostics.'};
  return{full,prefix,suffix,mapping};
}
export async function saveDeferredPreparation(){const {full,prefix,suffix,mapping}=await buildDeferredPreparation(),models=[];for(const g of[full,prefix,suffix]){const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){const tmp=new URL(f+'.tmp',dir);await writeFile(tmp,v);await rename(tmp,new URL(f,dir));}models.push({name:g.name,nodes:g.nodes.length,bytes:b.length,sha256:hash(b)});}const report={...mapping,models};await writeFile(new URL('jadama-preparation-cut.json.tmp',dir),JSON.stringify(report,null,2)+'\n');await rename(new URL('jadama-preparation-cut.json.tmp',dir),new URL('jadama-preparation-cut.json',dir));return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await saveDeferredPreparation(),null,2));
