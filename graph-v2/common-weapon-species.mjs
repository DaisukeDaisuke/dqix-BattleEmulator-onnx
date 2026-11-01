// Original equipped weapon species coefficients: twelve signed six-bit
// values in three property words. This is input decoding, not battle logic.
export const COMMON_WEAPON_SPECIES_FIELDS=[
  {species:1,word:1,shift:6,matching:'02085968'},
  {species:2,word:0,shift:0,matching:'02085818'},
  {species:3,word:1,shift:24,matching:'02085a10'},
  {species:4,word:2,shift:0,matching:'02085a48'},
  {species:5,word:1,shift:18,matching:'020859d8'},
  {species:6,word:1,shift:12,matching:'020859a0'},
  {species:7,word:1,shift:0,matching:'02085930'},
  {species:8,word:0,shift:6,matching:'02085850'},
  {species:9,word:0,shift:24,matching:'020858f8'},
  {species:10,word:2,shift:6,matching:'02085a80'},
  {species:11,word:0,shift:18,matching:'020858c0'},
  {species:12,word:0,shift:12,matching:'02085888'}
];

export function weaponSpeciesTenthsFromWords(words){
  if(!Array.isArray(words)||words.length!==3||words.some(v=>!Number.isInteger(v)||v<0||v>0xffffffff))throw Error('Weapon property words2fc/300/304 must be three uint32 values');
  return COMMON_WEAPON_SPECIES_FIELDS.map(({word,shift})=>{const value=words[word]>>>shift&63;return value>=32?value-64:value;});
}

export function commonWeaponSpeciesDamage(g,damage,{eligible,weapon,tenths,provided}){
  let selected=g.where(g.eq(weapon[3],1),weapon[2],10);
  if(tenths){
    const decoded=tenths.reduce((value,coefficient,i)=>g.where(g.eq(weapon[3],i+1),coefficient,value),g.constant(10));
    selected=provided?g.where(provided,decoded,selected):decoded;
  }
  // Match the ROM's signed-int conversion and binary32 divide. Multiplying
  // a tenths integer by0.1f would round differently for some coefficients.
  const table=Array.from({length:64},(_,i)=>Math.fround((i-32)/10)),coefficient=g.op('Gather',[g.constant(table,'float32',[64]),g.cast(g.add(selected,32),'int32')],{axis:0},{shape:['N',1]});
  return g.where(g.and(eligible,g.gt(weapon[0],0),g.ge(weapon[3],1),g.le(weapon[3],12)),g.mul(damage,coefficient),damage);
}
