// Exact signed32/Q12 operations for semantic graphs. Full words and products
// remain byte limbs; no signed32 value is first rounded through FLOAT.
import {normalizeByteCoefficients,multiplyBytes,bytesGreaterEqual} from './build-camera-facing-math.mjs';
export function fixed32Bytes(g,zero){
  const mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),select=(c,a,b)=>a.map((x,i)=>g.where(c,x,b[i])),negative=a=>g.ge(a[3],128),negate=a=>normalizeByteCoefficients(g,a.map((x,i)=>g.add(g.sub(255,x),i===0?1:0)),a.length),add=(a,b)=>normalizeByteCoefficients(g,a.map((x,i)=>g.add(x,b[i])),a.length),sub=(a,b)=>normalizeByteCoefficients(g,a.map((x,i)=>g.sub(x,b[i])),a.length),fromU16=p=>p.flatMap(x=>[mod(x,256),g.floor(g.mul(x,1/256))]),toU16=b=>[g.add(b[0],g.mul(b[1],256)),g.add(b[2],g.mul(b[3],256))],constant=n=>Array.from({length:4},(_,i)=>g.add(zero,Math.floor((n>>>0)/2**(8*i))%256));
  function signedGE(a,b){const na=negative(a),nb=negative(b);return g.where(g.eq(na,nb),bytesGreaterEqual(g,a,b),g.not(na));}
  function multiplyQ12(a,b){const first=g.nodes.length,na=negative(a),nb=negative(b),neg=g.not(g.eq(na,nb)),product=multiplyBytes(g,select(na,negate(a),a),select(nb,negate(b),b),8),rounded=normalizeByteCoefficients(g,product.map((x,i)=>i===0?g.add(x,g.where(neg,255,0)):i===1?g.add(x,g.where(neg,7,8)):x),8),shifted=Array.from({length:4},(_,i)=>g.add(g.floor(g.mul(rounded[i+1],1/16)),g.mul(mod(rounded[i+2],16),16))),result=select(neg,negate(shifted),shifted);exact(first);return result;}
  function divideQ12(a,b){
    const first=g.nodes.length,na=negative(a),nb=negative(b),neg=g.not(g.eq(na,nb)),magnitude=select(na,negate(a),a),denominator=select(nb,negate(b),b),isZero=g.eq(b.reduce((s,x)=>g.add(s,x),zero),0),divisor=[...denominator,zero].map((x,i)=>g.where(isZero,i===0?1:0,x));let remainder=Array(5).fill(zero),quotient=Array(8).fill(zero);
    // Original DIV mode1 divides signed(numerator)<<32 by signed denominator.
    // Preserve its64-bit truncating quotient before SDK +0x80000 and ASR20;
    // direct mathematical rounding differs for negative values near half ties.
    for(let bit=63;bit>=0;bit--){const source=bit>=32?magnitude[Math.floor((bit-32)/8)]:zero,incoming=bit>=32?mod(g.floor(g.mul(source,2**(-((bit-32)%8)))),2):zero,shifted=normalizeByteCoefficients(g,remainder.map((x,i)=>g.add(g.mul(x,2),i===0?incoming:zero)),5),take=bytesGreaterEqual(g,shifted,divisor);remainder=select(take,sub(shifted,divisor),shifted);const at=Math.floor(bit/8);quotient[at]=g.add(quotient[at],g.where(take,2**(bit%8),0));}
    quotient=select(neg,negate(quotient),quotient);const rounded=normalizeByteCoefficients(g,quotient.map((x,i)=>i===2?g.add(x,8):x),8),result=Array.from({length:4},(_,i)=>g.where(isZero,zero,g.add(g.floor(g.mul(rounded[i+2],1/16)),g.mul(mod(rounded[i+3],16),16))));exact(first);return result;
  }
  function exact(first){for(const node of g.nodes.slice(first))if(node.roundingSite){node.exactArithmetic=true;node.exactArithmeticReason='Full32/64-bit words remain base256 digits. Products/carries stay below2^20; restoring division keeps a five-byte remainder, doubles bytes before exact Euclidean carries, and compares chunks<=2^24-1. All arithmetic is exact integer or power-of-two binary32 scaling; original quotient truncation and signed cast/wrap are preserved.';}}
  return{mod,select,negative,negate,add,sub,fromU16,toU16,constant,signedGE,signedLE:(a,b)=>signedGE(b,a),unsignedGE:(a,b)=>bytesGreaterEqual(g,a,b),multiplyQ12,divideQ12,signExtend16:b=>[b[0],b[1],g.where(g.ge(b[1],128),255,zero),g.where(g.ge(b[1],128),255,zero)]};
}
