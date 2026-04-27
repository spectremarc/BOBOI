# BOBOI Screen Pal Setup

This guide helps you run BOBOI with a local OpenAI-compatible model server.

## 1. Start Your Local LLM Server

Run your local model server before using BOBOI.

Use these values in BOBOI settings:

```text
Local server: http://127.0.0.1:1234
API model: google/gemma-4-e4b
Optional TTS server: http://127.0.0.1:5505/tts
```

The extension calls this endpoint:

```text
http://127.0.0.1:1234/v1/chat/completions
```

Your local server should support an OpenAI-compatible chat completions API.

## 2. Install the Extension in Chrome or Edge

1. Open Chrome or Edge.
2. Go to one of these pages:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder:

```text
C:\Users\marun\Documents\git\BOBOI\extension
```

6. BOBOI Screen Pal should now appear in your extensions list.

## 3. Configure BOBOI

1. After installation, the BOBOI settings page should open automatically.
2. Set **Local server URL** to:

```text
http://127.0.0.1:1234
```

3. Set **Model** to:

```text
google/gemma-4-e4b
```

4. Edit **AI skill** if you want a personality, for example:

```text
Act cute. Call me boboi. Keep answers short and helpful.
```

5. Keep these enabled if your local model supports them:
   - Send visible tab screenshot with each question
   - Send page title, URL, selected text, and visible text
   - Refresh screen context every 10 seconds while tab is visible

6. Click **Save settings**.

## 4. Optional: Install Local TTS

Browser voices can sound robotic. BOBOI can instead call a local TTS server that returns audio. A default Piper voice is already included in the `voices` folder.

Install Piper:

```powershell
pip install piper-tts
```

Start the included BOBOI TTS bridge:

```powershell
powershell -ExecutionPolicy Bypass -File tools\start_tts_server.ps1
```

The TTS server will run here:

```text
http://127.0.0.1:5505/tts
```

Paste that URL into **Local TTS server URL optional** in BOBOI settings and click **Save settings**.

Then click **Refresh voices**, choose a voice from the dropdown, and save again.

To customize voices, add more matching Piper files to the `voices` folder:

```text
voice-name.onnx
voice-name.onnx.json
```

If the TTS server is not running, BOBOI automatically falls back to the browser voice.

If you open `http://127.0.0.1:5505/tts` directly in the browser, that is only a status check. BOBOI sends a `POST /tts` request internally when it needs audio.

To test the TTS server manually:

```powershell
powershell -ExecutionPolicy Bypass -File tools\test_tts_server.ps1
```

The test should list available voices and create `tts-test.wav`.

Server logs are written to:

```text
logs\boboi-tts.log
```

## 5. Test It

1. Open any normal webpage.
2. Refresh the page if BOBOI does not appear.
3. BOBOI should hover near the bottom-right corner.
4. Click the chat button and ask:

```text
What is visible on this page?
```

BOBOI will gather browser context, capture the visible tab, form a local model query, and answer using your saved AI skill.

When live screen context is enabled, BOBOI refreshes the screen cache every 10 seconds while the tab is visible. This happens silently in the background.

## 6. Screenshot and Vision Notes

Screenshot answering requires your local model server to accept image input in OpenAI-compatible chat format:

```json
{
  "type": "image_url",
  "image_url": {
    "url": "data:image/png;base64,..."
  }
}
```

If your local model is text-only or rejects image input, turn off **Send visible tab screenshot with each question** in BOBOI settings. BOBOI will still send page title, URL, selected text, and visible text.

## 7. Voice Controls

Click the microphone button to ask by voice.

Voice input depends on browser support and microphone permissions. If voice does not work, use the chat button.

## 8. Troubleshooting

If BOBOI says the local model request failed, check that your local server is running at:

```text
http://127.0.0.1:1234
```

If BOBOI does not appear, refresh the tab or check that the extension is enabled.

Some browser pages cannot run extensions, including:

- `chrome://extensions`
- `edge://extensions`
- Browser settings pages
- Some browser store pages

Test on a normal website instead.

## 9. Packaged File

The packaged zip is here:

```text
C:\Users\marun\Documents\git\BOBOI\BOBOI-Screen-Pal-extension.zip
```

For local testing, use **Load unpacked** with the `extension` folder. The zip is useful for sharing or backup.
