# Emby AutoSkip

[日本語](README.md) | **English**

An unofficial JavaScript extension that automatically skips intros, recaps, openings, and endings in the Emby Web Player.
It uses Emby chapter and intro markers and lets you decide what to play or skip for each title.

**Core v1.13.0** / optional language plugin **v1.0.0** / optional sync plugin **v1.0.5**

[Setup and usage guide (Japanese)](GUIDE.md) · [Changelog (Japanese)](CHANGELOG.md) · [Releases](https://github.com/yagi0013/emby-AutoSkip/releases) · [Report an issue](https://github.com/yagi0013/emby-AutoSkip/issues)

> This is not an official Emby server plugin or DLL. It is an extension for Emby Web. Skipping may not work correctly when a title has missing or inaccurate chapter data. The extension does not analyze video audio.

## Features

- **Match your viewing preferences:** enable or disable intro skipping and set openings and endings to Always play, Play first time only, or Always skip. Per-season and per-series settings are supported.
- **Control playback when needed:** manually skip a section, cancel one automatic skip, undo a recent skip, or temporarily pause AutoSkip.
- **Find supported titles in the library:** an Ⓢ badge marks titles with detectable skip sections. Series and seasons indicate whether all or only some episodes have skip targets. Scanning and badges can be disabled in the settings.
- **See sections while watching:** color-coded seek-bar markers, a countdown, and `Ctrl+←` / `Ctrl+→` chapter navigation.
- **Move your settings:** export and import JSON backups. With your own compatible API, the optional sync plugin can also synchronize encrypted settings.
- **Choose the display language:** the optional language plugin supports Japanese, English, Russian, Spanish, Portuguese, Italian, French, German, Polish, and Ukrainian.

The default configuration enables intro skipping, always skips openings, and always plays endings. First-play history is stored per season, or per series when season information is unavailable.

## Download and installation

| File | Version | Purpose |
| --- | --- | --- |
| [emby-autoskip.js](emby-autoskip.js) | 1.13.0 | Core script with built-in Japanese; works on its own |
| [emby-autoskip-i18n.js](emby-autoskip-i18n.js) | 1.0.0 | Optional plugin providing nine additional languages |
| [emby-autoskip-sync.js](emby-autoskip-sync.js) | 1.0.5 | Optional settings-sync plugin |

Open each required file and save it from GitHub's **Raw** view. No build step is required.

1. **Serve from the Emby server (recommended):** place the JavaScript files in the Emby Web distribution directory and load them from `index.html`. See the [installation guide with backup steps (Japanese)](GUIDE.md#導入方法aembyサーバーから配信推奨).
2. **Tampermonkey (alternative):** when you cannot modify the server files, install each script as a separate userscript. See the [Tampermonkey guide (Japanese)](GUIDE.md#導入方法btampermonkey代替).
3. Open the settings from the tab on the right edge of the screen. The panel is available outside video playback, but season and series settings can only be selected during playback. Do not enable both server-hosted and Tampermonkey copies at the same time.

The core script remains fully usable by itself. To enable language selection, load `emby-autoskip-i18n.js` as an additional script. The default Auto mode detects the browser language, and unsupported languages fall back to English. A manually selected language is saved in `localStorage` and applied without reloading the page.

Settings synchronization requires HTTPS and a [compatible API](SYNC_API.md). This repository does not include an API server implementation or a shared public synchronization service.

## What's new in v1.13.0

The core remains a standalone JavaScript file. Adding the language plugin enables automatic browser-language detection and immediate language switching from the settings panel. Unsupported browser languages fall back to English.

The Common settings section can now be collapsed in the same way as Advanced settings.

When updating, replace the JavaScript files and update the existing script tag's `?v=1.13.0` cache identifier. The [update and recovery guide (Japanese)](GUIDE.md#アップデートロールバック) also explains how to restore the extension after an Emby update.

## Tested environment and limitations

The tested environment is **Ubuntu / Emby Server 4.10.1.0 / Chrome and Brave** using the server-hosted installation with Tampermonkey disabled. Native Emby applications for Android and iOS are not supported.

Detection depends on Emby markers and chapter names. Skipping an ending to the end of a video may also skip post-credit content or a next-episode preview. Future changes to Emby Web may affect compatibility.

## Documentation and support

- [Usage guide (Japanese)](GUIDE.md): installation, settings, synchronization, debugging, updates, and rollback
- [Changelog (Japanese)](CHANGELOG.md): current changes and versioning notes
- [Sync API specification](SYNC_API.md): for users operating their own synchronization API
- [Archived sources and documents](archive/): older versions; new installations should use the JavaScript files in the repository root

When reporting a problem through [GitHub Issues](https://github.com/yagi0013/emby-AutoSkip/issues), include the core, plugin, Emby, and browser versions, your installation method, and reproduction steps. Never post authentication tokens or synchronization codes.

## License

The code and documentation in this repository, including archived material, are released under [CC0 1.0 Universal](LICENSE).

Copyright and related rights are waived to the fullest extent permitted by law. Where a waiver is not recognized, the fallback license terms in CC0 apply. Commercial use, modification, and redistribution are allowed without attribution. The software is provided without warranty.

Third-party rights are not covered. No trademark or patent rights are waived or granted.
