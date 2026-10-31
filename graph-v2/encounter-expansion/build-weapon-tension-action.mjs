// Explicit resolved weapon properties, with the original post-critical order.
// No inferred item identity, force status, trained approximation or host RNG.
import {buildDispelActionCore} from './build-dispel-action.mjs';
import {buildTensionActionCore,createTensionDamageHooks} from './build-tension-actions.mjs';
import {readDispelMasks} from './build-dispel-mask.mjs';
import {resistanceFraction} from '../boss-action-rules.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const WEAPON_FIELDS=[
  {name:'partyWeaponPresent',min:0,max:1,integer:true},
  {name:'encodedWeaponElement',min:0,max:7,integer:true},
  {name:'species1Tenths',min:-32,max:31,integer:true},
  {name:'enemySpecies',min:0,max:15,integer:true}
];
export function buildWeaponTensionActionCore(audit){
  const previous=buildTensionActionCore(audit).contract,actions=rom.actions,maxId=Math.max(...actions.map(a=>a.id)),equipmentFlags=Array(maxId+1).fill(0);for(const a of actions)equipmentFlags[a.id]=Number(!!(a.w10&0x40000));
  return buildDispelActionCore(audit,{
    name:'rom-weapon-tension-action-core2',...createTensionDamageHooks(),
    postResistanceDamage(g,value,r,{partySource,resistance}){
      const w=g.split(g.input('weapon',['N',4]),4),elements=g.split(g.input('elementResistances',['N',14]),14),present=g.gt(w[0],0),encoded=g.where(present,w[1],0),element=g.where(g.eq(encoded,0),8,encoded),equipmentFlag=g.op('Gather',[g.constant(equipmentFlags,'float32',[equipmentFlags.length]),g.cast(r.id,'int32')],{axis:0},{shape:['N',1]}),eligible=g.and(partySource,g.gt(equipmentFlag,0));
      // Party is the only represented weapon-bearing source. Its opposing
      // enemy uses the second seven explicit elemental susceptibility bytes.
      let byte=resistance[4];for(let i=0;i<7;i++)byte=g.where(g.eq(element,i+1),elements[7+i],byte);
      const fraction=resistanceFraction(g,byte),hasElement=g.and(eligible,g.ge(element,1),g.le(element,7));
      let damage=g.where(hasElement,g.max(g.mul(value,fraction),0),value);
      const fractions=Array.from({length:64},(_,i)=>Math.fround((i-32)/10)),speciesMultiplier=g.op('Gather',[g.constant(fractions,'float32',[64]),g.cast(g.add(w[2],32),'int32')],{axis:0},{shape:['N',1]}),speciesEligible=g.and(eligible,g.eq(w[3],1));
      damage=g.where(speciesEligible,g.mul(damage,g.where(present,speciesMultiplier,1)),damage);
      return{damage,minimumAllowed:g.or(g.not(partySource),g.gt(fraction,0))};
    },
    contract:{
      ...previous,
      fieldDomains:{...previous.fieldDomains,weapon:WEAPON_FIELDS},
      inputDomains:{...previous.inputDomains,elementResistances:{width:14,min:0,max:255,integer:true}},
      defaults:{...previous.defaults,weapon:[1,4,11,1],elementResistances:Array(14).fill(100)},
      weaponFields:WEAPON_FIELDS.map(x=>x.name),
      scope:'Separate extension of the tension-aware40-action core. One explicit party weapon has encoded element0..7 and signed species1 tenth-property, against an explicitly decoded enemy species. Original post-critical action resistance is followed by optional weapon-element resistance, species1 multiplier, then defend/zero fallback/target-high/combo/cap. All remaining species-specific properties are neutral1, force status is absent, and special weapon critical/always1/metal/proc properties are zero. Existing enemy records use unchanged arithmetic. This is a resolved numeric equipment contract, not a recovered item identity.',
      scopeJa:'武器の属性と獣系への倍率を明示入力し、会心判定後・防御補正前という実ROMの順番で適用します。テンションと通常攻撃の対象半減も引き継ぎます。',
      support:previous.support+' The previous equipment exclusion is narrowed only to these explicit properties: weapon presence, encoded element and species1 multiplier. Other equipment effects and force remain unsupported.',
      equipmentAuthority:{
        postprocessor:'JPN021e7328 / USA021e6a90',
        elementGetter:'JPN02086068 / USA02085748',
        elementTable:'JPN021fef64: encoded0→8, encoded1..7→same element',
        species1Getter:'JPN02086288 / USA02085968',
        species1Property:'Party aux +0x2ac signed weapon ID>0; property+0x300 signed6 bits6..11 divided by10. No weapon returns1.',
        monsterSpecies:'Original mons_data2.nat row+0xa bits7..10; level uses the independent low7 bits.',
        actual:'evidence-v2/ghidra/emulation-weapon-property-complete-run/response.json'
      },
      elementResistanceLayout:'Two actors ×7 raw currentStats3e..44 bytes, elements1..7. Normal party action1 also receives its ordinary physical byte in existing resistances[4]. Host composition must route those bytes from the same initial/current state; no probability or resistance formula is evaluated on the host.',
      originalDifference:'The restored goreonn C++ multiplies its literal1.1 before tension/critical. This graph follows actual ROM equipment/species order after critical and preserves any resulting difference.',
      extensionStatus:'New resolved-property component; unchanged old tension/core/encounter hashes are verified at build time. Whole monster313 needs its independent initial-state enclosing-turn proof.'
    }
  });
}
async function main(){
  const audit=await readDispelMasks(),oldBytes=await readFile(new URL('rom-tension-action-core2.onnx',dir)),reproduced=buildTensionActionCore(audit).model();if(hash(oldBytes)!==hash(reproduced))throw Error('Frozen tension core changed');
  const g=buildWeaponTensionActionCore(audit),b=g.model(),r={schema:'dq9-weapon-tension-model-v1',name:g.name,sha256:hash(b),bytes:b.length,nodes:g.nodes.length,oldTensionSha256:hash(oldBytes),oldRegeneratedEqual:true,weaponFields:WEAPON_FIELDS};
  for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['weapon-tension-action-model.json',JSON.stringify(r,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}console.log(JSON.stringify(r,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
