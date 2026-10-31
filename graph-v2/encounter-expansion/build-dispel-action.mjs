// Decode represented state writes from the independently audited byte masks;
// the shared caller retains the exact arithmetic and RNG ordering.
import {buildColumnActionCore} from './build-column-action.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {ACTION_STATUSES} from '../extended-rules.mjs';
import {readDispelMasks} from './build-dispel-mask.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const fields=[
  ['attackRank',0x58,0,3],['defenseRank',0x58,3,3],['agilityRank',0x58,6,3],
  ['blind',0x14,6,1],['sleep',0x14,4,1],['confusion',0x14,5,1],['paralysis',0x14,3,1],['skip',0x14,19,1],
  ['acrobat',0x18,10,1],['doubleDodge',0x14,25,1],['doubleGuard',0x18,0,1],['hpRegen',0x14,31,1],['mpRegen',0x14,30,1],
  ['hpDuration',0x69,0,8],['mpDuration',0x68,0,8],['hpRecovery',0x8c,0,8],['mpRecovery',0x8b,0,8],['defend',0x21,0,8]
];
export function decodedDispelColumns(audit){
  function retained(offset,shift,width){let value=0;for(let bit=0;bit<width;bit++){const absolute=shift+bit;value|=((audit.andMaskBytes176[offset+(absolute>>3)]>>(absolute&7))&1)<<bit;}if(value!==0&&value!==2**width-1)throw Error('A represented semantic field has a partial mask');return value!==0;}
  const actor=fields.map(([field,offset,shift,width])=>({field,offset,shift,width,retained:retained(offset,shift,width)})),aux=ACTION_STATUSES.flatMap(s=>[['Duration',s.durationOffset],['Recovery',s.recoveryOffset]].map(([suffix,offset])=>({field:s.field+suffix,offset,shift:0,width:8,retained:retained(offset,0,8)})));
  return{actor,aux};
}
export function buildDispelActionCore(audit,options={}){
  const previous=buildColumnActionCore().contract,a=rom.actions.find(x=>x.id===189),b=Buffer.from(a.raw,'hex'),rule={...decodeBossActionRule(189),damageId:a.damageId,damageCap:b.readUInt32LE(28)&0x3fff,forcedCritical:a.w08>>>29&1,selector:a.selector},columns=decodedDispelColumns(audit);
  if(rule.operation!==49||rule.damageId!==0||rule.selector!==0||rule.additional!==0||rule.mpCost!==10)throw Error('Unexpected immutable dispel189 record');
  return buildColumnActionCore({...options,name:options.name??'rom-dispel-action-core2',additionalRules:[rule,...(options.additionalRules??[])],contract:{
    scope:'The39 prior audited single-target action records plus enemy189 positive-dispel operation49, one live existing opposing target. The represented state writes are generated from the exact176-byte mask audited against all32 clear helpers. The shared pre-critical/shared/accuracy/base-damage/weapon/coup phase order is unchanged. MP must cover10 or be enemy255; preparation handles insufficient MP separately.',
    scopeJa:'共通39行動にいてつくはどうを追加します。32解除関数の実ROM保持マスクから状態欄の解除を生成し、命中・内部ダメージ・武器反応・必殺判定の順序を共有します。',
    dispelAuthority:{maskFile:audit.path,maskSha256:audit.sha256,source:audit.source,sourceSha256:audit.sourceSha256,operation:'JPN021e0b48 / USA021e02b0',clear:'JPN021eb028 / USA021ea85c',rawMaskModel:'rom-dispel-byte-mask176'},
    dispelColumns:columns,
    stateProjection:'actors66/aux35/status14/preparation10 plus wake/combo/context only. Base attack/defense/agility are retained; resetting their ranks causes subsequent current stats to use the existing exact ROM buff formula. This does not expose all176 RAM bytes or calculate unrepresented charm/might/mending states. Those ranks must be inactive for full caller composition, as must barriers, reflection, tension and unrepresented control flags. The separate raw-mask primitive accepts arbitrary bytes at the narrower pre-recalculation boundary.',
    excludedRawStatusMask:0x01800000,
    excludedRawRanksMask:0x3fe00,
    allowedPartyAcrobatActionIds:[189],
    fieldDomains:{...previous.fieldDomains,actors:previous.fieldDomains.actors.map(d=>d.name==='actor0.acrobat'?{name:d.name,min:0,max:1,integer:true}:d)},
    acrobatContract:'The target party acrobat flag is supported for189 only: this record has neither dodge nor guard, and the clear operation removes acrobat before later eligibility. For all previous action records, party acrobat remains unsupported.',
    retainedDispelFields:'Primary paralysis/sleep/confusion/blind and their durations/recovery, poison subtype, coup ready/duration/block, anger, defend, preparation and wake flags retain their original mask values. HP/MP and base stats are unchanged by the clearing operation; the normal caller still spends source MP and may execute its later coup phase.',
    defaults:{...previous.defaults,actionId:189},
    extensionStatus:'Separate40-record variant;39,33 and all encounter programs are frozen. Actual-ROM caller comparisons are required before use in an encounter.',
    ...(options.contract??{})
  },partyAcrobatSupport(g,r,before){return g.or(g.eq(before[0].acrobat,0),g.eq(r.id,189));},targetEffect(g,r,hit,parameters){
    const {sourceIndex,nextTarget,aux}=parameters;
    const applied=g.and(hit,g.eq(r.operation,49)),target={};
    for(const c of columns.actor)if(!c.retained)target[c.field]=g.where(applied,0,nextTarget[c.field]);
    for(let i=0;i<2;i++){const selected=g.and(applied,g.eq(sourceIndex,1-i));for(const c of columns.aux)if(!c.retained){const name=`a${i}_${c.field}`;aux[name]=g.where(selected,0,aux[name]);}}
    const extra=options.targetEffect?options.targetEffect(g,r,hit,parameters):null;
    if(extra?.target)Object.assign(target,extra.target);
    return{applied:extra?.applied?g.or(applied,extra.applied):applied,target};
  }});
}
async function main(){
  const frozen=await readFile(new URL('rom-column-action-core2.onnx',dir));if(hash(frozen)!==hash(buildColumnActionCore().model()))throw Error('Default39 generator no longer reproduces its frozen bytes');
  const audit=await readDispelMasks(),g=buildDispelActionCore(audit),bytes=g.model(),report={schema:'dq9-dispel-action-model-v1',name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length,actionIds:g.contract.inputDomains.actionId.values,immutable39Sha256:hash(frozen),immutable39RegeneratedEqual:true,maskSha256:audit.sha256,proofStatus:'Pending actual caller and existing-case comparisons.'};
  for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['dispel-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
