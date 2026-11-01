import {Graph} from './graph-builder.mjs';

const VALID_OPCODES=Array.from({length:125},(_,i)=>i+3).filter(x=>![54,81,82,83].includes(x));

/** One original linked-list dispatch or one real handler-return boundary. */
export function buildCommonAnimationDispatch(){
 const g=new Graph('rom-common-animation-dispatch',{
  inputContractVersion:1,
  authority:{path:'src/Combat/Overlay_25/func_ov025_021e9778.cpp',sha256:'9467787abf897a1f9f8283779dbd6ee6e710c0340c1eeffb7092ae937866b110',jpn:'021e9cc4..021e9d5c',runtimeTable:'021ef818'},
  scope:'Exact nonempty animation-loop control. Phase0 starts at the loop cursor check and stops at a real opcode handler entry, the next cursor check, or the tail. Phase1 starts after an actually completed handler. Its cursor and next index are the POST-handler values: a handler can change the script cursor. Delay, asynchronous readiness, opcode effects and the mandatory update tail are separate producers. Unknown handler entries are unsupported; no timing or return value is fabricated.',
  phases:{0:'before next opcode',1:'after actual handler return'},
  defaults:{phase:0,cursorIndex:-1,nextCursorIndex:-1,opcode:0,skipDepth:0,handlerReturnU16:[0,0],handlerCompleted:false,enabled:true},
  inputDomains:{phase:{width:1,min:0,max:1,integer:true},cursorIndex:{width:1,min:-1,max:16777214,integer:true},nextCursorIndex:{width:1,min:-1,max:16777214,integer:true},opcode:{width:1,min:0,max:255,integer:true},skipDepth:{width:1,min:0,max:65535,integer:true},handlerReturnU16:{width:2,min:0,max:65535,integer:true}},
  feedback:{cursorIndex:'resultCursorIndex'},validRuntimeOpcodes:VALID_OPCODES
 });
 const phase=g.input('phase'),cursor=g.input('cursorIndex'),next=g.input('nextCursorIndex'),opcode=g.input('opcode'),depth=g.input('skipDepth'),value=g.split(g.input('handlerReturnU16',['N',2]),2),completed=g.input('handlerCompleted',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
 const before=g.and(enabled,g.eq(phase,0)),after=g.and(enabled,g.eq(phase,1)),present=g.ge(cursor,0),skipping=g.gt(depth,0),skip=g.and(before,present,skipping,g.not(g.eq(opcode,10))),terminate=g.and(before,present,g.not(skipping),g.eq(opcode,11));
 const call=g.and(before,present,g.not(skip),g.not(terminate)),known=g.or(...VALID_OPCODES.map(x=>g.eq(opcode,x))),zero=g.and(g.eq(value[0],0),g.eq(value[1],0)),minusOne=g.and(g.eq(value[0],65535),g.eq(value[1],65535));
 const invalidAfter=g.and(after,g.or(g.not(completed),g.and(g.not(zero),g.not(present)))),supported=g.and(g.or(g.not(call),known),g.not(invalidAfter)),commit=g.and(after,completed,supported),advance=g.or(skip,g.and(commit,g.not(zero)));
 const resultCursor=g.where(terminate,-1,g.where(advance,next,cursor));
 const continueLoop=g.and(supported,g.or(skip,g.and(commit,g.not(zero),g.not(minusOne)))),tail=g.and(supported,g.or(g.and(before,g.not(present)),terminate,g.and(commit,g.or(zero,minusOne))));
 const outputs={supported,resultCursorIndex:resultCursor,requiresHandler:g.and(call,known),handlerOpcode:opcode,continueLoop,tailReached:tail,stoppedAtTerminator:terminate,returnedZero:g.and(commit,zero),returnedMinusOne:g.and(commit,minusOne),consumed:g.mul(cursor,0)};
 for(const[name,v]of Object.entries(outputs))g.output(v,name);
 return g;
}
