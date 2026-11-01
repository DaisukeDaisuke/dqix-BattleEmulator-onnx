import {Graph} from './graph-builder.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

// Required state stores of the forced placement helper, without its animation
// machinery. The common decision and typed object population supply the mask.
export function buildCameraWorldBehavior(){
 const g=new Graph('rom-camera-world-behavior1',{
  inputContractVersion:1,
  authority:[
   {path:'src/Combat/Main/func_02048cf0.cpp',sha256:'ea9da60c57ec66bed366c1367d619d1668b20214b5ef0c7daeb58cf7bfbe6586',jpn:'02049b10: forced placement calls the behavior setter only when BE is zero'},
   {path:'src/Combat/Main/func_02033b88.cpp',sha256:'a42942f9ae375dc690c00d151f2a665f1ed49234b7ff0d608f6d41a1ba39db86',jpn:'020336c0: BF=BE, BE=argument; stores observed at020336c8/020336cc'},
  ],
  scope:'Camera forced placement updates previous behavior BF from BE when BE is zero. Retain both bytes otherwise. This is the required state projection only; no animation bank, resource allocation, rendering or RNG operation.',
  defaults:{behaviorBE:0,behaviorPrevious:0,restoreActor:true,enabled:true},
  inputDomains:{behaviorBE:{width:1,min:0,max:255,integer:true},behaviorPrevious:{width:1,min:0,max:255,integer:true},restoreActor:{width:1,values:[true,false,0,1]},enabled:{width:1,values:[true,false,0,1]}},
 });
 const behavior=g.input('behaviorBE'),previous=g.input('behaviorPrevious'),restore=g.input('restoreActor',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),write=g.and(enabled,restore,g.eq(behavior,0));
 g.output(g.where(write,0,behavior),'nextBehaviorBE');g.output(g.where(write,behavior,previous),'nextBehaviorPrevious');g.output(write,'wrote');return g;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const dir=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('./',import.meta.url);console.log(JSON.stringify(await buildCameraWorldBehavior().save(dir)));}
