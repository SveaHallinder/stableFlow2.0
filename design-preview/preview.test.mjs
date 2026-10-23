import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

// Execute the actual prototype handlers without a browser, APIs or persisted data.
function preview() {
  const listeners = new Map();
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        innerHTML: '',
        textContent: '',
        isConnected: true,
        classList: { add() {}, remove() {}, contains: () => false },
        focus() {},
      });
    }
    return elements.get(id);
  };
  const document = {
    title: '',
    activeElement: null,
    body: element('body'),
    getElementById: element,
    querySelector: () => element('sheet'),
    addEventListener(name, handler) {
      const handlers = listeners.get(name) ?? [];
      handlers.push(handler);
      listeners.set(name, handlers);
    },
  };
  class LocalFormData {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values[name] ?? null; }
    getAll(name) {
      const value = this.values[name];
      return Array.isArray(value) ? value : value == null ? [] : [value];
    }
  }
  const context = vm.createContext({
    document,
    FormData: LocalFormData,
    window: { scrollTo() {} },
    setTimeout: () => 1,
    clearTimeout() {},
  });
  vm.runInContext(source, context, { filename: 'design-preview/app.js' });
  const run = (expression) => vm.runInContext(expression, context);
  const emit = (name, event) => {
    for (const handler of listeners.get(name) ?? []) handler(event);
  };
  return {
    run,
    html: () => element('app').innerHTML,
    overlay: () => element('overlay-root').innerHTML,
    toast: () => element('toast').textContent,
    click(dataset) {
      const button = { dataset };
      emit('click', {
        target: {
          classList: { contains: () => false },
          closest: (selector) => selector === 'button'
            || (selector === '[data-action="join-finish"]' && dataset.action === 'join-finish')
            ? button : null,
        },
      });
    },
    submit(type, values) {
      const form = { dataset: { form: type }, values };
      let prevented = false;
      emit('submit', {
        target: { closest: (selector) => selector === '[data-form]' ? form : null },
        preventDefault() { prevented = true; },
      });
      assert.equal(prevented, true, 'submission must remain local');
    },
  };
}

test('owner can find invitations, seasonal allocation and stall settings', () => {
  const app = preview();
  const hub = app.run('hubPage()');
  for (const action of ['season', 'stable-settings', 'moderation']) {
    assert.ok(hub.includes(`data-action="${action}"`), action);
  }
  assert.ok(app.run('membersPage()').includes('data-action="invite"'));
  assert.ok(app.run('calendarPage()').includes('data-action="new-duty"'));
  app.click({ action: 'invite' });
  assert.match(app.overlay(), /id="invite-form"/);
});

test('member gets own weekly passes and no owner management controls', () => {
  const app = preview();
  app.click({ action: 'join-finish' });
  assert.equal(app.run('state.role'), 'member');
  const hub = app.run('hubPage()');
  for (const action of ['season', 'stable-settings', 'moderation']) {
    assert.ok(!hub.includes(`data-action="${action}"`), action);
  }
  const members = app.run('membersPage()');
  assert.ok(!members.includes('data-action="invite"'));
  assert.ok(!members.includes('data-action="member-detail"'));
  assert.match(members, /Svea Hallinder \(du\)<\/strong><small>Medryttare/);
  const calendar = app.run('calendarPage()');
  assert.ok(calendar.includes('data-action="my-weekly"'));
  assert.ok(!calendar.includes('data-action="new-duty"'));
  assert.ok(!app.run('horsesPage()').includes('data-action="new-horse"'));
});

test('member cannot open owner forms through an action left elsewhere', () => {
  const app = preview();
  app.click({ action: 'join-finish' });
  for (const action of ['invite', 'season', 'new-duty', 'stable-settings', 'moderation', 'edit-duty-2']) {
    app.click({ action });
    assert.equal(app.overlay(), '', action);
    assert.match(app.toast(), /stallägaren/, action);
  }
  app.click({ action: 'my-weekly' });
  assert.match(app.overlay(), /Mina veckopass/);
  assert.doesNotMatch(app.overlay(), /id="season-form"/);
});

test('starting the owner onboarding after the member example resets its role', () => {
  const app = preview();
  app.click({ action: 'join-finish' });
  app.click({ action: 'onboard-start' });
  assert.equal(app.run('state.role'), 'owner');
  assert.equal(app.run('state.onboard'), true);
  app.click({ action: 'finish-onboard' });
  assert.equal(app.run('state.role'), 'owner');
  assert.equal(app.run('state.onboard'), false);
});

test('new chat picks the selected recipient, including Lisa', () => {
  const app = preview();
  app.click({ action: 'new-chat' });
  const choices = [...app.overlay().matchAll(/<button[^>]*data-chat="(\d+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.equal(choices.length, 3);
  for (const [name, expected] of [['Ingrid Andersson', 1], ['Emma Lind', 2], ['Lisa Berg', 3]]) {
    const choice = choices.find((match) => match[2].includes(name));
    assert.ok(choice, name);
    assert.equal(Number(choice[1]), expected);
    app.click({ chat: choice[1] });
    assert.equal(app.run('chatName()'), name);
    assert.equal(app.run('state.thread'), true);
    assert.match(app.html(), new RegExp(`<strong>${name}</strong><small>Privat konversation`));
  }
});

test('horse owner chat opens the owner and avoids a misleading self chat', () => {
  const app = preview();
  for (const [horseIndex, owner] of [[1, 'Ingrid Andersson'], [2, 'Emma Lind']]) {
    app.run(`state.horse=${horseIndex}`);
    app.click({ action: 'horse-owner-chat' });
    assert.equal(app.run('chatName()'), owner);
    assert.equal(app.run('state.page'), 'messages');
  }
  app.run("state.horse=0;state.page='horse'");
  app.click({ action: 'horse-owner-chat' });
  assert.equal(app.run('state.page'), 'horse');
  assert.match(app.toast(), /Du är hästägare/);
});

test('user-entered stall and post text is rendered as text rather than markup', () => {
  const app = preview();
  const payload = '<img src=x onerror="alert(1)"> & Åäö';
  app.run(`state.stall=${JSON.stringify(payload)};render()`);
  assert.ok(!app.html().includes(payload));
  assert.ok(app.html().includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Åäö'));
  app.submit('post', { title: payload, body: payload });
  assert.ok(!app.overlay().includes(payload));
  assert.ok(app.overlay().includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Åäö'));
});

test('a local duty retains the chosen person and day and appears only on that day', () => {
  const app = preview();
  app.click({ page: 'calendar' });
  app.submit('duty', {
    id: '', title: 'Eftermiddagsfodring', time: '15:30',
    owner: 'Lisa Berg', date: '2026-10-24', repeat: 'Bara detta pass', note: '',
  });
  const duty = JSON.parse(app.run('JSON.stringify(duties.at(-1))'));
  assert.equal(duty.owner, 'Lisa Berg');
  assert.equal(duty.day, 24);
  assert.equal(duty.time, '15:30');
  assert.equal(duty.end, '16:30');
  assert.ok(!app.run('calendarPage()').includes('Eftermiddagsfodring'));
  app.click({ day: '24' });
  assert.ok(app.html().includes('Eftermiddagsfodring'));
  assert.match(app.html(), /<span>Lisa<\/span>/);
  assert.match(app.toast(), /endast i designförslaget/);
});

test('local duty markup stays escaped in the calendar, Today and pass dialog', () => {
  const app = preview();
  const title = '<img src=x onerror="alert(1)"> & Åäö';
  const escapedTitle = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Åäö';
  app.click({ page: 'calendar' });
  app.submit('duty', {
    id: '', title, time: '09:30', owner: 'Svea Hallinder',
    date: '2026-10-23', repeat: 'Bara detta pass', note: '',
  });
  const id = app.run('duties.at(-1).id');
  for (const page of ['calendar', 'today']) {
    app.click({ page });
    assert.ok(!app.html().includes(title), page);
    assert.ok(app.html().includes(escapedTitle), page);
  }
  app.click({ action: `duty-${id}` });
  assert.ok(!app.overlay().includes(title));
  assert.ok(app.overlay().includes(escapedTitle));
});
