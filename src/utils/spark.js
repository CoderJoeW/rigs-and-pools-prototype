/* Turn a data series into an SVG path's `d` attribute: normalized to the
   series' own min/max (or a floor below it, e.g. 0, if `loFloor` is given),
   x spread 0-100, y scaled into [baseline-range, baseline]. */
export function sparkPath(data, baseline, range, loFloor){
  const h=data||[]; if(h.length<2) return '';
  const lo=loFloor===undefined?Math.min(...h):Math.min(loFloor,...h);
  const hi=Math.max(...h), r=(hi-lo)||1;
  return h.map((v,i)=>(i?'L':'M')+(i/(h.length-1)*100).toFixed(1)+' '+
    (baseline-((v-lo)/r)*range).toFixed(1)).join(' ');
}
