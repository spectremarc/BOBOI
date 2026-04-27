(function initBoboi() {
  if (window.__boboiLoaded) {
    return;
  }
  window.__boboiLoaded = true;

  const mascotUrl = chrome.runtime.getURL("assets/boboi-mascot.png");
  const actionImages = {
    idle: mascotUrl,
    thinking: chrome.runtime.getURL("assets/boboi-thinking.png"),
    searching: chrome.runtime.getURL("assets/boboi-searching.png"),
    calling: chrome.runtime.getURL("assets/boboi-dancing.png"),
    jumping: chrome.runtime.getURL("assets/boboi-jumping.png"),
    spinning: chrome.runtime.getURL("assets/boboi-spinning.png"),
    dancing: chrome.runtime.getURL("assets/boboi-dancing.png")
  };
  const root = document.createElement("div");
  root.id = "boboi-root";
  root.innerHTML = `
    <div class="boboi-stage">
      <div class="boboi-panels">
        <div class="boboi-bubble" hidden>
          <div class="boboi-message"></div>
          <button class="boboi-see-more" type="button" hidden>See more</button>
        </div>
        <form class="boboi-chat" hidden>
          <textarea placeholder="Ask BOBOI about this screen..."></textarea>
          <button class="boboi-send-button" type="submit">Send</button>
        </form>
      </div>
      <div class="boboi-character" data-mood="idle" title="Drag me">
        <img alt="BOBOI AI companion" src="${mascotUrl}">
        <div class="boboi-prop" aria-hidden="true"></div>
      </div>
      <div class="boboi-controls">
        <button class="boboi-icon-button boboi-drag" data-action="drag" title="Drag BOBOI" aria-label="Drag BOBOI"></button>
        <button class="boboi-icon-button boboi-mic is-off" data-action="mic" title="Microphone off" aria-label="Microphone off"></button>
        <button class="boboi-icon-button" data-action="chat" title="Chat">C</button>
        <button class="boboi-icon-button" data-action="settings" title="Settings">*</button>
        <button class="boboi-icon-button boboi-close" data-action="close" title="Close on this page" aria-label="Close on this page">x</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(root);
  placeDefault(root);

  const character = root.querySelector(".boboi-character");
  const bubble = root.querySelector(".boboi-bubble");
  const messageBox = root.querySelector(".boboi-message");
  const seeMoreButton = root.querySelector(".boboi-see-more");
  const chat = root.querySelector(".boboi-chat");
  const textarea = root.querySelector("textarea");
  const sendButton = root.querySelector(".boboi-send-button");
  const mascotImage = root.querySelector(".boboi-character img");
  const micButton = root.querySelector('[data-action="mic"]');
  const dragButton = root.querySelector('[data-action="drag"]');
  let voiceEnabled = false;
  let recognition = null;
  let moodTimers = [];
  let isAnswering = false;
  let isSpeaking = false;
  let isListening = false;
  let latestMessage = "";
  let stopLiveContextLoop = null;

  root.querySelector('[data-action="chat"]').addEventListener("click", () => {
    chat.hidden = !chat.hidden;
    if (!chat.hidden) {
      textarea.focus();
    }
  });

  root.querySelector('[data-action="settings"]').addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "BOBOI_OPEN_OPTIONS" });
  });

  root.querySelector('[data-action="close"]').addEventListener("click", () => {
    window.speechSynthesis?.cancel();
    isSpeaking = false;
    recognition?.stop();
    isListening = false;
    stopLiveContextLoop?.();
    root.remove();
    window.__boboiLoaded = false;
  });

  seeMoreButton.addEventListener("click", () => {
    bubble.classList.toggle("is-expanded");
    seeMoreButton.textContent = bubble.classList.contains("is-expanded") ? "Show less" : "See more";
    messageBox.textContent = bubble.classList.contains("is-expanded") ? latestMessage : getPreviewText(latestMessage);
  });

  micButton.addEventListener("click", () => {
    if (voiceEnabled) {
      setVoiceEnabled(false);
      window.speechSynthesis?.cancel();
      isSpeaking = false;
      recognition?.stop();
      isListening = false;
      say("Microphone off.", false);
      return;
    }

    setVoiceEnabled(true);
    startVoice();
  });

  chat.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(textarea.value);
    textarea.value = "";
    updateSendButton();
  });

  textarea.addEventListener("input", updateSendButton);
  updateSendButton();

  makeDraggable(root, dragButton);
  window.addEventListener("resize", () => keepInsideViewport(root));
  warmSpeechVoices();
  say("Hello boboi. I am ready.", false);
  stopLiveContextLoop = startLiveContextLoop();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "BOBOI_GET_PAGE_CONTEXT") {
      sendResponse(getPageContext());
    }
  });

  async function ask(question) {
    const cleanQuestion = String(question || "").trim();
    if (!cleanQuestion) {
      return;
    }

    isAnswering = true;
    setMood("thinking");
    say("Thinking with the screen, boboi...", false);

    try {
      scheduleMood("searching", 550);
      scheduleMood("spinning", 1800);
      scheduleMood("jumping", 3200);
      const response = await chrome.runtime.sendMessage({
        type: "BOBOI_ASK",
        payload: { question: cleanQuestion }
      });
      clearMoodTimers();

      if (!response?.ok) {
        throw new Error(response?.error || "Something went wrong.");
      }

      setMood("dancing");
      say(response.answer, true);
      setTimeout(() => setMood("idle"), 1400);
    } catch (error) {
      clearMoodTimers();
      setMood("idle");
      say(error.message || String(error), true);
    } finally {
      isAnswering = false;
      if (voiceEnabled && !isSpeaking) {
        setTimeout(startVoice, 450);
      }
    }
  }

  function say(text, speak) {
    bubble.hidden = false;
    latestMessage = String(text || "");
    bubble.classList.remove("is-expanded");
    messageBox.textContent = getPreviewText(latestMessage);
    requestAnimationFrame(updateSeeMoreButton);
    seeMoreButton.textContent = "See more";

    if (speak) {
      window.speechSynthesis?.cancel();
      if (isListening) {
        recognition?.stop();
      }
      const spokenText = cleanSpeechText(text);
      playLocalTts(spokenText).then((played) => {
        if (!played) {
          speakWithBrowserVoice(spokenText);
        }
      });
    }
  }

  async function playLocalTts(spokenText) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "BOBOI_TTS",
        payload: { text: spokenText }
      });

      if (!response?.ok || !response.audioDataUrl) {
        return false;
      }

      if (isListening) {
        recognition?.stop();
      }

      const audio = new Audio(response.audioDataUrl);
      isSpeaking = true;
      audio.onended = () => {
        isSpeaking = false;
        if (voiceEnabled && !isAnswering) {
          setTimeout(startVoice, 350);
        }
      };
      audio.onerror = () => {
        isSpeaking = false;
      };
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  function speakWithBrowserVoice(spokenText) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      if (isListening) {
        recognition?.stop();
      }
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.rate = 0.92;
      utterance.pitch = 1.08;
      const voice = getPreferredVoice();
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onstart = () => {
        isSpeaking = true;
      };
      utterance.onend = () => {
        isSpeaking = false;
        if (voiceEnabled && !isAnswering) {
          setTimeout(startVoice, 350);
        }
      };
      utterance.onerror = () => {
        isSpeaking = false;
      };
      window.speechSynthesis.speak(utterance);
    }
  }

  function setMood(mood) {
    character.dataset.mood = mood;
    mascotImage.src = actionImages[mood] || actionImages.idle;
  }

  function scheduleMood(mood, delay) {
    moodTimers.push(setTimeout(() => setMood(mood), delay));
  }

  function clearMoodTimers() {
    moodTimers.forEach((timerId) => clearTimeout(timerId));
    moodTimers = [];
  }

  function setVoiceEnabled(enabled) {
    voiceEnabled = enabled;
    micButton.classList.toggle("is-on", enabled);
    micButton.classList.toggle("is-off", !enabled);
    micButton.title = enabled ? "Microphone on" : "Microphone off";
    micButton.setAttribute("aria-label", micButton.title);
  }

  function updateSendButton() {
    const hasText = textarea.value.trim().length > 0;
    sendButton.disabled = !hasText;
    sendButton.classList.toggle("is-ready", hasText);
  }

  function updateSeeMoreButton() {
    const isTruncated = latestMessage.trim().length > messageBox.textContent.trim().length;
    const isOverflowing = bubble.scrollHeight > bubble.clientHeight + 2 || messageBox.scrollHeight > messageBox.clientHeight + 2;
    const shouldShow = isTruncated || isOverflowing;
    bubble.classList.toggle("is-long", shouldShow);
    seeMoreButton.hidden = !shouldShow;
  }

  function startVoice() {
    if (!voiceEnabled || isAnswering || isSpeaking || isListening) {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      say("Voice input is not available in this browser.", true);
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    setMood("calling");
    say("Listening, boboi...", false);
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result?.isFinal) {
        return;
      }
      const transcript = result[0]?.transcript || "";
      recognition.stop();
      ask(transcript);
    };
    recognition.onerror = (event) => {
      setMood("idle");
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setVoiceEnabled(false);
        say("Microphone permission is blocked. Allow microphone access for this site, then turn the mic on again.", false);
        return;
      }
      if (event.error === "no-speech") {
        if (voiceEnabled && !isAnswering) {
          setTimeout(startVoice, 500);
        }
        return;
      }
      say(`Voice error: ${event.error}`, false);
    };
    recognition.onend = () => {
      isListening = false;
      if (character.dataset.mood === "calling") {
        setMood("idle");
      }
      if (voiceEnabled && !isAnswering) {
        setTimeout(startVoice, 500);
      }
    };
    try {
      recognition.start();
      isListening = true;
    } catch (error) {
      isListening = false;
      say(error.message || String(error), false);
    }
  }
})();

function startLiveContextLoop() {
  let timerId = null;

  const refresh = async () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: "BOBOI_PREFETCH_CONTEXT",
        payload: {}
      });

      if (response?.ok) {
        return;
      }
    } catch {
      // Keep live context refresh silent. It should never interrupt the page.
    }
  };

  refresh();
  timerId = window.setInterval(refresh, 10000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (timerId) {
      window.clearInterval(timerId);
    }
  });

  return () => {
    if (timerId) {
      window.clearInterval(timerId);
    }
  };
}

function getPreviewText(text) {
  const clean = String(text || "").trim();
  if (clean.length <= 280) {
    return clean;
  }
  return `${clean.slice(0, 280).trim()}...`;
}

function stripEmoji(text) {
  return String(text || "")
    .replace(/[\uFE0E\uFE0F\u200D]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSpeechText(text) {
  return stripEmoji(text)
    .replace(/```[\s\S]*?```/g, " code block omitted ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~>#|[\]{}()]/g, " ")
    .replace(/-{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPreferredVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const preferredNames = ["natural", "online", "aria", "jenny", "zira", "samantha", "susan", "female", "woman", "google us english"];
  return voices.find((voice) => {
    const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
    return preferredNames.some((preferredName) => name.includes(preferredName));
  }) || voices.find((voice) => voice.lang?.toLowerCase().startsWith("en")) || null;
}

function warmSpeechVoices() {
  if (!window.speechSynthesis?.getVoices) {
    return;
  }
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

function getPageContext() {
  const visibleText = Array.from(document.body?.innerText || "")
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);

  return {
    title: document.title || "",
    url: location.href,
    selection: String(window.getSelection?.() || "").trim().slice(0, 2000),
    visibleText
  };
}

function makeDraggable(root, handle) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    const rect = root.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }

    setRootPosition(root, event.clientX - offsetX, event.clientY - offsetY);
  });

  handle.addEventListener("pointerup", () => {
    dragging = false;
    keepInsideViewport(root);
  });
}

function placeDefault(root) {
  requestAnimationFrame(() => {
    const margin = getViewportMargin();
    const left = window.innerWidth - root.offsetWidth - margin;
    const top = window.innerHeight - root.offsetHeight - margin;
    setRootPosition(root, left, top);
  });
}

function keepInsideViewport(root) {
  const rect = root.getBoundingClientRect();
  setRootPosition(root, rect.left, rect.top);
}

function setRootPosition(root, left, top) {
  const margin = getViewportMargin();
  const maxLeft = Math.max(margin, window.innerWidth - root.offsetWidth - margin);
  const maxTop = Math.max(margin, window.innerHeight - root.offsetHeight - margin);
  const nextLeft = clamp(left, margin, maxLeft);
  const nextTop = clamp(top, margin, maxTop);

  root.style.left = `${nextLeft}px`;
  root.style.top = `${nextTop}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
}

function getViewportMargin() {
  return window.innerWidth <= 520 ? 12 : 16;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
