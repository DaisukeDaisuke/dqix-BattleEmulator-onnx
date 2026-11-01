import {fileURLToPath} from 'node:url';
import {buildCommonAnimationDispatch} from './build-common-animation-dispatch.mjs';
import {buildCommonAnimationState} from './build-common-animation-state.mjs';
import {buildCommonAnimationReset} from './build-common-animation-reset.mjs';
import {buildCommonAnimationInitialize} from './build-common-animation-initialize.mjs';
import {buildCommonAnimationTick} from './build-common-animation-tick.mjs';

export async function buildCommonAnimationExecution(){
 const directory=new URL('./',import.meta.url),reports=[];
 for(const build of[buildCommonAnimationDispatch,buildCommonAnimationState,buildCommonAnimationReset,buildCommonAnimationInitialize,buildCommonAnimationTick]){const saved=await build().save(directory);reports.push({name:saved.name,nodes:saved.nodes,bytes:saved.bytes});}return reports;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonAnimationExecution()));
