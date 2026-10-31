import {Graph,physical} from '../graph-builder.mjs';
import {RandomGraph,buffStat} from '../transition-graphs.mjs';
import {coupEligibility,coupLevelDuration} from '../lifecycle-rules.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {AUX_FIELDS,CONFIG_FIELDS,DEFAULT_AUX,DEFAULT_CONFIG,DEFAULT_EXTENDED_ACTORS} from '../extended-rules.mjs';
import {extendedInputContract} from '../input-domains.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {writeFile,readFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {auditModelBytes} from './audit-model-artifacts.mjs';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');

export const BOSS_EVENT_IDS=[503,504,900,901,938];
const object=(keys,values)=>Object.fromEntries(keys.map((k,i)=>[k,values[i]]));
export function buildCollectionEventCore(){
  const contract=extendedInputContract();contract.inputDomains.actionId={values:BOSS_EVENT_IDS};
  const g=new Graph('rom-collection-event-core2',{
    ...contract,scopeJa:'行動不能503・MP不足504・回復900/901/938の行動本体です。HPダメージ0でも、自己対象の物理計算・武器反応・必殺判定の乱数を実行します。',defaultSteps:1,
    scope:'Actual JPN021ebd9c core for five audited event action records, targetCount0 before target collection, fallback self target, successful event allocation, two living actors. Primary preparation and post-status are separate.',
    records:BOSS_EVENT_IDS.map(id=>({id,raw:rom.actions.find(a=>a.id===id).raw})),actorFields:ACTOR_FIELDS,auxFields:AUX_FIELDS,configFields:CONFIG_FIELDS,
    order:'Ordinary execution target repetition2; residual-confusion scope1 returns self with0 collection draws. Then shared100, critical10000 with record weight0, accuracy100, physical self-target0/1/2, optional zero-damage bounded2, positive internal weapon callback, party target coup with zero bonus, then party after-action coup. No HP or MP effect.',
    supported:'Source paralysis/sleep/confusion/skip are represented. Event command selection is external; records have no critical/dodge/guard/blind/defend/element/combo flags. Tension, equipment-specific reactions, reflected/countered allocation failures and raw presentation fields remain excluded.',
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',aux:'nextAux',combo:'nextCombo',context:'nextContext'},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:DEFAULT_EXTENDED_ACTORS,aux:DEFAULT_AUX,config:DEFAULT_CONFIG,combo:[1,2,1,192,0,0],context:[1,0],sourceIndex:0,enabled:true,actionId:503},
    labels:{actionId:'503行動不能 /504MP不足 /900麻痺回復 /901睡眠回復 /938混乱回復',actors:'2人の状態',aux:'必殺・怒り・状態期限'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actorInput=g.input('actors',['N',66]),auxInput=g.input('aux',['N',35]),config=g.input('config',['N',7]),comboInput=g.input('combo',['N',6]),contextInput=g.input('context',['N',2]),sourceIndex=g.input('sourceIndex'),enabled=g.input('enabled',['N',1],'bool'),actionId=g.input('actionId'),columns=g.split(actorInput,66),actors=[0,1].map(i=>object(ACTOR_FIELDS,columns.slice(i*33,(i+1)*33))),aux=object(AUX_FIELDS,g.split(auxInput,35)),cfg=object(CONFIG_FIELDS,g.split(config,7)),party=g.eq(sourceIndex,0),source=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,g.where(party,actors[0][k],actors[1][k])])),supported=g.or(...BOSS_EVENT_IDS.map(id=>g.eq(actionId,id))),active=g.and(enabled,supported,g.gt(actors[0].hp,0),g.gt(actors[1].hp,0)),rng=new RandomGraph(g,seed,position);
  // Matching021540fc enters02153f98 early for confusion; all five original
  // event records have scope1 and that helper returns self without repeat RNG.
  const ordinaryCollection=g.and(active,g.not(g.and(party,g.gt(source.confusion,0))));
  for(let i=0;i<2;i++)rng.raw(ordinaryCollection);
  for(let i=0;i<3;i++)rng.raw(active);
  const p=physical(g,rng.seed,rng.position,source.baseAttack,buffStat(g,source.baseDefense,source.defenseRank,'defense',true,source.party),active);rng.seed=p.seed;rng.position=p.position;
  const zero=g.and(active,g.le(p.damage,0)),internal=g.where(active,g.where(zero,rng.bounded(zero,2),p.damage),0);
  rng.raw(g.and(active,g.gt(internal,0)));
  const tryCoup=chance=>{
    const a=actors[0],gate=g.and(active,party),blocked=g.or(g.le(a.hp,0),...['sleep','paralysis','confusion','skip'].map(k=>g.gt(a[k],0))),eligible=coupEligibility(g,{gate,skip:aux.coupSkip,level:a.level,blocked,ready:aux.coupReady});aux.coupSkip=eligible.skip;
    const charged=g.and(eligible.eligible,g.lt(rng.bounded(eligible.eligible,100),chance));aux.coupReady=g.where(charged,1,aux.coupReady);aux.coupDuration=g.where(charged,coupLevelDuration(g,a.level),aux.coupDuration);return charged;
  };
  const hitCharge=tryCoup(0),actionCharge=tryCoup(cfg.coupAfterActionChance),combo=g.split(comboInput,6).map((x,i)=>i===3?x:g.where(active,0,x)),context=g.split(contextInput,2),low=g.add(context[0],g.cast(active,'float32')),carry=g.floor(g.mul(low,1/65536)),high=g.add(context[1],carry),nextContext=g.cat([g.sub(low,g.mul(carry,65536)),g.sub(high,g.mul(g.floor(g.mul(high,1/65536)),65536))]);
  const outputs={nextSeed:rng.seed,nextPosition:rng.position,nextActors:actorInput,nextAux:g.cat(AUX_FIELDS.map(k=>aux[k])),nextCombo:g.cat(combo),nextContext,comboSide:combo[0],comboCount:combo[1],comboAction:combo[2],comboTarget:combo[3],damage:g.mul(source.hp,0),internalDamage:internal,consumed:g.sub(rng.position,position),supported:g.cast(supported,'float32'),active:g.cast(active,'float32'),critical:g.mul(source.hp,0),charged:g.cast(g.or(hitCharge,actionCharge),'float32')};
  for(const [name,value]of Object.entries(outputs))g.output(value,name);return g;
}

export async function buildCollectionTensionEvent(){
  const old=JSON.parse(await readFile(new URL('rom-tension-event-core2.json',dir))),base=buildCollectionEventCore().json();
  for(const record of base.contract.records)if((Buffer.from(record.raw,'hex').readUInt32LE(0x14)>>>28)!==1)throw Error('Original event scope changed');
  const g=new Graph('rom-collection-tension-event-core2',{...structuredClone(old.contract),scope:'Original five event actions with explicit residual-confusion collection. For a party source with confusion, actual021540fc returns through02153f98; every admitted event scope1 returns self and bypasses repeat2 RNG. Enemy collection uses the separate0215440c path and retains its two repeat draws even with confusion. Ordinary party inputs keep the frozen event sequence. Existing appealMode1 and separate tension completion are unchanged. Initial target and event allocation exclusions remain.',authority:[{file:'src/Combat/Overlay_0/func_ov000_021540fc.cpp',rule:'Confusion predicate returns early through02153f98 before repeat helper.'},{file:'src/Combat/Overlay_0/func_ov000_02153f98.cpp',rule:'Scope other than2/8 returns source/count1 without RNG; all admitted five events are scope1.'}],scopeJa:'混乱が残った回復イベントでは、元の対象収集の早期分岐に従って余分な2回の乱数消費を避けます。'}),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),prep=[...g.split(x.preparationState,10)],t=[...g.split(x.tension,6)],mode=g.where(g.eq(x.sourceIndex,0),prep[0],prep[5]),valid=g.or(g.eq(mode,0),g.and(g.eq(mode,1),g.eq(x.sourceIndex,1),g.eq(x.actionId,503))),out=g.inline(base,Object.fromEntries(base.inputs.map(d=>[d.name,d.name==='enabled'?g.and(x.enabled,valid):x[d.name]])),'event'),actors=[...g.split(out.nextActors,66)];
  for(let i=0;i<2;i++){const apply=g.and(g.gt(out.active,0),g.eq(x.sourceIndex,i),g.eq(x.actionId,503),g.eq(mode,1));prep[i*5]=g.where(apply,0,prep[i*5]);prep[i*5+2]=g.where(apply,10,prep[i*5+2]);actors[i*33+ACTOR_FIELDS.indexOf('skip')]=g.where(apply,1,actors[i*33+ACTOR_FIELDS.indexOf('skip')]);actors[i*33+ACTOR_FIELDS.indexOf('defend')]=g.where(apply,0,actors[i*33+ACTOR_FIELDS.indexOf('defend')]);for(const j of[0,1])t[i*3+j]=g.where(apply,0,t[i*3+j]);}
  Object.assign(out,{nextActors:g.cat(actors),supported:g.cast(g.and(valid,g.gt(out.supported,0)),'float32'),nextPreparationState:g.cat(prep),nextTension:g.cat(t)});for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
export async function writeCollectionEvent(){const models=[];for(const g of[buildCollectionEventCore(),await buildCollectionTensionEvent()]){const producers=new Set(g.inputs.map(d=>d.name));for(const n of g.nodes)for(const out of n.outputs){if(producers.has(out))throw Error('Duplicate output '+out);producers.add(out);}const b=g.model();auditModelBytes(b,{name:g.name});models.push({name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}const report={schema:'dq9-event-confusion-collection-v1',models,scope:'New names only. Original event numerical kernels and prior proof bytes stay frozen. Actual same-memory and zero-confusion bridge proofs are separate.'};await writeFile(new URL('collection-event-models.json.tmp',dir),JSON.stringify(report,null,2)+'\n');await rename(new URL('collection-event-models.json.tmp',dir),new URL('collection-event-models.json',dir));return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeCollectionEvent(),null,2));

