const DEFAULT_SETTINGS = {
  localServerUrl: "http://127.0.0.1:1234",
  model: "google/gemma-4-e4b",
  ttsServerUrl: "",
  ttsVoice: "",
  aiSkills: "Act cute. Be concise. Call me boboi.",
  autoScreenshot: true,
  includePageContext: true,
  liveContext: true,
  voiceEnabled: true
};

const liveContextCache = new Map();
const LIVE_CONTEXT_MAX_AGE_MS = 30000;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...current });
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "BOBOI_ASK") {
    answerQuestion(message.payload, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === "BOBOI_PREFETCH_CONTEXT") {
    prefetchContext(message.payload, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === "BOBOI_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "BOBOI_TTS") {
    synthesizeSpeech(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === "BOBOI_LIST_TTS_VOICES") {
    listTtsVoices(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error), voices: [] }));
    return true;
  }

  return false;
});

async function answerQuestion(payload, sender) {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const userQuestion = String(payload?.question || "").trim();

  if (!userQuestion) {
    throw new Error("Ask me something first.");
  }

  const toolContext = await getBestToolContext(settings, sender, payload);
  const prompt = buildPrompt(settings, userQuestion, toolContext);
  const response = await callLocalModel(settings, prompt, toolContext.screenshotDataUrl);

  return {
    ok: true,
    answer: response || "I looked, but I do not have a clear answer yet."
  };
}

async function prefetchContext(payload, sender) {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.liveContext || !sender?.tab?.id) {
    return { ok: false, skipped: true };
  }

  const context = await runLocalToolContext(settings, sender, payload);
  context.cachedAt = Date.now();
  liveContextCache.set(sender.tab.id, context);

  return {
    ok: true,
    cachedAt: context.cachedAt,
    hasScreenshot: Boolean(context.screenshotDataUrl),
    hasPageContext: Boolean(context.page)
  };
}

async function synthesizeSpeech(payload) {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const endpoint = String(settings.ttsServerUrl || "").trim();
  const text = String(payload?.text || "").trim();

  if (!endpoint || !text) {
    return { ok: false };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, voice: settings.ttsVoice || "" })
  });

  if (!response.ok) {
    throw new Error(`Local TTS failed with ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "audio/wav";
  const buffer = await response.arrayBuffer();

  return {
    ok: true,
    audioDataUrl: `data:${contentType};base64,${arrayBufferToBase64(buffer)}`
  };
}

async function listTtsVoices(payload) {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const serverUrl = String(payload?.ttsServerUrl || settings.ttsServerUrl || "").trim();
  if (!serverUrl) {
    return { ok: true, voices: [] };
  }

  const response = await fetch(normalizeTtsVoicesUrl(serverUrl));
  if (!response.ok) {
    throw new Error(`Could not load voices: ${response.status}`);
  }

  const data = await response.json();
  return {
    ok: true,
    voices: Array.isArray(data.voices) ? data.voices : []
  };
}

function normalizeTtsVoicesUrl(serverUrl) {
  const trimmed = String(serverUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  if (trimmed.endsWith("/tts")) {
    return `${trimmed.slice(0, -4)}/voices`;
  }
  return `${trimmed}/voices`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function runLocalToolContext(settings, sender, payload) {
  const context = {
    page: null,
    screenshotDataUrl: payload?.screenshotDataUrl || ""
  };

  if (settings.includePageContext && sender?.tab?.id) {
    context.page = await safeGetPageContext(sender.tab.id);
  }

  if (settings.autoScreenshot && !context.screenshotDataUrl && sender?.tab?.windowId) {
    context.screenshotDataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
  }

  return context;
}

async function getBestToolContext(settings, sender, payload) {
  const tabId = sender?.tab?.id;
  const cached = tabId ? liveContextCache.get(tabId) : null;
  const cacheIsFresh = cached && Date.now() - cached.cachedAt <= LIVE_CONTEXT_MAX_AGE_MS;

  if (settings.liveContext && cacheIsFresh) {
    return {
      page: cached.page || null,
      screenshotDataUrl: payload?.screenshotDataUrl || cached.screenshotDataUrl || ""
    };
  }

  return runLocalToolContext(settings, sender, payload);
}

async function safeGetPageContext(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "BOBOI_GET_PAGE_CONTEXT" });
  } catch {
    return null;
  }
}

function buildPrompt(settings, userQuestion, toolContext) {
  const skillPrompt = String(settings.aiSkills || "").trim();
  const page = toolContext.page || {};

  return [
    "You are BOBOI Screen Pal, a cute floating browser assistant.",
    "Use the local browser tools context below like an MCP tool result.",
    "If a screenshot is attached, look at it and answer accordingly.",
    "Do not include emoji or markdown formatting symbols in your answer.",
    skillPrompt ? `User mentioned these to be followed: "${skillPrompt}"` : "",
    page.title ? `Page title: ${page.title}` : "",
    page.url ? `Page URL: ${page.url}` : "",
    page.selection ? `Selected text: ${page.selection}` : "",
    page.visibleText ? `Visible page text:\n${page.visibleText}` : "",
    `Actual query from user: ${userQuestion}`
  ].filter(Boolean).join("\n\n");
}

async function callLocalModel(settings, prompt, screenshotDataUrl) {
  const endpoint = normalizeChatCompletionsUrl(settings.localServerUrl || DEFAULT_SETTINGS.localServerUrl);
  const content = [{ type: "text", text: prompt }];

  if (screenshotDataUrl) {
    content.push({
      type: "image_url",
      image_url: { url: screenshotDataUrl }
    });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_SETTINGS.model,
      messages: [
        {
          role: "user",
          content
        }
      ],
      max_tokens: 1600,
      temperature: 0.7
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.error?.message || `Local model request failed with ${response.status}`;
    throw new Error(`${detail}. Check that your local server is running at ${endpoint}.`);
  }

  return extractChatText(data);
}

function normalizeChatCompletionsUrl(serverUrl) {
  const trimmed = String(serverUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "http://127.0.0.1:1234/v1/chat/completions";
  }

  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}

function extractChatText(response) {
  const message = response?.choices?.[0]?.message?.content;
  if (typeof message === "string") {
    return message.trim();
  }

  if (Array.isArray(message)) {
    return message.map((part) => part.text || "").join("").trim();
  }

  return "";
}
