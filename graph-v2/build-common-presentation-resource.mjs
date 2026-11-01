import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

export const COMMON_PRESENTATION_RESOURCE_AUTHORITY={
  entry:'JPN021dc70c / matching021dbe10',state4:'JPN021dcf8c / matching021dc694',
  sources:[
    {path:'src/Combat/Overlay_25/func_ov025_021dbe10.cpp',sha256:'85f62f4651ba9d3c6ba53feea1e1a836526b1126914ef532c2e54f00803e650e'},
    {path:'src/Combat/Overlay_25/021dc694.cpp',sha256:'a967f0ceeb76af131d88a97a3ab9999ce419c102ef7bd8335b5ae1d39de8b188'},
    {path:'src/Filesystem/BackgroundLoader.cpp',sha256:'7ca2bee709631cb6fee5de4c843bc44aed61431827520bba808786202f0eaba0'}
  ]
};

// Original category selects a resource archive; it never selects an encounter
// execution program. The caller resolves these three kinds to the ROM paths.
export function commonMissingProgramArchiveKind(g,category,sourceId){
  return g.where(g.eq(category,2),2,g.where(g.and(g.or(g.eq(category,1),g.eq(category,4)),g.ge(sourceId,0),g.le(sourceId,3)),1,0));
}

export function buildCommonPresentationResource(){
  const domains={phase:{width:1,min:0,max:2,integer:true},presentationState:{width:1,min:0,max:255,integer:true},taskStatus:{width:1,min:-1,max:1,integer:true},actionDefinitionId:{width:1,min:0,max:4095,integer:true},actionOperation:{width:1,min:0,max:127,integer:true}};
  for(const name of['loadedFileSizeU16','taskIdU16','fallbackGlobal8U16','fallbackGlobal10U16'])domains[name]={width:2,min:0,max:65535,integer:true};
  const g=new Graph('rom-common-presentation-resource',{
    inputContractVersion:1,authority:COMMON_PRESENTATION_RESOURCE_AUTHORITY,
    scope:'Original presentation state4 control, split only at real resource parsing and program initialization calls. Phase0 polls the actual loader and requests loaded-file/NARC decoding; phase1 uses the state produced by primary program initialization/selector to decide fallback; phase2 consumes actual fallback lookup and initialization. No frame-count readiness, expected script, or observed endpoint is an input. The caller executes requested producers in original order. Program initialization invokes the existing selector without repeating the outer planning parent.',
    phases:{0:'actual loader status and loaded-file result',1:'after optional decoded-program initialization and selector',2:'actual fallback lookup; repeat after requested initialization completes'},
    fallback:'An action with operation12 searches fallback action344; all others search the action definition ID. A missing fallback enters state5 and clears global021efc3c and021efc44. Task removal and task-global=-1 occur after the final initialization or missing-fallback branch.',
    defaults:{phase:0,presentationState:4,taskStatus:0,loadedFilePresent:false,loadedFileSizeU16:[0,0],archiveLookupComplete:false,actionMemberPresent:false,programParseComplete:false,parsedProgramPresent:false,actionRecordPresent:true,actionDefinitionId:1,actionOperation:1,fallbackProgramPresent:false,fallbackInitialized:false,taskIdU16:[0,0],fallbackGlobal8U16:[0,0],fallbackGlobal10U16:[0,0],enabled:true},
    inputDomains:domains,feedback:{presentationState:'nextPresentationState',taskIdU16:'nextTaskIdU16',fallbackGlobal8U16:'nextFallbackGlobal8U16',fallbackGlobal10U16:'nextFallbackGlobal10U16'}
  });
  const phase=g.input('phase'),state=g.input('presentationState'),status=g.input('taskStatus'),definition=g.input('actionDefinitionId'),operation=g.input('actionOperation'),size=g.split(g.input('loadedFileSizeU16',['N',2]),2),task=g.input('taskIdU16',['N',2]),global8=g.input('fallbackGlobal8U16',['N',2]),global10=g.input('fallbackGlobal10U16',['N',2]),flag=name=>g.input(name,['N',1],'bool'),file=flag('loadedFilePresent'),record=flag('actionRecordPresent'),fallback=flag('fallbackProgramPresent'),initialized=flag('fallbackInitialized'),archiveComplete=flag('archiveLookupComplete'),member=flag('actionMemberPresent'),parseComplete=flag('programParseComplete'),parsed=flag('parsedProgramPresent'),enabled=flag('enabled');
  const poll=g.and(enabled,g.eq(phase,0)),primary=g.and(enabled,g.eq(phase,1)),last=g.and(enabled,g.eq(phase,2)),ready=g.and(poll,g.not(g.eq(status,0))),admitted=g.or(...[2,3,6].map(value=>g.eq(state,value))),needsRecord=g.or(g.and(ready,g.not(admitted)),g.and(primary,g.not(admitted)),last),parse=g.and(ready,file,g.or(...size.map(value=>g.gt(value,0))),record),needsArchive=g.and(parse,g.not(archiveComplete)),needsParse=g.and(parse,archiveComplete,member,g.not(parseComplete)),supported=g.and(g.or(g.not(needsRecord),record),g.not(needsArchive),g.not(needsParse)),lookup=g.and(primary,g.not(admitted),supported),initialize=g.and(last,supported,fallback,g.not(initialized)),missing=g.and(last,supported,g.not(fallback)),remove=g.and(supported,g.or(g.and(primary,admitted),g.and(last,g.or(g.not(fallback),initialized))));
  const outputs={supported,waiting:g.and(poll,g.eq(status,0)),requestLoadedFile:ready,requestArchiveMember:parse,requiresArchiveProducer:needsArchive,requiresProgramProducer:needsParse,requestPrimaryInitialize:g.and(parse,archiveComplete,member,parseComplete,parsed),requestFallbackLookup:lookup,fallbackActionId:g.where(g.eq(operation,12),344,definition),requestFallbackInitialize:initialize,removeTask:remove,clearFallbackGlobals:missing,nextPresentationState:g.where(missing,5,state),nextTaskIdU16:g.where(remove,g.constant([65535,65535],'float32',[1,2]),task),nextFallbackGlobal8U16:g.where(missing,0,global8),nextFallbackGlobal10U16:g.where(missing,0,global10),consumed:g.mul(state,0)};
  for(const[name,value]of Object.entries(outputs))g.output(value,name);
  return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonPresentationResource().save(),null,2));
