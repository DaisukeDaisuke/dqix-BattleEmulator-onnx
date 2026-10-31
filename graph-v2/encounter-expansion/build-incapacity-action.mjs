// Action160 adds one shared status transition to the same numeric caller.
// Its raw skip kind belongs to persistent preparation state, not a host flag.
import {buildSelectedActionCore} from './build-physical-selectors.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {PREPARATION_FIELDS,PREPARATION_DOMAINS} from './build-nushi-preparation.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const fields=['appealMode','appealTarget','skipKind','incapacitatedThisAction','pendingRecoveryMessage'];
export function buildIncapacityActionCore(options={}){
  const prior=buildSelectedActionCore().contract,a=rom.actions.find(x=>x.id===160),bytes=Buffer.from(a.raw,'hex');
  const rule={...decodeBossActionRule(160),damageId:a.damageId,damageCap:bytes.readUInt32LE(28)&0x3fff,forcedCritical:a.w08>>>29&1,selector:a.selector,effectElement:a.w18>>>27&31};
  if(rule.operation!==10||rule.additional!==1||rule.secondaryParameter!==5||rule.selector!==0||rule.effectElement!==15)throw Error('Unexpected immutable action160 record.');
  let state;
  const extraRules=options.additionalRules??[];
  return buildSelectedActionCore({...options,name:options.name??'rom-incapacity-action-core2',additionalRules:[rule,...extraRules],
    contract:{...prior,actionRules:[...prior.actionRules,rule,...extraRules],inputDomains:{...prior.inputDomains,actionId:{values:[...prior.inputDomains.actionId.values,160,...extraRules.map(r=>r.id)]}},fieldDomains:{...prior.fieldDomains,preparationState:PREPARATION_DOMAINS},
      scope:'The32 prior explicit single-target action records plus enemy action160 operation10/additional1/skipKind5. The raw mental-immunity flag0x1000000 must be absent. Source eligibility and all previous current-stat/equipment/routing exclusions remain. This component returns persistent skip metadata for later actual preparation/event/post graphs; it does not silently skip those phases.',
      scopeJa:'共通32行動に敵のおたけびを追加します。命中後に行動不能種別5と防御解除を記録し、次の準備・イベント・行動後処理へ状態を渡します。',
      preparationFields:PREPARATION_FIELDS,defaults:{...prior.defaults,actionId:160,preparationState:Array(10).fill(0)},feedback:{...prior.feedback,preparationState:'nextPreparationState'},
      excludedRawStatusMask:0x1000000,
      resistanceContract:'resistances[2] is the selected primary-effect byte for action160 element15 (raw stats4c), and sleep element10 for228. Slots0/1 remain DEF/AGI rank resistance, slot3 poison, slot4 selected damage element. All values are initial/current input bytes; no oracle output supplies them.',
      skipAuthority:[{table:'evidence-v2/ghidra/operation-table81.json',address:'JPN021ffce8',entry:10,handler:'JPN021dc964 / USA021dc0b8'},{function:'JPN021e3468 / USA021e2bd0',rule:'Operation10 bypasses the additional-effect probability draw; effect applies only after primary accuracy.'},{function:'JPN02088d70 / USA02088474',rule:'Set skip and subtype5, clear defend; sleep/confusion and3b/3c stay unchanged. Primary paralysis or the same active skip subtype rejects the setter.'}],
      representation:'The state ABI represents actors66,aux35,status14,combo6 and preparationState10. Other raw flag/tension/presentation bytes are outside this decoded projection; their static setter effects are preserved in the ROM evidence, not claimed as model outputs.',
      extensionStatus:'New33-record component; immutable32/28/8 and published encounter programs are retained. Fullcaller and same-memory followup validation are separate.',
      ...(options.contract??{})
    },
    targetEffect(g,currentRule,hit,parameters){
      const {sourceIndex,target,nextTarget}=parameters;
      const columns=g.split(g.input('preparationState',['N',10]),10);state=[0,1].map(i=>Object.fromEntries(fields.map((name,j)=>[name,columns[i*5+j]])));
      const oldKind=g.where(g.eq(sourceIndex,0),state[1].skipKind,state[0].skipKind);
      const applied=g.and(hit,g.eq(currentRule.operation,10),g.eq(target.paralysis,0),g.or(g.eq(target.skip,0),g.not(g.eq(oldKind,currentRule.secondaryParameter))));
      for(let i=0;i<2;i++)state[i].skipKind=g.where(g.and(applied,g.eq(sourceIndex,1-i)),currentRule.secondaryParameter,state[i].skipKind);
      const result={applied,target:{skip:g.where(applied,1,nextTarget.skip),defend:g.where(applied,0,nextTarget.defend)}};
      if(options.targetEffect){const extra=options.targetEffect(g,currentRule,hit,{...parameters,preparation:state});if(extra?.target)Object.assign(result.target,extra.target);if(extra?.applied)result.applied=g.or(result.applied,extra.applied);}
      return result;
    },
    extraOutputs(g,parameters){
      const {actors,active}=parameters;
      for(let i=0;i<2;i++){const dead=g.and(active,g.le(actors[i].hp,0));for(const key of['appealMode','skipKind'])state[i][key]=g.where(dead,0,state[i][key]);}
      return{nextPreparationState:g.cat(state.flatMap(s=>fields.map(key=>s[key]))),...(options.extraOutputs?options.extraOutputs(g,{...parameters,preparation:state}):{})};
    }
  });
}
async function main(){
  const old=await readFile(new URL('rom-selected-action-core2.onnx',directory));if(hash(old)!==hash(buildSelectedActionCore().model()))throw Error('Frozen32-action core changed.');
  const g=buildIncapacityActionCore(),bytes=g.model(),ir=g.json(),report={schema:'dq9-incapacity-action-v1',name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length,actionIds:g.contract.inputDomains.actionId.values,unchangedPreviousSha256:hash(old),proofStatus:'Pending actual caller/followup comparison.'};
  for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(ir,null,2)+'\n'],['incapacity-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',directory),value);await rename(new URL(file+'.tmp',directory),new URL(file,directory));}
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
