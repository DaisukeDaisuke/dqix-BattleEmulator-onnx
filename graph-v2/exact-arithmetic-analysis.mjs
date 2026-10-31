// Conservative interval proof for JSON IR only. No ONNX operators, constants,
// input contracts or execution semantics are changed by this pass.
//
// A FLOAT Add/Sub/Mul is hardware-exact when both operands are integers and
// every mathematical result has magnitude strictly below 2^24. A MatMul also
// requires the sum of absolute term bounds below 2^24: this proves every
// partial sum, irrespective of a backend's accumulation order. Unknown inputs
// remain unknown. Noninteger arithmetic is never tagged by this proof.
export const EXACT_ANALYSIS_VERSION='interval-integer-v1';
const LIMIT=2**24,MAX_CELLS=65536,UNKNOWN=null;
const f=Math.fround,bytes=new ArrayBuffer(4),floats=new Float32Array(bytes),bits=new Uint32Array(bytes);
const finite=x=>Number.isFinite(x);
const domain=(min,max,integer=false)=>finite(min)&&finite(max)&&min<=max?{min,max,integer:!!integer,dependencies:[]}:UNKNOWN;
const depend=(range,...parents)=>range?{...range,dependencies:[...new Set(parents.flatMap(x=>x?.dependencies??[]))]}:UNKNOWN;
const fixed=x=>domain(x,x,Number.isInteger(x));
const boolDomain=domain(0,1,true);
const magnitude=a=>a?Math.max(Math.abs(a.min),Math.abs(a.max)):Infinity;
const union=(a,b)=>a&&b?depend(domain(Math.min(a.min,b.min),Math.max(a.max,b.max),a.integer&&b.integer),a,b):UNKNOWN;
function nextFloat(value,up){
  if(!finite(value))return value;
  if(value===0)return up?2**-149:-(2**-149);
  floats[0]=value;bits[0]+=(value>0)===up?1:-1;return floats[0];
}
// One representable value of outward slack covers any binary64 evaluation of
// a real endpoint before binary32 rounding. Exact integer proofs avoid slack.
const rounded=(min,max,integer=false)=>domain(nextFloat(f(min),false),nextFloat(f(max),true),integer);
const shapeOf=value=>{
  if(!value?.shape||value.shape.some((x,i)=>!(Number.isInteger(x)&&x>0)&&!(x==='N'&&i===0)))return null;
  const shape=value.shape.map(x=>x==='N'?1:x),count=shape.reduce((a,b)=>a*b,1);
  return count<=MAX_CELLS?shape:null;
};
const count=shape=>shape?.reduce((a,b)=>a*b,1)??0;
function coordinates(index,shape){const out=Array(shape.length);for(let i=shape.length-1;i>=0;i--){out[i]=index%shape[i];index=Math.floor(index/shape[i]);}return out;}
function offset(coords,shape){let result=0;for(let i=0;i<shape.length;i++)result=result*shape[i]+coords[i];return result;}
function broadcastCell(tensor,coords,outShape){
  if(!tensor||tensor.shape.length>outShape.length)return UNKNOWN;
  const delta=outShape.length-tensor.shape.length,at=[];
  for(let i=0;i<tensor.shape.length;i++){const extent=tensor.shape[i];if(extent!==1&&extent!==outShape[i+delta])return UNKNOWN;at.push(extent===1?0:coords[i+delta]);}
  return tensor.cells[offset(at,tensor.shape)]??UNKNOWN;
}
function readRule(rule,dtype){
  if(!rule)return dtype==='bool'?boolDomain:UNKNOWN;
  let lo=rule.min,hi=rule.max,integer=!!rule.integer;
  if(Array.isArray(rule.values)&&rule.values.length){
    const values=rule.values.map(x=>typeof x==='boolean'?Number(x):x);
    if(values.some(x=>typeof x!=='number'||!finite(x)))return UNKNOWN;
    const small=Math.min(...values),large=Math.max(...values);
    lo=lo===undefined?small:Math.max(lo,small);hi=hi===undefined?large:Math.min(hi,large);
    integer=integer||values.every(Number.isInteger);
  }
  if(dtype==='bool')return domain(Math.max(0,lo??0),Math.min(1,hi??1),true);
  if(!finite(lo)||!finite(hi)||lo>hi)return UNKNOWN;
  if(integer){lo=Math.ceil(lo);hi=Math.floor(hi);}
  if(dtype==='int32'){
    if(lo<-(2**31)||hi>2**31-1)return UNKNOWN;
    return domain(Math.ceil(lo),Math.floor(hi),true);
  }
  // Host numbers become float32 tensor elements before the graph runs.
  return domain(f(lo),f(hi),integer||lo===hi&&Number.isInteger(f(lo)));
}
function arithmetic(op,a,b,dtype){
  if(!a||!b)return {range:UNKNOWN,exact:false};
  let lo,hi;
  if(op==='Add'){lo=a.min+b.min;hi=a.max+b.max;}
  else if(op==='Sub'){lo=a.min-b.max;hi=a.max-b.min;}
  else {const values=[a.min*b.min,a.min*b.max,a.max*b.min,a.max*b.max];lo=Math.min(...values);hi=Math.max(...values);}
  const ints=a.integer&&b.integer,exact=ints&&finite(lo)&&finite(hi)&&Math.max(Math.abs(lo),Math.abs(hi))<LIMIT;
  if(dtype==='int32')return {range:ints&&lo>=-(2**31)&&hi<=2**31-1?depend(domain(lo,hi,true),a,b):UNKNOWN,exact:false};
  if(exact)return {range:depend(domain(lo,hi,true),a,b),exact:true};
  // Integer inputs still produce an integer-valued binary32 result even if
  // precision is lost; do not label the operation itself exact.
  const range=rounded(lo,hi,ints);
  if(range?.integer){range.min=Math.ceil(range.min);range.max=Math.floor(range.max);}
  return {range:depend(range,a,b),exact:false};
}
function compare(op,a,b){
  if(!a||!b)return boolDomain;
  if(op==='Equal')return a.max<b.min||b.max<a.min?depend(fixed(0),a,b):a.min===a.max&&b.min===b.max&&a.min===b.min?depend(fixed(1),a,b):boolDomain;
  if(op==='Less')return a.max<b.min?depend(fixed(1),a,b):a.min>=b.max?depend(fixed(0),a,b):boolDomain;
  if(op==='LessOrEqual')return a.max<=b.min?depend(fixed(1),a,b):a.min>b.max?depend(fixed(0),a,b):boolDomain;
  if(op==='Greater')return compare('Less',b,a);
  return compare('LessOrEqual',b,a);
}
const powerOfTwo=x=>finite(x)&&x>0&&Number.isInteger(Math.log2(x));

/** Mutates only proof annotations on nodes. The returned range map is useful
 * for audits but is not serialized into the graph or used as a runtime guard. */
export function analyzeExactArithmetic(ir,{annotate=true}={}){
  const ranges=new Map(),inputRanges=new Map(),inputRefs=new Map(),inputRules=new Map(),producers=new Map(),values=ir.values??{},stats={version:EXACT_ANALYSIS_VERSION,model:ir.name,nodes:ir.nodes.length,manualArithmetic:0,automaticArithmetic:0,remainingArithmetic:0,automaticByOp:{},knownInputElements:0,unknownInputElements:0,unsupportedOps:[]},unsupported=new Set(),automatic=[];
  const get=name=>ranges.get(name);
  const set=(name,cells)=>{const shape=shapeOf(values[name]);if(shape)ranges.set(name,{shape,cells:cells??Array(count(shape)).fill(UNKNOWN)});};
  for(const value of ir.inputs){
    const shape=shapeOf(value);if(!shape)continue;
    const rules=ir.contract?.fieldDomains?.[value.name],base=ir.contract?.inputDomains?.[value.name];
    const cells=Array.from({length:count(shape)},(_,i)=>{
      const rule=rules?rules[i]:base,range=readRule(rule,value.dtype),key=`${value.name}[${i}]`;
      inputRefs.set(key,{input:value.name,index:i,...(rule?.name?{field:rule.name}:{})});inputRules.set(key,{rule,dtype:value.dtype});
      // A generic BOOL range follows from the tensor type, not a finite host
      // bound. A narrowed BOOL range, such as values:[false], does depend on it.
      const result=range?{...range,dependencies:value.dtype==='bool'&&range.min===0&&range.max===1?[]:[key]}:UNKNOWN;
      inputRanges.set(key,result);return result;
    });
    cells.forEach(x=>stats[x?'knownInputElements':'unknownInputElements']++);ranges.set(value.name,{shape,cells});
  }
  for(const value of ir.initializers){
    const shape=shapeOf(value);if(!shape)continue;
    ranges.set(value.name,{shape,cells:value.values.map(x=>fixed(value.dtype==='float32'?f(x):value.dtype==='bool'?Number(!!x):x))});
  }
  // Recognize only the exact integer identity x-floor(x/B)*B, B a power of
  // two. It avoids losing byte-limb ranges through interval correlation.
  const remainderRange=(node,cellIndex,outShape)=>{
    if(node.op!=='Sub')return UNKNOWN;
    const [x,multiple]=node.inputs,mul=producers.get(multiple);if(mul?.op!=='Mul')return UNKNOWN;
    const coords=coordinates(cellIndex,outShape),xRange=broadcastCell(get(x),coords,outShape);
    if(!xRange?.integer||magnitude(xRange)>=LIMIT)return UNKNOWN;
    for(const [qName,bName]of [[mul.inputs[0],mul.inputs[1]],[mul.inputs[1],mul.inputs[0]]]){
      const b=broadcastCell(get(bName),coords,outShape),floor=producers.get(qName);
      if(!b||b.min!==b.max||!powerOfTwo(b.min)||b.min<1||b.min>=LIMIT||floor?.op!=='Floor')continue;
      const scale=producers.get(floor.inputs[0]);if(scale?.op!=='Mul')continue;
      const inverseName=scale.inputs[0]===x?scale.inputs[1]:scale.inputs[1]===x?scale.inputs[0]:null;if(!inverseName)continue;
      const inverse=broadcastCell(get(inverseName),coords,outShape);
      if(!inverse||inverse.min!==1/b.min||inverse.max!==1/b.min)continue;
      const scaledLo=xRange.min/b.min,scaledHi=xRange.max/b.min;
      // All three operations are exact for these integer/power-of-two bounds.
      if(Math.max(Math.abs(Math.floor(scaledLo)*b.min),Math.abs(Math.floor(scaledHi)*b.min))>=LIMIT)continue;
      return depend(domain(0,b.min-1,true),xRange,b,inverse);
    }
    return UNKNOWN;
  };
  for(const node of ir.nodes){
    const wasAutomatic=/^interval-integer-v\d+$/.test(node.exactArithmeticSource??'');
    if(wasAutomatic&&annotate){delete node.exactArithmetic;delete node.exactArithmeticReason;delete node.exactArithmeticSource;delete node.exactArithmeticProof;}
    const manual=!!node.exactArithmetic&&!wasAutomatic;
    const op=node.op,outName=node.outputs[0],output=values[outName],outShape=shapeOf(output),dtype=output?.dtype;
    let cells=outShape?Array(count(outShape)).fill(UNKNOWN):null,exact=false,absoluteTermBound=null;
    if(outShape&&['Add','Sub','Mul'].includes(op)){
      exact=dtype==='float32';cells=cells.map((_,i)=>{
        const coords=coordinates(i,outShape),result=arithmetic(op,broadcastCell(get(node.inputs[0]),coords,outShape),broadcastCell(get(node.inputs[1]),coords,outShape),dtype);
        exact&&=result.exact;
        return remainderRange(node,i,outShape)??result.range;
      });
    }else if(outShape&&op==='MatMul'){
      const a=get(node.inputs[0]),b=get(node.inputs[1]);
      if(a?.shape.length===2&&b?.shape.length===2&&values[node.inputs[1]]?.shape[0]!=='N'&&a.shape[1]===b.shape[0]&&outShape.length===2&&outShape[0]===a.shape[0]&&outShape[1]===b.shape[1]){
        exact=dtype==='float32';absoluteTermBound=0;
        cells=cells.map((_,i)=>{
          const [row,col]=coordinates(i,outShape);let low=0,high=0,absolute=0,allInteger=true,known=true;const parents=[];
          for(let k=0;k<a.shape[1];k++){
            const aa=a.cells[row*a.shape[1]+k],bb=b.cells[k*b.shape[1]+col];
            if(!aa||!bb){known=false;break;}
            parents.push(aa,bb);
            allInteger&&=aa.integer&&bb.integer;
            const products=[aa.min*bb.min,aa.min*bb.max,aa.max*bb.min,aa.max*bb.max];
            low+=Math.min(...products);high+=Math.max(...products);absolute+=Math.max(...products.map(Math.abs));
          }
          // JS sums of integers below LIMIT are themselves exact. Larger sums
          // are only a failed proof, never an authorization for hardware f32.
          const ok=known&&allInteger&&absolute<LIMIT;exact&&=ok;absoluteTermBound=Math.max(absoluteTermBound,absolute);
          return ok?depend(domain(low,high,true),...parents):UNKNOWN;
        });
      }
    }else if(outShape&&op==='Split'){
      const source=get(node.inputs[0]),axis=node.attributes.axis??0;
      if(source&&values[node.inputs[0]]?.shape[axis]!=='N'&&axis>=0&&axis<source.shape.length){let start=0;for(const name of node.outputs){const shape=shapeOf(values[name]);if(!shape||shape.length!==source.shape.length||shape.some((extent,i)=>i!==axis&&extent!==source.shape[i]))continue;const part=Array.from({length:count(shape)},(_,i)=>{const at=coordinates(i,shape);at[axis]+=start;return source.cells[offset(at,source.shape)]??UNKNOWN;});set(name,part);start+=shape[axis];}}
    }else if(outShape&&op==='Concat'){
      const axis=node.attributes.axis??0,sources=node.inputs.map(get);
      if(sources.every(source=>source&&source.shape.length===outShape.length&&source.shape.every((extent,i)=>i===axis||extent===outShape[i]))&&axis>=0&&axis<outShape.length&&node.inputs.every(name=>values[name]?.shape[axis]!=='N'))cells=cells.map((_,i)=>{const at=coordinates(i,outShape);let p=at[axis];for(const source of sources){if(p<source.shape[axis]){at[axis]=p;return source.cells[offset(at,source.shape)]??UNKNOWN;}p-=source.shape[axis];}return UNKNOWN;});
    }else if(outShape&&op==='Gather'){
      const source=get(node.inputs[0]),indices=get(node.inputs[1]),axis=node.attributes.axis??0;
      if(source&&indices&&values[node.inputs[0]]?.shape[axis]!=='N'&&axis>=0&&axis<source.shape.length&&outShape.length===source.shape.length-1+indices.shape.length){
        cells=cells.map((_,i)=>{
          const at=coordinates(i,outShape),indexCoordinates=at.slice(axis,axis+indices.shape.length),index=indices.cells[offset(indexCoordinates,indices.shape)];
          if(!index?.integer||index.min<0||index.max>=source.shape[axis]||index.max-index.min>MAX_CELLS)return UNKNOWN;
          let result;for(let j=index.min;j<=index.max;j++){const from=at.slice(0,axis).concat([j],at.slice(axis+indices.shape.length)),d=source.cells[offset(from,source.shape)]??UNKNOWN;result=result===undefined?d:union(result,d);if(!result)break;}return depend(result??UNKNOWN,index,result);
        });
      }
    }else if(outShape&&['Identity','Cast','Floor','Where','Min','Max','Less','LessOrEqual','Greater','GreaterOrEqual','Equal','And','Or','Not'].includes(op)){
      cells=cells.map((_,i)=>{
        const coords=coordinates(i,outShape),args=node.inputs.map(name=>broadcastCell(get(name),coords,outShape)),[a,b,c]=args;
        if(op==='Identity')return a;
        if(op==='Cast'){
          if(dtype==='bool')return a&&(a.min>0||a.max<0)?depend(fixed(1),a):a?.min===0&&a.max===0?depend(fixed(0),a):boolDomain;
          if(!a)return UNKNOWN;
          if(dtype==='int32')return a.min>=-(2**31)&&a.max<=2**31-1?depend(domain(Math.trunc(a.min),Math.trunc(a.max),true),a):UNKNOWN;
          return depend(domain(f(a.min),f(a.max),a.integer),a);
        }
        if(op==='Floor')return a?depend(domain(Math.floor(a.min),Math.floor(a.max),true),a):UNKNOWN;
        if(op==='Where')return a?.min===1&&a.max===1?depend(b,a,b):a?.min===0&&a.max===0?depend(c,a,c):union(b,c);
        if(op==='Min')return args.every(Boolean)?depend(domain(Math.min(...args.map(x=>x.min)),Math.min(...args.map(x=>x.max)),args.every(x=>x.integer)),...args):UNKNOWN;
        if(op==='Max')return args.every(Boolean)?depend(domain(Math.max(...args.map(x=>x.min)),Math.max(...args.map(x=>x.max)),args.every(x=>x.integer)),...args):UNKNOWN;
        if(op==='Not')return a?.min===0&&a.max===0?depend(fixed(1),a):a?.min===1&&a.max===1?depend(fixed(0),a):boolDomain;
        if(op==='And')return a?.max===0?depend(fixed(0),a):b?.max===0?depend(fixed(0),b):a?.min===1&&b?.min===1?depend(fixed(1),a,b):boolDomain;
        if(op==='Or')return a?.min===1?depend(fixed(1),a):b?.min===1?depend(fixed(1),b):a?.max===0&&b?.max===0?depend(fixed(0),a,b):boolDomain;
        return compare(op,a,b);
      });
    }else unsupported.add(op);
    if(op!=='Split')set(outName,cells);
    for(const name of node.outputs)producers.set(name,node);
    if(dtype==='float32'&&['Add','Sub','Mul','Div','MatMul'].includes(op)){
      if(manual)stats.manualArithmetic++;
      else if(exact){
        const dependencies=[...new Set(cells.flatMap(x=>x.dependencies))];automatic.push({node,dependencies});
        stats.automaticArithmetic++;stats.automaticByOp[op]=(stats.automaticByOp[op]??0)+1;
        if(annotate){
          const min=Math.min(...cells.map(x=>x.min)),max=Math.max(...cells.map(x=>x.max));
          node.exactArithmetic=true;node.exactArithmeticSource=EXACT_ANALYSIS_VERSION;
          node.exactArithmeticReason='Machine input domains and conservative per-element interval propagation prove integer operands and every mathematical result/partial sum has magnitude strictly below 2^24. Unknown and noninteger arithmetic are excluded.';
          node.exactArithmeticProof={version:EXACT_ANALYSIS_VERSION,integer:true,min,max,strictAbsoluteLimit:LIMIT,dependencies:dependencies.map(key=>inputRefs.get(key)),...(absoluteTermBound===null?{}:{absoluteTermBound})};
        }
      }else stats.remainingArithmetic++;
    }
  }
  // Feedback is an induction proof, not a test of a few repeated inputs.
  // First require every mapped output interval to fit the corresponding input
  // domain. Then remove candidates depending on any failed feedback domain.
  // Mutually dependent candidates that all pass containment form an invariant.
  const feedback=new Map(),contained=(key,output)=>{
    const input=inputRanges.get(key),spec=inputRules.get(key);
    if(!input||!output||output.min<input.min||output.max>input.max||input.integer&&!output.integer)return false;
    const allowed=spec.rule?.values;
    if(allowed){
      const set=new Set(allowed.map(x=>spec.dtype==='float32'?f(Number(x)):Number(x)));
      if(output.min===output.max)return set.has(output.min);
      if(!output.integer||output.max-output.min+1>set.size)return false;
      for(let x=output.min;x<=output.max;x++)if(!set.has(x))return false;
    }
    return true;
  };
  for(const [input,outputName]of Object.entries(ir.contract?.feedback??{})){
    const inputValue=values[input],outputValue=values[outputName],inputShape=shapeOf(inputValue),outputTensor=get(outputName),outputShape=shapeOf(outputValue);
    if(!inputShape)continue;
    const compatible=outputShape&&inputValue.dtype===outputValue.dtype&&inputShape.length===outputShape.length&&inputShape.every((x,i)=>x===outputShape[i]);
    for(let index=0;index<count(inputShape);index++){
      const key=`${input}[${index}]`,output=compatible?outputTensor?.cells[index]:UNKNOWN,localContained=contained(key,output);
      feedback.set(key,{...inputRefs.get(key),output:outputName,outputIndex:index,localContained,closed:localContained,dependencies:output?.dependencies??[],range:output?{min:output.min,max:output.max,integer:output.integer}:null});
    }
  }
  let changed=true;while(changed){changed=false;for(const entry of feedback.values())if(entry.closed&&entry.dependencies.some(key=>feedback.has(key)&&!feedback.get(key).closed)){entry.closed=false;changed=true;}}
  for(const {node,dependencies}of automatic){
    const unsafe=dependencies.filter(key=>feedback.has(key)&&!feedback.get(key).closed),repeatSafe=unsafe.length===0;
    stats[repeatSafe?'repeatSafeAutomatic':'singleStepOnlyAutomatic']=(stats[repeatSafe?'repeatSafeAutomatic':'singleStepOnlyAutomatic']??0)+1;
    if(annotate)Object.assign(node.exactArithmeticProof,{repeatSafe,unsafeFeedbackDependencies:unsafe.map(key=>inputRefs.get(key))});
  }
  stats.repeatSafeAutomatic??=0;stats.singleStepOnlyAutomatic??=0;
  const fields=[...feedback.values()].map(entry=>({...entry,dependencies:entry.dependencies.map(key=>inputRefs.get(key))}));
  const feedbackClosure={version:EXACT_ANALYSIS_VERSION,scope:'Only the declared contract.feedback mapping; other inputs must remain fixed or be independently validated before each call. Proof uses interval containment including integer/discrete constraints, then removes transitive dependencies on failed feedback domains.',allFeedbackDomainsClosed:fields.every(x=>x.closed),allAutomaticProofsRepeatSafe:stats.singleStepOnlyAutomatic===0,repeatSafeAutomatic:stats.repeatSafeAutomatic,singleStepOnlyAutomatic:stats.singleStepOnlyAutomatic,fields};
  Object.assign(stats,{feedbackFields:fields.length,closedFeedbackFields:fields.filter(x=>x.closed).length,allFeedbackDomainsClosed:feedbackClosure.allFeedbackDomainsClosed,allAutomaticProofsRepeatSafe:feedbackClosure.allAutomaticProofsRepeatSafe});
  if(annotate)ir.feedbackDomainClosure=feedbackClosure;
  stats.unsupportedOps=[...unsupported];return {stats,ranges,feedbackClosure};
}
