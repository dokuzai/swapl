# @swapl/api-spec

The single source of truth for the Swapl API. `openapi.yaml` describes every
endpoint the web, iOS, and Android clients call; each platform **generates** its
DTOs from it so the three hand-written model sets stop drifting.

Architecture is server-authoritative: all clients call the one Next.js API,
which owns the single Postgres database. There is no client-side sync engine.

## TypeScript (web)

```bash
pnpm --filter @swapl/api-spec gen:ts
```

Emits `generated/ts/schema.d.ts` (via [`openapi-typescript`](https://github.com/openapi-ts/openapi-typescript)).
Import `paths` / `components` from it in the Next.js app.

## Swift (iOS)

Generated with Apple's
[`swift-openapi-generator`](https://github.com/apple/swift-openapi-generator)
as an SPM build plugin. Add the plugin + an `openapi-generator-config.yaml`
(`generate: [types, client]`) to the iOS target and point it at this
`openapi.yaml`. The plugin regenerates types at build time — nothing is
committed into the iOS source tree.

## Kotlin (Android — follow-up)

Generated with
[`openapi-generator`](https://openapi-generator.tech/) (`-g kotlin`,
`library=jvm-ktor`, `serializationLibrary=kotlinx_serialization`). Wired as a
Gradle task in a later phase (Android is scheduled after iOS + backend).

## Keeping it honest

The schemas mirror the client DTOs that already decode the live API today, so
adopting the generated types should be a drop-in. When an endpoint changes,
update `openapi.yaml` first, then regenerate per platform.
