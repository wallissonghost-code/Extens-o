export class GameLiveSource {
  constructor({ endpoint = 'wss://game-f202.onrender.com', WebSocketImpl = globalThis.WebSocket, handshakeTimeoutMs = 12000 } = {}) {
    this.endpoint = endpoint;
    this.WebSocketImpl = WebSocketImpl;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.socket = null;
    this.timer = null;
  }

  connect({ username, onGift = () => {}, onStatus = () => {}, onError = () => {} }) {
    const user = String(username || '').replace(/^@/, '').trim();
    if (!user) throw new Error('Informe o @usuário da live.');
    if (!this.WebSocketImpl) throw new Error('WebSocket indisponível neste navegador.');

    this.disconnect();
    const ws = new this.WebSocketImpl(this.endpoint);
    this.socket = ws;
    let connectSent = false;
    let authSent = false;
    let failed = false;

    const sendConnect = () => {
      if (connectSent || ws !== this.socket) return;
      connectSent = true;
      ws.send(JSON.stringify({ type: 'connect', username: user }));
      onStatus('checking', { username: user });
    };

    const fail = message => {
      if (failed) return;
      failed = true;
      onError(new Error(message));
    };

    this.timer = setTimeout(() => {
      if (ws !== this.socket || connectSent) return;
      fail('O conector não respondeu a tempo. Tente novamente.');
      try { ws.close(); } catch {}
    }, this.handshakeTimeoutMs);

    ws.onopen = () => onStatus('bridge', { status: 'open' });
    ws.onmessage = e => {
      let d;
      try { d = JSON.parse(e.data); } catch { return; }

      if (d.type === 'bridge' && d.status === 'ready') {
        if (d.authRequired) {
          if (!authSent) {
            authSent = true;
            ws.send(JSON.stringify({ type: 'auth', key: '' }));
            onStatus('authenticating');
          }
        } else {
          sendConnect();
        }
        return;
      }

      if (d.type === 'auth') {
        if (!d.ok) {
          fail('Este conector está exigindo chave. O observador público do Game deveria estar sem chave.');
          this.disconnect();
          return;
        }
        sendConnect();
        return;
      }

      if (d.type === 'status') {
        if (d.status === 'connected' || d.status === 'error' || d.status === 'disconnected') {
          clearTimeout(this.timer);
          this.timer = null;
        }
        onStatus(d.status, d);
        return;
      }

      if (d.type === 'gift') {
        onGift(d);
        return;
      }

      if (d.type === 'error') {
        clearTimeout(this.timer);
        this.timer = null;
        fail(d.message || 'Erro no Connector.');
      }
    };

    ws.onerror = () => fail('Falha ao abrir o WebSocket do observador.');
    ws.onclose = () => {
      clearTimeout(this.timer);
      this.timer = null;
      if (ws === this.socket) this.socket = null;
      onStatus('disconnected');
    };
    return ws;
  }

  disconnect() {
    clearTimeout(this.timer);
    this.timer = null;
    const ws = this.socket;
    this.socket = null;
    if (!ws) return;
    try { ws.send(JSON.stringify({ type: 'disconnect' })); } catch {}
    try { ws.close(); } catch {}
  }
}
