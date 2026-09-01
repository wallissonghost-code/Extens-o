import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLiveSource } from '../src/infrastructure/game-live-source.js';

class FakeWS {
  constructor(url) { this.url=url; this.sent=[]; FakeWS.last=this; }
  send(v) { this.sent.push(JSON.parse(v)); }
  close() { this.closed=true; this.onclose?.(); }
}

test('fluxo atual do Game: bridge sem auth -> connect por @usuario',()=>{
  const src=new GameLiveSource({WebSocketImpl:FakeWS,endpoint:'ws://x',handshakeTimeoutMs:1000});
  src.connect({username:'@abc'});
  const ws=FakeWS.last;
  ws.onopen();
  assert.equal(ws.sent.length,0);
  ws.onmessage({data:JSON.stringify({type:'bridge',status:'ready',authRequired:false})});
  assert.deepEqual(ws.sent[0],{type:'connect',username:'abc'});
  src.disconnect();
});

test('compatibilidade: se bridge exigir auth, tenta auth vazio e só conecta após ok',()=>{
  const src=new GameLiveSource({WebSocketImpl:FakeWS,endpoint:'ws://x',handshakeTimeoutMs:1000});
  src.connect({username:'abc'});
  const ws=FakeWS.last;
  ws.onmessage({data:JSON.stringify({type:'bridge',status:'ready',authRequired:true})});
  assert.deepEqual(ws.sent[0],{type:'auth',key:''});
  ws.onmessage({data:JSON.stringify({type:'auth',ok:true})});
  assert.deepEqual(ws.sent[1],{type:'connect',username:'abc'});
  src.disconnect();
});

test('presente recebido é encaminhado ao callback',()=>{
  let gift=null;
  const src=new GameLiveSource({WebSocketImpl:FakeWS,endpoint:'ws://x',handshakeTimeoutMs:1000});
  src.connect({username:'abc',onGift:d=>gift=d});
  const ws=FakeWS.last;
  ws.onmessage({data:JSON.stringify({type:'gift',giftId:5655,gift:'Rose',diamondCount:1})});
  assert.equal(gift.giftId,5655);
  src.disconnect();
});
