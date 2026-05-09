# Server package extraction

Practical reference for a future `packages/server` split from the current `packages/opencode` package.

The local server is now Effect `HttpApi` based inside `packages/opencode`. A future package split should extract that shape without changing runtime behavior at the same time.

## Goal

Create `packages/server` as the home for:

- HTTP contract definitions
- HTTP handler implementations
- OpenAPI generation
- embeddable server APIs for Node apps

The split should stay incremental and should not block on a complete domain-service extraction.

## Target Layout

- `packages/core` owns shared services and Effect-first domain schemas.
- `packages/server` owns server contracts, handlers, middleware composition, and OpenAPI output.
- `packages/cli` owns TUI and CLI entrypoints.
- `packages/sdk` is generated from the server OpenAPI spec and can add higher-level wrappers.
- `packages/plugin` owns generated or hand-written plugin-facing types.

## Current State

- The local server host lives in `packages/opencode/src/server/server.ts`.
- Route contracts and handlers live under `packages/opencode/src/server/routes/instance/httpapi/*`.
- OpenAPI generation is derived from `Server.openapi()` and `cli/cmd/generate.ts`.
- The Effect runtime and app layer are centralized in `src/effect/app-runtime.ts` and `src/effect/run-service.ts`.
- There is no standalone `packages/server` workspace yet on this branch.

## Extraction Strategy

Start `packages/server` as a contract and implementation package only. Move hosting later.

Why:

- Host ownership touches CLI startup, desktop/gui startup, tests, telemetry, auth, CORS, websocket upgrades, and SDK generation.
- Moving host ownership together with contracts would make the first package split too large.
- A contract-first extraction keeps `packages/opencode` as the runtime host while route definitions and handlers become easier to move.

Suggested sequence:

1. Move pure `HttpApi` contracts into `packages/server`.
2. Move handler factories that accept host-provided services and layers.
3. Keep runtime composition in `packages/opencode` while package boundaries settle.
4. Move OpenAPI generation after the route contracts are fully owned by `packages/server`.
5. Move server hosting once shared services are available from `packages/core`.

## Dependency Rule

During the first extraction phase:

- `packages/server` must not import from `packages/opencode`.
- `packages/opencode` may import from `packages/server`.
- `packages/server` may accept host-provided services, layers, callbacks, or placeholder schemas as inputs.

After `packages/core` owns the needed services:

- `packages/server` imports from `packages/core`.
- `packages/cli` imports from `packages/server` and `packages/core`.
- `packages/opencode` shrinks as responsibilities move to dedicated packages.

## Validation

Each extraction step should keep these checks green:

```sh
bun typecheck
bun test test/server/<focused-test>.test.ts
bun --cwd ../sdk/js script/build.ts
```
