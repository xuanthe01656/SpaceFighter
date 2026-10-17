const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let createApp;
try { ({ createApp } = require('../server.js')); } catch (error) {
  // Allows source-only checks when dependencies could not be installed offline.
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

async function request(app, uri) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${server.address().port}${uri}`, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status:res.statusCode, headers:res.headers, body:Buffer.concat(chunks).toString('utf8') }));
      }).on('error', reject);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('server answers /ping and /health without Firebase Admin credentials', { skip: !createApp }, async () => {
  const app = createApp('/does-not-exist');
  const ping = await request(app, '/ping');
  assert.equal(ping.status,200);
  assert.equal(ping.body,'pong');
  assert.equal(ping.headers['x-content-type-options'],'nosniff');
  const health = await request(app,'/health');
  assert.equal(JSON.parse(health.body).phase,1);
});

test('server returns 503 for a missing build, not an uncaught exception', { skip: !createApp }, async () => {
  const r = await request(createApp('/does-not-exist'),'/not-a-page');
  assert.equal(r.status,503);
});

test('server serves index.html and SPA fallback', { skip: !createApp }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'spacefighter-test-'));
  try {
    fs.writeFileSync(path.join(dir,'index.html'),'<html>hello phase 0</html>');
    const app = createApp(dir);
    const r = await request(app,'/portal');
    assert.equal(r.status,200);
    assert.match(r.body,/hello phase 0/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
