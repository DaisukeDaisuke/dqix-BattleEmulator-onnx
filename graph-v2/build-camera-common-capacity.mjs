// Shared twelve-object / seventy-two-command camera tensors. Four-object
// historical builders remain reproducible through their explicit defaults.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {buildDispatchInit,buildDispatchDecision,buildDispatchCommit} from './build-camera-dispatcher.mjs';
import {buildFallbackGoal} from './build-camera-goals.mjs';
import {buildCameraConflictUpdate} from './build-camera-member-goal.mjs';
import {buildPreprocessScan,buildPreprocessCommit} from './build-camera-preprocess.mjs';
import {buildCameraParentControl} from './build-camera-parent-control.mjs';
import {buildCameraRoutePost} from './build-camera-route-post.mjs';
import {buildRoutePrepare,buildRouteAccept,buildRouteFinalize} from './build-camera-route-planner.mjs';
import {buildCameraCorridorDistances,buildCameraCorridorConflict} from './build-camera-corridor.mjs';
import {buildCameraWorldBehavior} from './build-camera-world-behavior.mjs';

export const COMMON_CAMERA_CAPACITY=12,COMMON_CAMERA_COMMAND_CAPACITY=72;
export async function buildCommonCameraCapacity(){
 const options={capacity:COMMON_CAMERA_CAPACITY,commandCapacity:COMMON_CAMERA_COMMAND_CAPACITY};
 const graphs=[];
 for(const builder of [buildDispatchInit,buildDispatchDecision,buildDispatchCommit,buildFallbackGoal,buildCameraConflictUpdate,buildPreprocessScan,buildPreprocessCommit,buildCameraParentControl,buildCameraRoutePost])graphs.push(await builder(options));
 for(const builder of [buildRoutePrepare,buildRouteAccept,buildRouteFinalize])graphs.push(await builder({...options,byteNodes:true}));
 for(const builder of [buildCameraCorridorDistances,buildCameraCorridorConflict])graphs.push(await builder());
 graphs.push(buildCameraWorldBehavior());
 return graphs;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const directory=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('./',import.meta.url);
 await mkdir(directory,{recursive:true});
 for(const graph of await buildCommonCameraCapacity()){const result=await graph.save(directory);console.log(JSON.stringify({name:result.name,bytes:result.bytes,nodes:result.nodes}));}
}
