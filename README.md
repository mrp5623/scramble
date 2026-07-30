# Scramble

A desktop trivia game built with C++ and Qt. You're shown a random NFL
franchise and have to name a quarterback who played for it — each correct QB
adds their real career passing yards to your score across 25 rounds. A local
leaderboard tracks the best runs.

![Scramble screenshot](docs/screenshot.png)

## How it works

The game reads a bundled dataset (`data/nfl_qbs.json`) mapping each franchise
to its quarterbacks and their career passing yards. It runs fully offline —
no network access at play time.

## Build

Prerequisites:
- A C++20 compiler
- Qt5 (Widgets)
- CMake 3.10+
- vcpkg (for Qt5 on Windows)

```bash
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=<path-to-vcpkg>/scripts/buildsystems/vcpkg.cmake
cmake --build build --config Debug
```

Run `build/Debug/scramble.exe`. The build copies `data/` next to the
executable automatically.

## Refreshing the stats

`data/nfl_qbs.json` is generated offline by `tools/update_stats.py`, which
sums each quarterback's franchise passing yards across all 32 cached team
pages to produce career totals. Regenerate it with:

```bash
python tools/update_stats.py
```

## Project layout

| Path | Purpose |
|------|---------|
| `main.cpp`, `scramblewindow.*` | Qt UI |
| `scramble.*` | Game logic and dataset loading |
| `team.*` | Team value type |
| `tools/update_stats.py` | Offline dataset generator |
| `data/nfl_qbs.json` | Bundled game data |
