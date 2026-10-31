// Independent executable transcription of matching source arithmetic, not an
// ONNX evaluator. Float32 nodes in the graph are compared with these routines.
export const F=Math.fround;
export const MASK=(1n<<64n)-1n,A=0x5d588b656c078965n,C=0x269ec3n;
export const nextSeed=seed=>(seed*A+C)&MASK;
export const raw32=seed=>Number(seed>>32n);
export const float01=raw=>F(raw/4294967295);
export const randomMax=(raw,max)=>max<=0?0:Math.min(max-1,Math.trunc(F(F(max)*float01(raw))));
export const randomBetween=(raw,min,max)=>F(F(F(max-min)*float01(raw))+min);
export function physicalReference(seed,position,attack,defense){
  let value=F(F(F(attack)-F(F(defense)/2))/2),consumed=0;
  if(value>0){
    const minimum=F(F(attack)/16);seed=nextSeed(seed);consumed++;
    if(value<=minimum)value=randomBetween(raw32(seed),0,minimum);
    else{
      const width=F(value/16),percentage=randomBetween(raw32(seed),F(-width),width);
      seed=nextSeed(seed);consumed++;
      const flat=randomBetween(raw32(seed),-1,1);
      value=F(F(value+percentage)+flat);
    }
  }
  return {seed,position:position+consumed,damage:Math.trunc(Math.max(0,value)),consumed};
}
export const seedBytes=seed=>Array.from({length:8},(_,i)=>Number((seed>>BigInt(8*i))&255n));
export const bytesSeed=bytes=>Array.from(bytes).reduce((v,x,i)=>v+(BigInt(x)<<BigInt(i*8)),0n);
export const rawBytes=raw=>[raw&255,(raw>>>8)&255,(raw>>>16)&255,raw>>>24];
export const hex=seed=>'0x'+seed.toString(16).padStart(16,'0');

export function buffReference(base,rank,kind,partyCap,party){
  const multiplier=kind==='quarter'?1+.25*rank:kind==='defense'?(rank<0?.75+.25*rank:1+.5*rank):kind==='charm'?1+.5*Math.max(0,rank):1+.5*rank;
  return Math.min(Math.trunc(F(base*multiplier))&65535,partyCap&&!party?65535:999);
}
export class RandomReference {
  constructor(seed,position){this.seed=seed;this.position=position;}
  raw(){this.seed=nextSeed(this.seed);this.position++;return raw32(this.seed);}
  bounded(max){return randomMax(this.raw(),max);}
  range(min,max){return randomBetween(this.raw(),F(min),F(max));}
}
