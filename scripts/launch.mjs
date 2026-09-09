import { readFile, writeFile, open, rename, unlink, realpath, mkdir } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname, join, delimiter, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const APP = 'changyi-pavilion', CONTROL_PATH = '/__pavilion_control', SESSION = '.pavilion-local.json';
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export const supportedNode = version => {
  const [major,minor] = version.replace(/^v/, '').split('.').map(Number);
  return (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
};
const rootHash = root => createHash('sha256').update(root).digest('hex');
const isAlive = pid => {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid,0); return true; } catch (error) { return error.code === 'EPERM'; }
};

async function readSession(root) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const session = JSON.parse(await readFile(join(root,SESSION),'utf8'));
      if (session.app !== APP || session.rootHash !== rootHash(root) || typeof session.token !== 'string') throw new Error('启动记录不属于当前文件夹，请先在原启动窗口按 Control+C。');
      return session;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      if (!(error instanceof SyntaxError) || attempt === 3) throw error;
      await delay(50); // Another double-click may still be writing its initial lock.
    }
  }
}

export async function releaseSession(root, token) {
  const current = await readSession(root);
  if (current?.token === token) await unlink(join(root,SESSION)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}

export async function requestControl(session, method = 'GET') {
  if (!Number.isInteger(session?.port) || session.port < 1 || session.port > 65535) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${session.port}${CONTROL_PATH}`, {
      method, headers: { 'x-pavilion-token': session.token }, signal: AbortSignal.timeout(1800), redirect: 'error',
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result.app === APP && result.rootHash === session.rootHash ? result : null;
  } catch { return null; }
}

export async function acquireSession(root, { probe = requestControl, alive = isAlive } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = { app: APP, rootHash: rootHash(root), pid: process.pid, token: randomBytes(24).toString('hex'), phase: 'preparing' };
    try {
      const handle = await open(join(root,SESSION),'wx',0o600);
      try { await handle.writeFile(JSON.stringify(session)); } finally { await handle.close(); }
      return { session, existing: false };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = await readSession(root);
      if (!current) continue;
      const live = await probe(current);
      if (live) return { session: current, existing: true, url: live.url };
      if (alive(current.pid)) throw new Error('此文件夹正在启动或安装依赖，请查看已有的启动窗口。');
      await releaseSession(root,current.token);
    }
  }
  throw new Error('启动记录正在更新，请稍后再试。');
}

async function updateSession(root, session) {
  const temporary = join(root,`${SESSION}.${process.pid}.tmp`);
  await writeFile(temporary,JSON.stringify(session),{ mode: 0o600 });
  await rename(temporary,join(root,SESSION));
}

export function controlPlugin(session, status, stop) {
  return {
    name: 'pavilion-local-control',
    configureServer(server) {
      server.middlewares.use((req,res,next) => {
        if (req.url?.split('?')[0] !== CONTROL_PATH) return next();
        const supplied = Buffer.from(String(req.headers['x-pavilion-token'] ?? ''));
        const expected = Buffer.from(session.token);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) { res.statusCode = 403; res.end(); return; }
        if (!['GET','POST'].includes(req.method)) { res.statusCode = 405; res.end(); return; }
        res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({ app: APP, rootHash: session.rootHash, ...status() }));
        if (req.method === 'POST') setImmediate(stop);
      });
    },
  };
}

export async function dependencyFingerprint(root) {
  const [pkg,lock] = await Promise.all([readFile(join(root,'package.json')),readFile(join(root,'package-lock.json'))]);
  return createHash('sha256').update(pkg).update(lock).update(`${process.platform}:${process.arch}:${process.versions.node.split('.')[0]}`).digest('hex');
}

function runNpm(root, signal) {
  return new Promise((resolve,reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',['ci','--no-audit','--no-fund','--include=optional'],{
      cwd: root, stdio: 'inherit', signal, env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH || ''}` },
    });
    child.once('error',reject);
    child.once('exit',(code,signal) => code === 0 ? resolve() : reject(new Error(`依赖安装未完成（${signal || code}）。请检查网络后重新双击启动，现有源码不会被修改。`)));
  });
}

export async function ensureDependencies(root, { signal, install = runNpm, load = () => import(pathToFileURL(join(root,'node_modules/vite/dist/node/index.js')).href) } = {}) {
  const fingerprint = await dependencyFingerprint(root), stamp = join(root,'node_modules/.pavilion-deps.json');
  let previous;
  try { previous = JSON.parse(await readFile(stamp,'utf8')); } catch { /* first install / switched architecture */ }
  if (previous?.fingerprint === fingerprint) {
    try { return await load(); } catch { /* repair a missing native Rollup binary */ }
  }
  console.log('首次运行或依赖有变化，正在安装项目依赖…');
  await install(root,signal);
  // A failed dynamic import stays cached in this process. Ask for a clean restart after repairing it.
  let vite;
  try { vite = await load(); } catch (error) { throw new Error(`依赖已安装，请重新双击启动以加载新依赖。${error.message}`,{ cause: error }); }
  await mkdir(join(root,'node_modules'),{ recursive: true });
  await writeFile(stamp,JSON.stringify({ fingerprint }));
  return vite;
}

export function openBrowser(url, platform = process.platform) {
  if (platform !== 'darwin') { console.log(`请在浏览器打开：${url}`); return; }
  const child = spawn('/usr/bin/open',[url],{ stdio: 'ignore' });
  child.on('error',() => console.log(`请手动打开：${url}`));
  child.on('exit',code => { if (code) console.log(`请手动打开：${url}`); });
}

export async function launch({ root = defaultRoot, stop = false, check = false, noOpen = false, dependencies = ensureDependencies, browser = openBrowser } = {}) {
  root = await realpath(root);
  if (!supportedNode(process.versions.node)) throw new Error('需要 Node.js 20.19+ 或 22.12+；推荐安装 Node.js 24 LTS。');
  if (check) {
    await dependencyFingerprint(root);
    console.log(`Node.js ${process.versions.node} · ${process.platform}/${process.arch}\n项目：${root}\n启动条件检查通过（未安装依赖、未启动服务）。`);
    return;
  }
  if (stop) {
    const session = await readSession(root);
    if (!session) { console.log('长衣亭没有正在运行的本地服务。'); return; }
    if (await requestControl(session,'POST')) { console.log('已请求停止本项目的长衣亭服务。'); return; }
    if (!isAlive(session.pid)) { await releaseSession(root,session.token); console.log('已清理上次退出的启动记录。'); return; }
    throw new Error('无法确认当前服务，请在原启动窗口按 Control+C。其他进程未被关闭。');
  }
  const { session,existing,url } = await acquireSession(root);
  if (existing) { console.log(`长衣亭已在运行：${url}`); if (!noOpen) browser(url); return; }
  const controller = new AbortController(); let server, closing;
  const shutdown = () => closing ||= (async () => {
    controller.abort(); if (server) await server.close();
    await releaseSession(root,session.token);
    for (const signal of ['SIGINT','SIGTERM','SIGHUP']) process.removeListener(signal,onSignal);
    console.log('长衣亭已停止。');
  })();
  const onSignal = () => { void shutdown().then(() => process.exit(0)); };
  for (const signal of ['SIGINT','SIGTERM','SIGHUP']) process.once(signal,onSignal);
  try {
    const { createServer } = await dependencies(root,{ signal: controller.signal });
    controller.signal.throwIfAborted();
    server = await createServer({ root, server: {
      host: '127.0.0.1', port: 4173, strictPort: false, open: false,
      fs: { deny: ['.env','.env.*','*.{crt,pem}','**/.git/**','**/.pavilion-local.json','**/.pavilion-local.json.*.tmp'] },
    }, plugins: [controlPlugin(session,() => ({ url: session.url }),onSignal)] });
    controller.signal.throwIfAborted(); await server.listen();
    const address = server.httpServer.address();
    session.port = address.port; session.url = `http://127.0.0.1:${address.port}${server.config.base}`; session.phase = 'ready';
    await updateSession(root,session);
    console.log(`\n长衣亭已启动：${session.url}\n请保留此窗口；按 Control+C 或双击 Stop-Mac.command 结束。\n`);
    if (!noOpen) browser(session.url);
    return { server,shutdown,session };
  } catch (error) { await shutdown(); throw error; }
  finally {
    if (closing) for (const signal of ['SIGINT','SIGTERM','SIGHUP']) process.removeListener(signal,onSignal);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const options = new Set(process.argv.slice(2));
  if ([...options].some(option => !['--stop','--check','--no-open'].includes(option))) {
    console.error('用法：node scripts/launch.mjs [--stop | --check] [--no-open]'); process.exitCode = 1;
  } else launch({ stop: options.has('--stop'), check: options.has('--check'), noOpen: options.has('--no-open') }).catch(error => { console.error(`\n启动失败：${error.message}`); process.exitCode = 1; });
}
