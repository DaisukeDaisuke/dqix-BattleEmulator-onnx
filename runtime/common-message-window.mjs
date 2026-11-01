import {staticFontPresence} from './common-message-data.mjs';
const CAPACITY=160,pad=(values,n=CAPACITY)=>{if(values.length>n)throw Error('Message input exceeds buffer');return [...values,...Array(n-values.length).fill(0)];};
const scalar=(result,key)=>Number(result[key]?.[0]);
const boundary=message=>Object.assign(new Error(message),{code:'DQ9_PRESENTATION_BOUNDARY'});
export function initialCommonMessageWindow(){return{rawTokens:Array(CAPACITY).fill(0),outputTokens:Array(CAPACITY).fill(0),produced:0,total:0,index:0,windowState:0,windowActive:false,slotReferences:Array(128).fill(0),allocationBits:Array(32).fill(0),glyphCount:0,rubyMode:false,fontSize:12,quietPrefixSatisfied:true,rendererPresent:false,slotMetadataZero:true,nameFormatActive:true,staticFontsPresent:true,dynamicBanksAbsent:true,tokensPresent:true};}

export function createCommonMessageWindowRunner({runGraph,fonts,onTrace}={}){
  if(typeof runGraph!=='function')throw Error('Actual shared ONNX executor is required');
  const execute=async(name,feeds)=>{const [result]=await runGraph(name,[feeds]);onTrace?.({name,feeds,result});return result;};
  const commitFont=(row,result)=>({...row,produced:scalar(result,'nextProduced'),outputTokens:result.nextOutputTokens,slotReferences:result.nextSlotReferences,allocationBits:result.nextAllocationBits,glyphCount:scalar(result,'nextGlyphCount'),rubyMode:!!scalar(result,'nextRubyMode')});
  return{
    async begin(row,compiled){
      const result=await execute('rom-common-message-window-begin',{compiledTokens:pad(compiled.tokens),compiledTotal:[compiled.total],priorSlotReferences:row.slotReferences});
      const state={...row,rawTokens:result.rawTokens,outputTokens:result.outputTokens,total:scalar(result,'total'),produced:scalar(result,'produced'),index:scalar(result,'index'),slotReferences:result.slotReferences,allocationBits:result.allocationBits,glyphCount:scalar(result,'glyphCount'),windowState:scalar(result,'windowState'),windowActive:!!scalar(result,'windowActive'),rubyMode:!!scalar(result,'rubyMode')};
      return{...state,...staticFontPresence(state.rawTokens,fonts,state.fontSize)};
    },
    async font(row,{argument=16,tickCount=1,oneCall=false}={}){
      if(!Number.isInteger(argument)||argument<0||argument>0xffffffff||!Number.isInteger(tickCount)||tickCount<0||tickCount>0xffffffff)throw Error('Original unsigned font-frame budget required');
      let state={...row},calls=oneCall?1:argument===0?0:Math.max(argument,tickCount),iterations=0;
      const presence=staticFontPresence(state.rawTokens,fonts,state.fontSize);
      while((calls>0||!oneCall&&state.rubyMode)&&state.produced<state.total){
        let finished=false;
        while(!finished){
          if(++iterations>CAPACITY)throw Error('Unbounded or cyclic font input');
          const result=await execute('rom-common-message-font-step',{rawTokens:state.rawTokens,outputTokens:state.outputTokens,...presence,produced:[state.produced],total:[state.total],rubyMode:[state.rubyMode],slotReferences:state.slotReferences,allocationBits:state.allocationBits,glyphCount:[state.glyphCount],...Object.fromEntries(['tokensPresent','rendererPresent','slotMetadataZero','nameFormatActive','staticFontsPresent','dynamicBanksAbsent'].map(key=>[key,[!!state[key]]]))});
          if(!scalar(result,'supported'))throw boundary('Unsupported original font producer state');
          const previous=state.produced;state=commitFont(state,result);finished=!!scalar(result,'endFontCall');
          if(state.produced===previous&&!finished)throw Error('Font producer made no progress');
        }
        if(calls>0)calls--;
      }
      if(!oneCall&&state.rubyMode&&state.produced>=state.total)throw Error('Unclosed ruby would keep the original font producer running');
      return state;
    },
    async consume(row,{ticks=1,fastText=true}={}){
      if(!Number.isInteger(ticks)||ticks<0||ticks>0xffffffff)throw Error('Original UI tick count required');
      let state={...row},budget=fastText?16:Math.min(ticks===0?1:ticks,CAPACITY+1),continuous=false;
      if(!state.windowActive||state.windowState===0)return state;
      for(let iteration=0;iteration<CAPACITY;iteration++){
        const result=await execute('rom-common-message-consume-step',{tokens:state.outputTokens,produced:[state.produced],index:[state.index],windowState:[state.windowState],windowActive:[state.windowActive],budget:[budget],continuous:[continuous],quietPrefixSatisfied:[state.quietPrefixSatisfied]});
        if(!scalar(result,'supported'))throw boundary('Unsupported original message-control/UI prefix state');
        state.index=scalar(result,'nextIndex');state.windowState=scalar(result,'nextWindowState');budget=scalar(result,'nextBudget');continuous=!!scalar(result,'nextContinuous');
        if(scalar(result,'endConsumeCall'))return state;
      }
      throw Error('Message consumer exceeded the original token arena');
    }
  };
}
