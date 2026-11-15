import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('.', import.meta.url));
const npmCli = process.env.npm_execpath;

function command(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: 60000, shell: false });
  assert.equal(result.status, 0, `${program} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('packed package exposes typed exports, working binaries, and strict consumer types', { timeout: 180000 }, async () => {
  assert.ok(npmCli, 'Run this check through npm run test:types.');
  const dir = await mkdtemp(join(tmpdir(), 'plumbcheck-types-'));
  try {
    const packed = JSON.parse(command(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--pack-destination', dir, '--json'], root))[0];
    assert.ok(packed.files.some(file => file.path === 'src/index.d.ts'));
    const consumer = join(dir, 'consumer');
    await import('node:fs/promises').then(fs => fs.mkdir(consumer));
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'actual-consumer', private: true, type: 'module' }));
    const archive = join(dir, packed.filename);
    // A fresh consumer needs registry metadata for production dependencies;
    // npm ci's tarball cache alone cannot satisfy an offline dependency resolve.
    command(process.execPath, [npmCli, 'install', archive, '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
    await copyFile(join(here, 'consumer.ts'), join(consumer, 'consumer.ts'));
    for (const compiler of ['typescript', 'typescript-legacy']) {
      const packageDir = join(here, 'node_modules', compiler);
      const metadata = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
      const executable = resolve(packageDir, typeof metadata.bin === 'string' ? metadata.bin : metadata.bin.tsc);
      for (const [module, moduleResolution] of [['NodeNext', 'NodeNext'], ['ESNext', 'Bundler']]) {
        await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module, moduleResolution, strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: false, types: [], lib: ['ES2022'] }, files: ['consumer.ts'] }));
        command(process.execPath, [executable, '-p', 'tsconfig.json'], consumer);
      }
    }
    for (const name of ['plumbcheck', 'plumcheck']) {
      assert.equal(command(process.execPath, [npmCli, 'exec', '--offline', '--', name, '--version'], consumer).trim(), packed.version);
    }
    command(process.execPath, ['--input-type=module', '-e', "import {createRecorder,ReplaySession,runSuite,runAgentSuite,validateSuite,redact,toHtml,toJUnit,ContractError} from 'plumbcheck'; const r=createRecorder({async callTool(){return {ok:true}}}); await r.callTool({name:'read',arguments:{}}); const fixtures=await r.snapshot(); const s=new ReplaySession({fixtures,policies:{allow:['read']}}); if(!(await s.callTool({name:'read'})).ok)throw Error('Wrong runtime result'); s.verifyComplete();"], consumer);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
