// Verification-only memory projection. No battle transition is calculated here.
import {ACTOR_FIELDS} from './rules.mjs';
import {AUX_FIELDS,ACTION_STATUSES} from './extended-rules.mjs';
import {BOSS_STATUS_FIELDS} from './boss-action-rules.mjs';
export function initialStats(a={}){
  const b=Buffer.alloc(0xb0);for(const [key,offset,fallback]of [['hp',0,100],['mp',2,10],['maxHp',4,100],['maxMp',6,100],['attack',8,82],['defense',10,68],['agility',12,0]])b.writeUInt16LE(a[key]??fallback,offset);
  let flags=a.status??0;if(a.poison)flags|=2;if(a.hpRegen)flags|=0x80000000;if(a.mpRegen)flags|=0x40000000;b.writeUInt32LE(flags>>>0,0x14);b.writeUInt32LE(a.flags18??0,0x18);b[0x21]=a.defend??0;b.writeUInt16LE(a.poisonKind??(a.poison?2:0),0x22);b.writeUInt32LE(a.ranksPacked??0,0x58);
  for(const [key,offset]of [['mpDuration',0x68],['hpDuration',0x69],['mpRecovery',0x8b],['hpRecovery',0x8c],['chargeBlock',0x3a],['chargeByte',0x3b],['angerDuration',0x7e],['angerRecovery',0xa1]])b[offset]=a[key]??0;
  b.writeInt16LE(a.angerTarget??0,0x2e);for(let i=0;i<21;i++)b[0x3e+i]=a.resistances?.[i]??100;for(const [offset,value]of Object.entries(a.statBytes??{}))b[Number(offset)]=value;return b;
}
export function projectState(buffers,baseActors,baseAux){
  const actors=[...baseActors],aux=[...baseAux];
  for(let i=0;i<2;i++){
    const b=buffers[i],set=(key,value)=>actors[i*33+ACTOR_FIELDS.indexOf(key)]=value,flags=b.readUInt32LE(0x14),f18=b.readUInt32LE(0x18),ranks=b.readUInt32LE(0x58);
    for(const [key,offset]of [['hp',0],['mp',2],['maxHp',4],['maxMp',6]])set(key,b.readUInt16LE(offset));
    for(const [key,offset]of [['defend',0x21],['hpDuration',0x69],['mpDuration',0x68],['hpRecovery',0x8c],['mpRecovery',0x8b]])set(key,b[offset]);
    for(const [key,mask]of [['paralysis',8],['sleep',16],['confusion',32],['blind',64],['skip',0x80000],['doubleDodge',0x2000000],['hpRegen',0x80000000],['mpRegen',0x40000000]])set(key,+(!!(flags&mask)));
    set('poison',+(!!(flags&2)&&(b[0x22]&3)===2));set('acrobat',+(!!(f18&0x400)));set('doubleGuard',+(!!(f18&1)));
    for(const [j,key]of ['attackRank','defenseRank','agilityRank'].entries()){const v=ranks>>3*j&7;set(key,v<4?v:v-8);}
    for(const s of ACTION_STATUSES){aux[AUX_FIELDS.indexOf(`a${i}_${s.field}Duration`)]=b[s.durationOffset];aux[AUX_FIELDS.indexOf(`a${i}_${s.field}Recovery`)]=b[s.recoveryOffset];}
  }
  const put=(key,value)=>aux[AUX_FIELDS.indexOf(key)]=value;put('coupReady',buffers[0][0x3b]>>3&1);put('coupDuration',buffers[0][0x3b]>>4);put('coupSkip',buffers[0][0x3a]);put('anger',buffers[1].readUInt32LE(0x18)>>12&1);put('angerDuration',buffers[1][0x7e]);put('angerRecovery',buffers[1][0xa1]);put('angerTarget',buffers[1].readInt16LE(0x2e));
  const offsets={poisonKind:0x22,paralysisDuration:0x5c,paralysisRecovery:0x7f,sleepDuration:0x5d,sleepRecovery:0x80,confusionDuration:0x5e,confusionRecovery:0x81},status=BOSS_STATUS_FIELDS.map(k=>{const value=buffers[Number(k[1])][offsets[k.slice(3)]];return k.endsWith('poisonKind')?value&3:value;});return{actors,aux,status,wakeSkip:buffers.map(b=>b[0x3b]&1)};
}
