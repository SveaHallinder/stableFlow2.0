import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../hooks/useWeather.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const forecast = () => ({
  createdTime: '2026-10-12T15:15:00Z',
  referenceTime: '2026-10-12T15:00:00Z',
  timeSeries: [
    { time: '2026-10-12T14:00:00Z', data: { air_temperature: 99, wind_speed: 3, symbol_code: 1 } },
    { time: '2026-10-12T16:00:00Z', data: { air_temperature: 0, wind_speed: 4.4, symbol_code: 6 } },
    { time: '2026-10-13T06:00:00Z', data: { air_temperature: -2.3, wind_speed: 3, symbol_code: 25 } },
    { time: '2026-10-13T15:00:00Z', data: { air_temperature: 7.4, wind_speed: 3, symbol_code: 3 } },
    { time: '2026-10-13T16:00:00Z', data: { air_temperature: 33, wind_speed: 3, symbol_code: 1 } },
  ],
});

function fixture({ platform = 'web', reply } = {}) {
  let rendering, now = Date.parse('2026-10-12T15:30:00Z');
  const calls = [], warnings = [], timeouts = new Map(), intervals = new Map();
  let timerId = 0;
  const react = {
    useState: initial => rendering.state(initial),
    useEffect: (setup, deps) => rendering.effect(setup, deps),
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const module = { exports: {} };
  const response = (json = forecast()) => ({ ok: true, status: 200, json: async () => json });
  vm.runInNewContext('(function(require,module,exports){' + outputText + '\n})', {
    Date: Clock, Intl, AbortController,
    console: { warn: (...args) => warnings.push(args) },
    fetch: (url, options) => { calls.push({ url, options }); return reply ? reply(url, options, response) : Promise.resolve(response()); },
    setTimeout: (callback, delay) => { timeouts.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: (callback, delay) => { intervals.set(++timerId, { callback, delay }); return timerId; },
    clearInterval: id => intervals.delete(id),
  }, { filename: 'hooks/useWeather.ts' })(name => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Platform: { OS: platform } };
    assert.fail('Unexpected weather dependency: ' + name);
  }, module, module.exports);
  class Driver {
    constructor(location) { this.location = location; this.slots = []; this.live = true; this.flush(); }
    state(initial) {
      const index = this.cursor++, slot = this.slots[index] ??= { value: initial };
      return [slot.value, value => {
        assert.ok(this.live, 'An unmounted weather card must not be updated');
        const next = typeof value === 'function' ? value(slot.value) : value;
        if (!Object.is(next, slot.value)) { slot.value = next; this.dirty = true; }
      }];
    }
    effect(setup, deps) {
      const index = this.cursor++, old = this.slots[index];
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
        this.slots[index] = { setup, deps, cleanup: old?.cleanup, pending: true, effect: true };
      }
    }
    flush(location = this.location) {
      this.location = location;
      for (let iteration = 0; iteration < 10; iteration++) {
        this.cursor = 0; this.dirty = false; rendering = this;
        this.result = module.exports.useWeather(location);
        for (const slot of this.slots) if (slot.effect && slot.pending) {
          slot.pending = false; slot.cleanup?.(); slot.cleanup = slot.setup();
        }
        if (!this.dirty) return;
      }
      assert.fail('Weather state did not settle');
    }
    unmount() { this.live = false; for (const slot of this.slots) if (slot.effect) slot.cleanup?.(); }
  }
  return { calls, warnings, intervals, timeouts, response,
    advance: milliseconds => { now += milliseconds; },
    mount: location => new Driver(location),
    settle: async driver => { for (let i = 0; i < 6; i++) await Promise.resolve(); driver.flush(); },
  };
}

for (const platform of ['web', 'ios']) {
  test(`weather: ${platform} uses the current SMHI API for Åkersberga without inventing zeroes`, async () => {
    const f = fixture({ platform }); const d = f.mount('Åkersberga');
    await f.settle(d);
    assert.equal(f.calls.length, 1);
    assert.match(f.calls[0].url, /category\/snow1g\/version\/1\//);
    assert.match(f.calls[0].url, /lon\/18\.2997\/lat\/59\.4794\//);
    assert.equal(d.result.status, 'ready');
    assert.equal(d.result.data.temperature, 0);
    assert.equal(d.result.data.summary, 'Mulet');
    assert.equal(d.result.data.high, 7);
    assert.equal(d.result.data.low, -2);
    assert.equal(d.result.data.updatedAt, '17:15');
    d.unmount(); assert.equal(f.timeouts.size, 0); assert.equal(f.intervals.size, 0);
  });
}

for (const location of [undefined, '  ', 'En ort som inte finns', 'Stockholmsvägen i en annan ort']) {
  test(`weather: missing or unknown location ${String(location)} does not silently fetch Stockholm`, async () => {
    const f = fixture(); const d = f.mount(location); await f.settle(d);
    assert.equal(f.calls.length, 0); assert.equal(d.result.data, null);
    assert.equal(d.result.status, 'error'); assert.ok(d.result.error);
    d.unmount();
  });
}

test('weather: a malformed forecast, an outdated forecast and HTTP errors expose an honest empty state', async () => {
  for (const reply of [
    (_url, _options, response) => Promise.resolve(response({ ...forecast(), timeSeries: [] })),
    (_url, _options, response) => Promise.resolve(response({ ...forecast(), createdTime: '2026-10-10T15:15:00Z' })),
    (_url, _options, response) => { const json = forecast(); delete json.timeSeries[1].data.air_temperature; return Promise.resolve(response(json)); },
    () => Promise.resolve({ ok: false, status: 503 }),
    () => Promise.reject(new Error('Network unavailable')),
  ]) {
    const f = fixture({ reply }); const d = f.mount('Åkersberga'); await f.settle(d);
    assert.equal(d.result.status, 'error'); assert.equal(d.result.data, null);
    assert.ok(d.result.error); assert.match(String(f.warnings[0]?.[0]), /^\[weather\]/);
    d.unmount();
  }
});

test('weather: a failed first request can be retried immediately when the network recovers', async () => {
  let requests = 0;
  const f = fixture({ reply: (_url, _options, response) => ++requests === 1
    ? Promise.resolve({ ok: false, status: 503 }) : Promise.resolve(response()) });
  const d = f.mount('Åkersberga'); await f.settle(d);
  assert.equal(d.result.status, 'error'); assert.equal(d.result.data, null);
  assert.equal(typeof d.result.retry, 'function', 'Weather must be retryable without waiting for the hourly refresh');
  d.result.retry(); d.flush(); await f.settle(d);
  assert.equal(f.calls.length, 2); assert.equal(d.result.status, 'ready');
  assert.equal(d.result.data.location, 'Åkersberga'); assert.equal(d.result.data.temperature, 0);
  d.unmount(); assert.equal(f.timeouts.size, 0); assert.equal(f.intervals.size, 0);
});

test('weather: location changes abort the old request and discard its late result', async () => {
  const requests = [];
  const f = fixture({ reply: (_url, options) => new Promise(resolve => requests.push({ resolve, signal: options.signal })) });
  const d = f.mount('Åkersberga'); d.flush('Uppsala');
  assert.equal(requests.length, 2); assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(f.response()); await f.settle(d);
  assert.equal(d.result.data.location, 'Uppsala');
  requests[0].resolve(f.response()); await f.settle(d);
  assert.equal(d.result.data.location, 'Uppsala');
  d.unmount(); assert.equal(requests[1].signal.aborted, true);
});

test('weather: SMHI missing-value markers cannot become actual weather readings', async () => {
  for (const parameter of ['air_temperature', 'wind_speed', 'symbol_code']) {
    const f = fixture({ reply: (_url, _options, response) => {
      const json = forecast(); json.timeSeries[1].data[parameter] = 9999;
      return Promise.resolve(response(json));
    } });
    const d = f.mount('Åkersberga'); await f.settle(d);
    assert.equal(d.result.data, null, parameter + ' contains missing data');
    assert.equal(d.result.status, 'error'); d.unmount();
  }
});

test('weather: missing temperatures are excluded from the 24-hour range', async () => {
  const f = fixture({ reply: (_url, _options, response) => {
    const json = forecast(); json.timeSeries[2].data.air_temperature = 9999;
    return Promise.resolve(response(json));
  } });
  const d = f.mount('Åkersberga'); await f.settle(d);
  assert.equal(d.result.data.high, 7); assert.equal(d.result.data.low, 0); d.unmount();
});

test('weather: a ten-second timeout ends loading and does not update an unmounted card', async () => {
  const f = fixture({ reply: (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }) });
  const d = f.mount('Åkersberga');
  for (const timer of f.timeouts.values()) if (timer.delay === 10_000) timer.callback();
  await f.settle(d); assert.equal(d.result.status, 'error'); assert.equal(d.result.data, null);
  d.unmount();
  const other = f.mount('Uppsala'); other.unmount(); await f.settle(other);
});

test('weather: successful requests are reused for an hour and failed requests are not cached', async () => {
  const f = fixture(); const a = f.mount('Åkersberga'); await f.settle(a); a.unmount();
  const b = f.mount('Åkersberga'); await f.settle(b); assert.equal(f.calls.length, 1); b.unmount();
  f.advance(3_600_001);
  const c = f.mount('Åkersberga'); await f.settle(c); assert.equal(f.calls.length, 2); c.unmount();
  const failed = fixture({ reply: () => Promise.reject(new Error('Network unavailable')) });
  const x = failed.mount('Åkersberga'); await failed.settle(x); x.unmount();
  const y = failed.mount('Åkersberga'); await failed.settle(y); assert.equal(failed.calls.length, 2); y.unmount();
});

test('weather: hourly refresh clears the old reading while the new forecast loads', async () => {
  let requestCount = 0, resolveRefresh;
  const f = fixture({ reply: (_url, _options, response) => ++requestCount === 1
    ? Promise.resolve(response()) : new Promise(resolve => { resolveRefresh = resolve; }) });
  const d = f.mount('Åkersberga'); await f.settle(d);
  assert.equal(d.result.data.temperature, 0);
  f.advance(3_600_000);
  for (const timer of f.intervals.values()) timer.callback();
  d.flush(); assert.equal(d.result.status, 'loading'); assert.equal(d.result.data, null);
  resolveRefresh(f.response({ createdTime: '2026-10-12T16:15:00Z', timeSeries: [
    { time: '2026-10-12T17:00:00Z', data: { air_temperature: 3.8, wind_speed: 4, symbol_code: 6 } },
  ] }));
  await f.settle(d); assert.equal(d.result.data.temperature, 4); d.unmount();
});

test('weather: updated time uses Swedish winter time instead of the device timezone', async () => {
  const f = fixture({ reply: (_url, _options, response) => {
    const json = forecast(); json.createdTime = '2026-10-25T01:15:00Z';
    json.timeSeries = [{ time: '2026-10-25T02:00:00Z', data: { air_temperature: -4.4, wind_speed: 0, symbol_code: 1 } }];
    return Promise.resolve(response(json));
  } });
  f.advance(Date.parse('2026-10-25T01:30:00Z') - Date.parse('2026-10-12T15:30:00Z'));
  const d = f.mount('Åkersberga'); await f.settle(d);
  assert.equal(d.result.data.updatedAt, '02:15'); assert.equal(d.result.data.temperature, -4);
  d.unmount();
});
