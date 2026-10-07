import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import React from 'react';
import ts from 'typescript';

async function loadReceipt({ clipboardFailure } = {}) {
  const source = await readFile(new URL('../components/InviteReceipt.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('InviteReceipt.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
  const copied = [];
  const toasts = [];
  const logs = [];
  const dependencies = {
    React, View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
    StyleSheet: { create: styles => styles },
    Clipboard: { setStringAsync: async value => {
      if (clipboardFailure === 'throw') throw new Error('Synthetic clipboard failure');
      if (clipboardFailure === 'false') return false;
      copied.push(value);
      return true;
    } },
    useAppData: () => ({ state: { stables: [{ id: 'A', name: 'QA Första' }, { id: 'B', name: 'QA Andra' }] } }),
    useToast: () => ({ showToast: (...args) => toasts.push(args) }),
    theme: { colors: {} }, console: { warn: (...args) => logs.push(args) },
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => { ${body}; return InviteReceipt; };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  });
  const render = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  return { render, copied, toasts, logs };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function content(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(content).join(' ');
  return tree && typeof tree === 'object' ? content(tree.props?.children) : '';
}

const confirmation = { email: 'recipient@example.test', inviteCode: 'FIRST1',
  codes: [{ stableId: 'A', code: 'FIRST1' }, { stableId: 'B', code: 'SECOND2' }] };

test('confirmed receipt explains the email-bound path without promising mail delivery', async () => {
  const { render } = await loadReceipt();
  assert.equal(render({ confirmation: null }), null);
  const text = content(render({ confirmation }));
  assert.match(text, /recipient@example\.test/);
  assert.match(text, /Logga in/);
  assert.match(text, /Skapa konto.*Har inbjudan/);
  assert.match(text, /samma e-postadress/);
  assert.match(text, /Mejlleverans är inte bekräftad/);
  assert.match(text, /personliga koden.*skapar konto/);
  assert.match(text, /Gå med.*stallkod/);
  assert.doesNotMatch(text, /(?:mejl|e-post).*skickad/i);
});

test('copyable instructions retain the confirmed email and every stable code', async () => {
  const { render, copied, toasts } = await loadReceipt();
  const tree = render({ confirmation });
  const instructionButton = nodes(tree).find(node => node.props?.accessibilityLabel === 'Kopiera inbjudan med instruktioner');
  assert.ok(instructionButton, 'A recipient needs the email/login instructions alongside the code.');
  await instructionButton.props.onPress();
  assert.equal(copied.length, 1);
  assert.match(copied[0], /recipient@example\.test/);
  assert.match(copied[0], /Skapa konto.*Har inbjudan/);
  assert.match(copied[0], /QA Första: FIRST1/);
  assert.match(copied[0], /QA Andra: SECOND2/);
  const codeButton = nodes(tree).find(node => node.props?.accessibilityLabel === 'Kopiera inbjudningskod SECOND2');
  await codeButton.props.onPress();
  assert.equal(copied[1], 'SECOND2');
  assert.equal(toasts.at(-1)[1], 'success');
});

test('clipboard failure preserves selectable instructions and reports the failure', async () => {
  for (const clipboardFailure of ['throw', 'false']) {
    const { render, copied, toasts, logs } = await loadReceipt({ clipboardFailure });
    const tree = render({ confirmation });
    const instructionButton = nodes(tree).find(node => node.props?.accessibilityLabel === 'Kopiera inbjudan med instruktioner');
    assert.ok(instructionButton);
    await instructionButton.props.onPress();
    assert.equal(copied.length, 0);
    assert.equal(toasts.at(-1)[1], 'error');
    assert.match(logs.at(-1)[0], /^\[invite copy\]/);
    assert.match(content(tree), /recipient@example\.test/);
    assert.ok(nodes(tree).some(node => node.props?.selectable && content(node).includes('recipient@example.test')));
  }
});
