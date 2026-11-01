// Validate the public IR's actual input tensors. Some composed IRs retain
// domain entries for internal, unexposed values; those are not input tensors.
export function validateModelInput(ir,row){
  const failures=[],contract=ir.contract??{};
  const check=(value,rule,path)=>{
    if(!rule)return;
    const number=Number(value);
    if(rule.integer&&!Number.isInteger(number)||rule.min!==undefined&&number<rule.min||rule.max!==undefined&&number>rule.max||rule.values&&!rule.values.includes(value)&&!(typeof value==='boolean'&&rule.values.includes(number)))failures.push(path+': domain');
  };
  for(const input of ir.inputs){
    const values=row[input.name],width=input.shape.slice(1).reduce((a,b)=>a*b,1);
    if(!(Array.isArray(values)||ArrayBuffer.isView(values))||values.length!==width){failures.push(input.name+': exactly '+width+' values required');continue;}
    for(let index=0;index<width;index++){
      const value=values[index],path=input.name+'['+index+']';
      if(input.dtype==='bool'?![false,true,0,1].includes(value):typeof value!=='number'||!Number.isFinite(value)||input.dtype==='int32'&&(!Number.isInteger(value)||value< -2147483648||value>2147483647)){failures.push(path+': '+input.dtype+' required');continue;}
      check(value,contract.inputDomains?.[input.name],path);
      check(value,contract.fieldDomains?.[input.name]?.[index],path);
    }
  }
  const get=term=>term.input?(term.reduce==='sum'?row[term.input]?.reduce((a,b)=>a+Number(b),0):row[term.input]?.[term.index??0]):term.value;
  for(const relation of contract.relations??[]){
    const left=get(relation.left),right=get(relation.right);
    const valid=relation.op==='<='?left<=right:relation.op==='<'?left<right:relation.op==='>='?left>=right:relation.op==='>'?left>right:relation.op==='=='?left===right:relation.op==='!='?left!==right:false;
    if(!valid)failures.push('relation: '+JSON.stringify(relation));
  }
  const initial=contract.initialization;
  if(initial&&typeof initial==='object'&&initial.counter&&Array.isArray(initial.zeroInputs)&&get(initial.counter)===initial.equals)for(const name of initial.zeroInputs)if(!row[name]||row[name].some(value=>value!==0))failures.push(name+': initial values must be zero');
  return failures;
}
