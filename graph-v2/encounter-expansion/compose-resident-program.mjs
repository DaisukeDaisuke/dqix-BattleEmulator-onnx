// Declarative inlining only: named tensors are rebound, private work slots are
// namespaced, and every original model call/loop/capture remains unchanged.
// This browser-compatible utility contains no numerical battle operation.
export function inlineResidentProgram({parent,child,prefix,inputs,outputs={}}){
  if(parent.schema!=='dq9-resident-onnx-program-v1'||child.schema!==parent.schema)throw Error('Program schema mismatch');
  if(Object.keys(child.parameters).length)throw Error('Parameterized child needs explicit parameter binding');
  const mapping=new Map(),parentSlots=new Map(parent.slots.map(s=>[s.name,s])),childSlots=new Map(child.slots.map(s=>[s.name,s]));
  function bind(inner,outer){
    if(mapping.has(inner)&&mapping.get(inner)!==outer)throw Error('Aliased child tensor mapped to distinct parent slots: '+inner);
    const a=childSlots.get(inner),b=parentSlots.get(outer);if(!a||!b||a.width!==b.width||a.dtype!==b.dtype)throw Error('Program tensor type mismatch '+inner+' -> '+outer);mapping.set(inner,outer);
  }
  for(const[name,inner]of Object.entries(child.inputs)){if(!inputs[name])throw Error('Missing child input '+name);bind(inner,inputs[name]);}
  for(const[name,outer]of Object.entries(outputs)){if(!child.outputs[name])throw Error('Missing child output '+name);bind(child.outputs[name],outer);}
  for(const s of child.slots)if(!mapping.has(s.name)){
    if(s.initial.kind==='input')throw Error('Unbound external child tensor '+s.name);
    const name=prefix+':'+s.name;if(parentSlots.has(name))throw Error('Private tensor collision '+name);
    const added={...structuredClone(s),name};parent.slots.push(added);parentSlots.set(name,added);mapping.set(s.name,name);
  }
  const modules=new Map(parent.modules.map(m=>[m.name,m]));for(const m of child.modules){if(modules.has(m.name)){if(modules.get(m.name).sha256!==m.sha256)throw Error('Immutable module hash collision '+m.name);}else{const copy=structuredClone(m);parent.modules.push(copy);modules.set(m.name,copy);}}
  function translate(steps){return steps.map(s=>{
    const r={...structuredClone(s),id:prefix+':'+s.id};
    if(s.op==='repeat'){r.body=translate(s.body);return r;}
    if(s.op==='call')for(const key of ['inputs','outputs'])r[key]=Object.fromEntries(Object.entries(s[key]).map(([name,value])=>[name,mapping.get(value)]));
    else if(s.op==='capture')r.tensors=Object.fromEntries(Object.entries(s.tensors).map(([name,value])=>[name,mapping.get(value)]));
    else throw Error('Unsupported child operation '+s.op);return r;
  });}
  return translate(child.steps);
}
