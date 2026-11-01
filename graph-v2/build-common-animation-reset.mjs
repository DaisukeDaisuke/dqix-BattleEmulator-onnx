import {Graph} from './graph-builder.mjs';
import {COMMON_ANIMATION_RESET_BASE,COMMON_ANIMATION_RESET_WORDS} from './common-animation-fields.mjs';
export {COMMON_ANIMATION_RESET_BASE,COMMON_ANIMATION_RESET_WORDS} from './common-animation-fields.mjs';

// Opcode61 takes the current command pointer from the dispatcher's second
// argument. It does not read that pointer from the file-node payload.
export function buildCommonAnimationReset(){
 const width=COMMON_ANIMATION_RESET_WORDS,g=new Graph('rom-common-animation-reset',{
  inputContractVersion:1,
  authority:{handler:'JPN021e66b8 / matching021e6208',initializer:'JPN021e3574 / matching021e3084',dispatcher:'JPN021e9c0c / matching021e9778'},
  scope:'Complete opcode61 and its original reset helper. The current command pointer is supplied by the shared dispatcher as two raw u16 limbs. Every represented owner byte is retained unless the original store writes it. Bytes576 and577, and byte579, are not reset. This graph does not perform a timeline tick or execute the animation device.',
  opcode:61,ownerBase:COMMON_ANIMATION_RESET_BASE,ownerHalfwords:width,
  defaults:{scriptBlockU16:Array(width).fill(0),commandPointerU16:[0,0],scriptOwnerPresent:true,enabled:true},
  inputDomains:{scriptBlockU16:{width,min:0,max:65535,integer:true},commandPointerU16:{width:2,min:0,max:65535,integer:true}},
  feedback:{scriptBlockU16:'nextScriptBlockU16'}
 });
 const input=g.split(g.input('scriptBlockU16',['N',width]),width),pointer=g.split(g.input('commandPointerU16',['N',2]),2),owner=g.input('scriptOwnerPresent',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),run=g.and(owner,enabled),zero=g.mul(pointer[0],0),values=[],masks=[];
 for(let i=0;i<width;i++){
  const offset=i*2;
  let value=zero,mask=65535;
  if(offset<4)value=pointer[i];
  else if([0x14,0x16,0x1c,0x1e].includes(offset))value=g.add(zero,65535);
  else if(offset===0x36){value=input[i];mask=0;}
  else if(offset===0x38){value=g.mul(g.floor(g.mul(input[i],1/256)),256);mask=255;}
  values.push(g.where(run,value,input[i]));masks.push(g.where(run,g.add(zero,mask),zero));
 }
 g.output(g.or(g.not(enabled),owner),'supported');g.output(run,'handlerCompleted');g.output(g.cat(values),'nextScriptBlockU16');g.output(g.cat(masks),'writeMaskU16');g.output(g.cat([g.cast(run,'float32'),zero]),'handlerReturnU16');g.output(zero,'consumed');return g;
}
