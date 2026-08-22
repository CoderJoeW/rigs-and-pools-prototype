/* Local RNG-backed weather generation. This is the seam a backend endpoint
   will eventually replace: weather.js only ever asks "what's the weather on
   day N" and gets back a {cloud,wind} reading for that day, cached so a day
   already drawn is never regenerated (today() becoming yesterday's next()
   depends on that). Swapping generateLocal() for an async fetch — keyed by
   the same day index, filled into the same cache — shouldn't require
   touching weather.js at all; ensureWeather already forecasts one day ahead,
   which is the runway a real network round trip would use. */
function generateLocal(){
  return { cloud:Math.min(1,Math.max(0,(Math.random()+Math.random())/2*1.15-0.1)),
    wind:0.2+Math.random()*1.2 };
}

export function createWeatherService(){
  let cache=new Map();
  function forDay(day){
    if(!cache.has(day)) cache.set(day, generateLocal());
    return cache.get(day);
  }
  // A fresh game (or a wipe) must not see a previous run's weather bleed
  // through just because both start at day 0 — see weather.js's ensureWeather.
  function reset(){ cache=new Map(); }
  return { forDay, reset };
}
