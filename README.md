# AI IP-Cam — Receipt Compliance Auditor

An AI-powered web app that watches a store's CCTV / RTSP cameras (or uploaded video files) and **flags every transaction where the cashier did NOT hand a printed receipt to the customer**.

For each violation it produces a detailed report with:
- exact wall-clock time and offset inside the video
- evidence screenshots
- short physical description of cashier and customer
- Claude's reasoning and a confidence/severity score

A built-in chat (powered by Claude Sonnet) lets you ask questions like *"how many violations today?"* or *"generate a daily report"*.

---

## Architecture

```
RTSP camera ── ffmpeg ──► 60s MP4 chunks
                              │
                              ▼
                    Stage 1: motion gate (ffmpeg scene detect, free)
                              │
                              ▼
                    Stage 2: extract 8 key frames
                              │
                              ▼
                  Claude Sonnet (vision) ──► JSON verdict
                              │
                              ▼
                  If violation → SQLite report + screenshots
                              │
                              ▼
                  Dashboard + chat (Next.js + shadcn UI)
```

**Smart two-stage pipeline** keeps cost low for 24h+ footage: cheap motion detection skips empty hours, and only chunks with activity are sent to the LLM.

---

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** + **framer-motion**
- **Anthropic Claude Sonnet** (vision) via `@anthropic-ai/sdk`
- **ffmpeg** for RTSP ingestion, segmentation, frame extraction, motion gate
- **better-sqlite3** for storing streams, reports, chat history

---

## Prerequisites

1. **Node.js 18.18+** (20+ recommended)
2. **ffmpeg** on your `PATH`
   - macOS: `brew install ffmpeg`
   - Ubuntu/Debian: `sudo apt install ffmpeg`
   - Windows: <https://www.gyan.dev/ffmpeg/builds/>
3. **Anthropic API key** — get one at <https://console.anthropic.com/>

---

## Setup

```bash
# 1. Install deps
npm install

# 2. Configure your secrets
cp .env.example .env.local
# then open .env.local and paste your ANTHROPIC_API_KEY

# 3. Start the app
npm run dev
```

Open <http://localhost:3000>. The dashboard banner at the top tells you whether ffmpeg and your API key are detected.

---

## Using it

### A. Live IP camera (RTSP)

1. Click **Add** in the *Cameras* panel.
2. Enter a name and the RTSP URL — most cameras follow this pattern:
   ```
   rtsp://<username>:<password>@<camera-ip>:554/<stream-path>
   ```
   Examples:
   - Hikvision: `rtsp://admin:Password1@192.168.1.64:554/Streaming/Channels/101`
   - Dahua: `rtsp://admin:Password1@192.168.1.10:554/cam/realmonitor?channel=1&subtype=0`
   - Reolink: `rtsp://admin:Password1@192.168.1.20:554/h264Preview_01_main`
3. Hit the **Play** button on the camera row. The app starts recording in 60-second chunks and analyzing each one. New violations appear in real time on the right.

### B. Upload a recorded file (any length)

1. In the chat panel, click the paperclip icon and pick any video file (MP4, MOV, MKV, …).
2. Optionally type a note (e.g. *"Friday afternoon, register 2"*).
3. Hit send. The app segments the video into 60s chunks, runs the same pipeline, and reports back when it's done. Long videos (24h+) are supported but will take time and API budget — the smart motion gate keeps that manageable.

### C. Chat with the AI auditor

Ask questions like:
- "Summarize today's violations."
- "Which cashier description appears most often?"
- "Generate a structured weekly compliance report."
- "What time of day has the most violations?"

Claude has the metadata of all your stored reports in context (timestamps, descriptions, severity, etc.) so it can answer with real numbers.

---

## Tuning

All knobs live in `.env.local`:

| Variable           | Default              | Effect                                                                      |
| ------------------ | -------------------- | --------------------------------------------------------------------------- |
| `ANTHROPIC_MODEL`  | `claude-sonnet-4-5`  | Any vision-capable Claude model                                             |
| `CHUNK_SECONDS`    | `60`                 | Smaller = faster feedback, more API calls. Larger = cheaper, slower         |
| `FRAMES_PER_CHUNK` | `8`                  | More frames = higher accuracy, more tokens. 6–10 is a good range            |
| `DATA_DIR`         | `./data`             | SQLite database location                                                    |
| `RECORDINGS_DIR`   | `./recordings`       | Where MP4 chunks are stored                                                 |
| `SCREENSHOTS_DIR`  | `./screenshots`      | Evidence images                                                             |
| `FFMPEG_PATH`      | `ffmpeg`             | Custom ffmpeg binary path                                                   |

To adjust the motion-gate sensitivity, edit `detectMotion`'s `threshold` in `src/lib/ffmpeg.ts` (lower = more sensitive, more LLM calls).

To change *what* the AI is looking for, edit `ANALYSIS_SYSTEM_PROMPT` in `src/lib/claude.ts`. You could repurpose this app to detect, say, employees on their phones, unattended tills, suspicious behavior, etc.

---

## File map

```
src/
├── app/
│   ├── layout.tsx            # root layout (dark theme)
│   ├── page.tsx              # main dashboard (3-pane: cameras / chat / violations)
│   ├── globals.css           # tailwind + shadcn theme tokens
│   ├── reports/
│   │   ├── page.tsx          # list of all violation reports
│   │   └── [id]/page.tsx     # single report with screenshots + reasoning
│   └── api/
│       ├── streams/          # CRUD + start/stop for RTSP streams
│       ├── reports/          # list / fetch a violation report
│       ├── screenshots/      # serve evidence images from disk
│       ├── chat/             # chat with Claude over the reports
│       ├── analyze-upload/   # upload a file and run the pipeline once
│       └── system/           # health: ffmpeg + API key + counts
├── components/
│   ├── ui/                   # shadcn primitives + AdvancedChatInput
│   ├── chat-panel.tsx        # chat UI (uses AdvancedChatInput)
│   ├── streams-panel.tsx     # RTSP camera management
│   ├── violations-panel.tsx  # live feed of flagged violations
│   └── system-status-banner.tsx
└── lib/
    ├── analyzer.ts           # orchestrator: record → motion gate → frames → Claude → DB
    ├── ffmpeg.ts             # RTSP recording, segmenting, motion detection, frame extraction
    ├── claude.ts             # Anthropic SDK wrapper + analysis & chat prompts
    ├── db.ts                 # better-sqlite3 setup + repos
    ├── paths.ts              # data/recordings/screenshots dirs
    ├── types.ts              # shared types
    └── utils.ts              # cn(), date helpers
```

---

## Cost & performance notes

For a 24-hour 1080p RTSP feed with the defaults (60s chunks, motion gate, 8 frames per active chunk):

- ~1440 chunks per day, of which typically only 10-30% pass the motion gate during business hours
- ~150–400 LLM calls/day, ~8 images each
- With `claude-sonnet-4-5` that's roughly a few US dollars per camera per day at current pricing — adjust `FRAMES_PER_CHUNK` and `CHUNK_SECONDS` if you need to go cheaper

---

## Privacy

- All data (recordings, screenshots, SQLite DB) stays on your machine.
- The only thing sent over the network is image frames + your prompts to Anthropic.
- Faces and clothing descriptions stored in reports are intentionally generic (Claude is instructed never to use names).

---

## Roadmap ideas

- Live preview of each RTSP camera in the dashboard
- Per-camera schedule (only audit during business hours)
- Email / Telegram alerts on every violation
- Export a daily PDF compliance report
- Multi-tenant mode for chains of stores
