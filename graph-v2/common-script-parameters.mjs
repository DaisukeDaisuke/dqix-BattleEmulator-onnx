// Shared, explicit numeric conversion domain of original Script::Parameter.
// Raw binary32 words are decoded inside the graph, never by the host caller.
export function commonScriptParameters(g,{count,types,raw}){
 const mod=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n)),trunc=v=>g.where(g.ge(v,0),g.floor(v),g.sub(0,g.floor(g.sub(0,v)))),powers=Array.from({length:256},(_,e)=>e>=85&&e<=136?2**(e-150):0),table=g.constant(powers,'float32',[256]),ints=[],floats=[],valid=[];
 for(let i=0;i<types.length;i++){
  const lo=raw[2*i],hi=raw[2*i+1],signedHigh=g.where(g.ge(hi,32768),g.sub(hi,65536),hi),integerValue=g.add(lo,g.mul(signedHigh,65536)),exponent=mod(g.floor(g.mul(hi,1/128)),256),fraction=g.add(lo,g.mul(mod(hi,128),65536)),mantissa=g.add(fraction,8388608),factor=g.op('Gather',[table,g.cast(exponent,'int32')],{axis:0},{shape:['N',1],dtype:'float32'}),magnitude=g.mul(mantissa,factor),floatValue=g.where(g.ge(hi,32768),g.sub(0,magnitude),magnitude),floatZero=g.and(g.eq(exponent,0),g.eq(fraction,0)),floatValid=g.or(floatZero,g.and(g.ge(exponent,85),g.le(exponent,136),g.le(magnitude,512)));
  ints.push(g.where(g.eq(types[i],1),integerValue,g.where(g.eq(types[i],2),trunc(floatValue),0)));floats.push(g.where(g.eq(types[i],1),integerValue,g.where(g.eq(types[i],2),floatValue,0)));
  valid.push(g.or(g.ge(i,count),g.eq(types[i],0),g.and(g.eq(types[i],1),g.ge(integerValue,-1048576),g.le(integerValue,1048576)),g.and(g.eq(types[i],2),floatValid)));
 }
 return{ints,floats,supported:g.and(...valid),trunc};
}
