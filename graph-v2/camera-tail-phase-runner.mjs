// Public UI adapter only; the proved projection runner is kept byte-for-byte.
import {createCameraTailProjectionRunner,CAMERA_TAIL_PROJECTION_MODELS} from './camera-tail-projection-runner.mjs';
export const CAMERA_TAIL_PHASE_MODELS=CAMERA_TAIL_PROJECTION_MODELS;
export async function createCameraTailPhaseRunner(options){
 const runner=await createCameraTailProjectionRunner(options);
 async function run(input){const result=await runner.run(input);return result.complete?{...result,presentation:result.world.prior.event}:result;}
 return{run,runRows:(rows,options={})=>run({rows,...options}),models:CAMERA_TAIL_PHASE_MODELS};
}
