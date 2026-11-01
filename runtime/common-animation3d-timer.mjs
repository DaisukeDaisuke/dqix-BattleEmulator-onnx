import {validateGraphInputs} from '../graph-v2/input-domains.mjs';
export const COMMON_ANIMATION3D_TIMER_MODELS=['rom-common-animation3d-timer'];
const clone=x=>structuredClone(x),word=p=>p[0]+65536*p[1],pair=n=>[n%65536,Math.floor(n/65536)],scalar=(o,k)=>Number(o[k]?.[0]),pointer=(b,at)=>[b[at]+256*b[at+1],b[at+2]+256*b[at+3]];
const requireData=(x,m)=>{if(!x)throw Error(m);};

/** Backing access is structural; every timer value is computed in the graph. */
export function createCommonAnimation3DTimerRunner({getModel,runGraph,onTrace,read,write}={}){
  async function call(input){const name=COMMON_ANIMATION3D_TIMER_MODELS[0],ir=await getModel(name);requireData(ir,'The shared Animation3D timer graph is required');const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));const errors=validateGraphInputs(ir.contract,feeds);requireData(!errors.length,'Invalid original timer operands: '+errors.join('; '));const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});requireData(scalar(out,'supported'),'The shared timer operation is unsupported');return out;}
  return{
    models:COMMON_ANIMATION3D_TIMER_MODELS,
    async run({animationPointerU16,valueU16=[0,0],operation='advance',state:prior,maxTransitions=2}={}){
      requireData(['advance','set'].includes(operation)&&Number.isInteger(maxTransitions)&&maxTransitions>=0,'An original timer operation and nonnegative transition budget are required');
      const request={animationPointerU16:[...animationPointerU16],valueU16:[...valueU16],operation};let state=prior?clone(prior):{schema:'dq9-common-animation3d-timer-state-v1',request,phase:0,transitions:0},transitions=0;
      requireData(state.schema==='dq9-common-animation3d-timer-state-v1'&&JSON.stringify(state.request)===JSON.stringify(request),'A resumed timer cannot change its original request');
      if(state.phase===3)return{complete:false,pending:'Original zero-frame looping timer does not return',nonterminating:true,state,transitions};
      while(state.phase!==2&&transitions<maxTransitions){
        const animationBytes=read(animationPointerU16,16,{known:true}),dataPointerU16=pointer(animationBytes,4),present=dataPointerU16.some(Boolean),dataBytes=present?read(dataPointerU16,26,{known:true}):Array(26).fill(0),raw=pointer(dataBytes,8);
        // Raw frame count is observed only after phase0 has scattered the actual
        // time store. The original also reads it only after advancing time.
        const rawFrameCountBytes=state.phase===1&&present?read(pair(word(raw)+4),2,{known:true}):[0,0],out=await call({operation:operation==='set'?2:state.phase,animationBytes,dataBytes,valueU16,rawFrameCountBytes});
        if(present)write(dataPointerU16,out.nextDataBytes,out.writtenMaskBytes);
        state.phase=scalar(out,'nextPhase');state.dataPointerU16=[...dataPointerU16];state.timeU16=[...out.timeU16];state.frameCountU16=[...out.frameCountU16];state.transitions++;transitions++;
        if(scalar(out,'nonterminating'))return{complete:false,pending:'Original zero-frame looping timer does not return',nonterminating:true,state,transitions};
      }
      return state.phase===2?{complete:true,state,transitions,timeU16:state.timeU16}:{complete:false,pending:'Original timer transition budget exhausted',budgetExhausted:true,state,transitions};
    }
  };
}
