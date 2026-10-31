// Public UI shape adapter only: no numeric calculation or state alteration.
// The proved event runner keeps its original bytes and diagnostic API.
import {createCameraAdmissionEventRunner,CAMERA_ADMISSION_EVENT_MODELS} from './camera-admission-event-runner.mjs';
export const CAMERA_ADMISSION_PHASE_MODELS=CAMERA_ADMISSION_EVENT_MODELS;
export async function createCameraAdmissionPhaseRunner(options){
  const runner=await createCameraAdmissionEventRunner(options);
  async function run(input){const result=await runner.run(input);return result.complete?{...result,presentation:result.event}:result;}
  return {run,runRows:(rows,options={})=>run({rows,...options}),models:CAMERA_ADMISSION_PHASE_MODELS};
}
