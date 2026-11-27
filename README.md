<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Developer Cleaner" width="128" height="128">
</p>

<h1 align="center">Developer Cleaner</h1>

<p align="center">
  <strong>Reclaim disk space from node_modules, build folders, merged worktrees and developer caches</strong>
</p>

<p align="center">
  <a href="https://github.com/jash90/developer-cleaner/releases/latest">
    <img src="https://img.shields.io/github/v/release/jash90/developer-cleaner?style=flat-square" alt="Latest Release">
  </a>
  <a href="https://github.com/jash90/developer-cleaner/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/jash90/developer-cleaner?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/jash90/developer-cleaner/releases">
    <img src="https://img.shields.io/github/downloads/jash90/developer-cleaner/total?style=flat-square" alt="Downloads">
  </a>
</p>

---

A fast, cross-platform desktop application that reclaims disk space from `node_modules` folders, build folders (Cargo `target`, CocoaPods `Pods`, `.next`, `.nx`, `.turbo`, Android `.cxx`, `coverage`, `.expo`), merged Git worktrees, and the shared developer caches that quietly grow to tens of gigabytes.

## Features

- **Parallel Scanning** — Uses Rust's Rayon for blazing-fast recursive directory scanning
- **Honest Size Analysis** — Reports what a delete actually frees, not the nominal folder size
- **Developer Cache Cleanup** — Finds shared caches outside your projects: npm, pnpm, bun, yarn, uv, Gradle, puppeteer browser builds, and old Node versions under nvm
- **Abandoned Store Detection** — Spots pnpm stores left behind when the tool changed its default location, telling them apart from the store actually in use
- **Top Packages Detection** — Identifies technologies used (React, Next, Vue, Express, etc.) from `package.json` and shows them as badges
- **Package Manager Detection** — Detects npm, yarn, pnpm, or bun based on lock files
- **Selective Deletion** — Choose exactly which folders to remove with checkboxes
- **Merged Worktree Cleanup** — Finds worktrees already merged into any of a repository's base branches, including squash merges, asks before discarding uncommitted changes, and removes them without deleting branches
- **Menu Bar Mode** — Hide the Dock icon and keep a live count of removable worktrees and free disk space in the menu bar
- **Sorting & Filtering** — Sort by name, size, or package manager
- **Cross-Platform** — Native apps for Windows, macOS, and Linux
- **Lightweight** — Small binary size thanks to Tauri architecture

### Why sizes differ from what you expect

Summing file lengths is the obvious way to size a folder and it is wrong in three
common cases, each of which this app measures properly:

| Case | What naive sizing reports | What you actually get back |
|------|---------------------------|----------------------------|
| `node_modules` under pnpm or bun | full size of every file | close to nothing — the files are hardlinks into a shared store, and the data survives the delete |
| Sparse files (VM disk images) | the nominal size, sometimes hundreds of GB | only the blocks really written |
| Cloud-evicted files (iCloud Drive) | the nominal size | nothing — the bytes are not on this machine |

Each row shows the reclaimable figure, with the nominal size beside it when the two
disagree. Caches owned by a tool with its own prune command are handed to that tool
rather than deleted, so entries still referenced by your projects are kept.

## Download

<table>
  <tr>
    <th>Platform</th>
    <th>Download</th>
    <th>Architecture</th>
  </tr>
  <tr>
    <td>🪟 Windows</td>
    <td><a href="https://github.com/jash90/developer-cleaner/releases/latest">Download .msi</a></td>
    <td>x64</td>
  </tr>
  <tr>
    <td>🍎 macOS</td>
    <td><a href="https://github.com/jash90/developer-cleaner/releases/latest">Download .dmg</a></td>
    <td>Apple Silicon / Intel</td>
  </tr>
  <tr>
    <td>🐧 Linux</td>
    <td><a href="https://github.com/jash90/developer-cleaner/releases/latest">Download .deb / .AppImage</a></td>
    <td>x64</td>
  </tr>
</table>

> **Note:** The app is not code-signed.
> - **macOS:** Right-click → Open to bypass Gatekeeper
> - **Windows:** Click "More info" → "Run anyway"

## How It Works

1. **Select a folder** — Choose a directory to scan (e.g., your Projects folder). Developer caches are scanned at launch and need no folder.
2. **Watch the overview fill in** — One scan finds `node_modules` folders, build folders and merged Git worktrees. Each category card fills in as soon as its own scan returns, the total grows as "found so far", progress is shown against the last scan's duration, and **Stop** ends a scan without leaving a partial list.
3. **Start from the overview** — A disk bar shows each category's share and the free space before and after removal. A "safest first" suggestions list offers one-click selection only for low-risk single-category picks (such as clean merged worktrees); anything costly or spanning several kinds only opens the matching list for review. Four cards show each category's total and largest items.
4. **Drill down** — "Review all" opens a category's full list. Build folders are grouped by tool, each kind with its own checkbox and a note on what deleting it costs; nothing selects across kinds. A build folder is offered only when the tool that made it left its marks (a `target` needs `Cargo.toml` beside it and Cargo's `CACHEDIR.TAG` inside, `Pods` needs a `Podfile` and `Manifest.lock`, and so on) and Git tracks nothing inside it.
5. **Review and remove** — The review panel collects what you picked on every screen, repeats each selected kind's cost note, and removes everything in one go. Worktrees with uncommitted changes are listed by name, and **Remove** stays disabled until you tick that their changes will be permanently lost.

Developer caches live at fixed locations, so they need no folder. Targets are grouped by
kind and each one states how it will be cleaned: deleted, emptied in place, or handed to
the owning tool's prune command.

For linked Git worktrees, the app refreshes each repository's remote-tracking refs and then compares every worktree against all of the repository's base branches — `origin/HEAD` plus `origin/main`, `origin/master`, `origin/development` and `origin/develop`, falling back to local branches only when a repository has no remote base at all. Comparing against `origin/HEAD` alone would report every branch merged into a second integration branch as still open.

Beyond a plain ancestry check, a branch also counts as merged when its content is already in the base under a different history — the squash merge that GitHub performs by default. That probe writes its synthetic commit into a scratch object directory, so it never leaves objects behind in the repository.

Worktrees with a detached HEAD are included; a worktree that holds a base branch itself never is. Registrations whose directory is already gone are reported as stale and cleared with `git worktree prune` rather than being mislabelled as having uncommitted changes.

Worktrees with uncommitted changes can be selected, but the review panel names every one of them and removes them only once you accept losing those changes. That consent covers only what the panel listed: a worktree that was clean at scan time and has changes by the time you click Remove is still refused. Removal is always refused when Git has locked the worktree, or when the worktree gained a commit after the scan — accepting the loss of uncommitted files is not accepting the loss of a commit. A worktree that something else removed after the scan (another tool, another session) counts as removed rather than as a failure, and leaves the list. Untracked OS and watcher noise (`.DS_Store`, `.watchman-cookie-*`) is reported separately from real changes: it is what makes `git worktree remove` refuse, so removal retries once with a single `-f` after re-reading the worktree — never two, which is what would be needed to bypass a lock. Git branches are kept.

### Menu bar mode

Settings (the gear in the header) hold the only two things this app remembers between runs: whether
the Dock icon is hidden, and which folders the menu bar watches. For each watched folder the tray
shows the free space on the volume that folder actually lives on — matched by longest mount point,
so a folder on an external disk reports that disk and not the boot volume — and how many worktrees
could be removed right now — exactly the rows the window lets you select for that folder, minus stale
registrations, which free nothing. That count comes from the same merge detection the main window
uses, minus the fetch and the size walk, so the background refresh never touches the network and
never crawls `node_modules`. It updates every 15 minutes, on **Refresh now**, and after a scan or a
cleanup. When the window shows a watched folder and its list no longer matches the menu bar's count,
the window says the list may be out of date and offers a rescan.

Closing the window leaves the app running in the menu bar; **Quit** in the tray menu ends it.

Platform differences worth knowing: hiding the Dock icon is macOS-only, since that is the only
platform with a Dock. The text beside the tray icon is unsupported on Windows and depends on the
desktop environment on Linux — the menu itself carries the same information everywhere. On Linux
the tray needs `libayatana-appindicator3` (or the older `libappindicator3`) at runtime; the `.deb`
declares it, and if it is missing the app still starts, just without the tray.

## Build from Source

### Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | 18+ |
| [Rust](https://rustup.rs/) | Latest stable |

**Platform-specific:**
- **Linux:** `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

### Build

```bash
git clone https://github.com/jash90/developer-cleaner.git
cd developer-cleaner
npm install
npm run tauri build
```

Binaries will be in `src-tauri/target/release/bundle/`.

### Development

```bash
npm run tauri dev
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Tailwind CSS |
| Backend | Rust, Tauri 2 |
| Build | Vite 7 |

## License

[MIT](LICENSE) © Bartłomiej Zimny

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.
