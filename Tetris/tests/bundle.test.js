import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OUT, bundle } from '../scripts/build.mjs';

test('dist/tetris.js가 src/와 같은 내용이다 (다르면 npm run build)', async () => {
  const committed = await readFile(OUT, 'utf8').catch(() => '');
  assert.equal(committed, await bundle(), 'dist/tetris.js가 오래됐습니다. `npm run build`를 실행하세요.');
});
