// New preparation entry for the frozen52 records plus115/134. Original
// word08 bit28 contributes an effective zero cost; its raw cost is retained
// separately in metadata. No previous preparation model is overwritten.
import {Graph} from '../graph-builder.mjs';
import {buildNushiPreparation} from './build-nushi-preparation.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {tensorContract,tensionState,packTension} from './build-tension-actions.mjs';
import {TENSION_FIELDS} from './build-tension-primitives.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export async function buildImpactPreparation(){
  const base=JSON.parse(await readFile(new URL('status-family-program.json',dir),'utf8')),ids=[...base.actionIds,115,134],columns=ids.map(id=>{const a=rom.actions.find(r=>r.id===id);return{id,rawCost:a.mpCost,exempt:a.w08>>>28&1,effectiveCost:(a.w08>>>28&1)?0:a.mpCost};}),rules=ids.map(id=>({...decodeBossActionRule(id),mpCost:columns.find(r=>r.id===id).effectiveCost}));
  const k=(await buildNushiPreparation({name:'rom-impact-preparation-kernel2',actionIds:ids,actionRules:rules,appealObjectFlags(g,flags){const f=[...g.split(flags,8)],t=tensionState(g);f[3]=t[0].high;f[7]=t[1].high;return g.cat(f);}})).json();
  const g=new Graph('rom-impact-preparation2',{
    ...k.contract,fieldDomains:{...k.contract.fieldDomains,tension:tensorContract.fieldDomains},defaults:{...k.contract.defaults,tension:Array(6).fill(0),actionId:115},feedback:{...k.contract.feedback,tension:'nextTension'},tensionFields:TENSION_FIELDS,
    actionIds:ids,mpCostColumns:columns,
    scope:'The existing exact appeal→primary recovery→cleanup→command replacement graph, parameterized by the52 previously represented records plus original115/134. Original word08 bit28 exempts134 from MP-insufficiency replacement while retaining raw cost4 in metadata. Party manual action1 and represented primary/inability events remain permitted. All numerical state is supplied explicitly; no full311 encounter or item identity is inferred.',
    scopeJa:'54行動の準備を共通処理に接続し、シールドアタックのMP検査免除を実ROMフラグから選びます。主状態回復や魅了による行動置換と乱数順序を保持します。',
    authority:{mpExemption:'USA021eaa50 tests action word08 bit28 before checking MP. The fullcaller applies the same flag before expenditure.',prior:'Frozen positive appeal/primary/tension preparation graphs',actual:'evidence-v2/ghidra/emulation-enemy134-mp-control-run/response.json'},
    constraints:'One stable party0 and enemy192; no excluded/mental-immunity/force/equipment/party-AI paths. The actual high-tension flag controls appeal eligibility. Each selected core retains its own full source/target restrictions. No deferred-AI reselection is performed inside this entry.'
  }),x=Object.fromEntries(k.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),out=g.inline(k,x,'prepare'),t=g.split(x.tension,6),state=[0,1].map(i=>({stage:t[i*3],low:t[i*3+1],high:t[i*3+2]})),apply=g.and(out.active,g.not(out.recovered),out.appealSuccess,g.eq(out.appealType,1));
  for(let i=0;i<2;i++){const selected=g.and(apply,g.eq(x.sourceIndex,i));state[i].stage=g.where(selected,0,state[i].stage);state[i].low=g.where(selected,0,state[i].low);}
  out.nextTension=packTension(g,state);for(const[name,value]of Object.entries(out))g.output(value,name);return g;
}
export async function writeImpactPreparation(){const g=await buildImpactPreparation(),b=g.model();auditModelBytes(b,{name:g.name});const report={schema:'dq9-impact-preparation-v1',name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length,actionIds:g.contract.actionIds,mpCostColumns:g.contract.mpCostColumns,scope:g.contract.scope};for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['impact-preparation-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeImpactPreparation(),null,2));
