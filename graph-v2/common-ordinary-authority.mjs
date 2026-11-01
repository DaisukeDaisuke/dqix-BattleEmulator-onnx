// Matching source hashes preserved with the independent ARM evidence.
// No Ghidra installation or ROM is needed to reproduce the public models.
const files={
  'Overlay_0/func_ov000_02160030.cpp':'03389919486632ccf069412b3c3b72feb0376db208ddfdd7bd9825f707c93ef7',
  'Overlay_0/func_ov000_02157d14.cpp':'09ebe68eec71fc276f09d38225840da77f685084185fc0475e4bc8680507c8ec',
  'Overlay_24/func_ov024_021eb5d0.cpp':'3ebff2cec3daf6461a0e4946155953d4792bc949046121ac645df13639f1a7d5',
  'Overlay_24/func_ov024_021e6a90.cpp':'cfbcf59823f0114318cf642726d56851de69e7d5bb9aa7bbbc7c9c8fb5a0891e',
  'Overlay_24/func_ov024_021da9e0.cpp':'1d3300b885d5b69e8c956fdfd86b1e757affb5b427d49301f8e256d1fc78647c',
  'Overlay_24/func_ov024_021e303c.cpp':'1a0432ad070659ed0334bf929d8f3be7b2cd07b93e0f60b03b11835a998f077f',
  'Overlay_24/func_ov024_021e8ca0.cpp':'62282c7c0c57bb443a96e64a7f5d46b63b47443f2caf1acd77697758fbe1fe19',
  'Overlay_0/func_ov000_0215ccbc.cpp':'542fdcc6f5dfc1fc0550194950b1ef0844caedb9558be8961baddd1a20116697',
  'Overlay_0/func_ov000_02159eac.cpp':'bb5acbff3fe5faa859d2cd8e203a060ea074f11238b9c3f84ad3cfbc702bcff4',
  'Overlay_24/func_ov024_021e80e4.cpp':'3466bf4a2af01a1144615769df232fb0602c9ce22be7aa918e56892469d409b5',
  'Overlay_24/func_ov024_021e99d8.cpp':'73a5d09f6c6a2e74edf0840ced87d5be665b73fae064f294e8806a4c7de0a642',
  'Overlay_24/func_ov024_021e9b24.cpp':'1e15438851c8908f62a1c9de9dafb2194ad1764837fe6402c273b5561394c2e1',
  'Overlay_0/func_ov000_0215fef0.cpp':'e42a3d8e5ce7f8d42a7bdcc8c50434d8e643d8ebbcd71025f294af04949483f7',
  'Overlay_0/func_ov000_0215e958.cpp':'7b2aa62a0f6b25fedea2075fa24a4e43b5207d2120f448bb232a1d90b8020891',
  'Overlay_0/func_ov000_0215ffc4.cpp':'d061d527bf4d9d470bd7bae3cf0af149fd82af0a9ce47caf87e64c3820958aa3',
  'Overlay_0/func_ov000_0215a88c.cpp':'65ac07b8ecbc42cd9b0a111488d6bf11e170622eb8276ef6bd36745b69bbc201'
};
export function pinOrdinaryAuthority(rows){return rows.map(row=>{const sha256=files[row.path.replace(/^src\/Combat\//,'')];if(!sha256)throw Error('Missing ordinary source authority '+row.path);return{...row,sha256};});}
