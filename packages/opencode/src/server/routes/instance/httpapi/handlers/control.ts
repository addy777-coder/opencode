import { Auth } from "@/auth"
import { ProviderID } from "@/provider/schema"
import * as Log from "@opencode-ai/core/util/log"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { RootHttpApi } from "../api"
import { LogInput } from "../groups/control"

export const controlHandlers = HttpApiBuilder.group(RootHttpApi, "control", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service

    const authList = Effect.fn("ControlHttpApi.authList")(function* () {
      const all = yield* auth.all().pipe(Effect.orDie)
      return Object.fromEntries(
        Object.entries(all).map(([providerID, info]) => [
          providerID,
          {
            stored: true,
            type: info.type,
          },
        ]),
      )
    })

    const authSet = Effect.fn("ControlHttpApi.authSet")(function* (ctx: {
      params: { providerID: ProviderID }
      payload: Auth.Info
    }) {
      yield* auth.set(ctx.params.providerID, ctx.payload).pipe(Effect.orDie)
      return true
    })

    const authMove = Effect.fn("ControlHttpApi.authMove")(function* (ctx: {
      params: { providerID: ProviderID; targetProviderID: ProviderID }
    }) {
      if (ctx.params.providerID === ctx.params.targetProviderID) return true
      const existing = yield* auth.get(ctx.params.providerID).pipe(Effect.orDie)
      if (!existing) return false
      yield* auth.set(ctx.params.targetProviderID, existing).pipe(Effect.orDie)
      yield* auth.remove(ctx.params.providerID).pipe(Effect.orDie)
      return true
    })

    const authRemove = Effect.fn("ControlHttpApi.authRemove")(function* (ctx: { params: { providerID: ProviderID } }) {
      yield* auth.remove(ctx.params.providerID).pipe(Effect.orDie)
      return true
    })

    const log = Effect.fn("ControlHttpApi.log")(function* (ctx: { payload: typeof LogInput.Type }) {
      const logger = Log.create({ service: ctx.payload.service })
      logger[ctx.payload.level](ctx.payload.message, ctx.payload.extra)
      return true
    })

    return handlers
      .handle("authList", authList)
      .handle("authSet", authSet)
      .handle("authMove", authMove)
      .handle("authRemove", authRemove)
      .handle("log", log)
  }),
)
