// Lancer (depuis desktop-player) : node --test test/version.test.js
const test = require('node:test');
const assert = require('node:assert');
const { compareVersions, isValidVersion } = require('../src/version');

test('compare nombre par nombre, pas comme du texte', () => {
  assert.ok(compareVersions('0.10.0', '0.9.5') > 0);
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
  assert.strictEqual(compareVersions('2.0', '2.0.0'), 0);
});

test('accepte seulement des nombres séparés par des points', () => {
  assert.ok(isValidVersion('1.2.0'));
  assert.ok(!isValidVersion('1.2.0-beta'));
  assert.ok(!isValidVersion('1'));
  assert.ok(!isValidVersion(undefined));
});
