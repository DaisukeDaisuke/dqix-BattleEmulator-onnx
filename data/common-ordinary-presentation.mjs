// Browser-safe decoding of immutable original action data. Result arithmetic
// and message/allocation decisions remain inside the shared ONNX modules.
export const COMMON_ORDINARY_ACTION_FIELDS=Object.freeze([
  'operation','additional','secondaryParameter','afterAction','combo',
  'startParty','startEnemy','hitParty','hitEnemy','untargetedParty','untargetedEnemy',
  'tailParty','tailEnemy','criticalParty','criticalEnemy','noDamageMpMessage','specialHeader'
]);

export function commonOrdinaryActionData(raw){
  if(typeof raw!=='string'||raw.length!==104)throw Error('Expected the original 52-byte action definition');
  const bytes=Uint8Array.from(raw.match(/../g),s=>parseInt(s,16)),view=new DataView(bytes.buffer),w=at=>view.getUint32(at,true),id=view.getUint16(4,true);
  return[w(24)>>>5&127,w(24)&31,view.getInt16(50,true),w(44)>>>10&15,w(44)>>>27&1,
    w(32)&1023,w(32)>>>10&1023,w(32)>>>20&1023,w(36)&1023,w(36)>>>10&1023,w(36)>>>20&1023,
    w(40)&1023,w(40)>>>10&1023,w(40)>>>20&1023,w(44)&1023,w(16)>>>25&1,
    Number([97,121,154,336,358,359,500,527,908,909,910,911].includes(id))];
}
