import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { supportedNode, acquireSession, releaseSession, ensureDependencies, controlPlugin, launch } from '../scripts/launch.mjs';

const exec = promisify(execFile);
async function folder(t) {
  const root = await mkdtemp(resolve('.launcher-test-'));
  t.after(() => rm(root,{ recursive: true,force: true }));
  await writeFile(join(root,'package.json'),'{"name":"fixture"}');
  await writeFile(join(root,'package-lock.json'),'{"lockfileVersion":3}');
  return root;
}

test('Node version checks match the installed Vite engine requirement',() => {
  for (const version of ['20.19.0','22.12.0','24.0.0','26.8.1']) assert.equal(supportedNode(version),true);
  for (const version of ['18.20.0','20.18.9','21.7.0','22.11.9','garbage']) assert.equal(supportedNode(version),false);
});

test('Mac entrypoint handles Chinese, spaces and shell metacharacters in its folder name',async t => {
  const parent = await folder(t), root = join(parent,'长衣亭 Mac $demo'); await mkdir(root);
  for (const path of ['Start-Mac.command','Stop-Mac.command','scripts/mac/node.sh','scripts/launch.mjs','package.json','package-lock.json']) {
    await mkdir(resolve(root,path,'..'),{ recursive: true }); await cp(resolve(path),join(root,path));
  }
  const { stdout } = await exec('bash',[join(root,'Start-Mac.command'),'--check'],{ cwd: parent,env: { ...process.env,PAVILION_NO_PAUSE: '1' } });
  assert.ok(stdout.includes(root)); assert.ok(stdout.includes('启动条件检查通过'));
  await assert.rejects(readFile(join(root,'.pavilion-local.json')),{ code: 'ENOENT' });
  const stop = await exec('bash',[join(root,'Stop-Mac.command')],{ cwd: parent,env: { ...process.env,PAVILION_NO_PAUSE: '1' } });
  assert.ok(stop.stdout.includes('没有正在运行'));
});

test('dependency setup runs once, follows lock changes, and never stamps a failed install',async t => {
  const root = await folder(t); let installed = 0; const vite = {};
  const options = { install: async () => { installed++; },load: async () => vite };
  assert.equal(await ensureDependencies(root,options),vite); await ensureDependencies(root,options); assert.equal(installed,1);
  await writeFile(join(root,'package-lock.json'),'{"lockfileVersion":3,"changed":true}');
  await ensureDependencies(root,options); assert.equal(installed,2);
  await rm(join(root,'node_modules/.pavilion-deps.json'));
  await assert.rejects(ensureDependencies(root,{ ...options,install: async () => { throw new Error('network unavailable'); } }),/network unavailable/);
  await assert.rejects(readFile(join(root,'node_modules/.pavilion-deps.json')),{ code: 'ENOENT' });
});

test('launch lock reuses a verified service and refuses to terminate or replace an active unverified process',async t => {
  const root = await folder(t), first = await acquireSession(root);
  const mode = (await stat(join(root,'.pavilion-local.json'))).mode & 0o777; assert.equal(mode,0o600);
  const second = await acquireSession(root,{ probe: async () => ({ url: 'http://127.0.0.1:4180/changyi-pavilion/' }) });
  assert.equal(second.existing,true); assert.equal(second.session.token,first.session.token);
  await assert.rejects(acquireSession(root,{ probe: async () => null,alive: () => true }),/正在启动/);
  await releaseSession(root,'incorrect token'); assert.ok(await readFile(join(root,'.pavilion-local.json')));
  const restarted = await acquireSession(root,{ probe: async () => null,alive: () => false });
  assert.equal(restarted.existing,false); assert.notEqual(restarted.session.token,first.session.token);
  await releaseSession(root,restarted.session.token);
});

test('stop middleware authenticates this session and leaves unrelated routes untouched',async () => {
  let middleware,stopped = 0,next = 0;
  controlPlugin({ token: 'test-token',rootHash: 'this-project' },() => ({ url: 'http://127.0.0.1:4173/changyi-pavilion/' }),() => stopped++).configureServer({ middlewares: { use: fn => middleware = fn } });
  const response = () => ({ statusCode: 200, setHeader() {},end(body) { this.body = body; } });
  const denied = response(); middleware({ url: '/__pavilion_control',method: 'POST',headers: { 'x-pavilion-token': 'wrong' } },denied,() => next++);
  assert.equal(denied.statusCode,403); assert.equal(stopped,0);
  middleware({ url: '/changyi-pavilion/',headers: {} },response(),() => next++); assert.equal(next,1);
  const accepted = response(); middleware({ url: '/__pavilion_control',method: 'POST',headers: { 'x-pavilion-token': 'test-token' } },accepted,() => next++);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(stopped,1); assert.equal(JSON.parse(accepted.body).rootHash,'this-project');
});

test('launcher uses Vite’s actual fallback port, opens only after listening, and cleans up on close/failure',async t => {
  const root = await folder(t); let listening = false,closed = false; const opened = [];
  const server = { config: { base: '/changyi-pavilion/' }, httpServer: { address: () => ({ port: 4174 }) }, listen: async () => { listening = true; },close: async () => { closed = true; } };
  const running = await launch({ root,dependencies: async () => ({ createServer: async config => {
    assert.equal(config.server.host,'127.0.0.1'); assert.equal(config.server.strictPort,false); return server;
  } }),browser: url => { assert.equal(listening,true); opened.push(url); } });
  assert.deepEqual(opened,['http://127.0.0.1:4174/changyi-pavilion/']);
  await running.shutdown(); assert.equal(closed,true);
  await assert.rejects(readFile(join(root,'.pavilion-local.json')),{ code: 'ENOENT' });
  await assert.rejects(launch({ root,noOpen: true,dependencies: async () => { throw new Error('offline'); } }),/offline/);
  await assert.rejects(readFile(join(root,'.pavilion-local.json')),{ code: 'ENOENT' });
});
