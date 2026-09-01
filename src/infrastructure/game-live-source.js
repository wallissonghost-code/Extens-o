export class GameLiveSource {
  constructor({ endpoint = 'wss://game-f202.onrender.com', WebSocketImpl = globalThis.WebSocket, bridgeTimeoutMs = 15000, liveTimeoutMs = 45000, heartbeatMs = 10000, reconnectDelaysMs = [1000, 3000, 7000] } = {}) {
    this.endpoint = endpoint;
    this.WebSocketImpl = WebSocketImpl;
    this.bridgeTimeoutMs = bridgeTimeoutMs;
    this.liveTimeoutMs = liveTimeoutMs;
    this.heartbeatMs = heartbeatMs;
    this.reconnectDelaysMs = reconnectDelaysMs;
    this.socket = null;
    this.timer = null;
    this.heartbeat = null;
    this.reconnectTimer = null;
    this.manual = true;
    this.generation = 0;
    this.reconnectAttempt = 0;
    this.current = null;
  }

  connect(options = {}) {
    const user = String(options.username || '').replace(/^@/, '').trim();
    if (!user) throw new Error('Informe o @usuário da live.');
    if (!this.WebSocketImpl) throw new Error('WebSocket indisponível neste navegador.');
    this.disconnect();
    this.manual = false;
    this.reconnectAttempt = 0;
    this.current = { ...options, username: user };
    return this.#open(false);
  }

  #open(isReconnect) {
    const opts = this.current;
    if (!opts || this.manual) return null;
    const { username: user, onGift = () => {}, onActivity = () => {}, onStatus = () => {}, onError = () => {}, onPacket = () => {} } = opts;
    const gen = ++this.generation;
    const ws = new this.WebSocketImpl(this.endpoint);
    this.socket = ws;
    let observeSent = false;
    let settled = false;

    const clearTimer = () => { clearTimeout(this.timer); this.timer = null; };
    const armTimer = (ms, phase) => {
      clearTimer();
      this.timer = setTimeout(() => {
        if (this.manual || gen !== this.generation || ws !== this.socket || settled) return;
        const message = phase === 'bridge' ? 'O Connector não respondeu a tempo.' : 'A Live demorou demais para responder. Tente novamente.';
        onError(new Error(message));
        try { ws.close(); } catch {}
      }, ms);
    };
    const send = payload => { try { ws.send(JSON.stringify(payload)); return true; } catch { return false; } };
    const startHeartbeat = () => {
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (!this.manual && gen === this.generation && ws === this.socket) send({ type: 'ping' });
      }, this.heartbeatMs);
    };
    const sendObserve = () => {
      if (observeSent || this.manual || gen !== this.generation || ws !== this.socket) return;
      observeSent = true;
      send({ type: 'public_observe', username: user });
      onStatus('checking', { username: user, publicObserver: true });
      armTimer(this.liveTimeoutMs, 'live');
    };

    armTimer(this.bridgeTimeoutMs, 'bridge');
    if (isReconnect) onStatus('reconnecting', { attempt: this.reconnectAttempt, reason: 'websocket' });

    ws.onopen = () => {
      if (gen !== this.generation) return;
      onStatus('bridge', { status: 'open', endpoint: this.endpoint });
      startHeartbeat();
    };

    ws.onmessage = e => {
      if (gen !== this.generation) return;
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
        if (st === 'checking' || st === 'reconnecting') armTimer(this.liveTimeoutMs, 'live');
        if (['connected', 'offline', 'error'].includes(st)) {
          settled = true;
          clearTimer();
          if (st === 'connected') this.reconnectAttempt = 0;
        }
        onStatus(d.status, d);
        return;
      }
      if (['gift', 'like', 'chat', 'follow', 'share'].includes(d.type)) {
        settled = true;
        clearTimer();
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
        settled = true;
        clearTimer();
        onError(new Error(String(d.message || 'Erro no Connector.')));
      }
    };

    ws.onerror = () => {
      if (gen !== this.generation || this.manual) return;
      onStatus('transport-error', { reason: 'websocket' });
    };
    ws.onclose = e => {
      if (gen !== this.generation) return;
      clearTimer();
      clearInterval(this.heartbeat);
      this.heartbeat = null;
      if (ws === this.socket) this.socket = null;
      if (this.manual) {
        onStatus('disconnected', { reason: 'manual', code: e?.code || 0 });
        return;
      }
      const next = this.reconnectAttempt + 1;
      if (next > this.reconnectDelaysMs.length) {
        onStatus('disconnected', { reason: 'websocket', code: e?.code || 0, recoveryExhausted: true, attempt: this.reconnectAttempt });
        onError(new Error('Connector desconectado. Reconexão automática esgotada.'));
        return;
      }
      this.reconnectAttempt = next;
      const delay = this.reconnectDelaysMs[next - 1];
      onStatus('reconnecting', { reason: 'websocket', attempt: next, maxAttempts: this.reconnectDelaysMs.length, delay });
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.manual && gen === this.generation) this.#open(true);
      }, delay);
    };
    return ws;
  }

  disconnect() {
    this.manual = true;
    this.generation += 1;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    clearTimeout(this.reconnectTimer);
    this.timer = null;
    this.heartbeat = null;
    this.reconnectTimer = null;
    const ws = this.socket;
    this.socket = null;
    this.current = null;
    if (!ws) return;
    try { ws.send(JSON.stringify({ type: 'disconnect' })); } catch {}
    try { ws.close(); } catch {}
  }
}
