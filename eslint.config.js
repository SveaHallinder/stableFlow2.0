// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const { FlatCompat } = require('@eslint/eslintrc');

module.exports = defineConfig([
  ...new FlatCompat({ baseDirectory: __dirname }).extends('expo'),
  {
    ignores: ['dist/*'],
  },
]);
