// 使用本机已安装 Pi SDK 和 TypeScript；不安装依赖、不改全局配置。
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const sdk = process.env.PI_SDK_ROOT || resolve('../../node_modules/@earendil-works/pi-coding-agent');
const tsc = process.env.TSC_PATH || resolve('../../node_modules/typescript/bin/tsc');
const require = createRequire(join(sdk, 'package.json'));
const temporary = await mkdtemp(join(resolve('.'), '.design-typecheck-'));
try {
  const paths = {
    '@earendil-works/pi-coding-agent': [join(sdk, 'dist/index.d.ts')],
    '@earendil-works/pi-ai': [join(sdk, 'node_modules/@earendil-works/pi-ai/dist/index.d.ts')],
    'typebox': [require.resolve('typebox').replace(/\.mjs$/, '.d.mts')],
    'typebox/value': [require.resolve('typebox/value').replace(/\.mjs$/, '.d.mts')],
  };
  await writeFile(join(temporary, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, allowImportingTsExtensions: true, skipLibCheck: true, noUnusedLocals: true, noUnusedParameters: true, noUncheckedIndexedAccess: true, paths, types: ['node'], typeRoots: [join(sdk, 'node_modules/@types')] },
    files: ['index.ts', 'schema.ts', 'svg.ts', 'core.ts'].map((file) => resolve(file)),
  }));
  const result = spawnSync(process.execPath, [tsc, '-p', join(temporary, 'tsconfig.json')], { stdio: 'inherit', timeout: 30000 });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(temporary, { recursive: true, force: true }); }
