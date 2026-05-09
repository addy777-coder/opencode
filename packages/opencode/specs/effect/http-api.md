# HttpApi server

Current reference for the local opencode server hosted by `packages/opencode`.

## Current State

- `src/server/server.ts` builds the local server from the Effect `HttpApi` route tree.
- `src/server/routes/instance/httpapi/*` owns route contracts, route handlers, route-level middleware, raw transport helpers, and the public OpenAPI surface.
- `Server.Default()` returns the Effect web handler used by in-process tests and local callers.
- `Server.listen()` runs the same route tree on the native Effect HTTP listener so PTY websocket upgrades, SSE, workspace routing, CORS, auth, and UI fallback behavior all share one backend path.
- `Server.openapi()` derives SDK input from `OpenApi.fromApi(PublicApi)`.
- The SDK build script runs `bun dev generate` and no longer selects between multiple OpenAPI sources.

## Ownership

- JSON routes should be modeled as `HttpApiGroup` definitions plus handlers in the matching `groups/*` and `handlers/*` modules.
- Routes that need raw transport control, such as SSE or websocket upgrades, should live beside the HttpApi groups and be composed by `httpapi/server.ts`.
- Shared runtime concerns belong in route middleware or server composition layers, not in individual handlers.
- Instance context comes from `InstanceState` and the directory/workspace headers handled by the server layer.
- Public SDK compatibility normalization belongs in `httpapi/public.ts`.

## Change Rules

1. Preserve runtime behavior unless the change is intentionally user-facing.
2. Keep Effect Schema as the route DTO source of truth.
3. Reuse existing services rather than re-architecting service logic at the HTTP boundary.
4. Add focused tests for auth, instance selection, status codes, headers, side effects, and transport behavior when touching a route.
5. Regenerate the SDK after schema or OpenAPI-affecting changes and review the generated diff.
6. Prefer raw Effect HTTP helpers over contorting streaming, SSE, or websocket behavior into `HttpApi` when the route needs lower-level control.

## Validation

For server changes, run:

```sh
bun typecheck
bun test test/server/<focused-test>.test.ts
```

For OpenAPI or SDK changes, also run:

```sh
bun --cwd ../sdk/js script/build.ts
```
