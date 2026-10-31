import{physical}from'../graph-builder.mjs';
import{buildBossActionCore}from'../build-boss-action.mjs';
import{buildBossCommandRoute}from'../boss-phases.mjs';
import{decodeBossActionRule,resistanceFraction}from'../boss-action-rules.mjs';
import{enemyPackedDamage,buildRubbleCore}from'./build-packed-damage.mjs';
import{makeNushiRow,nushiProfileAudit,MONSTER305}from'./nushi-profiles.mjs';
import rom from'../../restored/dq9-unified/data/rom.mjs';
import{readFile,writeFile,rename}from'node:fs/promises';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
const directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const NUSHI_ACTION_IDS=[1,94,548];
export const NUSHI_ACTION_RULES=NUSHI_ACTION_IDS.map(id=>{const a=rom.actions.find(x=>x.id===id),v=new DataView(Uint8Array.from(a.raw.match(/../g),x=>parseInt(x,16)).buffer);return{...decodeBossActionRule(id),damageId:a.damageId,damageCap:v.getUint32(0x1c,true)&0x3fff};});
// The proved core's doc metadata predates the preparation wrapper. Preserve
// that exact snapshot instead of letting unrelated outer-profile fields alter
// an immutable binary/hash. appealState is historical metadata, not a core
// input; the live composite uses its separately declared preparationState10.
function frozenCoreDefaults(){const{effectResistances,preparationState,ai,...row}=makeNushiRow();return{...row,appealState:[0,-1],ai};}
export function buildNushiCore(){
  return buildBossActionCore({name:'rom-nushi-action-core2',actionIds:NUSHI_ACTION_IDS,actionRules:NUSHI_ACTION_RULES,
    contract:{scope:'Actual JPN021ebd9c one-existing-target boundary: party normal1 and enemy normal1/sweep94/tsunami548. Enemy critical threshold0. Target-count attenuation outside this1v1 scope is not assumed. Action94 final damage cap1999; actions1/548 have cap0 (no cap). Reuses the exact checked shared pipeline and packed enemy table111.',
      scopeJa:'通常攻撃・敵なぎはらい・つなみの1対象行動本体。なぎはらいの最終1999上限と実ROM表111を接続します。AI・魅了・行動前後処理・カメラは外側です。',
      actionRules:NUSHI_ACTION_RULES,monsterRecord:MONSTER305,defaults:{...frozenCoreDefaults(),sourceIndex:1,enabled:true,actionId:548,resistances:Array(5).fill(100)},
      resistanceFields:['defenseRank','agilityRank','sleep','poison','physical'],damageCap:'word1c&0x3fff is applied after binary32 combo/defense/resistance and integer truncation, before HP application. A zero cap means no limit.',
      authority:[{file:'src/Combat/Overlay_24/GetAttackBaseDamage.cpp',jpnAddress:'021e8458'},{file:'src/Combat/Overlay_24/func_ov024_021e6a90.cpp',rule:'finalvar38 integer conversion followed by nonzero14-bit cap'},{file:'src/Combat/Overlay_24/func_ov024_021eb5d0.cpp',rule:'Base damage, callback selector0, postprocess, operationHP, wake/proc/coup order'}]},
    baseDamage(g,rng,rule,hit,{attack,defense}){const packed=g.gt(rule.damageId,0),p=physical(g,rng.seed,rng.position,attack,defense,g.and(hit,g.not(packed)));rng.seed=p.seed;rng.position=p.position;const table=enemyPackedDamage(g,rng,rule.damageId,g.and(hit,packed));return{seed:rng.seed,position:rng.position,damage:g.where(packed,table.damage,p.damage)};},
    damageResistance(g,rule,resistance){return g.where(g.eq(rule.damageElement,0),1,resistanceFraction(g,resistance[4]));},
    finalDamage(g,value,rule){return g.where(g.gt(rule.damageCap,0),g.min(value,rule.damageCap),value);}
  });
}
export function buildNushiCommandRoute(){const row=makeNushiRow();return buildBossCommandRoute({name:'rom-nushi-command-route2',actionIds:NUSHI_ACTION_IDS,actionRules:NUSHI_ACTION_RULES,contract:{scope:'Checked ordinary/event/primary/MP command routing, extended only to enemy94/548 and party normal1.',scopeJa:'通常攻撃・なぎはらい・つなみと主状態イベントを実行グラフへ接続します。',defaults:{actors:row.actors,aux:row.aux,sourceIndex:1,actionId:548,targetCount:1,recovered:false,enabled:true}}});}
async function main(){
  const checked=[];for(const[name,generated,path]of[['rom-boss-action-core2',buildBossActionCore(),'../'],['rom-rubble-action-core2',buildRubbleCore(),'']]){const bytes=await readFile(new URL(path+name+'.onnx',directory));if(hash(bytes)!==hash(generated.model()))throw Error('Validated baseline changed: '+name);checked.push({name,sha256:hash(bytes),regeneratedEqual:true});}
  const models=[];for(const g of[buildNushiCore(),buildNushiCommandRoute()]){const m=await g.save(directory);models.push({...m,sha256:hash(g.model())});}
  for(const[file,value]of[['nushi-action-models.json',{models,unchanged:checked}],['nushi-initial-profile-audit.json',{schema:'dq9-initial-profile-field-audit-v1',profiles:nushiProfileAudit()}]]){await writeFile(new URL(file+'.tmp',directory),JSON.stringify(value,null,2)+'\n');await rename(new URL(file+'.tmp',directory),new URL(file,directory));}
  console.log(JSON.stringify({models:models.map(x=>({name:x.name,nodes:x.nodes,bytes:x.bytes,sha256:x.sha256})),unchanged:checked},null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
