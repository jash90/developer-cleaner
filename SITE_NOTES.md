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
| Rozmiar „do odzyskania” vs nominalny (hardlinki, sparse, iCloud) | `fs_size.rs`, `NodeModulesPage.tsx`, `CachesPage.tsx` |
| Wykrywanie menedżera pakietów po lockfile (npm/yarn/pnpm/bun) | `commands.rs`, `NodeModulesPage.tsx` |
| Wykrywanie technologii z `package.json` (top packages) | `commands.rs`, `NodeModulesPage.tsx` |
| Sortowanie po nazwie, rozmiarze, menedżerze (nagłówki kolumn) | `NodeModulesPage.tsx`, `useNodeModules.ts` |
| Przegląd: suma do odzyskania (każdy bajt liczony raz), pasek dysku z wolnym miejscem teraz i po usunięciu, cztery karty z największymi pozycjami, karty wypełniane w miarę powrotu skanów, postęp względem poprzedniego skanu folderu, Stop (`cancel_scan`) | `Overview.tsx`, `Hero.tsx`, `CategoryCard.tsx`, `disk_space.rs`, `scan_cancel.rs` |
| Sugestie od najbezpieczniejszych; „Select” tylko dla pozycji o niskim ryzyku z jednej kategorii (porzucone store'y, czyste niezablokowane worktree), reszta otwiera przefiltrowaną listę | `utils/suggestions.ts` (testy: `suggestions.test.mjs`), `SuggestionList.tsx` |
| Foldery buildów: grupy per narzędzie, każda z własnym polem wyboru i notą „What you lose”; nic nie zaznacza kilku narzędzi naraz | `build_artifacts.rs`, `BuildFoldersPage.tsx`, `useBuildArtifacts.ts` |
| Zmergowane worktree: porównanie z `origin/HEAD`, `main`, `master`, `development`, `develop`; wykrywanie squash merge; brudne da się zaznaczyć (od 1.6.0), zablokowanych nie; wpisy „stale” czyszczone `git worktree prune`; gałęzie zostają | `git_worktrees.rs`, `WorktreesPage.tsx` |
| Cache deweloperskie: npm (`_cacache`, `_npx`), pnpm (aktywny store → `pnpm store prune`, porzucone store'y), bun, yarn (Berry i Classic), uv (`uv cache prune`), Gradle (stare wersje), puppeteer (stare buildy), nvm (stare wersje Node), logi Homebrew (opróżniane w miejscu); skanowane przy starcie aplikacji | `dev_caches.rs`, `CachesPage.tsx`, `useDevCaches.ts` |
| „Select safe” — zaznacza tylko cele oznaczone jako bezpieczne | `useDevCaches.ts` |
| Jeden panel „Review and Remove…” zbiera zaznaczenie ze wszystkich ekranów, powtarza koszt każdego zaznaczonego narzędzia i notatki cache, pozwala odznaczać; brudne worktree wymagają zaznaczenia zgody przypiętej nad przyciskami, zgoda resetuje się przy zmianie listy, domyślny przycisk to „Keep Everything” | `ReviewDrawer.tsx`, `App.tsx`, `useCleanup.ts` |
| Tryb paska menu: ukrycie ikony w Docku (tylko macOS), obserwowane foldery, liczba worktree do usunięcia + wolne miejsce na wolumenie, odświeżanie co 15 min | `tray.rs`, `settings.rs`, `SettingsPanel.tsx` |
| Diagnostyka tła (czas ostatniego odświeżenia, liczba procesów Git) | `SettingsPanel.tsx` (`tick_diagnostics`) |

Ekrany: przegląd (pasek narzędzi z Rescan, suma i pasek dysku, sugestie, cztery karty kategorii, pasek zaznaczenia), osobna strona dla każdej kategorii (`node_modules` / Build folders / Merged worktrees / Developer caches), wysuwany panel przeglądu przed usunięciem, panel ustawień. Menu w pasku menu jest natywne (Tauri tray).

## i18n

Brak. Interfejs aplikacji jest tylko po angielsku (napisy wprost w komponentach, brak plików tłumaczeń). → Jeden zestaw screenshotów dla obu wersji strony.

## CTA i identyfikatory

- Remote: `https://github.com/jash90/developer-cleaner` → user `jash90`, repo `developer-cleaner`, repo publiczne.
- Brak `homepage`, brak CNAME, brak adresu produkcyjnego (to aplikacja desktopowa) → główne CTA: **GitHub Releases (latest)**, drugorzędne: repozytorium.
- Adres strony: `https://jash90.github.io/developer-cleaner/` (PL), `.../en/` (EN).
- Licencja: MIT, © 2025 Bartłomiej Zimny (`LICENSE`). Kontakt: brak w repo poza GitHubem → link do Issues.

## Identyfikacja wizualna

- Logo/ikona: `src-tauri/icons/app-icon.png`, `128x128.png` (wygenerowana ikona z commita `ab03be0`).
- Kolory (Tailwind w komponentach): tło `gray-50`, akcent główny `blue-600` (przycisk Choose Folder…), `orange` dla folderów buildów, `amber` dla worktree, `sky` dla cache, `red-600` dla akcji destrukcyjnych, `green-600` dla odzyskanego miejsca.
- Font: systemowy stos (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, …` — `src/index.css`).
- Aplikacja nie ma trybu ciemnego — strona ma, z tą samą paletą.

## Pages: publikacja i utrzymanie

- Strona: `site/` (PL `index.html`, EN `en/index.html`), publikowana przez `.github/workflows/pages.yml` (Pages `build_type: workflow`, bez gałęzi `gh-pages`, bez Jekylla).
- Zrzuty i obrazy OG: `npm run screenshots` uruchamia prawdziwy frontend w Vite z atrapą mostu Tauri i fikcyjnymi danymi, zapisuje `site/assets/screenshots/*.webp` (wymaga `cwebp` w PATH, `brew install webp`; bez niego skrypt kończy się przed zapisem czegokolwiek; empty, scanning, node-modules, builds, worktrees, caches, overview, review, settings), a potem renderuje `scripts/og-image.html` do `og-image.png` (pl) i `og-image-en.png` (en), 1200×630.
- Kontrola: `npm run site:verify` (konsola, obrazy, linki i kotwice, zgodność struktury PL/EN, 390 px, tryb ciemny, lightbox, nagłówek z canonical/hreflang/OG/JSON-LD, absolutne URL-e, rozmiar obrazów OG, nieużyte zrzuty, stara nazwa w dowolnym miejscu).
- Stara nazwa (Node Modules Cleaner) nie występuje nigdzie na stronie; notkę dla aktualizujących usunięto.
- `robots.txt` nie ma sensu na stronie projektu (roboty czytają go tylko w katalogu głównym hosta); `sitemap.xml` zgłasza się w Search Console ręcznie.
- Stary adres `https://jash90.github.io/node-modules-cleaner/` (PL i `en/`) przekierowuje na nowy: GitHub sam nie przekierowuje stron Pages po zmianie nazwy repozytorium, więc przekierowanie to strony-zaślepki w repozytorium strony użytkownika `jash90/jash90.github.io` (`node-modules-cleaner/index.html` i `node-modules-cleaner/en/`, meta refresh + `location.replace`, `noindex`, canonical na nowy adres). Ich usunięcie przywróci 404.
