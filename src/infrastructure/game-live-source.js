export class GameLiveSource {
  constructor({ endpoint = 'wss://game-f202.onrender.com', WebSocketImpl = globalThis.WebSocket, handshakeTimeoutMs = 15000, heartbeatMs = 10000 } = {}) {
    this.endpoint = endpoint;
    this.WebSocketImpl = WebSocketImpl;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.heartbeatMs = heartbeatMs;
    this.socket = null;
    this.timer = null;
    this.heartbeat = null;
  }

  connect({ username, onGift = () => {}, onActivity = () => {}, onStatus = () => {}, onError = () => {}, onPacket = () => {} }) {
    const user = String(username || '').replace(/^@/, '').trim();
    if (!user) throw new Error('Informe o @usuário da live.');
    if (!this.WebSocketImpl) throw new Error('WebSocket indisponível neste navegador.');

    this.disconnect();
    const ws = new this.WebSocketImpl(this.endpoint);
    this.socket = ws;
    let observeSent = false;
    let failed = false;

    const send = payload => { try { ws.send(JSON.stringify(payload)); return true; } catch { return false; } };
    const startHeartbeat = () => {
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => { if (ws === this.socket) send({ type: 'ping' }); }, this.heartbeatMs);
    };
    const sendObserve = () => {
      if (observeSent || ws !== this.socket) return;
      observeSent = true;
      send({ type: 'public_observe', username: user });
      onStatus('checking', { username: user, publicObserver: true });
    };
    const fail = message => {
      if (failed) return;
      failed = true;
      onError(new Error(message));
    };

    this.timer = setTimeout(() => {
      if (ws !== this.socket) return;
      fail(observeSent ? 'A Live não respondeu a tempo.' : 'O Connector não respondeu a tempo.');
      try { ws.close(); } catch {}
    }, this.handshakeTimeoutMs);

    ws.onopen = () => {
      onStatus('bridge', { status: 'open', endpoint: this.endpoint });
      startHeartbeat();
    };

    ws.onmessage = e => {
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      onPacket(d);

      if (d.type === 'bridge' && d.status === 'ready') {
        onStatus('bridge-ready', d);
        sendObserve();
        return;
      }

      if (d.type === 'pong') {
        onStatus('heartbeat', d);
        return;
      }

      if (d.type === 'status') {
        const st = String(d.status || '').toLowerCase();
        if (['connected','error','offline'].includes(st)) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        onStatus(d.status, d);
        return;
      }

      if (['gift','like','chat','follow','share'].includes(d.type)) {
        onActivity(d.type, d);
        if (d.type === 'gift') onGift(d);
        return;
      }

      if (d.type === 'debug') {
        const ev = String(d.event || '');
        const match = ev.match(/^(GIFT|LIKE|CHAT|FOLLOW|SHARE) RECEBIDO/i);
        if (match) onStatus('debug-activity', { ...d, activity: match[1].toLowerCase() });
        return;
      }

      if (d.type === 'error') {
        clearTimeout(this.timer);
        this.timer = null;
        const msg = String(d.message || 'Erro no Connector.');
        if (/chave do caos connector inválida/i.test(msg)) {
          fail('O servidor do Game ainda não publicou o observador público. Aguarde o deploy e tente novamente.');
        } else {
          fail(msg);
        }
      }
    };

    ws.onerror = () => fail('Falha ao abrir o WebSocket do observador.');
    ws.onclose = e => {
      clearTimeout(this.timer);
      clearInterval(this.heartbeat);
      this.timer = null;
      this.heartbeat = null;
      if (ws === this.socket) this.socket = null;
      onStatus('disconnected', { reason: 'websocket', code: e?.code || 0 });
    };
    return ws;
  }

  disconnect() {
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    this.timer = null;
    this.heartbeat = null;
    const ws = this.socket;
    this.socket = null;
    if (!ws) return;
    try { ws.send(JSON.stringify({ type: 'disconnect' })); } catch {}
    try { ws.close(); } catch {}
  }
}
