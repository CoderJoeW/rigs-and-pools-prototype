// See docs/implementation-notes.md: "Weather async-readiness seam"

export interface DayWeather { cloud: number; wind: number }

function generateLocal(): DayWeather {
  return {
    cloud: Math.min(1, Math.max(0, (Math.random() + Math.random()) / 2 * 1.15 - 0.1)),
    wind: 0.2 + Math.random() * 1.2,
  };
}

export interface WeatherService {
  peek(day: number): DayWeather | undefined;
  ensure(day: number): Promise<DayWeather>;
  reset(): void;
}

export function createWeatherService(): WeatherService {
  let cache = new Map<number, DayWeather>();
  function peek(day: number): DayWeather | undefined {
    return cache.get(day);
  }
  function ensure(day: number): Promise<DayWeather> {
    if (!cache.has(day)) cache.set(day, generateLocal());
    return Promise.resolve(cache.get(day)!);
  }
  // A fresh game (or a wipe) must not see a previous run's weather bleed
  // through just because both start at day 0 — see weather.ts's ensureWeather.
  function reset(): void { cache = new Map(); }
  return { peek, ensure, reset };
}
