import {Graph} from './graph-builder.mjs';
import {fileURLToPath} from 'node:url';

/** The original nested formatter's byte buffer overlaps all four correlated
 * camera row words. Text bytes can occupy that overlap, so a zero-only patch
 * would be wrong for longer messages. */
export function buildCommonMessageFormatterStack(){
  const offsets=[0x32,0x3e,0x4a,0x56],g=new Graph('rom-common-message-formatter-stack',{
    inputContractVersion:1,
    authority:{formatter:'JPN021edb38 / matching021ed634',clearCall:'JPN021ee4a8..021ee4b4: buffer=sp+0x256, length0x100',clearLeaf:'JPN0200f238 / matching__clear',source:'src/Combat/Overlay_25/func_ov025_021ed634.cpp',stack:'jpn-component-world-dispatch-v1'},
    scope:'Exact byte scatter from the already computed qualified message formatter into its cleared256-byte stack buffer. Under the original nested component ABI, formatter SP=componentSP−0x3f8, buffer=componentSP−0x1a2 and row-word addresses=componentSP−0x170+12*i. This graph projects all sixteen overlapping bytes, including actual text for longer messages. It does not choose text, infer frame completion or accept observed stack bytes as produced data.',
    formatterBufferWordOffsets:offsets,
    defaults:{priorU16:Array(8).fill(0),formattedBytes:Array(256).fill(0),formattedByteLength:0,showExecuted:false,stackAbiMatches:false},
    inputDomains:{priorU16:{width:8,min:0,max:65535,integer:true},formattedBytes:{width:256,min:0,max:255,integer:true},formattedByteLength:{width:1,min:0,max:255,integer:true}}
  });
  const prior=g.split(g.input('priorU16',['N',8]),8),bytes=g.input('formattedBytes',['N',256]),length=g.input('formattedByteLength'),show=g.input('showExecuted',['N',1],'bool'),abi=g.input('stackAbiMatches',['N',1],'bool'),supported=g.or(g.not(show),abi),active=g.and(show,abi);
  const read=index=>g.where(g.gt(length,index),g.op('Gather',[bytes,g.constant([index],'int32',[1])],{axis:1},{shape:['N',1]}),0);
  const after=offsets.flatMap((offset,word)=>[0,2].map((add,limb)=>g.where(active,g.add(read(offset+add),g.mul(read(offset+add+1),256)),prior[word*2+limb])));
  g.output(supported,'supported');g.output(g.cat(after),'nextU16');g.output(active,'written');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const{name,nodes,bytes}=await buildCommonMessageFormatterStack().save();
  console.log(JSON.stringify({name,nodes,bytes}));
}
