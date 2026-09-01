export class GameLiveSource {
  constructor({ endpoint = 'wss://game-f202.onrender.com', WebSocketImpl = globalThis.WebSocket } = {}) { this.endpoint = endpoint; this.WebSocketImpl = WebSocketImpl; this.socket = null; }
  connect({ username, key = '', onGift = () => {}, onStatus = () => {}, onError = () => {} }) {
    const user = String(username || '').replace(/^@/, '').trim();
    if (!user) throw new Error('Informe o @usuário da live.');
    if (!this.WebSocketImpl) throw new Error('WebSocket indisponível neste navegador.');
    this.disconnect(); const ws = new this.WebSocketImpl(this.endpoint); this.socket = ws;
    ws.onopen = () => { onStatus('authenticating'); ws.send(JSON.stringify({ type: 'auth', key: String(key || '') })); };
    ws.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d.type === 'auth') { if (!d.ok) { onError(new Error('Chave inválida.')); this.disconnect(); return; } ws.send(JSON.stringify({ type: 'connect', username: user })); }
      else if (d.type === 'status') onStatus(d.status, d); else if (d.type === 'gift') onGift(d); else if (d.type === 'error') onError(new Error(d.message || 'Erro no Connector.'));
    };
    ws.onerror = () => onError(new Error('Falha no WebSocket.')); ws.onclose = () => onStatus('disconnected'); return ws;
  }
  disconnect() { if (!this.socket) return; try { this.socket.send(JSON.stringify({ type: 'disconnect' })); } catch {} try { this.socket.close(); } catch {} this.socket = null; }
}
