import type { Action, DuelState, Side } from "../engine/state";
import { chooseCommit } from "./commit";
import { planResolution } from "./plan";
import type { AIRequest } from "./worker";

type Pending = { req: AIRequest; resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function runInline(req: AIRequest): unknown {
  return req.kind === "commit" ? chooseCommit(req.state, req.side) : planResolution(req.state, req.side).actions;
}

/** If the worker can't load (e.g. a webview that blocks module workers), finish on the main thread. */
function fallBack(reason: unknown) {
  if (!workerBroken) console.warn("AI worker unavailable, running AI on the main thread", reason);
  workerBroken = true;
  worker = null;
  for (const [id, p] of pending) {
    pending.delete(id);
    try {
      p.resolve(runInline(p.req));
    } catch (err) {
      p.reject(err as Error);
    }
  }
}

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      fallBack(err);
      return null;
    }
    worker.onerror = (e) => fallBack(e.message);
    worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const p = pending.get(id);
      pending.delete(id);
      if (error) p?.reject(new Error(error));
      else p?.resolve(result);
    };
  }
  return worker;
}

function ask<T>(kind: AIRequest["kind"], full: DuelState, side: Side): Promise<T> {
  // Events and records are irrelevant to the AI; strip them to keep messages small.
  const state: DuelState = { ...full, events: [], turns: [] };
  const req: AIRequest = { id: nextId++, kind, state, side };
  return new Promise<T>((resolve, reject) => {
    const w = getWorker();
    if (!w) {
      // Yield a frame so the UI can paint before the synchronous search.
      setTimeout(() => {
        try {
          resolve(runInline(req) as T);
        } catch (err) {
          reject(err as Error);
        }
      }, 16);
      return;
    }
    pending.set(req.id, { req, resolve: resolve as (v: unknown) => void, reject });
    w.postMessage(req);
  });
}

export const aiCommit = (state: DuelState, side: Side) => ask<[number, number]>("commit", state, side);
export const aiResolve = (state: DuelState, side: Side) => ask<Action[]>("resolve", state, side);
