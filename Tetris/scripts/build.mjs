// src/의 ES 모듈을 일반 <script> 하나로 묶는다.
// file://로 index.html을 더블클릭해 열면 브라우저가 모듈 로딩을 막기 때문이다.
// 모듈마다 자기 함수 스코프를 주므로 모듈 간 이름이 겹쳐도 안전하다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENTRY = join(root, 'src/main.js');
export const OUT = join(root, 'dist/tetris.js');

const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*'([^']+)';?[ \t]*\n/gm;
const EXPORT_RE = /^export\s+(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm;

const moduleId = (file) => `__${relative(root, file).replace(/\W/g, '_')}`;

export async function bundle() {
  const modules = new Map();
  const order = [];

  async function visit(file) {
    if (modules.has(file)) return;
    modules.set(file, null);
    const src = await readFile(file, 'utf8');
    const imports = [...src.matchAll(IMPORT_RE)].map(([, names, spec]) => ({
      names: names.split(',').map((n) => n.trim()).filter(Boolean),
      file: resolve(dirname(file), spec),
    }));
    for (const dep of imports) await visit(dep.file);
    modules.set(file, { src, imports });
    order.push(file);
  }

  await visit(ENTRY);

  const parts = order.map((file) => {
    const { src, imports } = modules.get(file);
    const exported = [...src.matchAll(EXPORT_RE)].map(([, name]) => name);
    const body = src.replace(IMPORT_RE, '').replace(/^export\s+(?=(?:const|let|function|class)\b)/gm, '');
    if (/^\s*(?:import|export)\b/m.test(body)) {
      throw new Error(`${relative(root, file)}: 지원하지 않는 import/export 형식입니다 (이름 있는 import와 export 선언만 지원).`);
    }
    const bindings = imports.map((dep) => `const { ${dep.names.join(', ')} } = ${moduleId(dep.file)};`);
    return [
      `// ── ${relative(root, file)} ──`,
      `const ${moduleId(file)} = (() => {`,
      ...bindings,
      body.trim(),
      `return { ${exported.join(', ')} };`,
      '})();',
    ].join('\n');
  });

  return [
    '/* 자동 생성 파일입니다. src/를 고친 뒤 `npm run build`로 다시 만드세요. */',
    '(() => {',
    "'use strict';",
    parts.join('\n\n'),
    '})();',
    '',
  ].join('\n');
}

export async function writeBundle() {
  const code = await bundle();
  await mkdir(dirname(OUT), { recursive: true });
  const current = await readFile(OUT, 'utf8').catch(() => null);
  if (current !== code) await writeFile(OUT, code);
  return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeBundle();
  console.log(`빌드 완료 → ${relative(root, OUT)}`);
}
