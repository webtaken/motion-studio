# Motion Studio

Your agent doesn't "make" the video: **it writes the program that draws it**. Each video is an
HTML page with `window.seek(t)` that paints the exact frame for second `t`. Headless Chromium
photographs every frame, ffmpeg joins them into an MP4 (9:16, 1:1 and 16:9), music is composed
in code and sound effects land on the beat. Before the final render, the agent looks at its own
frames on contact sheets and fixes what doesn't work.

## Install

Unzip so the folder `motion-studio/` (the one with `SKILL.md`) ends up in your agent's skills folder:

| Agent | Folder |
|---|---|
| Claude Code | `~/.claude/skills/motion-studio/` (or `.claude/skills/` inside a project) |
| Codex CLI, Cursor, Gemini CLI, OpenCode | `~/.agents/skills/motion-studio/` (or the skills folder your agent reads) |

Then ask your agent: *"set up the motion studio in ./motion-studio"*. It runs
`scripts/init.mjs`, which copies the studio, installs Playwright + Chromium, prepares Python for
audio, runs `npm run doctor` and makes a 2-second test render.

**Requirements:** Node 22+, ffmpeg with libx264, Python 3 with numpy (optional, for music and
sfx). Missing something? `npm run doctor` prints the exact install command for your OS.

## First prompts

1. *"Make a 15-second showreel of the studio itself, one beat every 2 s, music at 120 BPM."*
2. *"Make a 20-second launch video for [product] ([url]). Use real screenshots, logo, colors and
   fonts. 9:16 first, then 1:1 and 16:9."*
3. *"Study refs/my-reference.mp4 and copy its grammar (cuts, pacing, type), not its content."*

The full prompts are in `references/prompts.md`.

## Good to know

- The agent rules, docs and prompts inside the studio are written in **Spanish**. The agent
  reads them fine and answers in your language.
- Renders run locally and offline. No API keys, no telemetry, no per-video cost beyond your
  agent plan. What gets installed and which domains are contacted: see `SKILL.md`.
- Bundled fonts (Inter, Unbounded) are under the SIL Open Font License (`OFL.txt` next to each font).
- Updating an existing studio: `node scripts/init.mjs <studio> --update` keeps your videos and brands.

---

## En español

Descomprime para que la carpeta `motion-studio/` quede en `~/.claude/skills/` (Claude Code) o
`~/.agents/skills/` (otros agentes). Luego pídele al agente: *"monta el estudio de motion en
./motion-studio"*. Requisitos: Node 22+, ffmpeg con libx264 y Python 3 con numpy (opcional, para
la música). Los prompts de la Guía MOTION están en `references/prompts.md`.
