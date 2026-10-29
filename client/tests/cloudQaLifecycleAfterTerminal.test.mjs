import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ignoreQaLifecycleAfterTerminal} from '../src/game/combat/CloudQaLifecyclePolicy.js';

const event=(reason,terminal)=>ignoreQaLifecycleAfterTerminal({reason,terminal});

test('C8/C12: sharing after terminal cannot overwrite audited result',()=>{
  for(const reason of ['hidden','blur','resize']){
    assert.equal(event(reason,true),true,reason);
  }
});

test('C8/C12: active battle still fail-closes on hidden, blur, resize',()=>{
  for(const reason of ['hidden','blur','resize']){
    assert.equal(event(reason,false),false,reason);
  }
});

test('C8/C12: identity loss always fail-closes, even after terminal',()=>{
  assert.equal(event('auth',true),false);
  assert.equal(event('auth',false),false);
});

test('C8/C12: unknown, malformed and absent signals are never ignored',()=>{
  for(const reason of ['abandon','logout','unknown',null,undefined,{}]){
    assert.equal(event(reason,true),false);
  }
  assert.equal(ignoreQaLifecycleAfterTerminal({reason:'blur',terminal:1}),false);
  assert.equal(ignoreQaLifecycleAfterTerminal(),false);
});

test('C8/C12 cockpit wires lifecycle guard before error/abandon',()=>{
  const source=readFileSync(new URL('../src/components/CloudQaAlpha1/index.jsx',import.meta.url),'utf8');
  const block=source.match(/const halt=\(reason='unknown'\)=>\{([\s\S]*?)\n    \};/);
  assert.ok(block,'lifecycle guard block');
  const body=block[1];
  assert.ok(body.indexOf('ignoreQaLifecycleAfterTerminal(')>-1);
  assert.ok(body.indexOf('ignoreQaLifecycleAfterTerminal(')<body.indexOf("setStatus('error')"));
  assert.ok(body.indexOf("setStatus('error')")<body.indexOf('void session.abandon()'));
  assert.match(source,/if\(!user\|\|user\.uid!==expectedUid\)halt\('auth'\)/);
  for(const signal of ['hidden','blur','resize']){
    assert.ok(source.includes(`halt('${signal}')`));
  }
});

test('C8/C12 policy is visual-only and cannot change game/economy authority',()=>{
  const source=readFileSync(new URL('../src/game/combat/CloudQaLifecyclePolicy.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/gameService|wallet|settle|reward|fetch\(|firebase|localStorage|sessionStorage/);
});
