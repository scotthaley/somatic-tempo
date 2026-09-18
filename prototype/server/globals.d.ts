// The card table is loaded from CSV via Vite's ?raw import. The worker never
// evaluates it, but it is reachable through the engine's types.
declare module "*?raw" {
  const content: string;
  export default content;
}
