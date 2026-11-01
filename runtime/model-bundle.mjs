const MAGIC='DQ9ONNX1',MAX_EXPANDED_BYTES=512*1024*1024;
const utf8=new TextDecoder('utf-8',{fatal:true});
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const validHash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const validName=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]*$/.test(value);

async function expand(compressed,limit){
  const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Model bundle exceeds its declared size');chunks.push(value);}
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  if(size!==limit)throw Error('Model bundle expanded byte count differs');
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}

export async function decodeModelBundle(compressed,descriptor){
  if(!(compressed instanceof Uint8Array))compressed=new Uint8Array(compressed);
  if(!descriptor||!validHash(descriptor.sha256)||!Number.isSafeInteger(descriptor.expandedBytes)||descriptor.expandedBytes<12||descriptor.expandedBytes>MAX_EXPANDED_BYTES)throw Error('Invalid model bundle declaration');
  if(compressed.length!==descriptor.sizeBytes||await sha256(compressed)!==descriptor.sha256)throw Error('Model bundle SHA-256 or byte count differs');
  const bytes=await expand(compressed,descriptor.expandedBytes);
  if(utf8.decode(bytes.subarray(0,8))!==MAGIC)throw Error('Invalid model bundle magic');
  const headerBytes=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true),payload=12+headerBytes;
  if(headerBytes<2||headerBytes>1024*1024||payload>bytes.length)throw Error('Invalid model bundle header size');
  const header=JSON.parse(utf8.decode(bytes.subarray(12,payload)));
  if(header.schema!=='dq9-onnx-bundle-v1'||header.id!==descriptor.id||!Array.isArray(header.models)||!header.models.length)throw Error('Invalid model bundle identity');
  if(JSON.stringify(header.models.map(model=>model.name))!==JSON.stringify(descriptor.models))throw Error('Model bundle membership differs');
  const models=new Map();let offset=0;
  for(const entry of header.models){
    if(!validName(entry.name)||models.has(entry.name)||!validHash(entry.sha256)||!validHash(entry.irSha256))throw Error('Invalid/duplicate bundled model');
    for(const key of ['offset','length','irOffset','irLength'])if(!Number.isSafeInteger(entry[key])||entry[key]<0)throw Error('Invalid model bundle range');
    if(!entry.length||!entry.irLength||entry.offset!==offset||entry.irOffset!==offset+entry.length||payload+entry.irOffset+entry.irLength>bytes.length)throw Error('Model bundle ranges overlap or leave a gap');
    const onnx=bytes.subarray(payload+entry.offset,payload+entry.offset+entry.length),irBytes=bytes.subarray(payload+entry.irOffset,payload+entry.irOffset+entry.irLength);
    if(await sha256(onnx)!==entry.sha256||await sha256(irBytes)!==entry.irSha256)throw Error('Bundled model content differs: '+entry.name);
    const ir=JSON.parse(utf8.decode(irBytes));if(ir.name!==entry.name)throw Error('Bundled IR identity differs');
    models.set(entry.name,{name:entry.name,onnx,ir,sha256:entry.sha256,irSha256:entry.irSha256,executionProvider:entry.executionProvider,public:entry.public===true});
    offset=entry.irOffset+entry.irLength;
  }
  if(payload+offset!==bytes.length)throw Error('Model bundle has trailing bytes');
  return models;
}

// baseURL should resolve to an immutable Hugging Face commit for repeatable
// runs. fetchBytes is injectable for local/offline use and network accounting.
// Failed loads are evicted; concurrent requests for one bundle share a promise.
export function createModelBundleLoader({index,baseURL,fetchBytes,onProgress}={}){
  if(index?.schema!=='dq9-runtime-index-v3'||!Array.isArray(index.bundles)||!index.bundles.length||index.bundles.length>3)throw Error('Expected a bundled DQ9 runtime index');
  const declarations=new Map(),byName=new Map(),pending=new Map();
  for(const bundle of index.bundles){
    if(!/^models\/[a-z0-9-]+\.onnxbundle\.gz$/.test(bundle.path)||declarations.has(bundle.path)||!Array.isArray(bundle.models)||!bundle.models.length)throw Error('Invalid/duplicate model bundle path');
    declarations.set(bundle.path,bundle);
  }
  for(const model of index.models??[]){
    const declaration=declarations.get(model.bundle);
    if(!validName(model.name)||!validHash(model.sha256)||!validHash(model.irSha256)||byName.has(model.name)||!declaration?.models.includes(model.name))throw Error('Invalid model index binding');
    byName.set(model.name,model);
  }
  for(const bundle of declarations.values())for(const name of bundle.models)if(byName.get(name)?.bundle!==bundle.path)throw Error('Unindexed model bundle member');
  async function download(path){
    if(fetchBytes)return fetchBytes(path);
    if(!baseURL)throw Error('A release baseURL or fetchBytes is required');
    const response=await fetch(new URL(path,baseURL));if(!response.ok)throw Error('Model bundle download failed: '+response.status);return new Uint8Array(await response.arrayBuffer());
  }
  function loadBundle(path){
    if(!pending.has(path)){
      const descriptor=declarations.get(path);if(!descriptor)throw Error('Unknown model bundle');
      const promise=(async()=>{
        onProgress?.({kind:'bundle',path,models:descriptor.models.length});
        const models=await decodeModelBundle(await download(path),descriptor);
        for(const [name,model]of models){const expected=byName.get(name);if(model.sha256!==expected.sha256||model.irSha256!==expected.irSha256||(model.executionProvider??null)!==(expected.executionProvider??null)||model.public!==(expected.public===true))throw Error('Bundled model index differs: '+name);}
        return models;
      })().catch(error=>{if(pending.get(path)===promise)pending.delete(path);throw error;});
      pending.set(path,promise);
    }
    return pending.get(path);
  }
  return{
    async getModel(name){const entry=byName.get(name);if(!entry)throw Error('Unknown model: '+name);return(await loadBundle(entry.bundle)).get(name);},
    async loadAll(){const result=new Map();for(const bundle of declarations.keys())for(const [name,model]of await loadBundle(bundle))result.set(name,model);return result;},
    get downloadedBundles(){return pending.size;},
    clear(){pending.clear();}
  };
}
