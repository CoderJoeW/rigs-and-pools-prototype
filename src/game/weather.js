/* 02-weather.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installWeather(G){
  /* ---- weather: drawn daily, forecast one day ahead ---- */
  function drawWeather(){ return { cloud:Math.min(1,Math.max(0,(Math.random()+Math.random())/2*1.15-0.1)),
    wind:0.2+Math.random()*1.2 }; }
  function ensureWeather(){
    if(!G.s.weather) G.s.weather={ day:Math.floor(G.s.t/86400), now:drawWeather(), next:drawWeather() };
    const d=Math.floor(G.s.t/86400);
    while(G.s.weather.day<d){ G.s.weather.day++; G.s.weather.now=G.s.weather.next; G.s.weather.next=drawWeather(); }
  }
  const sky = () => G.s.weather ? 0.25+0.75*(1-G.s.weather.now.cloud) : 1;


  Object.assign(G, {drawWeather,ensureWeather,sky});
}
