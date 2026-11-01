import {Graph} from './graph-builder.mjs';
import {COMMON_ANIMATION_STATE_OFFSETS,COMMON_ANIMATION_STATE_OPCODES} from './common-animation-fields.mjs';
export {COMMON_ANIMATION_STATE_OFFSETS,COMMON_ANIMATION_STATE_OPCODES} from './common-animation-fields.mjs';

// Exact byte offsets in the original script owner. All unlisted bytes are
// retained by the runtime; the graph never fabricates allocator padding.
export function buildCommonAnimationState(){
 const offsets=COMMON_ANIMATION_STATE_OFFSETS,g=new Graph('rom-common-animation-state',{
  inputContractVersion:1,
  authority:{runtimeTable:'JPN021ef818',handlers:{10:'JPN021e412c / matching021e3c3c',11:'JPN021e4168 / matching021e3c78',55:'JPN021e6404 / matching021e5f54',58:'JPN021e64e0 / matching021e6030',64:'JPN021e6720 / matching021e6270',66:'JPN021e6758 / matching021e62a8',71:'JPN021e6824 / matching021e6374',80:'JPN021e73a8 / matching021e6ef8',93:'JPN021e7900 / matching021e7450',118:'JPN021e8740 / matching021e82a0'}},
  scope:'Complete original pure script-state opcode handlers. Script state and linked-node payload use raw u16 limbs, preserving signed values and float bit patterns without converting their meanings. Payload masks identify bytes actually written by the original file constructor. Required unknown bits reject execution. Every other owner byte is retained unchanged. Resource, animation-device and timeline update handlers are separate producers.',
  stateOffsets:offsets,payloadBaseOffset:8,opcodes:COMMON_ANIMATION_STATE_OPCODES,
  defaults:{opcode:11,stateU16:Array(offsets.length).fill(0),payloadU16:Array(10).fill(0),payloadMaskU16:Array(10).fill(0),scriptOwnerPresent:true,enabled:true},
  inputDomains:{opcode:{width:1,min:0,max:255,integer:true},stateU16:{width:offsets.length,min:0,max:65535,integer:true},payloadU16:{width:10,min:0,max:65535,integer:true},payloadMaskU16:{width:10,min:0,max:65535,integer:true}},feedback:{stateU16:'nextStateU16'}
 });
 const op=g.input('opcode'),state=g.split(g.input('stateU16',['N',offsets.length]),offsets.length),payload=g.split(g.input('payloadU16',['N',10]),10),masks=g.split(g.input('payloadMaskU16',['N',10]),10),owner=g.input('scriptOwnerPresent',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),is=n=>g.eq(op,n),low=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n)),bit=(v,n)=>g.gt(low(g.floor(g.mul(v,1/n)),2),0),known=(i,n=65536)=>g.eq(low(masks[i],n),n-1);
 const masksKnown=g.or(is(11),g.and(g.or(is(10),is(66),is(71),is(93)),known(0)),g.and(g.or(is(58),is(64),is(80)),known(0),known(1)),g.and(is(55),known(0),known(1,4),known(2,32768)),g.and(is(118),known(0),known(1),known(2),known(3,256)));
 const supported=g.or(g.not(enabled),g.and(owner,masksKnown)),run=g.and(enabled,owner,masksKnown),updated=[...state],at=offset=>state[offsets.indexOf(offset)];
 const set=(opcode,offset,value)=>{const i=offsets.indexOf(offset);if(i<0)throw Error('Unlisted original state offset');updated[i]=g.where(g.and(run,is(opcode)),value,updated[i]);};
 set(10,0x57c,g.where(g.eq(at(0x57c),payload[0]),0,at(0x57c)));
 set(55,0x21c,g.where(bit(payload[0],1),g.floor(g.mul(payload[0],.5)),0));set(55,0x220,g.where(bit(payload[1],1),30,65535));set(55,0x222,g.where(bit(payload[1],2),low(payload[2],32768),65535));
 for(const[opcode,offset]of[[58,0x224],[64,0x548]]){set(opcode,offset,payload[0]);set(opcode,offset+2,payload[1]);}
 for(const[opcode,offset]of[[66,0x554],[71,0x55c],[93,0x566]])set(opcode,offset,payload[0]);
 set(80,0x57e,payload[0]);set(80,0x580,payload[1]);
 set(118,0x568,g.add(at(0x568),g.mul(g.sub(1,g.cast(bit(at(0x568),2),'float32')),2)));
 set(118,0x574,g.add(low(at(0x574),256),g.mul(low(payload[3],256),256)));
 for(const[i,offset]of[0x56e,0x570,0x572].entries())set(118,offset,payload[i]);
 g.output(supported,'supported');g.output(run,'handlerCompleted');g.output(g.cat(updated),'nextStateU16');g.output(g.cat([g.cast(run,'float32'),g.mul(op,0)]),'handlerReturnU16');g.output(g.mul(op,0),'consumed');return g;
}
