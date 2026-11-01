// The control scheduler is unchanged. Only the three byte-node models replace
// their original limited-domain counterparts; the path kernel stays identical.
import {createCameraRoutePlanner,CAMERA_ROUTE_MODELS} from './camera-route-planner.mjs';
const modelAliases=commandCapacity=>Object.fromEntries(CAMERA_ROUTE_MODELS.filter(n=>n!=='rom-camera-route-step').map(n=>[n,n.replace('route-','route-byte-')+(commandCapacity===60?'':commandCapacity)]));
export const cameraRouteByteModelNames=(commandCapacity=60)=>{const aliases=modelAliases(commandCapacity);return CAMERA_ROUTE_MODELS.map(n=>aliases[n]??n);};
export const CAMERA_ROUTE_BYTE_MODELS=cameraRouteByteModelNames(60);
export async function createCameraRouteBytePlanner({runGraph,getModel,onTrace,commandCapacity=60}={}){
 if(![60,72].includes(commandCapacity))throw Error('Camera command capacity must be60 or72');const aliases=modelAliases(commandCapacity);
 const r=await createCameraRoutePlanner({getModel:n=>getModel(aliases[n]??n),runGraph:(n,rows,meta)=>runGraph(aliases[n]??n,rows,meta),onTrace:onTrace?e=>onTrace({...e,model:aliases[e.model]??e.model}):undefined});
 return {...r,models:cameraRouteByteModelNames(commandCapacity)};
}
