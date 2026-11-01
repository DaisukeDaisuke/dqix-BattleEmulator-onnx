// Input-asset readers. No seed, observed output, frame count or readiness enters
// these functions. The same tables and parser serve every actor/action.
const bytes=value=>value instanceof Uint8Array?value:typeof value==='string'?Uint8Array.from(value.match(/../g)??[],x=>Number.parseInt(x,16)):Uint8Array.from(value??[]);
const view=value=>{const b=bytes(value);return{bytes:b,data:new DataView(b.buffer,b.byteOffset,b.byteLength)};};
const assert=(condition,message)=>{if(!condition)throw Error(message);};
export function parseOriginalMessageCatalog(value){
  const {bytes:b,data}=view(value);assert(b.length>=4,'Message catalog has no header');
  const count=data.getUint32(0,true)&0xfff,strings=4+count*8;assert(strings<=b.length,'Message catalog index exceeds supplied bytes');
  const records=new Map();
  for(let i=0;i<count;i++){
    const id=data.getInt16(4+i*8,true),offset=data.getUint32(8+i*8,true);if(offset===0xffffffff)continue;
    const start=strings+offset;assert(start<b.length,'Message string offset exceeds supplied catalog');let end=start;while(end<b.length&&b[end]!==0)end++;assert(end<b.length,'Unterminated original message string');
    if(!records.has(id))records.set(id,b.slice(start,end));
  }
  return{kind:'dq9-original-nat-message-data-v1',count,records};
}

export function parseOriginalStaticFontTables(values){
  const result=new Map();
  for(const item of values){
    const size=Number(item.size??/^f(\d+)\.mes$/.exec(item.name??'')?.[1]),{bytes:b,data}=view(item.bytes??item.hex);
    assert([6,8,10,12].includes(size)&&b.length>=16,'Unsupported or incomplete static font table');
    const count=data.getInt16(6,true),offset=data.getUint32(8,true);assert(count>=0&&offset+count*2<=b.length,'Static font key table exceeds supplied asset');
    const keys=new Map();for(let i=0;i<count;i++){const key=data.getUint16(offset+2*i,true);if(!keys.has(key))keys.set(key,i);}
    result.set(size,{size,count,keys,bytes:b});
  }
  return result;
}

export function staticFontPresence(tokens,fonts,baseSize=12){
  const base=fonts.get(baseSize),small=fonts.get(6);assert(base&&small,'Original base and ruby static-font tables are required');
  const present=table=>tokens.map(token=>token>=0xff00?0:Number((token&255)!==0&&table.keys.has(token)));
  return{baseGlyphPresent:present(base),smallGlyphPresent:present(small)};
}

// The initial qualified formatter accepts explicit named substitutions and
// ordinary Shift-JIS text. Tag instructions require a separate qualified parser
// branch and are rejected instead of being silently discarded.
export function compileStaticMessage(value,{substitutions={},capacity=160}={}){
  const source=bytes(value),expanded=[];
  for(let i=0;i<source.length;){
    if(source[i]===0)break;
    if(source[i]===91){
      let end=i+1;while(end<source.length&&source[end]!==93)end++;assert(end<source.length,'Unterminated message substitution');
      const body=source.slice(i+1,end),key=String.fromCharCode(...body);
      if(Object.hasOwn(substitutions,key)){const replacement=bytes(substitutions[key]);assert(!replacement.includes(0),'Substitution bytes must exclude the trailing NUL');expanded.push(...replacement);}
      else{assert(body.includes(47)&&!body.includes(91),'Unsupported message substitution: '+key);expanded.push(91,...body,93);}
      i=end+1;continue;
    }
    assert(source[i]!==60,'Message tags need their own exact parser branch');expanded.push(source[i++]);
  }
  const tokens=[],punctuation=new Map(Array.from('-!?[]{}()~,.',(char,i)=>[char.charCodeAt(0),[0x7c81,0x4981,0x4881,0x7581,0x7681,0x7581,0x7681,0x6981,0x6a81,0x6081,0x4181,0x4481][i]]));let ruby=0;
  for(let i=0;i<expanded.length;){
    const a=expanded[i],b=expanded[i+1];
    if(a===92&&b===110||a===13&&b===10){tokens.push(0xff18);i+=2;}
    else if(a===10){tokens.push(0xff18);i++;}
    else if(a===0x81&&b===0x40){tokens.push(0xff1a);i+=2;}
    else if(a===32){tokens.push(0xff1b);i++;}
    else if(a===91){assert(ruby===0,'Nested ruby is outside the admitted parser');tokens.push(0xff36);ruby=1;i++;}
    else if(a===47&&ruby===1){tokens.push(0xff37);ruby=2;i++;}
    else if(a===93&&ruby===2){tokens.push(0xff38);ruby=0;i++;}
    else if(a>=65&&a<=90){tokens.push(0x82|((0x60+a-65)<<8));i++;}
    else if(a>=97&&a<=122){tokens.push(0x82|((0x81+a-97)<<8));i++;}
    else if(a>=48&&a<=57){tokens.push(0x82|((0x4f+a-48)<<8));i++;}
    else if(punctuation.has(a)){const token=punctuation.get(a);assert(token!==0x7581&&token!==0x7681,'Quoted-name layout needs its own exact branch');tokens.push(token);i++;}
    else if('+*/%&|=:;>$@#^_\\"\''.includes(String.fromCharCode(a))){i++;}
    else{assert((a>0x80&&a<0xa0||a>0xdf&&a<0xeb)&&b!==undefined,'Unsupported single-byte message punctuation');const token=a|(b<<8);assert(token!==0x7581&&token!==0x7681,'Quoted-name layout needs its own exact branch');tokens.push(token);i+=2;}
    assert(tokens.length<capacity,'Message segment exceeds the actual token buffer');
  }
  assert(ruby===0,'Unclosed ruby is outside the admitted parser');assert(tokens.some(token=>token<0xff00||token===0xff1a||token===0xff1b),'Empty message requires the original empty-text branch');tokens.push(0xff01);
  return{tokens,total:tokens.length,expandedBytes:Uint8Array.from(expanded),scope:'Ordinary text, named input substitutions, newline, spaces, ASCII letters/digits/punctuation and balanced ruby; no message tags, quoted-name layout, scene-specific font bank or captured output'};
}
