// wrangler dev, for the checks that play the Worker on this machine: npm run talk:host and npm run town:host. Each one's on ports of
// its own, its inspector's too: left to itself wrangler takes 9229 for the inspector if it looks free, so of two started at the same
// moment the second dies with "Address already in use (socket "direct:1:default")". And stopping one that's already stopped is over
// at once, where waiting for it to stop again kept talk:host going until the check gave up on it at 600 s.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

export const WRANGLER = 'wrangler@4.154.0';
// Ports nothing has, all asked for while the others are still held, so they're different from each other
const freePorts = async (n) => {
  const held = await Promise.all(Array.from({ length: n }, () => new Promise((r) => { const s = createServer().listen(0, '127.0.0.1', () => r(s)); })));
  const ports = held.map((s) => s.address().port);
  await Promise.all(held.map((s) => new Promise((r) => s.close(r))));
  return ports;
};

// `args` are what's said to wrangler dev besides where it listens. start() is the port it's ready on.
export function wranglerDev({ cwd, args, command = ['npx', '--yes', WRANGLER, 'dev'] }) {
  let worker = null;
  return {
    async start() {
      const [port, inspector] = await freePorts(2);
      worker = spawn(command[0], [...command.slice(1), ...args, '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector)],
        { cwd, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      await new Promise((ok, no) => {
        let said = '';
        const late = setTimeout(() => no(new Error(`wrangler dev never said it was ready:\n${said}`)), 180000);
        const hear = (d) => { said += d; if (/Ready on/.test(said)) { clearTimeout(late); ok(); } };
        worker.stdout.on('data', hear); worker.stderr.on('data', hear);
        worker.once('exit', (code) => { clearTimeout(late); no(new Error(`wrangler dev stopped (${code}):\n${said}`)); });
      });
      return port;
    },
    // whatever of it's still going is told to stop, and it's over once it has, or at once if it already had
    stop() {
      if (!worker) return Promise.resolve();
      const was = worker; worker = null;
      return new Promise((r) => {
        if (was.exitCode !== null || was.signalCode !== null) r(); else was.once('exit', r);
        try { process.kill(-was.pid, 'SIGTERM'); } catch { r(); }
      });
    },
  };
}
