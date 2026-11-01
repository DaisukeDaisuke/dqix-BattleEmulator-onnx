import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

/** One exact original Patricia-tree step. Memory reads follow computed node
 * indices; names, branching and final comparisons are never expected outputs. */
export function buildCommonNsbxxNameTree(){
  const g=new Graph('rom-common-nsbxx-name-tree',{
    inputContractVersion:1,authority:{sources:['src/NitroSDK/NSBXX/NameList.cpp'],originals:{searchIndex:'JPN020b8ff8'}},
    scope:'Original NSBXX name-search admission, Patricia-tree descent and final16-byte equality. Count<16 requests the existing original linear-search module. Long search follows the actual root first child, then the target bit selected by the current node while previousBitIndex>node.bitIndex. It stops at the original leaf and compares all16 bytes, including after NUL. Actual node and candidate-name bytes are structural memory inputs. Malformed indices/target bit positions remain explicit memory boundaries; a missing result is not invented.',
    operations:{0:'original short/long admission and root child',1:'original tree step or candidate request',2:'original candidate equality'},
    defaults:{operation:0,nameCount:0,targetPresent:true,rootBytes:[0,0,0,0],nodeBytes:[0,0,0,0],targetBytes:Array(16).fill(0),candidateBytes:Array(16).fill(0),previousBitIndex:0,candidateIndex:0,enabled:true},
    inputDomains:{operation:{width:1,min:0,max:2,integer:true},nameCount:{width:1,min:0,max:255,integer:true},rootBytes:{width:4,min:0,max:255,integer:true},nodeBytes:{width:4,min:0,max:255,integer:true},targetBytes:{width:16,min:0,max:255,integer:true},candidateBytes:{width:16,min:0,max:255,integer:true},previousBitIndex:{width:1,min:0,max:255,integer:true},candidateIndex:{width:1,min:0,max:255,integer:true}}
  });
  const op=g.input('operation'),count=g.input('nameCount'),previous=g.input('previousBitIndex'),candidateIndex=g.input('candidateIndex'),root=g.split(g.input('rootBytes',['N',4]),4),node=g.split(g.input('nodeBytes',['N',4]),4),targetTensor=g.input('targetBytes',['N',16]),target=g.split(targetTensor,16),candidate=g.split(g.input('candidateBytes',['N',16]),16),present=g.input('targetPresent',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
  const zero=g.mul(op,0),mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),step=g.eq(op,1),descend=g.gt(previous,node[0]),rootPresent=g.gt(root[1],0),long=g.ge(count,16),active=g.and(enabled,present),bitIndex=mod(node[0],8);
  const index=g.min(g.floor(g.mul(node[0],.125)),15),value=g.op('GatherElements',[targetTensor,g.cast(index,'int32')],{axis:1},{shape:['N',1]});let inverse=g.add(zero,1);for(let i=1;i<8;i++)inverse=g.where(g.eq(bitIndex,i),2**(-i),inverse);
  const bit=mod(g.floor(g.mul(value,inverse)),2),nextChild=g.where(g.eq(bit,0),node[1],node[2]),candidateValid=g.lt(node[3],count),qualified=g.and(g.or(g.not(g.and(step,descend)),g.lt(node[0],128)),g.or(g.not(g.and(step,g.not(descend))),candidateValid),g.or(g.not(g.eq(op,2)),g.lt(candidateIndex,count)));
  const supported=g.or(g.not(active),qualified),rootStep=g.and(active,supported,g.eq(op,0),long,rootPresent),treeStep=g.and(active,supported,step,descend),equal=g.and(...target.map((v,i)=>g.eq(v,candidate[i]))),compared=g.and(active,supported,g.eq(op,2));
  for(const[k,v]of Object.entries({supported,requestLinear:g.and(active,g.eq(op,0),g.not(long)),requestNode:g.or(rootStep,treeStep),nextNodeIndex:g.where(rootStep,root[1],g.where(treeStep,nextChild,0)),nextPreviousBitIndex:g.where(rootStep,root[0],node[0]),requestCandidate:g.and(active,supported,step,g.not(descend)),nextCandidateIndex:node[3],completed:g.and(enabled,supported,g.or(g.not(present),g.and(g.eq(op,0),long,g.not(rootPresent)),compared)),index:g.where(g.and(compared,equal),candidateIndex,-1),consumed:zero}))g.output(v,k);
  return g;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildCommonNsbxxNameTree().save();console.log(JSON.stringify({name:r.name,nodes:r.nodes,bytes:r.bytes}));}
