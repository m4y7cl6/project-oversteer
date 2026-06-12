/* NITRO RUSH room server: tiny WebSocket relay with room membership.
 * The first member of a room is the host (only the host can start a race);
 * every other message is relayed to the rest of the room with the sender id.
 *
 *   npm run server          (port 8787, override with PORT env)
 *
 * Deployable to any Node host (Render/Fly/Railway/VPS); the client connects
 * via  ?server=wss://your-host  on the game URL.
 */
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const wss = new WebSocketServer({ port: PORT });

/** room -> Map<id, ws> */
const rooms = new Map();
let nextId = 1;

function roomMembers(room) {
  const m = rooms.get(room);
  if (!m) return [];
  return [...m.entries()].map(([id, ws]) => ({ id, name: ws.nrName }));
}

function broadcast(room, msg, exceptId = null) {
  const m = rooms.get(room);
  if (!m) return;
  const raw = JSON.stringify(msg);
  for (const [id, ws] of m) {
    if (id !== exceptId && ws.readyState === ws.OPEN) ws.send(raw);
  }
}

wss.on('connection', (ws) => {
  ws.nrId = null;
  ws.nrRoom = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.t === 'join' && typeof msg.room === 'string' && !ws.nrRoom) {
      const room = msg.room.slice(0, 16);
      if (!rooms.has(room)) rooms.set(room, new Map());
      const members = rooms.get(room);
      if (members.size >= 8) {
        ws.send(JSON.stringify({ t: 'full' }));
        return;
      }
      ws.nrId = nextId++;
      ws.nrRoom = room;
      ws.nrName = String(msg.name || `P${ws.nrId}`).slice(0, 12);
      members.set(ws.nrId, ws);
      const isHost = members.keys().next().value === ws.nrId;
      ws.send(JSON.stringify({
        t: 'joined', id: ws.nrId, host: isHost, members: roomMembers(room),
      }));
      broadcast(room, { t: 'members', members: roomMembers(room) }, ws.nrId);
      console.log(`[${room}] ${ws.nrName} joined (${members.size} in room)`);
      return;
    }

    if (!ws.nrRoom) return;

    // start: host only
    if (msg.t === 'start') {
      const members = rooms.get(ws.nrRoom);
      if (!members || members.keys().next().value !== ws.nrId) return;
      broadcast(ws.nrRoom, { ...msg, from: ws.nrId });
      console.log(`[${ws.nrRoom}] race start`, msg.track, msg.laps);
      return;
    }

    // everything else (state/finish/...) relays to the rest of the room
    broadcast(ws.nrRoom, { ...msg, from: ws.nrId }, ws.nrId);
  });

  ws.on('close', () => {
    if (!ws.nrRoom) return;
    const members = rooms.get(ws.nrRoom);
    if (!members) return;
    members.delete(ws.nrId);
    console.log(`[${ws.nrRoom}] ${ws.nrName} left (${members.size} in room)`);
    if (members.size === 0) {
      rooms.delete(ws.nrRoom);
    } else {
      broadcast(ws.nrRoom, { t: 'members', members: roomMembers(ws.nrRoom) });
    }
  });
});

console.log(`NITRO RUSH room server listening on :${PORT}`);
