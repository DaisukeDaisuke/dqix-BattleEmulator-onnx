// New names only. The old42-action family and all encounter programs are
// immutable; the common schedule generator must reproduce them byte-for-byte.
import {buildActionFamilyProgram} from './build-action-family-program.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex'),old=await readFile(new URL('action-family-program.json',dir)),reproduced=await buildActionFamilyProgram({persist:false,returnProgram:true});
if(hash(old)!==hash(JSON.stringify(reproduced.program,null,2)+'\n'))throw Error('Frozen42-action schedule changed');
const core=JSON.parse(await readFile(new URL('rom-dispel-action-core2.json',dir),'utf8')),fields=structuredClone(core.contract.fieldDomains);
fields.actors=fields.actors.map(r=>r.name==='actor0.acrobat'?{...r,min:0,max:0}:r.name==='actor1.level'?{...r,max:99}:r);
fields.combo=fields.combo.map((r,i)=>i===1?{...r,max:126}:r);
const {program,report}=await buildActionFamilyProgram({
  coreName:'rom-dispel-action-core2',entryName:'rom-repeated-family-entry2',hitName:'rom-repeated-family-hit2',finishName:'rom-repeated-family-finish2',repeatedIds:[73,292,539,542,555],totalDamageMax:262144,
  routeName:'rom-action-family-v2-route2',resultName:'rom-action-family-v2-result2',outputBase:'action-family-v2',programName:'dq9-action-family47-caller',returnProgram:true,
  scope:'Typed routing over40 exact single-target records, five repeated records73/292/539/542/555 and two enemy self-heal records30/587. Party action1 only; all other records enemy-only. The same complete input batch traverses one shared single-hit core and one reused repeated hit core. Unknown IDs/sides preserve state/RNG and return supported0. To stay inside every immutable unselected module domain, this composed boundary excludes target-party acrobat, limits enemy level to99, initial comboCount to126 and entry position to4900. The direct189 component separately represents acrobat clearing; that larger direct scope is not silently added here. No primary/post, enclosing turn, camera or whole-configuration claim.',
  scopeJa:'単発40行動、連続攻撃5行動、自己回復2行動を共通の呼び出し口へ接続します。敵側の47行動と味方の通常攻撃が対象です。',
  routeContract:{fieldDomains:fields,compositionLimits:'Party acrobat must be0 even for189 because unselected legacy self-heal inputs retain that domain. Initial comboCount<=126 ensures the one selected caller update stays within127 for later module guards. Other inherited exclusions and vital relations still apply.'}
});
report.immutablePriorProgramSha256=hash(old);report.immutablePriorRegeneratedEqual=true;report.actionCount=program.actionIds.length;
await writeFile(new URL('action-family-v2-program-build.json.tmp',dir),JSON.stringify(report,null,2)+'\n');await rename(new URL('action-family-v2-program-build.json.tmp',dir),new URL('action-family-v2-program-build.json',dir));
console.log(JSON.stringify({...report,modules:report.modules.map(m=>({name:m.name,sha256:m.sha256,nodes:m.nodes}))},null,2));
