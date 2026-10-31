// The control scheduler is unchanged. Only the three byte-node models replace
// their original limited-domain counterparts; the path kernel stays identical.
import {createCameraRoutePlanner,CAMERA_ROUTE_MODELS} from './camera-route-planner.mjs';
const aliases=Object.fromEntries(CAMERA_ROUTE_MODELS.filter(n=>n!=='rom-camera-route-step').map(n=>[n,n.replace('route-','route-byte-')]));
export const CAMERA_ROUTE_BYTE_MODELS=CAMERA_ROUTE_MODELS.map(n=>aliases[n]??n);
export async function createCameraRouteBytePlanner({runGraph,getModel,onTrace}={}){
 const r=await createCameraRoutePlanner({getModel:n=>getModel(aliases[n]??n),runGraph:(n,rows,meta)=>runGraph(aliases[n]??n,rows,meta),onTrace:onTrace?e=>onTrace({...e,model:aliases[e.model]??e.model}):undefined});
 return {...r,models:CAMERA_ROUTE_BYTE_MODELS};
}
