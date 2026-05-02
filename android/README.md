# swapl — Android

Kotlin + Jetpack Compose, minSdk 26 (Android 8), targetSdk 34.

## Project setup (one-time)

This folder ships the source tree but no Gradle wrapper. Generate the wrapper
once:

```bash
cd android/swapl
gradle wrapper --gradle-version 8.7
```

Then add `settings.gradle.kts` (already provided) referencing the local
`design-tokens` module that wraps the generated Kotlin file from
`packages/design-tokens/build/kotlin/SwaplTokens.kt`.

The build needs:
- AGP 8.5+
- Compose BOM 2024.10+
- Kotlin 2.0+ with the Compose compiler plugin

## Open in Android Studio

`File → Open → android/swapl`. Sync Gradle, run on the `Pixel 8` and
`Pixel Tablet` emulators.

## Tablet layout

`MainActivity` reads `WindowSizeClass` and switches between a bottom-bar
phone layout and a `NavigationSuiteScaffold` (rail + detail) tablet layout.

## Local dev backend

In `local.properties` (gitignored), set:

```
swapl.api.base.url=http://10.0.2.2:3000
```

(`10.0.2.2` is the host loopback from the Android emulator — points to
`http://localhost:3000` running `next dev`.)
