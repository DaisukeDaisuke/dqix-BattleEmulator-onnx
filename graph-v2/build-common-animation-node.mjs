import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

const OPCODES=[1,2,3,18,19,20,22,24,25,26,55,58,61,62,64,66,67,69,70,71,80,93,118];
const integer=(width,min,max)=>({width,min,max,integer:true});

/** One original typed Script instruction -> a linked-node payload. Links and
 * strings are structural relocations; unknown allocator padding stays masked. */
export function buildCommonAnimationNode(){
 const g=new Graph('rom-common-animation-node',{
  authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',script:'src/Resource/Script.cpp',parser:'JPN0216e8f0 / matching func_ov000_0216d1c4',opcodeTable:'JPN overlay0 02184c90',handlers:{1:'0216b31c',2:'0216b42c',3:'0216b434',18:'0216bbf4',19:'0216bc88',20:'0216bc9c',22:'0216c004',24:'0216c074',25:'0216c088',26:'0216c108',55:'0216cc90',58:'0216ce80',61:'0216cfb0',62:'0216cfc4',64:'0216d02c',66:'0216d0d4',67:'0216d12c',69:'0216d194',70:'0216d1f4',71:'0216d248',80:'0216d4c8',93:'0216d968',118:'0216e1fc'}},
  scope:'Shared typed original animation-node constructors, up to four parameters per instruction. Integer parameters are admitted within ±1048576; floating parameters are zero or finite normal binary32 values with exponent85..136 and magnitude at most512. Raw bit limbs are decoded in ONNX, including signed integer/float conversion, separate binary32 multiply/divide, truncation and exact rounded Q12 multiplication. Every payload bit is marked written or unknown. Original linked pointer values and allocated string pointers are relocations, not invented addresses. Allocation failure, arbitrary padding, other opcodes and execution of the resulting program are separate producer boundaries.',
  opcodes:OPCODES,payloadRepresentation:'Ten little-endian unsigned16 limbs, with a same-width written-bit mask. Header opcode is known; next pointers and string pointers are resolved structurally by the runtime and have zero mask. Unwritten bytes/bits never become known zero merely because their placeholder value is zero.',
  inputDomains:{opcode:integer(1,0,65535),parameterCount:integer(1,0,4),parameterTypes:integer(4,0,2),parameterRawU16:integer(8,0,65535)},
  defaults:{opcode:2,parameterCount:0,parameterTypes:[0,0,0,0],parameterRawU16:Array(8).fill(0),stringPresent:[false,false,false,false],enabled:true}
 });
 const op=g.input('opcode'),count=g.input('parameterCount'),types=g.split(g.input('parameterTypes',['N',4]),4),raw=g.split(g.input('parameterRawU16',['N',8]),8),strings=g.split(g.input('stringPresent',['N',4],'bool'),4),enabled=g.input('enabled',['N',1],'bool'),zero=g.mul(op,0),constant=n=>g.add(zero,n),yes=g.eq(op,op),no=g.not(yes),eq=n=>g.eq(op,n),any=ns=>g.or(...ns.map(eq)),mod=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n)),trunc=v=>g.where(g.ge(v,0),g.floor(v),g.sub(0,g.floor(g.sub(0,v)))),u16=v=>mod(v,65536),u8=v=>mod(v,256),s32Words=v=>[u16(v),u16(g.floor(g.mul(v,1/65536)))];
 const ints=[],floats=[],valid=[];
 const powers=Array.from({length:256},(_,e)=>e>=85&&e<=136?2**(e-150):0),table=g.constant(powers,'float32',[256]);
 for(let i=0;i<4;i++){
  const lo=raw[2*i],hi=raw[2*i+1],signedHigh=g.where(g.ge(hi,32768),g.sub(hi,65536),hi),integerValue=g.add(lo,g.mul(signedHigh,65536)),exponent=mod(g.floor(g.mul(hi,1/128)),256),fraction=g.add(lo,g.mul(mod(hi,128),65536)),mantissa=g.add(fraction,8388608),factor=g.op('Gather',[table,g.cast(exponent,'int32')],{axis:0},{shape:['N',1],dtype:'float32'}),magnitude=g.mul(mantissa,factor),floatValue=g.where(g.ge(hi,32768),g.sub(0,magnitude),magnitude),floatZero=g.and(g.eq(exponent,0),g.eq(fraction,0)),floatValid=g.or(floatZero,g.and(g.ge(exponent,85),g.le(exponent,136),g.le(magnitude,512)));
  const intValue=g.where(g.eq(types[i],1),integerValue,g.where(g.eq(types[i],2),trunc(floatValue),0)),floatConverted=g.where(g.eq(types[i],1),integerValue,g.where(g.eq(types[i],2),floatValue,0));
  ints.push(intValue);floats.push(floatConverted);valid.push(g.or(g.ge(i,count),g.eq(types[i],0),g.and(g.eq(types[i],1),g.ge(integerValue,-1048576),g.le(integerValue,1048576)),g.and(g.eq(types[i],2),floatValid)));
 }
 let qualified=g.and(...valid),required=constant(0),stringIndex=constant(-1),stringOffset=constant(-1),replaceSuffix=no,size=constant(0),payload=Array.from({length:10},()=>zero),mask=Array.from({length:10},()=>zero);
 function node(code,bytes,writes=[],extra=yes){
  const selected=eq(code);size=g.where(selected,bytes,size);qualified=g.and(qualified,g.or(g.not(selected),extra));
  for(const[index,value,written=65535]of writes){payload[index]=g.where(selected,value,payload[index]);mask[index]=g.where(selected,written,mask[index]);}
 }
 function minParams(code,n){required=g.where(eq(code),n,required);}
 for(const code of[19,24,61,62,67])node(code,8);
 node(18,12,[],g.and(g.eq(types[0],0),strings[0]));minParams(18,1);
 stringIndex=g.where(eq(18),0,stringIndex);stringOffset=g.where(eq(18),8,stringOffset);replaceSuffix=g.or(replaceSuffix,eq(18));
 const firstString=g.eq(types[0],0),firstInteger=g.eq(types[0],1),secondString=g.and(g.eq(types[1],0),strings[1]);
 node(20,16,[[4,g.where(firstString,255,u8(ints[0])),255]],g.or(g.and(firstString,strings[0]),g.and(firstInteger,secondString,g.ge(count,2))));minParams(20,1);stringIndex=g.where(eq(20),g.where(firstString,0,1),stringIndex);stringOffset=g.where(eq(20),12,stringOffset);replaceSuffix=g.or(replaceSuffix,eq(20));
 node(69,12,[[4,u16(ints[0])],[5,u16(ints[1])]]);minParams(69,2);
 const defaultInt=g.where(g.eq(count,0),1,ints[0]),defaultWords=s32Words(defaultInt);node(58,12,[[4,defaultWords[0]],[5,defaultWords[1]]]);
 node(22,12,[[4,g.add(u8(ints[0]),g.mul(u8(ints[1]),256))]]);minParams(22,2);
 const p3Count=g.where(firstString,g.where(g.ge(count,2),ints[1],1),g.where(g.ge(count,3),ints[2],1)),p3Actor=g.where(firstString,7,u8(ints[0])),p3Flags=g.where(firstString,g.where(g.ge(count,3),u8(ints[2]),0),g.where(g.ge(count,4),u8(ints[3]),0));
 node(3,16,[[6,u16(p3Count)],[7,g.add(p3Actor,g.mul(p3Flags,256))]],g.or(g.and(firstString,strings[0]),g.and(firstInteger,secondString,g.ge(count,2))));minParams(3,1);stringIndex=g.where(eq(3),g.where(firstString,0,1),stringIndex);stringOffset=g.where(eq(3),8,stringOffset);
 const firstFloat=g.eq(types[0],2),p26Type=g.where(firstFloat,types[0],types[1]),p26Float=g.where(firstFloat,floats[0],floats[1]),p26Int=g.where(firstFloat,ints[0],ints[1]),p26Has=g.or(firstFloat,g.ge(count,2)),p26Value=g.where(g.eq(p26Type,2),trunc(g.mul(p26Float,4096)),g.where(g.eq(p26Type,1),trunc(g.mul(g.op('Div',[p26Int,1000]),4096)),4096));
 node(26,12,[[4,g.where(firstFloat,7,u8(ints[0])),255],[5,u16(g.where(p26Has,p26Value,4096))]],g.or(firstFloat,firstInteger));minParams(26,1);
 for(const code of[70,71,66,93]){node(code,12,[[4,u16(ints[0])]]);minParams(code,1);}
 node(25,20,[[4,zero],[5,zero],[6,u16(g.add(ints[0],100))],[7,u16(trunc(g.mul(floats[1],4096)))],[8,zero,255]],g.and(g.ge(floats[1],-512),g.le(floats[1],512)));minParams(25,2);
 const words64=s32Words(ints[0]);node(64,12,[[4,words64[0]],[5,words64[1]]]);minParams(64,1);
 const p55Negative=g.lt(ints[0],0),p55Id=g.where(g.eq(ints[0],0),1,mod(ints[0],32768)),p55Has=g.ge(count,2),p55Nonnegative=g.ge(ints[1],0),p55Default=g.or(g.not(p55Has),g.eq(ints[1],-2));
 node(55,16,[[4,g.where(p55Negative,0,g.add(1,g.mul(p55Id,2))),g.where(p55Negative,1,65535)],[5,g.where(p55Default,1,g.where(p55Nonnegative,2,0)),3],[6,g.where(g.and(p55Has,p55Nonnegative),mod(ints[1],32768),0),32767]]);minParams(55,1);
 const mode=u8(ints[0]),allXYZ=g.or(g.eq(mode,0),g.eq(mode,2)),scaleMode=g.or(g.eq(mode,1),g.eq(mode,4)),singleMode=g.eq(mode,3),q12=floats.map(v=>trunc(g.mul(v,4096))),quotient=g.floor(g.mul(q12[1],1/4096)),remainder=g.sub(q12[1],g.mul(quotient,4096)),scaled655=g.add(g.mul(quotient,655),g.floor(g.mul(g.add(g.mul(remainder,655),2048),1/4096))),x=g.where(allXYZ,q12[1],g.where(scaleMode,g.where(g.ge(count,2),scaled655,655),g.where(singleMode,g.where(g.ge(count,2),q12[1],1),0))),y=g.where(allXYZ,q12[2],g.where(scaleMode,g.where(g.ge(count,3),q12[2],4096),0)),z=g.where(allXYZ,q12[3],g.where(g.and(scaleMode,g.ge(count,4)),g.mul(mod(ints[3],16),4096),0));
 node(118,16,[[4,u16(x)],[5,u16(y)],[6,u16(z)],[7,mode]],g.and(g.or(g.not(allXYZ),g.ge(count,4)),...floats.slice(1).map(v=>g.and(g.ge(v,-512),g.le(v,512)))));minParams(118,1);
 node(80,12,[[4,u16(ints[1])],[5,u16(trunc(g.mul(floats[0],4096)))]],g.and(g.ge(floats[0],-512),g.le(floats[0],512)));minParams(80,2);
 qualified=g.and(qualified,g.ge(count,required));
 const root=eq(1),end=eq(2),skip66=g.and(eq(66),g.lt(ints[0],0)),supported=g.and(any(OPCODES),qualified),append=g.and(enabled,supported,g.not(root),g.not(end),g.not(skip66)),hasOne=g.or(...ints.map((v,i)=>g.and(g.lt(i,count),g.eq(u16(v),1)))),actionCount=g.add(count,g.where(hasOne,2,0)),actions=Array.from({length:6},(_,i)=>g.where(g.lt(i,count),u16(ints[Math.min(i,3)]),g.where(g.and(hasOne,g.eq(i,count)),2,g.where(g.and(hasOne,g.eq(i,g.add(count,1))),219,0))));
 payload[0]=op;payload[1]=zero;mask[0]=constant(65535);mask[1]=constant(65535);
 const outputs={supported,appendNode:append,startProgram:g.and(enabled,supported,root),noNode:g.and(enabled,supported,g.or(end,skip66)),nodeByteLength:g.where(append,size,0),payloadU16:g.cat(payload),payloadMaskU16:g.cat(mask),stringParameterIndex:stringIndex,stringPointerOffset:stringOffset,replaceCharacterSuffix:replaceSuffix,parameter:payload[4],parameterKnown:g.eq(mask[4],65535),rootActionCount:g.where(root,actionCount,0),rootActionIds:g.cat(actions),consumed:zero};
 for(const[name,value]of Object.entries(outputs))g.output(value,name);return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonAnimationNode().save(),null,2));
