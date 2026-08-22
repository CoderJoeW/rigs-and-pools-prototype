import { createWeatherService } from '../services/weatherService.js';
import { dayIndexOf } from '../utils/calendar.js';

/* 02-weather.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installWeather(G){
  /* ---- weather: drawn daily, forecast one day ahead ---- */
  const weatherService = createWeatherService();
  function ensureWeather(){
    const d=dayIndexOf(G.s.t);
    if(!G.s.weather){
      weatherService.reset();
      G.s.weather={ day:d, now:weatherService.forDay(d), next:weatherService.forDay(d+1) };
    }
    while(G.s.weather.day<d){
      G.s.weather.day++;
      G.s.weather.now=weatherService.forDay(G.s.weather.day);
      G.s.weather.next=weatherService.forDay(G.s.weather.day+1);
    }
  }
  const sky = () => G.s.weather ? 0.25+0.75*(1-G.s.weather.now.cloud) : 1;


  Object.assign(G, {ensureWeather,sky});
}
