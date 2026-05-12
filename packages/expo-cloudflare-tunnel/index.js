'use strict';
const { spawn } = require('child_process');

let _proc = null;

async function startAsync(port) {
  return new Promise((resolve, reject) => {
    _proc = spawn('cloudflared', [
      'tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate',
    ]);

    const timeout = setTimeout(() => {
      reject(new Error('cloudflared tunnel failed to start within 60s'));
    }, 60000);

    const onData = (data) => {
      const match = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    };

    _proc.stdout.on('data', onData);
    _proc.stderr.on('data', onData);
    _proc.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

async function stopAsync() {
  if (_proc) {
    _proc.kill();
    _proc = null;
  }
}

module.exports = { startAsync, stopAsync };
