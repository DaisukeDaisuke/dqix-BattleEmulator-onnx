// Packed ROM damage rows are fixed parameters, not learned approximations.
// The enemy branch is shared by every action with a non-null damage record.
import {Graph,physical} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import {decodeBossActionRule,resistanceFraction} from '../boss-action-rules.mjs';
import {buildBossActionCore} from '../build-boss-action.mjs';
import {makeBurudogaRow,PROFILE_LIMITS,BURUDOGA_SOURCES} from './profiles.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const DIRECTORY=new URL('./',import.meta.url);
export const PACKED_ROWS=rom.damage.map(x=>({...x}));
const lastId=Math.max(...PACKED_ROWS.map(x=>x.id));
const byId=new Map(PACKED_ROWS.map(x=>[x.id,x]));
const lookupColumn=(g,id,key)=>g.op('Gather',[
  g.constant(Array.from({length:lastId+1},(_,i)=>byId.get(i)?.[key]??0),'float32',[lastId+1]),
  g.cast(id,'int32')
],{axis:0},{shape:['N',1]});
export function enemyPackedDamage(g,rng,damageId,enabled){
  const present=lookupColumn(g,damageId,'id'),base=lookupColumn(g,damageId,'base0'),width=lookupColumn(g,damageId,'width');
  const supported=g.gt(present,0),active=g.and(enabled,supported);
  // GetAttackBaseDamage stores a binary32 FloatBetween result, adds base in
  // binary32, then truncates toward zero. Every mined enemy base>=width, so
  // Floor is exactly the required conversion on the complete represented table.
  const spread=rng.range(active,g.sub(0,width),width),raw=g.add(base,spread);
  return{damage:g.where(active,g.floor(raw),0),raw:g.where(active,raw,0),supported,active,base,width};
}
export function buildPackedDamage(){
  const g=new Graph('rom-enemy-packed-damage',{
    scope:'Enemy branch of GetAttackBaseDamage for all123 mined non-null damage records. One random FloatBetween draw even when width is zero. No action hit, resistance, defense, critical, HP update or camera phases.',
    scopeJa:'敵用の固定範囲ダメージ表123行を実ROMのfloat32式で計算します。幅0も乱数1回消費。命中・耐性・HP更新は呼出側です。',
    authority:[{file:'src/Combat/Overlay_24/GetAttackBaseDamage.cpp',matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',jpnAddress:'overlay24:0x021e8458'},
      {file:'src/Util/Random.cpp',rule:'NextRandomFloatBetween: binary32 subtraction, multiplication and addition, using binary64 raw/(2^32-1) followed by binary32.'}],
    romSha256:rom.romSha256,records:PACKED_ROWS,
    tableBounds:{baseMin:Math.min(...PACKED_ROWS.map(x=>x.base0)),baseMax:Math.max(...PACKED_ROWS.map(x=>x.base0)),widthMax:Math.max(...PACKED_ROWS.map(x=>x.width)),allBaseAtLeastWidth:PACKED_ROWS.every(x=>x.base0>=x.width)},
    inputDomains:{seed:{min:0,max:255,integer:true},position:{min:1,max:4990,integer:true},damageId:{min:0,max:lastId,integer:true}},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,damageId:109,enabled:true},
    feedback:{seed:'nextSeed',position:'nextPosition'},
    labels:{damageId:'ROMダメージ表ID（109はガレキ落とし）'},
    absentRows:'A missing table ID reports supported=false and returns state/RNG identity; it is not replaced with physical damage.',
    seed:'Current LCG state immediately before the next draw, eight little-endian bytes. Position is a counter; no skip-ahead is performed.'
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),id=g.input('damageId'),enabled=g.input('enabled',['N',1],'bool'),rng=new RandomGraph(g,seed,position);
  const out=enemyPackedDamage(g,rng,id,enabled);
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),...out}))g.output(value,name);
  return g;
}

export function buildRubbleCore(){
  const ids=[1,546],rules=ids.map(id=>({...decodeBossActionRule(id),damageId:rom.actions.find(a=>a.id===id).damageId}));
  return buildBossActionCore({name:'rom-rubble-action-core2',actionIds:ids,actionRules:rules,
    contract:{
      scope:'Actual JPN021ebd9c core boundary for normal action1 on either side and enemy action546 (rubble). One existing live target, successful event allocation. Reuses the verified common action pipeline; only the ROM packed base-damage rule and selected damage-element resistance differ.',
      scopeJa:'通常攻撃と敵ガレキ落としの行動本体。既存の命中・回避・盾・状態・必殺・怒り・コンボ規則を共有し、ROM表109の固定範囲ダメージを接続します。',
      resistanceFields:['defenseRank','agilityRank','sleep','poison','selectedDamageElement'],
      resistanceContract:'resistances[4] is the target byte for the actual damage element:8 for action1,5 for action546. It is supplied from the initial/current actor resistance data, never inferred from observed damage.',
      labels:{actionId:'1通常攻撃 /546ガレキ落とし',resistances:'DEF・AGI・睡眠・毒・選択ダメージ属性の耐性率'},
      extension:'This separate model leaves rom-boss-action-core2 unchanged. It does not claim arbitrary party actions or other fixed-range action callers are implemented.',
      provenance:{profile:'Unchanged original burudoga_v9_no_tate vitals/stats; ROM300 and action546 records.',source:BURUDOGA_SOURCES.find(x=>x.variant==='burudoga_v9_no_tate').source,limits:PROFILE_LIMITS},
      defaults:{...makeBurudogaRow(),actionId:546,sourceIndex:1,enabled:true,resistances:[100,100,100,100,100]}
    },
    baseDamage(g,rng,rule,hit,{attack,defense}){
      const packed=g.gt(rule.damageId,0),p=physical(g,rng.seed,rng.position,attack,defense,g.and(hit,g.not(packed)));
      rng.seed=p.seed;rng.position=p.position;
      const table=enemyPackedDamage(g,rng,rule.damageId,g.and(hit,packed));
      return{seed:rng.seed,position:rng.position,damage:g.where(packed,table.damage,p.damage)};
    },
    damageResistance(g,rule,resistance){return g.where(g.eq(rule.damageElement,0),1,resistanceFraction(g,resistance[4]));}
  });
}

async function main(){
  await mkdir(DIRECTORY,{recursive:true});
  const baseline=await readFile(new URL('../rom-boss-action-core2.onnx',import.meta.url)),regenerated=buildBossActionCore().model(),hash=x=>createHash('sha256').update(x).digest('hex');
  if(hash(baseline)!==hash(regenerated))throw Error('Common builder changed the validated monster303 model.');
  const models=[];
  for(const g of[buildPackedDamage(),buildRubbleCore()]){const result=await g.save(DIRECTORY);models.push({...result,sha256:hash(g.model())});}
  const report={schema:'dq9-encounter-expansion-models-v1',models,unchangedBaseline:{name:'rom-boss-action-core2',sha256:hash(baseline),regeneratedEqual:true},romSha256:rom.romSha256};
  await writeFile(new URL('models.json.tmp',DIRECTORY),JSON.stringify(report,null,2)+'\n');await rename(new URL('models.json.tmp',DIRECTORY),new URL('models.json',DIRECTORY));
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
