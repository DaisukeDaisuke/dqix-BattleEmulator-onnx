// Exact shared short lookup or original Patricia-tree control flow. The host
// only selects the already supplied node/name bytes at graph-computed indices.
const scalar=(o,k)=>Number(o[k]?.[0]),clone=x=>structuredClone(x),validBytes=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=255);
export const COMMON_NSBXX_NAME_LOOKUP_MODELS=['rom-common-nsbxx-name-match','rom-common-nsbxx-name-tree'];
export function createCommonNsbxxNameLookupRunner({getModel,runGraph,onTrace}={}){
  async function call(name,input){const ir=await getModel(name);if(!ir)throw Error('Missing original NSBXX lookup graph '+name);const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});return out;}
  return{
    models:COMMON_NSBXX_NAME_LOOKUP_MODELS,
    async lookup({dictionary,targetBytes,targetPresent=true,state:prior,maxTransitions=132}={}){
      if(!dictionary||!Number.isInteger(dictionary.count)||dictionary.count<0||dictionary.count>255||!Array.isArray(dictionary.names)||dictionary.names.length!==dictionary.count||dictionary.names.some(x=>!validBytes(x,16))||!Array.isArray(dictionary.treeBytes)||dictionary.treeBytes.length<4||!validBytes(targetBytes,16))throw Error('Actual raw NSBXX name dictionary and16-byte target are required');
      if(!Number.isInteger(maxTransitions)||maxTransitions<1||maxTransitions>132)throw Error('A bounded NSBXX name-search budget is required');
      const state=prior?clone(prior):{schema:'dq9-original-nsbxx-name-search-v1',operation:0,previousBitIndex:0,nodeIndex:0,candidateIndex:0,transitions:0};
      const pending=reason=>({complete:false,pending:reason,state});
      for(let iteration=0;iteration<maxTransitions;iteration++){
        if(state.operation===3){const short=await call('rom-common-nsbxx-name-match',{nameCount:dictionary.count,namesBytes:Array.from({length:240},(_,i)=>dictionary.names[Math.floor(i/16)]?.[i%16]??0),targetBytes,targetPresent});state.transitions++;if(!scalar(short,'supported'))return pending('Original short dictionary lookup is unsupported');return{complete:true,index:scalar(short,'index'),state};}
        let nodeBytes=[0,0,0,0],candidateBytes=Array(16).fill(0);
        if(state.operation===1){const at=state.nodeIndex*4;if(at+4>dictionary.treeBytes.length)return pending('Original NSBXX node pointer requires additional actual backing bytes');nodeBytes=dictionary.treeBytes.slice(at,at+4);}
        if(state.operation===2){if(state.candidateIndex>=dictionary.count)return pending('Original NSBXX leaf name points outside the supplied dictionary');candidateBytes=dictionary.names[state.candidateIndex];}
        const o=await call('rom-common-nsbxx-name-tree',{operation:state.operation,nameCount:dictionary.count,targetPresent,rootBytes:dictionary.treeBytes.slice(0,4),nodeBytes,targetBytes,candidateBytes,previousBitIndex:state.previousBitIndex,candidateIndex:state.candidateIndex});state.transitions++;
        if(!scalar(o,'supported'))return pending('Original NSBXX search reaches an unrepresented target bit or leaf pointer');
        if(scalar(o,'requestLinear')){state.operation=3;continue;}
        if(scalar(o,'completed'))return{complete:true,index:scalar(o,'index'),state};
        if(scalar(o,'requestNode')){state.operation=1;state.nodeIndex=scalar(o,'nextNodeIndex');state.previousBitIndex=scalar(o,'nextPreviousBitIndex');}
        else if(scalar(o,'requestCandidate')){state.operation=2;state.candidateIndex=scalar(o,'nextCandidateIndex');}
        else throw Error('Unresolved original NSBXX tree transition');
      }
      return{...pending('Original NSBXX search transition budget exhausted'),budgetExhausted:true};
    }
  };
}
