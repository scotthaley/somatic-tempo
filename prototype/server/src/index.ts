import { Server, routePartykitRequest, type Connection, type ConnectionContext } from "partyserver";
import { randomSeed } from "../../src/engine/rng";
import type { ClientMessage } from "../../src/net/protocol";
import { createRoom, onLeave, onMessage, type Effect, type RoomState } from "../../src/net/room";

interface Env {
  DuelRoom: DurableObjectNamespace<DuelRoom>;
  /** Comma-separated origins allowed to open a socket. Empty = allow all. */
  ALLOWED_ORIGINS?: string;
}

const mint = () => ({ matchId: crypto.randomUUID(), seed: randomSeed() });

/**
 * One duel per room. The Durable Object is only a relay: it orders actions and
 * rebroadcasts them, and every rule is evaluated in the browsers. See
 * src/net/room.ts for the protocol, which is tested independently of this file.
 */
export class DuelRoom extends Server<Env> {
  static options = { hibernate: true };

  room!: RoomState;

  async onStart() {
    const saved = await this.ctx.storage.get<RoomState>("room");
    const seeded = mint();
    this.room = saved ?? createRoom(seeded.matchId, seeded.seed);
  }

  private async flush(conn: Connection, effects: Effect[]) {
    await this.ctx.storage.put("room", this.room);
    for (const e of effects) {
      const payload = JSON.stringify(e.msg);
      if (e.to === "all") this.broadcast(payload);
      else if (e.to === "others") this.broadcast(payload, [conn.id]);
      else conn.send(payload);
    }
  }

  async onConnect(conn: Connection, ctx: ConnectionContext) {
    const allowed = this.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);
    const origin = ctx.request.headers.get("Origin");
    if (allowed?.length && origin && !allowed.includes(origin)) {
      conn.close(1008, "Origin not allowed");
    }
  }

  async onMessage(conn: Connection, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    await this.flush(conn, onMessage(this.room, conn.id, msg, mint));
  }

  async onClose(conn: Connection) {
    await this.flush(conn, onLeave(this.room, conn.id));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
