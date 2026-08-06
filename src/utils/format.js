export function gauss(){ let u=0,v=0; while(u===0)u=Math.random(); while(v===0)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
export const pick = a => a[Math.floor(Math.random()*a.length)];
export const wearRate = () => 0.75+Math.random()*0.5;

export const fmt = {
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
