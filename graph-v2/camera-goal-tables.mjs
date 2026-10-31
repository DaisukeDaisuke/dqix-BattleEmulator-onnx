// Ordered neighbors from matching func_ov000_0216f82c / JPN02170f58.
// Preserve the ROM's exact branch tests and u8 stores, including auxiliary255.
// Do not replace these boundary tests with a geometric clipping rule for all
// byte inputs: node255 deliberately produces [7,8,254,0,245,246].
export function romCameraNeighbors(node){
  const r=Math.trunc(node/9),c=node%9;
  if(r%2===0){
    return [r===8||c===0?255:(r+1)*9+c-1,r===8||c===8?255:(r+1)*9+c,c===0?255:r*9+c-1,c===8?255:r*9+c+1,r===0||c===0?255:(r-1)*9+c-1,r===0||c===8?255:(r-1)*9+c].map(x=>x&255);
  }
  if(c>7)return Array(6).fill(255);
  return [r===8?255:(r+1)*9+c,r===8?255:(r+1)*9+c+1,c===0?255:r*9+c-1,c===7?255:r*9+c+1,(r-1)*9+c,(r-1)*9+c+1].map(x=>x&255);
}
export const CAMERA_BYTE_NEIGHBORS=Array.from({length:256},(_,i)=>romCameraNeighbors(i));
export const row4Bytes=words=>words.flatMap(word=>Array.from({length:4},(_,i)=>Number((BigInt(word)>>(BigInt(i)*8n))&255n)));
