import { Auth } from "@/auth"
import { ProviderID } from "@/provider/schema"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { described } from "./metadata"

const AuthParams = Schema.Struct({
  providerID: ProviderID,
})

const AuthMoveParams = Schema.Struct({
  providerID: ProviderID,
  targetProviderID: ProviderID,
})

const AuthStatus = Schema.Struct({
  stored: Schema.Boolean,
  type: Schema.String,
})

const AuthStatuses = Schema.Record(Schema.String, AuthStatus)

const LogQuery = Schema.Struct({
  directory: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
})

export const LogInput = Schema.Struct({
  service: Schema.String.annotate({ description: "Service name for the log entry" }),
  level: Schema.Union([
    Schema.Literal("debug"),
    Schema.Literal("info"),
    Schema.Literal("error"),
    Schema.Literal("warn"),
  ]).annotate({ description: "Log level" }),
  message: Schema.String.annotate({ description: "Log message" }),
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)).annotate({
    description: "Additional metadata for the log entry",
  }),
})

export const ControlPaths = {
  authList: "/auth",
  auth: "/auth/:providerID",
  authMove: "/auth/:providerID/move/:targetProviderID",
  log: "/log",
} as const

export const ControlApi = HttpApi.make("control").add(
  HttpApiGroup.make("control")
    .add(
      HttpApiEndpoint.get("authList", ControlPaths.authList, {
        success: described(AuthStatuses, "Stored auth status by provider"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "auth.list",
          summary: "List auth status",
          description: "List provider auth records without returning credentials.",
        }),
      ),
      HttpApiEndpoint.put("authSet", ControlPaths.auth, {
        params: AuthParams,
        payload: Auth.Info,
        success: described(Schema.Boolean, "Successfully set authentication credentials"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "auth.set",
          summary: "Set auth credentials",
          description: "Set authentication credentials",
        }),
      ),
      HttpApiEndpoint.post("authMove", ControlPaths.authMove, {
        params: AuthMoveParams,
        success: described(Schema.Boolean, "Successfully moved authentication credentials"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "auth.move",
          summary: "Move auth credentials",
          description: "Move authentication credentials between provider IDs without returning credentials.",
        }),
      ),
      HttpApiEndpoint.delete("authRemove", ControlPaths.auth, {
        params: AuthParams,
        success: described(Schema.Boolean, "Successfully removed authentication credentials"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "auth.remove",
          summary: "Remove auth credentials",
          description: "Remove authentication credentials",
        }),
      ),
      HttpApiEndpoint.post("log", ControlPaths.log, {
        query: LogQuery,
        payload: LogInput,
        success: described(Schema.Boolean, "Log entry written successfully"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "app.log",
          summary: "Write log",
          description: "Write a log entry to the server logs with specified level and metadata.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "control", description: "Control plane routes." })),
)
