import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

/** Stack effects of the actual NARC lookup called from the state4 frame path. */
export function buildCommonPresentationNarcStack(){
  const integer=(width,min,max)=>({width,min,max,integer:true});
  const g=new Graph('rom-common-presentation-narc-stack',{
    inputContractVersion:1,
    authority:[
      {path:'src/Filesystem/FileIO.cpp',symbol:'GetFileInNarc',jpn:'02076378'},
      {path:'src/NitroSDK/Filesystem/NarcHandle.cpp',symbols:['NarcHandle::Initialize','PrepareReadFileInNARCByID']},
      {path:'src/NitroSDK/Filesystem/NitroVM.cpp',meaning:'Original initialized NitroVM and path/read helper stores'},
      {path:'src/Combat/Overlay_25/func_ov025_021dc694.cpp',jpn:'021dcf8c; GetFileInNarc call021dd040'},
    ],
    defaults:{priorU16:Array(8).fill(0),componentSpU16:[0,0],archiveValid:false,archiveFileCount:0,firstFileIndex:0,fileOffsetsU16:Array(1024).fill(0),lookupMatched:false,matchedFileIndex:0,lookupReached:false,enabled:true},
    inputDomains:{priorU16:integer(8,0,65535),componentSpU16:integer(2,0,65535),archiveFileCount:integer(1,0,512),firstFileIndex:integer(1,0,65535),fileOffsetsU16:integer(1024,0,65535),matchedFileIndex:integer(1,0,511)},
    stackAbi:'jpn-component-state4-narc-v1',
    layout:{lookupEntrySpFromComponentSp:-0xb0,nestedRowBaseFromComponentSp:-0x174,nitroVmFromComponentSp:-0x1d8},
    scope:'The original state4 caller invokes GetFileInNarc at componentSP-b0. A valid supplied NARC clears word0. When at least one file is inspected, word1 receives the FAT start offset of the matched file or final inspected file, word2 receives the actual local NitroVM pointer componentSP-1d8, and word3 is preserved. An empty index range preserves words1/2/3. The graph chooses and gathers the offset from up to512 supplied exact FAT start offsets. Archive metadata and filename lookup are parsed only from initial supplied bytes; no observed stack or original execution result is an input. This boundary ends at lookup return; subsequent parser, formatter, selector, cleanup and world-camera stores are distinct producers. Invalid archives and larger FATs remain explicit unsupported boundaries.',
    originalStorePCs:['020ce234','020ce4bc','020cd63c','020cd660','020ce5a0'],
    feedback:{priorU16:'nextU16'},
  });
  const prior=g.split(g.input('priorU16',['N',8]),8),component=g.split(g.input('componentSpU16',['N',2]),2),validArchive=g.input('archiveValid',['N',1],'bool'),count=g.input('archiveFileCount',['N',1]),first=g.input('firstFileIndex',['N',1]),offsets=g.input('fileOffsetsU16',['N',1024]),matched=g.input('lookupMatched',['N',1],'bool'),matchIndex=g.input('matchedFileIndex',['N',1]),reached=g.input('lookupReached',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
  const mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),requested=g.and(enabled,reached),inspected=g.lt(first,count),matchValid=g.or(g.not(matched),g.and(inspected,g.ge(matchIndex,first),g.lt(matchIndex,count))),qualified=g.and(validArchive,g.gt(count,0),g.le(count,512),g.ge(first,0),g.eq(mod(component[0],4),0),matchValid),active=g.and(requested,qualified),readActive=g.and(active,inspected),lastIndex=g.min(g.max(g.where(matched,matchIndex,g.sub(count,1)),0),511),pick=index=>g.op('GatherElements',[offsets,g.cast(index,'int32')],{axis:1},{shape:['N',1]});
  const low=g.sub(component[0],0x1d8),pointer=[mod(low,65536),mod(g.add(component[1],g.floor(g.mul(low,1/65536))),65536)],zero=g.mul(first,0),fileOffset=[pick(g.mul(lastIndex,2)),pick(g.add(g.mul(lastIndex,2),1))],values=[zero,zero,...fileOffset,...pointer,prior[6],prior[7]],next=values.map((value,i)=>g.where(i<2?active:i<6?readActive:g.constant(false,'bool'),value,prior[i]));
  g.output(g.cat(next),'nextU16');g.output(g.or(g.not(requested),qualified),'supported');g.output(active,'active');g.output(g.cat([g.cast(active,'float32'),g.cast(readActive,'float32'),g.cast(readActive,'float32'),zero]),'wordWritten');g.output(g.cat(pointer),'nitroVmU16');g.output(g.where(inspected,lastIndex,-1),'lastInspectedFileIndex');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){const {name,nodes,bytes}=await buildCommonPresentationNarcStack().save();console.log(JSON.stringify({name,nodes,bytes}));}
