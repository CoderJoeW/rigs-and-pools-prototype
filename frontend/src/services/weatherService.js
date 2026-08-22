// See docs/implementation-notes.md: "Weather async-readiness seam"
function generateLocal(){
  return { cloud:Math.min(1,Math.max(0,(Math.random()+Math.random())/2*1.15-0.1)),
    wind:0.2+Math.random()*1.2 };
}

export function createWeatherService(){
  let cache=new Map();
  function peek(day){ return cache.get(day); }
  function ensure(day){
    if(!cache.has(day)) cache.set(day, generateLocal());
    return Promise.resolve(cache.get(day));
  }
  // A fresh game (or a wipe) must not see a previous run's weather bleed
  // through just because both start at day 0 — see weather.js's ensureWeather.
  function reset(){ cache=new Map(); }
  return { peek, ensure, reset };
}
