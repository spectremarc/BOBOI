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

const fields = {
  localServerUrl: document.querySelector("#localServerUrl"),
  model: document.querySelector("#model"),
  ttsServerUrl: document.querySelector("#ttsServerUrl"),
  ttsVoice: document.querySelector("#ttsVoice"),
  aiSkills: document.querySelector("#aiSkills"),
  autoScreenshot: document.querySelector("#autoScreenshot"),
  includePageContext: document.querySelector("#includePageContext"),
  liveContext: document.querySelector("#liveContext"),
  voiceEnabled: document.querySelector("#voiceEnabled")
};

const saveButton = document.querySelector("#save");
const refreshVoicesButton = document.querySelector("#refreshVoices");
const status = document.querySelector("#status");

load();

saveButton.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    localServerUrl: fields.localServerUrl.value.trim(),
    model: fields.model.value.trim(),
    ttsServerUrl: fields.ttsServerUrl.value.trim(),
    ttsVoice: fields.ttsVoice.value,
    aiSkills: fields.aiSkills.value.trim(),
    autoScreenshot: fields.autoScreenshot.checked,
    includePageContext: fields.includePageContext.checked,
    liveContext: fields.liveContext.checked,
    voiceEnabled: fields.voiceEnabled.checked
  });

  status.textContent = "Saved. Refresh open tabs to show BOBOI there.";
  setTimeout(() => {
    status.textContent = "";
  }, 3200);
});

refreshVoicesButton.addEventListener("click", () => {
  loadVoices(fields.ttsVoice.value);
});

async function load() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  fields.localServerUrl.value = settings.localServerUrl || DEFAULT_SETTINGS.localServerUrl;
  fields.model.value = settings.model || DEFAULT_SETTINGS.model;
  fields.ttsServerUrl.value = settings.ttsServerUrl || "";
  await loadVoices(settings.ttsVoice || "");
  fields.aiSkills.value = settings.aiSkills || "";
  fields.autoScreenshot.checked = Boolean(settings.autoScreenshot);
  fields.includePageContext.checked = Boolean(settings.includePageContext);
  fields.liveContext.checked = Boolean(settings.liveContext);
  fields.voiceEnabled.checked = Boolean(settings.voiceEnabled);
}

async function loadVoices(selectedVoice) {
  fields.ttsVoice.innerHTML = '<option value="">Default voice</option>';

  if (!fields.ttsServerUrl.value.trim()) {
    return;
  }

  status.textContent = "Loading voices...";
  const response = await chrome.runtime.sendMessage({
    type: "BOBOI_LIST_TTS_VOICES",
    payload: { ttsServerUrl: fields.ttsServerUrl.value.trim() }
  });

  if (!response?.ok) {
    status.textContent = response?.error || "Could not load voices.";
    return;
  }

  for (const voice of response.voices || []) {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = voice.name || voice.id;
    fields.ttsVoice.appendChild(option);
  }

  fields.ttsVoice.value = selectedVoice || "";
  status.textContent = response.voices?.length ? "Voices loaded." : "No voices found.";
}
