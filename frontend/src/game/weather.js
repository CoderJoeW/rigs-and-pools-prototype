import { createWeatherService } from '../services/weatherService.js';
import { dayIndexOf } from '../utils/calendar.js';

const FALLBACK_READING={ cloud:0.3, wind:0.5 };

/* 02-weather.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installWeather(G){
  /* ---- weather: drawn daily, forecast one day ahead ---- */
  const weatherService = createWeatherService();
  function readingFor(day){
    const cached=weatherService.peek(day);
    if(cached) return cached;
    weatherService.ensure(day);
    return weatherService.peek(day) || FALLBACK_READING;
  }
  function ensureWeather(){
    const d=dayIndexOf(G.s.t);
    if(!G.s.weather){
      weatherService.reset();
      G.s.weather={ day:d, now:readingFor(d), next:readingFor(d+1) };
      return;
    }
    while(G.s.weather.day<d){
      G.s.weather.day++;
      G.s.weather.now=readingFor(G.s.weather.day);
      G.s.weather.next=readingFor(G.s.weather.day+1);
    }
    const now=weatherService.peek(G.s.weather.day);
    if(now) G.s.weather.now=now;
    const next=weatherService.peek(G.s.weather.day+1);
    if(next) G.s.weather.next=next;
  }
  const sky = () => G.s.weather ? 0.25+0.75*(1-G.s.weather.now.cloud) : 1;


  Object.assign(G, {ensureWeather,sky});
}
