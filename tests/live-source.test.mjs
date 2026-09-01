import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLiveSource } from '../src/infrastructure/game-live-source.js';

class FakeWS {
  constructor(url) { this.url=url; this.sent=[]; FakeWS.last=this; }
  send(v) { this.sent.push(JSON.parse(v)); }
  close() { this.closed=true; this.onclose?.({code:1000}); }
}

test('fluxo atual do Game: bridge sem auth -> connect por @usuario',()=>{
  const src=new GameLiveSource({WebSocketImpl:FakeWS,endpoint:'ws://x',handshakeTimeoutMs:1000,heartbeatMs:999999});
  src.connect({username:'@abc'});
  const ws=FakeWS.last;
  ws.onopen();
  assert.equal(ws.sent.length,0);
  ws.onmessage({data:JSON.stringify({type:'bridge',status:'ready',authRequired:false})});
  assert.deepEqual(ws.sent[0],{type:'connect',username:'abc'});
  src.disconnect();
});

test('compatibilidade: bridge com auth continua explicitamente tratado',()=>{
  const src=new GameLiveSource({WebSocketImpl:FakeWS,endpoint:'ws://x',handshakeTimeoutMs:1000,heartbeatMs:999999});
  src.connect({username:'abc'});
  const ws=FakeWS.last;
  ws.onmessage({data:JSON.stringify({type:'bridge',status:'ready',authRequired:true})});
  assert.deepEqual(ws.sent[0],{type:'auth',key:''});
  ws.onmessage({data:JSON.stringify({type:'auth',ok:true})});
  assert.deepEqual(ws.sent[1],{type:'connect',username:'abc'});
  src.disconnect();
});

test('gift alimenta callbacks de atividade e presente',()=>{
  let gift=null,activity=null;
  const src=new GameLiveSource({WebSocketImpl:FakeWS,endpoint:'ws://x',handshakeTimeoutMs:1000,heartbeatMs:999999});
  src.connect({username:'abc',onGift:d=>gift=d,onActivity:(kind,d)=>activity={kind,d}});
  const ws=FakeWS.last;
  ws.onmessage({data:JSON.stringify({type:'gift',giftId:5655,gift:'Rose',diamondCount:1})});
  assert.equal(gift.giftId,5655);
  assert.equal(activity.kind,'gift');
  assert.equal(activity.d.gift,'Rose');
  src.disconnect();
});

test('status offline do Connector chega intacto para a UI',()=>{
  let status=null,detail=null;
  const src=new GameLiveSource({WebSocketImpl:FakeWS,endpoint:'ws://x',handshakeTimeoutMs:1000,heartbeatMs:999999});
  src.connect({username:'abc',onStatus:(s,d)=>{status=s;detail=d}});
  const ws=FakeWS.last;
  ws.onmessage({data:JSON.stringify({type:'status',status:'offline',username:'abc',reason:'TikTok informou Live offline'})});
  assert.equal(status,'offline');
  assert.equal(detail.reason,'TikTok informou Live offline');
  src.disconnect();
});
