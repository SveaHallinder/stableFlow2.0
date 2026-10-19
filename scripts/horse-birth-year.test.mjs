import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function helpers() {
  const source = await readFile(new URL('../lib/horseAge.ts', import.meta.url), 'utf8')
    .catch(() => assert.fail('Birth year validation and calendar age are not implemented yet'));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('birth year produces a new calendar age at the year boundary without rewriting the horse', async () => {
  const { getHorseAge } = await helpers();
  const horse = Object.freeze({ birthYear: 2019, age: 3 });
  assert.equal(getHorseAge(horse, 2026), 7);
  assert.equal(getHorseAge(horse, 2027), 8);
  assert.equal(getHorseAge({ birthYear: 2026 }, 2026), 0);
});

test('birth year is optional and rejects invalid or future input', async () => {
  const { parseHorseBirthYear, isValidHorseBirthYear } = await helpers();
  assert.equal(parseHorseBirthYear('', 2026), undefined);
  assert.equal(parseHorseBirthYear('   ', 2026), undefined);
  assert.equal(parseHorseBirthYear(' 2019 ', 2026), 2019);
  assert.equal(parseHorseBirthYear('1900', 2026), 1900);
  assert.equal(parseHorseBirthYear('2026', 2026), 2026);
  for (const input of ['7', '2027', '1899', '2019.5', '2e3', 'abc', 'Infinity', '-1']) {
    assert.equal(parseHorseBirthYear(input, 2026), undefined, input);
  }
  for (const value of [NaN, Infinity, 2019.5, -1, 1899, 2027]) {
    assert.equal(isValidHorseBirthYear(value, 2026), false);
  }
});

test('unknown birth year stays unknown and legacy age is not used to guess a birth year', async () => {
  const { getHorseAge } = await helpers();
  assert.equal(getHorseAge({}, 2026), undefined);
  assert.equal(getHorseAge({ age: 0 }, 2026), 0);
  assert.equal(getHorseAge({ age: 9 }, 2026), 9);
  assert.equal(getHorseAge({ birthYear: 2027, age: 9 }, 2026), undefined);
});
