// Complete current-member AssignGoal projection, including target depth1..3.
// Only field binding and the actual helper schedule live in this host module.
// Every map operation, candidate, distance, conflict and byte write is ONNX.
import {validateGraphInputs} from './input-domains.mjs';
import {createCameraDelayedPaintRunner} from './camera-delayed-paint-runner.mjs';
export const CAMERA_MEMBER_WIDE_MODELS=['rom-camera-member-goal-prepare-wide','rom-camera-nearest-node','rom-camera-conflict-update','rom-camera-ring-labels','rom-camera-nonmember-goal-finalize','rom-camera-member-goal-commit-wide','rom-camera-class-paint','rom-camera-map-write','rom-camera-delayed-paint-step'];
const array=x=>Array.isArray(x)?[...x]:[x];
export async function createCameraMemberWideRunner({runGraph,getModel,onTrace}={}){
  const models=Object.fromEntries(await Promise.all(CAMERA_MEMBER_WIDE_MODELS.map(async name=>[name,await getModel(name)])));let calls=0;
  async function call(name,rows,phase){
    const ir=models[name],inputs=rows.map((row,lane)=>{const input=Object.fromEntries(ir.inputs.map(d=>{const v=array(row[d.name]??ir.contract.defaults[d.name]);if(v.length!==d.shape[1])throw Error(`${name}.${d.name}: lane${lane} width`);return[d.name,v];})),errors=validateGraphInputs(ir.contract,input);if(errors.length)throw Error(`${name} lane${lane}: ${errors.join('; ')}`);return input;});
    calls++;const outputs=await runGraph(name,inputs,{phase});if(outputs.length!==rows.length)throw Error('Member graph changed lane count');if(onTrace)await onTrace({phase,model:name,inputs,outputs});return outputs;
  }
  const delayed=await createCameraDelayedPaintRunner({getModel:async n=>models[n],runGraph:async(name,inputs,meta)=>{calls++;return runGraph(name,inputs,meta);},onTrace});
  async function run({rows}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('Nonempty batch required');calls=0;
    const sourceRows=rows.map((r,lane)=>{
      if(!Array.isArray(r.roster)||r.roster.length!==36||!Array.isArray(r.sourceId)||r.sourceId.length!==1)throw Error(`lane${lane}: explicit roster36 and sourceId required`);
      const ids=Array.from({length:r.rosterCount[0]},(_,i)=>r.roster[i*3]);if(new Set(ids).size!==ids.length)throw Error(`lane${lane}: unique roster IDs required`);const source=ids.indexOf(r.sourceId[0]),target=ids.indexOf(r.target[0]);if(source<0||target<0||source===target)throw Error(`lane${lane}: distinct source and target rows required`);
      for(const [i,actor]of [[source,r.actor],[target,r.target]]){const offset=actor===r.actor?1:2,aux=actor===r.actor?3:4;if(r.roster[i*3+1]!==actor[offset]||r.roster[i*3+2]!==actor[aux])throw Error(`lane${lane}: actor/roster start or auxiliary mismatch`);}
      return source;
    });
    const prepared=await call('rom-camera-member-goal-prepare-wide',rows,'camera:member-wide:prepare');prepared.forEach((p,lane)=>{if(rows[lane].enabled?.[0]!==false&&!p.supported[0])throw Error(`lane${lane}: target depth>0 requires class>=242 for the ordered delayed-paint proof`);});
    const nearest=await call('rom-camera-nearest-node',rows.map(r=>({worldPosition:r.targetWorldPosition,objectPresent:r.targetObjectPresent})),'camera:member-wide:nearest');
    const preConflict=await call('rom-camera-conflict-update',rows.map((r,i)=>({occupancy:prepared[i].clearedOccupancy,selectedNodes:nearest[i].neighbors,roster:r.roster,rosterCount:r.rosterCount,excludedIds:[r.sourceId[0],r.target[0]],excludedPresent:[true,true],observedRow4Bytes:r.observedRow4Bytes,enabled:prepared[i].active})),'camera:member-wide:pre-conflict');
    const labelRows=rows.map((r,i)=>({occupancy:prepared[i].clearedOccupancy,origin:prepared[i].origin,radius:prepared[i].radius,delay:prepared[i].delay,enabled:prepared[i].active}));
    const ringLabels=await call('rom-camera-ring-labels',labelRows,'camera:member-wide:labels-ring');
    const labels=await call('rom-camera-class-paint',rows.map((r,i)=>({occupancy:ringLabels[i].nextOccupancy,origin:prepared[i].origin,actorClass:[r.actor[0]],maximumDepth:prepared[i].effectiveDepth,enabled:prepared[i].active})),'camera:member-wide:labels-footprint');
    const targetRing=await call('rom-camera-ring-labels',labelRows.map(r=>({...r,occupancy:Array(81).fill(0)})),'camera:member-wide:target-ring');
    const targetPivot=await call('rom-camera-map-write',rows.map((r,i)=>({occupancy:targetRing[i].nextOccupancy,node:prepared[i].origin,value:[r.target[1]],enabled:prepared[i].active})),'camera:member-wide:target-pivot');
    const targetArea=(await delayed.run({rows:rows.map((r,i)=>({occupancy:targetPivot[i].nextOccupancy,origin:prepared[i].origin,actorClass:prepared[i].delayedPaintClass,maximumDepth:prepared[i].effectiveDepth,enabled:prepared[i].delayedPaintEnabled}))})).output;
    const innerArea=await call('rom-camera-ring-labels',labelRows.map(r=>({...r,occupancy:Array(81).fill(0),radius:[1]})),'camera:member-wide:inner-area');
    // The shared candidate routine preserves the real overlapping stack
    // scratch. Force its pivot to target.start, as the member branch does,
    // while retaining the target's actual depth/descriptor flags.
    const candidates=await call('rom-camera-nonmember-goal-finalize',rows.map((r,i)=>({...r,target:[...r.target.slice(0,3),255,255,r.target[5]],flags:[false,false,r.flags[2],r.flags[3]],distanceLabels:labels[i].nextOccupancy,enabled:prepared[i].active})),'camera:member-wide:shared-candidate');
    const commit=await call('rom-camera-member-goal-commit-wide',rows.map((r,i)=>({...r,occupancy:preConflict[i].nextOccupancy,distanceLabels:labels[i].nextOccupancy,targetArea:targetArea[i].nextOccupancy,innerArea:innerArea[i].nextOccupancy,candidateGoal:candidates[i].nextGoal,enabled:prepared[i].active})),'camera:member-wide:commit');
    const restored=await call('rom-camera-class-paint',commit.map(c=>({occupancy:c.occupancyBeforeRestorePaint,origin:c.restorePaintOrigin,actorClass:c.restorePaintValue,maximumDepth:c.restorePaintDepth,enabled:c.restorePaintEnabled})),'camera:member-wide:source-footprint');
    const auxWritten=await call('rom-camera-map-write',commit.map((c,i)=>({occupancy:restored[i].nextOccupancy,node:c.auxiliaryWriteNode,value:c.auxiliaryWriteValue,enabled:prepared[i].active})),'camera:member-wide:auxiliary-write');
    const postConflict=await call('rom-camera-conflict-update',rows.map((r,i)=>{const roster=r.roster.map((value,j)=>j%3===2?preConflict[i].nextAuxiliary[Math.floor(j/3)]:value);roster[sourceRows[i]*3+2]=commit[i].nextAuxiliary[0];return {occupancy:auxWritten[i].nextOccupancy,selectedNodes:commit[i].postConflictNodes,roster,rosterCount:r.rosterCount,excludedIds:[r.sourceId[0],255],excludedPresent:[true,false],observedRow4Bytes:preConflict[i].nextObservedRow4Bytes,enabled:prepared[i].active};}),'camera:member-wide:post-conflict');
    return {output:commit.map((c,i)=>({...c,nextOccupancy:postConflict[i].nextOccupancy,rosterAuxiliary:postConflict[i].nextAuxiliary,nextObservedRow4Bytes:postConflict[i].nextObservedRow4Bytes,preRow4Writes:preConflict[i].writeRow4One,postRow4Writes:postConflict[i].writeRow4One,supported:prepared[i].supported})),prepared,nearest,preConflict,postConflict,distanceLabels:labels.map(x=>x.nextOccupancy),targetArea:targetArea.map(x=>x.nextOccupancy),innerArea:innerArea.map(x=>x.nextOccupancy),candidates,graphCalls:calls,
      scope:'Complete current-member AssignGoal projection for effective target depth0..3 and distinct existing source/target roster rows; positive target depth requires class>=242. Initial world coordinates, actual record categories, initial correlated four row+4 words and occupancy are inputs. Matrix rings, exact nearest distances, ordered delayed class paint, overlapping candidate scratch, both conflict writers and source restore are graph computations. Upstream membership/dispatch and unobserved initial row+4 values remain explicit boundaries. The host does not inject actual-ROM intermediate results.'};
  }
  return {run,models:CAMERA_MEMBER_WIDE_MODELS};
}
