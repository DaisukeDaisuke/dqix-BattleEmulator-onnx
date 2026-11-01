// Exact8-byte lookup rows from JPN overlay0:02183f24, ending at02183fac.
// These rows select definition data. No encounter selects an executable graph.
export const COMMON_SUMMON_ROWS=Object.freeze([
  [344,35],[345,145],[346,146],[347,15],[348,18],[349,19],
  [350,89],[351,46],[352,128],[353,52],[354,47],[356,53],
  [470,17],[472,180],[473,183],[339,179],[794,75]
].map(([actionId,monsterId])=>Object.freeze({actionId,monsterId,secondMonsterId:-1,count:1})));
export const COMMON_SUMMON_AUTHORITY=Object.freeze({
  lookup:'JPN021612d4 / matching func_ov000_0215fb54',
  table:'JPN overlay0:02183f24..02183fac; terminal action=-1, monster0=-2, monster1=-1, count=0',
  operation:'JPN021dcb4c / matching func_ov024_021dc2a0',
  missing:'An action absent from the table returns count=-1 and does not invoke an insertion helper.'
});
