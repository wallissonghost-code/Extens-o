import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLiveSource } from '../src/infrastructure/game-live-source.js';

class FakeWS {
  constructor(url) { this.url=url; this.sent=[]; FakeWS.last=this; }
  send(v) { this.sent.push(JSON.parse(v)); }
  close() { this.closed=true; this.onclose?.({code:1000}); }
}

test('bridge do Game -> public_observe somente com @usuario',()=>{
  const src=new GameLiveSource({WebSocketImpl:FakeWS,endpoint:'ws://x',handshakeTimeoutMs:1000,heartbeatMs:999999});
  src.connect({username:'@abc'});
  const ws=FakeWS.last;
  ws.onopen();
  assert.equal(ws.sent.length,0);
  ws.onmessage({data:JSON.stringify({type:'bridge',status:'ready',authRequired:true,publicObserver:true})});
  assert.deepEqual(ws.sent[0],{type:'public_observe',username:'abc'});
  src.disconnect();
});

test('public_observe independe de authRequired=false',()=>{
  const src=new GameLiveSource({WebSocketImpl:FakeWS,endpoint:'ws://x',handshakeTimeoutMs:1000,heartbeatMs:999999});
  src.connect({username:'abc'});
  const ws=FakeWS.last;
  ws.onmessage({data:JSON.stringify({type:'bridge',status:'ready',authRequired:false,publicObserver:true})});
  assert.deepEqual(ws.sent[0],{type:'public_observe',username:'abc'});
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
  ws.onmessage({data:JSON.stringify({type:'status',status:'offline',username:'abc',reason:'TikTok informou que esta conta não está ao vivo.'})});
  assert.equal(status,'offline');
  assert.equal(detail.reason,'TikTok informou que esta conta não está ao vivo.');
  src.disconnect();
});
