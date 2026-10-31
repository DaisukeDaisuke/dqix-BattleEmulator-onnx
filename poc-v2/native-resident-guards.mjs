// Emit the same per-call field/relationship checks as the frozen GPU backend.
// A failure records its code and call index, exits this lane's inner block,
// and leaves the rest of the batch running. No battle rules live here.
export function emitNativeResidentGuards({graph,contract,values,emit,get,i32,constant,inputBase,faultOffset}){
  const labels=[],item=(name,j=0)=>{const v=values.get(name);if(!v||j<0||j>=v.items.length)throw Error('Invalid native domain reference '+name);return v.items[j];},load=x=>get(x),number=x=>{get(x);if(x.dtype===9)emit(0xb2);},literal=x=>{if(!Number.isFinite(x)||Math.fround(x)!==x)throw Error('Domain literal is not exact float32');get(constant(x,1));};
  const all=checks=>{if(!checks.length){i32(1);return;}checks[0]();for(const check of checks.slice(1)){check();emit(0x71);}},any=checks=>{if(!checks.length){i32(0);return;}checks[0]();for(const check of checks.slice(1)){check();emit(0x72);}};
  function check(good,label){good();emit(0x45,0x04,0x40);get(inputBase);i32(labels.length+1);emit(0x36,2,...unsigned(faultOffset*4));get(inputBase);emit(0x20,3,0x36,2,...unsigned((faultOffset+1)*4));emit(0x0c,1,0x0b);labels.push(label);}
  for(const v of graph.inputs)for(let j=0;j<v.shape[1];j++){
    const x=item(v.name,j),checks=[];
    const raw=()=>{get(x);if(v.dtype===1)emit(0xbc);};
    if(v.dtype===1){checks.push(()=>{raw();i32(0x7f800000);emit(0x71);i32(0x7f800000);emit(0x47);});checks.push(()=>{raw();i32(0x7fffffff);emit(0x71,0x45);raw();i32(0x7f800000);emit(0x71,0x45,0x45,0x72);});}
    if(v.dtype===9)checks.push(()=>{raw();i32(1);emit(0x4d);});
    for(const rule of [contract.inputDomains?.[v.name],contract.fieldDomains?.[v.name]?.[j]])if(rule){
      if(Object.keys(rule).some(k=>!['name','width','integer','min','max','values'].includes(k)))throw Error('Unsupported native domain property');
      if(rule.integer&&v.dtype===1)checks.push(()=>{get(x);emit(0x8e);get(x);emit(0x5b);});
      if(v.dtype===6){
        if(rule.min!==undefined){const bound=Math.ceil(rule.min);checks.push(()=>{if(bound<=-2147483648)i32(1);else if(bound>2147483647)i32(0);else{get(x);i32(bound);emit(0x4e);}});}
        if(rule.max!==undefined){const bound=Math.floor(rule.max);checks.push(()=>{if(bound>=2147483647)i32(1);else if(bound< -2147483648)i32(0);else{get(x);i32(bound);emit(0x4c);}});}
        if(rule.values){const values=[...new Set(rule.values.map(Number))].filter(x=>Number.isInteger(x)&&x>=-2147483648&&x<=2147483647);checks.push(()=>any(values.map(v=>()=>{get(x);i32(v);emit(0x46);})));}
      }else{
        if(rule.min!==undefined)checks.push(()=>{number(x);literal(Number(rule.min));emit(0x60);});
        if(rule.max!==undefined)checks.push(()=>{number(x);literal(Number(rule.max));emit(0x5f);});
        if(rule.values)checks.push(()=>any([...new Set(rule.values.map(Number))].map(v=>()=>{number(x);literal(v);emit(0x5b);})));
      }
    }
    if(checks.length)check(()=>all(checks),`${v.name}[${j}]`);
  }
  function relationValue(r){if(!r.input){literal(r.value);return;}const v=values.get(r.input);if(!v)throw Error('Unknown native domain relation input');if(r.reduce){if(r.reduce!=='sum')throw Error('Unsupported native reduction');number(v.items[0]);for(const x of v.items.slice(1)){number(x);emit(0x92);}}else number(item(r.input,r.index??0));}
  const comparison={'<':[0x5d,0x48],'<=':[0x5f,0x4c],'>':[0x5e,0x4a],'>=':[0x60,0x4e],'==':[0x5b,0x46],'!=':[0x5c,0x47]};
  for(const r of contract.relations??[]){if(!comparison[r.op])throw Error('Unsupported native relation');const li=r.left.input&&values.get(r.left.input)?.dtype===6,ri=r.right.input&&values.get(r.right.input)?.dtype===6;if(li||ri){if(!li||!ri||r.left.reduce||r.right.reduce)throw Error('Native integer relation needs scalar int32 inputs');check(()=>{load(item(r.left.input,r.left.index??0));load(item(r.right.input,r.right.index??0));emit(comparison[r.op][1]);},JSON.stringify(r));}else check(()=>{relationValue(r.left);relationValue(r.right);emit(comparison[r.op][0]);},JSON.stringify(r));}
  const initialization=contract.initialization;
  if(initialization){if(initialization.counter.input&&values.get(initialization.counter.input)?.dtype===6)throw Error('Integer initialization counter needs an explicit lowering');for(const name of initialization.zeroInputs)for(let j=0;j<values.get(name).items.length;j++)check(()=>{relationValue(initialization.counter);literal(initialization.equals);emit(0x5c);number(item(name,j));literal(0);emit(0x5b,0x72);},`initialization:${name}[${j}]`);}
  return labels;
}
function unsigned(value){const bytes=[];do{let byte=value&127;value=Math.floor(value/128);if(value)byte|=128;bytes.push(byte);}while(value);return bytes;}
