import type { DuelState, Side } from "../engine/state";
import { chooseCommit } from "./commit";
import { planResolution } from "./plan";

export type AIRequest =
  | { id: number; kind: "commit"; state: DuelState; side: Side }
  | { id: number; kind: "resolve"; state: DuelState; side: Side };

self.onmessage = (e: MessageEvent<AIRequest>) => {
  const { id, kind, state, side } = e.data;
  try {
    const result = kind === "commit" ? chooseCommit(state, side) : planResolution(state, side).actions;
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
