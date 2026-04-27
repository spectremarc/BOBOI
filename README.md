# BOBOI Screen Pal

A playful Chrome/Edge extension that adds a floating, semi-transparent AI companion to the bottom-right of every page.

BOBOI now talks to a local OpenAI-compatible model server instead of the OpenAI cloud API. The default local setup is:

```text
Local server: http://127.0.0.1:1234
API model: google/gemma-4-e4b
Optional TTS server: http://127.0.0.1:5505/tts
```

## How It Works

When you ask BOBOI a question, the extension runs a local tool flow:

1. Reads the current page title, URL, selected text, and visible page text.
2. Captures the visible browser tab as a screenshot.
3. Builds a prompt using your saved AI skill/personality.
4. Sends the prompt and screenshot to your local model server at `/v1/chat/completions`.
5. Shows and optionally speaks the answer in the floating companion.

By default, BOBOI silently refreshes the visible-tab context every 10 seconds while the tab is visible. When you ask a question, it reuses the latest cached screenshot/page context if it is fresh, which makes responses feel more seamless.

This is MCP-inspired tool orchestration inside the browser extension: gather context with tools, form a structured query, then ask the local model. A full external MCP bridge can be added later if you want BOBOI to control more tools outside the browser.

## Install for Testing

1. Start your local model server.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked** and select `extension`.
5. In BOBOI settings, confirm:
   - Local server URL: `http://127.0.0.1:1234`
   - Model: `google/gemma-4-e4b`

For the full step-by-step guide, see [SETUP.md](SETUP.md).

## What It Does

- Shows the supplied BOBOI mascot as a draggable floating assistant.
- Adds mute, voice, chat, and settings buttons.
- Captures the visible tab screenshot when you ask a question.
- Keeps a fresh screen-context cache every 10 seconds while the tab is visible.
- Sends page context plus your prompt to your local model server.
- Prepends the saved AI skill/personality text to every question.
- Can use an optional local Piper TTS server for more natural speech.

No ChatGPT login, browser token, credit card, or OpenAI API key is required by the extension.

## Optional Local TTS

BOBOI falls back to the browser voice when no TTS server is configured. A default Piper voice is bundled in the `voices` folder. For better local speech, install Piper and run the included bridge:

```powershell
pip install piper-tts
powershell -ExecutionPolicy Bypass -File tools\start_tts_server.ps1
```

Then set **Local TTS server URL optional** in BOBOI settings to:

```text
http://127.0.0.1:5505/tts
```

Click **Refresh voices**, choose a voice from the dropdown, and save.

To customize voices, add more matching Piper files to `voices`:

```text
voice-name.onnx
voice-name.onnx.json
```

If you open `http://127.0.0.1:5505/tts` in the browser, it only shows a status message. BOBOI sends a `POST /tts` request internally when it needs audio.

To test the TTS server manually:

```powershell
powershell -ExecutionPolicy Bypass -File tools\test_tts_server.ps1
```

Server logs are written to:

```text
logs\boboi-tts.log
```
