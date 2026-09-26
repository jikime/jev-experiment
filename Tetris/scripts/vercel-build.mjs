// Vercel 배포용 빌드: 번들을 만들고 사이트에 필요한 파일만 public/에 모은다.
// src·scripts·tests·README는 공개 사이트에 올리지 않는다. Jev 중계는 api/(Vercel 함수)가 맡는다.
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUT, writeBundle } from './build.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC = join(root, 'public');
const SITE_FILES = ['index.html', 'styles.css', relative(root, OUT)]; // index.html이 참조하는 파일 전부

await writeBundle();
await rm(PUBLIC, { recursive: true, force: true });
for (const file of SITE_FILES) {
  const target = join(PUBLIC, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, file), target);
}
console.log(`배포 파일 → ${relative(root, PUBLIC)}/ (${SITE_FILES.join(', ')})`);
