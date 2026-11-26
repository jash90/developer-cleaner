# SITE_NOTES — analiza repozytorium pod stronę GitHub Pages

Źródło treści dla strony w `site/`. Wszystko poniżej wynika z kodu i README w tym repo (stan: v1.8.0, commit `61386b3`).

## Czym jest aplikacja

**Developer Cleaner** — desktopowa aplikacja (Windows, macOS, Linux), która odzyskuje miejsce na dysku po czterech rodzajach śmieci deweloperskich:

1. folderach `node_modules` w projektach (`scan_for_node_modules`, `delete_folders` — `src-tauri/src/commands.rs`),
2. folderach buildów w projektach: Cargo `target`, CocoaPods `Pods`, `.next`, `.nx`, `.turbo`, androidowe `.cxx`, `coverage`, `.expo` (znajduje je ten sam przebieg `scan_for_node_modules` jako `build_artifacts`; usuwa `delete_build_artifacts` — `src-tauri/src/build_artifacts.rs`). Folder jest oferowany tylko przy znacznikach narzędzia obok i w środku (np. `Cargo.toml` + `CACHEDIR.TAG`, `Podfile` + `Manifest.lock`) i gdy Git nic w nim nie śledzi; sprawdzenie powtarza się przed usunięciem,
3. zmergowanych Git worktree (`scan_for_merged_worktrees`, `delete_merged_worktrees` — `src-tauri/src/git_worktrees.rs`),
4. współdzielonych cache'ach narzędzi poza projektami (`scan_for_dev_caches`, `clean_dev_caches` — `src-tauri/src/dev_caches.rs`).

Problem: te foldery rosną niepostrzeżenie do dziesiątek GB, a naiwne liczenie rozmiaru kłamie (hardlinki pnpm/bun, pliki rzadkie, pliki wyrzucone do iCloud).

## Odbiorca strony

Developerzy JavaScript/TypeScript (i szerzej: każdy, kto trzyma dużo repozytoriów, używa `git worktree`, pnpm, bun, uv, Gradle, nvm). Wniosek z: charakteru narzędzia, języka README (techniczny, szczegółowy), braku jakichkolwiek treści „produktowych”. Ton strony: konkretny i techniczny.

## Typ projektu i stack

- Typ: aplikacja desktopowa (Tauri 2).
- Frontend: React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4 (`package.json`).
- Backend: Rust (Rayon do równoległego skanowania, `src-tauri/Cargo.toml`), wtyczki Tauri: dialog, fs, shell.
- Brak bazy danych, brak zewnętrznego API, brak zmiennych środowiskowych wymaganych do działania (tylko `TAURI_PLATFORM`/`TAURI_DEBUG` przy buildzie).
- Uruchomienie lokalne: `npm install` → `npm run tauri dev`; build: `npm run tauri build` (README). Wymagania: Node 18+, Rust stable, narzędzia systemowe per platforma (README → Prerequisites).
- Wydania: `.github/workflows/release.yml` buduje instalatory `.dmg` (Apple Silicon + Intel), `.msi`, `.deb`/`.AppImage` z tagów `v*` i publikuje w GitHub Releases.

## Główne funkcje (z kodu)

| Funkcja | Gdzie w kodzie |
|---|---|
| Równoległe skanowanie wybranego folderu (Rayon) | `commands.rs` |
| Rozmiar „do odzyskania” vs nominalny (hardlinki, sparse, iCloud) | `fs_size.rs`, `FolderList.tsx`, `CacheList.tsx` |
| Wykrywanie menedżera pakietów po lockfile (npm/yarn/pnpm/bun) | `commands.rs`, `FolderList.tsx` (badge) |
| Wykrywanie technologii z `package.json` (top packages) | `commands.rs`, `FolderList.tsx` |
| Sortowanie po nazwie, rozmiarze, menedżerze | `SortControls.tsx`, `useNodeModules.ts` |
| Foldery buildów: grupy per narzędzie, każda z własnym polem wyboru i opisem kosztu usunięcia; „Select All” w `node_modules` ich nie zaznacza | `build_artifacts.rs`, `BuildArtifactList.tsx`, `useBuildArtifacts.ts` |
| Zmergowane worktree: porównanie z `origin/HEAD`, `main`, `master`, `development`, `develop`; wykrywanie squash merge; brudne da się zaznaczyć (od 1.6.0), zablokowanych nie; wpisy „stale” czyszczone `git worktree prune`; gałęzie zostają | `git_worktrees.rs`, `WorktreeList.tsx` |
| Cache deweloperskie: npm (`_cacache`, `_npx`), pnpm (aktywny store → `pnpm store prune`, porzucone store'y), bun, yarn (Berry i Classic), uv (`uv cache prune`), Gradle (stare wersje), puppeteer (stare buildy), nvm (stare wersje Node), logi Homebrew (opróżniane w miejscu) | `dev_caches.rs`, `CacheList.tsx` |
| „Select safe” — zaznacza tylko cele oznaczone jako bezpieczne | `useDevCaches.ts` |
| Jedno „Remove Selected” dla wszystkich czterech kategorii, łącznie z cache (od 1.7.0); wspólne potwierdzenie z podsumowaniem; brudne worktree wymagają zaznaczenia zgody na utratę zmian, zanim przycisk się odblokuje (1.8.0) | `ConfirmDialog.tsx`, `App.tsx`, `useCleanup.ts` |
| Tryb paska menu: ukrycie ikony w Docku (tylko macOS), obserwowane foldery, liczba worktree do usunięcia + wolne miejsce na wolumenie, odświeżanie co 15 min | `tray.rs`, `settings.rs`, `SettingsPanel.tsx` |
| Diagnostyka tła (czas ostatniego odświeżenia, liczba procesów Git) | `SettingsPanel.tsx` (`tick_diagnostics`) |

Ekrany: jedno okno (nagłówek, pasek podsumowania skanu z przyciskiem Rescan, panele `node_modules` / Build folders / Merged Git worktrees / Developer caches, stopka z zaznaczeniem), dialog potwierdzenia, panel ustawień. Menu w pasku menu jest natywne (Tauri tray).

## i18n

Brak. Interfejs aplikacji jest tylko po angielsku (napisy wprost w komponentach, brak plików tłumaczeń). → Jeden zestaw screenshotów dla obu wersji strony.

## CTA i identyfikatory

- Remote: `https://github.com/jash90/developer-cleaner` → user `jash90`, repo `developer-cleaner`, repo publiczne.
- Brak `homepage`, brak CNAME, brak adresu produkcyjnego (to aplikacja desktopowa) → główne CTA: **GitHub Releases (latest)**, drugorzędne: repozytorium.
- Adres strony: `https://jash90.github.io/developer-cleaner/` (PL), `.../en/` (EN).
- Licencja: MIT, © 2025 Bartłomiej Zimny (`LICENSE`). Kontakt: brak w repo poza GitHubem → link do Issues.

## Identyfikacja wizualna

- Logo/ikona: `src-tauri/icons/app-icon.png`, `128x128.png` (wygenerowana ikona z commita `ab03be0`).
- Kolory (Tailwind w komponentach): tło `gray-50`, akcent główny `blue-600` (przycisk Select Folder), `orange` dla folderów buildów, `amber` dla worktree, `sky` dla cache, `red-600` dla akcji destrukcyjnych, `green-600` dla odzyskanego miejsca.
- Font: systemowy stos (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, …` — `src/index.css`).
- Aplikacja nie ma trybu ciemnego — strona ma, z tą samą paletą.

## Pages: publikacja i utrzymanie

- Strona: `site/` (PL `index.html`, EN `en/index.html`), publikowana przez `.github/workflows/pages.yml` (Pages `build_type: workflow`, bez gałęzi `gh-pages`, bez Jekylla).
- Zrzuty i obrazy OG: `npm run screenshots` uruchamia prawdziwy frontend w Vite z atrapą mostu Tauri i fikcyjnymi danymi, zapisuje `site/assets/screenshots/*.webp` (empty, overview, builds, worktrees, caches, confirm, confirm-consent, settings), a potem renderuje `scripts/og-image.html` do `og-image.png` (pl) i `og-image-en.png` (en), 1200×630.
- Kontrola: `npm run site:verify` (konsola, obrazy, linki i kotwice, zgodność struktury PL/EN, 390 px, tryb ciemny, lightbox, nagłówek z canonical/hreflang/OG/JSON-LD, absolutne URL-e, rozmiar obrazów OG, nieużyte zrzuty, stara nazwa).
- Stara nazwa (Node Modules Cleaner) może wystąpić tylko w notce dla aktualizujących, oznaczonej `data-former-name`.
- `robots.txt` nie ma sensu na stronie projektu (roboty czytają go tylko w katalogu głównym hosta); `sitemap.xml` zgłasza się w Search Console ręcznie.
- Stary adres `https://jash90.github.io/node-modules-cleaner/` zwraca 404: GitHub nie przekierowuje stron Pages po zmianie nazwy repozytorium.
