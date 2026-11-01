// Matching CritRateCalculation.cpp and func_ov000_02156cc4. The binary32
// multiplication order and final integer truncation are observable at the
// bounded10000 boundary. A command's complete hit count is fixed before its
// target loop, including repeated targets and targets that later die.
export function commonCriticalThreshold(g,{baseThreshold,baseRate,weight,hitCount}){
  // baseRate is the initial resolved party base percentage, before the
  // action weight and hit-count divisor. -1 retains the legacy ABI whose
  // explicit criticalThreshold represents that base percentage times100.
  const base=g.where(g.ge(baseRate,0),baseRate,g.mul(baseThreshold,.01)),weighted=g.mul(g.mul(weight,.01),base),perHit=g.mul(g.op('Div',[1,g.max(hitCount,1)]),weighted);
  return g.where(g.gt(hitCount,0),g.floor(g.mul(100,perHit)),0);
}
