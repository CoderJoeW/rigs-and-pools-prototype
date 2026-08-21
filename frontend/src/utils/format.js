/* The one-line "what does this part do" description shown on the Build tab,
   a rig's retrofit sheet, and that sheet's part picker — same four slot
   kinds, same wording, wherever a frame/board/cooler/supply is offered. */
export function partSub(slot, p){
  switch(slot){
    case 'frame': return 'fits '+p.slots+' · airflow '+p.air.toFixed(2);
    case 'mobo':  return 'drives '+p.pcie+' · '+p.w+'W idle';
    case 'cool':  return '÷'+p.fac.toFixed(2)+' heat · '+p.w+'W';
    case 'psu':   return fmt.w(p.w)+' · '+p.conn+' PCIe · '+(p.eff*100).toFixed(0)+'%';
  }
}

export const fmt = {
  // For counters/totals that should always hold a real number by render
  // time (issue #5's root cause: `X||0` on a NaN state field silently
  // rendered a plausible-looking 0 instead of surfacing the bug). Use this
  // instead of `||0` wherever the field being missing/NaN is corruption,
  // not a legitimate "not set yet" state — a genuine "not yet" case should
  // keep its own explicit default rather than this sentinel (issue #14).
  n(x){ return Number.isFinite(x) ? x : '—'; },
  hash(mh){ return mh>=1e6?(mh/1e6).toFixed(2)+' TH/s':mh>=1000?(mh/1000).toFixed(2)+' GH/s':mh.toFixed(0)+' MH/s'; },
  usd(n){ const a=Math.abs(n);
    return (n<0?'-$':'$')+(a>=10000?a.toLocaleString('en-US',{maximumFractionDigits:0}):a.toFixed(2)); },
  usd2(n){ return (n<0?'-$':'$')+Math.abs(n).toFixed(2); },
  c(n){ return n>=100?n.toFixed(1):n.toFixed(3); },
  pct(n,d=1){ return (n*100).toFixed(d)+'%'; },
  w(x){ return Math.abs(x)>=1000?(x/1000).toFixed(2)+' kW':x.toFixed(0)+' W'; },
  day(t){ return Math.floor(t/86400)+1; },
  clock(t){ const h=Math.floor((t%86400)/3600), m=Math.floor((t%3600)/60);
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); },
  hm(t){ return 'd'+(Math.floor(t/86400)+1)+' '+fmt.clock(t); },
  dur(s){ if(s<60) return Math.max(1,Math.round(s))+' sec';
    if(s<3600){ const m=Math.floor(s/60), x=Math.round(s%60);
      return m+' min'+(x?' '+x+' sec':''); }
    const d=s/86400; return d>=1?d.toFixed(1)+' d':(s/3600).toFixed(1)+' h'; },
  eta(d){ if(!isFinite(d)||d>9e4) return 'never';
    return d<1?(d*24).toFixed(1)+' h':d<200?d.toFixed(1)+' d':Math.round(d)+' d'; },
};
