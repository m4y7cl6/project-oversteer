/** Messages exchanged with the room server (JSON over WebSocket). */

export interface NetMember {
  id: number;
  name: string;
}

/** Compact kart pose+state broadcast ~12 Hz. */
export interface NetKartState {
  p: [number, number, number];
  q: [number, number, number, number];
  /** forward speed m/s (wheel spin / effects on remotes) */
  s: number;
  drift: boolean;
  boost: boolean;
  /** ranking score from local Progress */
  score: number;
  finished: boolean;
  finishTime: number;
}

export interface NetStartConfig {
  track: string;
  laps: number;
}

export interface NetCallbacks {
  onJoined?(selfId: number, host: boolean, members: NetMember[]): void;
  onMembers?(members: NetMember[]): void;
  onStart?(config: NetStartConfig): void;
  onState?(fromId: number, state: NetKartState): void;
  onError?(reason: string): void;
}

/**
 * Thin client for the room server: join a room, relay kart state, receive
 * peers' state. The first joiner is host and the only one who can start.
 */
export class NetClient {
  selfId = 0;
  isHost = false;
  members: NetMember[] = [];
  connected = false;

  private ws?: WebSocket;

  constructor(
    public readonly serverUrl: string,
    public readonly room: string,
    public readonly name: string,
    private cb: NetCallbacks,
  ) {}

  connect(): void {
    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch {
      this.cb.onError?.('bad server url');
      return;
    }
    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({ t: 'join', room: this.room, name: this.name }));
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.cb.onError?.('disconnected');
    };
    this.ws.onerror = () => {
      this.connected = false;
      this.cb.onError?.('connection failed');
    };
    this.ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'joined':
          this.connected = true;
          this.selfId = msg.id as number;
          this.isHost = msg.host as boolean;
          this.members = msg.members as NetMember[];
          this.cb.onJoined?.(this.selfId, this.isHost, this.members);
          break;
        case 'members': {
          this.members = msg.members as NetMember[];
          // host may change if the previous host left
          this.isHost = this.members[0]?.id === this.selfId;
          this.cb.onMembers?.(this.members);
          break;
        }
        case 'full':
          this.cb.onError?.('room full');
          break;
        case 'start':
          this.cb.onStart?.({ track: msg.track as string, laps: msg.laps as number });
          break;
        case 'state':
          this.cb.onState?.(msg.from as number, msg.state as NetKartState);
          break;
      }
    };
  }

  sendStart(config: NetStartConfig): void {
    if (this.isHost) this.send({ t: 'start', ...config });
  }

  sendState(state: NetKartState): void {
    this.send({ t: 'state', state });
  }

  disconnect(): void {
    this.ws?.close();
    this.connected = false;
  }

  /** Grid slot for a member: order of the members array (stable join order). */
  slotOf(id: number): number {
    const i = this.members.findIndex((m) => m.id === id);
    return i < 0 ? 0 : i;
  }

  private send(obj: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}
