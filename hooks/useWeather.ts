import { useEffect, useState } from 'react';

export type WeatherData = {
  location: string;
  temperature: number;
  high: number;
  low: number;
  wind: number;
  summary: string;
  updatedAt: string;
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

const DEFAULT_COORDS: [number, number] = [59.33, 18.07]; // Stockholm fallback

function resolveCoords(location?: string): [number, number] {
  if (!location) return DEFAULT_COORDS;
  const key = location.toLowerCase().trim();
  for (const [name, coords] of Object.entries(LOCATION_COORDS)) {
    if (key.includes(name)) return coords;
  }
  return DEFAULT_COORDS;
}

function findParam(params: Array<{ name: string; values: number[] }>, name: string): number | undefined {
  return params.find((p) => p.name === name)?.values[0];
}

export function useWeather(stableLocation?: string): WeatherData | null {
  const [data, setData] = useState<WeatherData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const [lat, lon] = resolveCoords(stableLocation);
    const locationLabel = stableLocation?.trim() || 'Stockholm';

    const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`SMHI ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;

        const timeSeries: Array<{
          validTime: string;
          parameters: Array<{ name: string; values: number[] }>;
        }> = json.timeSeries ?? [];

        if (timeSeries.length === 0) return;

        // Current (first entry)
        const now = timeSeries[0];
        const temp = findParam(now.parameters, 't') ?? 0;
        const wind = findParam(now.parameters, 'ws') ?? 0;
        const symbol = findParam(now.parameters, 'Wsymb2') ?? 1;

        // Get today's high/low from all entries for current day
        const todayStr = now.validTime.slice(0, 10);
        const todayEntries = timeSeries.filter((ts) => ts.validTime.startsWith(todayStr));
        const temps = todayEntries.map((ts) => findParam(ts.parameters, 't') ?? temp);
        const high = Math.round(Math.max(...temps));
        const low = Math.round(Math.min(...temps));

        const updatedTime = new Date(now.validTime);
        const hh = String(updatedTime.getHours()).padStart(2, '0');
        const mm = String(updatedTime.getMinutes()).padStart(2, '0');

        setData({
          location: locationLabel,
          temperature: Math.round(temp),
          high,
          low,
          wind: Math.round(wind),
          summary: WEATHER_DESCRIPTIONS[symbol] ?? 'Okänt',
          updatedAt: `${hh}:${mm}`,
        });
      })
      .catch(() => {
        // Weather is non-critical — panel shows null state gracefully
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
    };
  }, [stableLocation]);

  return data;
}
