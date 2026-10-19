import { useEffect, useState } from 'react';

export type WeatherData = {
  location: string;
  temperature: number;
  high: number;
  low: number;
  wind: number;
  summary: string;
  updatedAt: string;
  symbol: number;
};

// SMHI weather symbol → Swedish description
const WEATHER_DESCRIPTIONS: Record<number, string> = {
  1: 'Klart',
  2: 'Nästan klart',
  3: 'Halvklart',
  4: 'Molnigt',
  5: 'Mycket moln',
  6: 'Mulet',
  7: 'Dimma',
  8: 'Lätt regnskur',
  9: 'Regnskur',
  10: 'Kraftig regnskur',
  11: 'Åskväder',
  12: 'Lätt snöblandat regn',
  13: 'Snöblandat regn',
  14: 'Kraftigt snöblandat regn',
  15: 'Lätt snöfall',
  16: 'Snöfall',
  17: 'Kraftigt snöfall',
  18: 'Lätt regn',
  19: 'Regn',
  20: 'Kraftigt regn',
  21: 'Åska',
  22: 'Lätt snöblandat regn',
  23: 'Snöblandat regn',
  24: 'Kraftigt snöblandat regn',
  25: 'Lätt snöfall',
  26: 'Snöfall',
  27: 'Kraftigt snöfall',
};

// Known Swedish locations → SMHI grid coordinates (lat, lon)
const LOCATION_COORDS: Record<string, [number, number]> = {
  åkersberga: [59.4794, 18.2997],
  stockholm: [59.33, 18.07],
  göteborg: [57.71, 11.97],
  malmö: [55.6, 13.0],
  uppsala: [59.86, 17.64],
  linköping: [58.41, 15.63],
  västerås: [59.61, 16.55],
  örebro: [59.27, 15.21],
  norrköping: [58.59, 16.18],
  helsingborg: [56.05, 12.69],
  jönköping: [57.78, 14.16],
  umeå: [63.83, 20.26],
  lund: [55.7, 13.19],
  borås: [57.72, 12.94],
  sundsvall: [62.39, 17.31],
  gävle: [60.67, 17.15],
  karlstad: [59.38, 13.5],
  växjö: [56.88, 14.81],
  halmstad: [56.67, 12.86],
  luleå: [65.58, 22.15],
  trollhättan: [58.28, 12.29],
};

function resolveCoords(location?: string): [number, number] | undefined {
  if (!location?.trim()) return undefined;
  const normalize = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const key = normalize(location);
  for (const [name, coords] of Object.entries(LOCATION_COORDS)) {
    if (key === normalize(name)) return coords;
  }
}

type SMHIForecast = {
  createdTime: string;
  timeSeries: Array<{
    time: string;
    data: { air_temperature: number; wind_speed: number; symbol_code: number };
  }>;
};

const CACHE_TTL = 60 * 60 * 1000;
const forecastCache = new Map<string, { forecast: SMHIForecast; expiresAt: number }>();

function readForecast(forecast: SMHIForecast, location: string): WeatherData {
  const now = Date.now();
  const created = Date.parse(forecast?.createdTime);
  if (!Number.isFinite(created) || now - created > 2 * CACHE_TTL || created - now > 5 * 60 * 1000) {
    throw new Error('SMHI returned an outdated forecast.');
  }
  const upcoming = Array.isArray(forecast.timeSeries)
    ? forecast.timeSeries.filter((entry) => Number.isFinite(Date.parse(entry.time)) && Date.parse(entry.time) >= now)
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
    : [];
  const current = upcoming[0];
  const temperature = current?.data?.air_temperature;
  const wind = current?.data?.wind_speed;
  const symbol = current?.data?.symbol_code;
  if (!current || Date.parse(current.time) - now > 90 * 60 * 1000
    || typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature === 9999
    || typeof wind !== 'number' || !Number.isFinite(wind) || wind < 0 || wind === 9999
    || !Number.isInteger(symbol) || !WEATHER_DESCRIPTIONS[symbol]) {
    throw new Error('SMHI returned invalid weather parameters.');
  }
  // The forecast starts now, so these are the next 24 hours, not today's past temperatures.
  const temperatures = upcoming.filter((entry) => Date.parse(entry.time) <= now + 24 * CACHE_TTL)
    .map((entry) => entry.data?.air_temperature)
    .filter((value) => typeof value === 'number' && Number.isFinite(value) && value !== 9999);
  return {
    location,
    temperature: Math.round(temperature),
    high: Math.round(Math.max(...temperatures)),
    low: Math.round(Math.min(...temperatures)),
    wind: Math.round(wind),
    summary: WEATHER_DESCRIPTIONS[symbol],
    symbol,
    updatedAt: new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit',
    }).format(new Date(created)),
  };
}

export type WeatherStatus = 'loading' | 'ready' | 'error';

export type WeatherState = {
  data: WeatherData | null;
  status: WeatherStatus;
  error?: string;
  retry: () => void;
};

export function useWeather(stableLocation?: string): WeatherState {
  const [data, setData] = useState<WeatherData | null>(null);
  const [status, setStatus] = useState<WeatherStatus>('loading');
  const [error, setError] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const coords = resolveCoords(stableLocation);
    const locationLabel = stableLocation?.trim();
    setData(null);
    setError(undefined);
    if (!coords || !locationLabel) {
      setStatus('error');
      setError(locationLabel ? 'Ort ej hittad' : 'Ange stallets ort');
      return;
    }

    const [lat, lon] = coords;
    const key = `${lat},${lon}`;
    const url = `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json?parameters=air_temperature,wind_speed,symbol_code`;
    let controller: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      setData(null);
      setStatus('loading');
      setError(undefined);
      try {
        const cached = forecastCache.get(key);
        let forecast: SMHIForecast;
        if (cached && cached.expiresAt > Date.now()) {
          forecast = cached.forecast;
        } else {
          controller = new AbortController();
          timeoutId = setTimeout(() => controller?.abort(), 10_000);
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error(`SMHI returned HTTP ${response.status}.`);
          forecast = await response.json();
        }
        if (cancelled) return;
        const weather = readForecast(forecast, locationLabel);
        if (!cached || cached.expiresAt <= Date.now()) {
          forecastCache.set(key, { forecast, expiresAt: Date.now() + CACHE_TTL });
        }
        setData(weather);
        setStatus('ready');
      } catch (reason) {
        if (cancelled) return;
        forecastCache.delete(key);
        setData(null);
        setStatus('error');
        setError('Ej tillgängligt');
        console.warn('[weather] Could not load the SMHI forecast.', reason instanceof Error ? reason.message : 'Invalid response');
      } finally {
        clearTimeout(timeoutId);
      }
    };

    void load();
    const refreshId = setInterval(() => void load(), CACHE_TTL);

    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(timeoutId);
      clearInterval(refreshId);
    };
  }, [stableLocation, retryCount]);

  return { data, status, error, retry: () => setRetryCount(count => count + 1) };
}
