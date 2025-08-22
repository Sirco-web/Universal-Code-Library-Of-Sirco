/*************************************************
 * SECTION 1 — GLOBAL CONFIG
 *************************************************/
// Backend endpoints & credentials
const CONVERT_API_SECRET = "uTUuVOyN3zeygvDUmxB0bzxsKDpdf3g9"; // PDF to PNG
const AI_API_KEY = ""; // <-- Replace with your AI API key
const API_STORAGE_KEY = "inkline_api_secret"; // Storage key for ConvertAPI secret
const AI_STORAGE_KEY = "inkline_ai_key"; // Storage key for AI key

// Example AI endpoint (replace with your actual)
const AI_API_URL = "https://api.groq.com/openai/v1/models";

/*************************************************
 * SECTION 2 — DOM ELEMENTS
 *************************************************/
const signInForm = document.getElementById("signInForm");
const apiKeyInput = document.getElementById("apiKey"); // ConvertAPI
const aiKeyInput = document.getElementById("aiKey");   // AI API
const guestBtn = document.getElementById("guestMode");
const fileInput = document.getElementById("pdfFile");
const previewContainer = document.getElementById("preview");
const statusText = document.getElementById("status");
const aiPromptInput = document.getElementById("aiPrompt");
const aiResponseContainer = document.getElementById("aiResponse");
const sendPromptBtn = document.getElementById("sendPrompt");

/*************************************************
 * SECTION 3 — SIGN‑IN / SESSION LOGIC
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const storedConvertKey = localStorage.getItem(API_STORAGE_KEY);
  const storedAIKey = localStorage.getItem(AI_STORAGE_KEY);
  if (storedConvertKey || storedAIKey) {
    setStatus("Signed in with saved credentials");
    toggleAppVisibility(true);
  }
});

// Save keys from sign‑in form
signInForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const convertKey = apiKeyInput.value.trim();
  const aiKey = aiKeyInput.value.trim();

  if (!convertKey || !aiKey) return alert("Please enter both keys");

  localStorage.setItem(API_STORAGE_KEY, convertKey);
  localStorage.setItem(AI_STORAGE_KEY, aiKey);

  setStatus("Signed in successfully");
  toggleAppVisibility(true);
});

// Handle guest mode
guestBtn?.addEventListener("click", () => {
  // Clear any stored API keys
  localStorage.removeItem(API_STORAGE_KEY);
  localStorage.removeItem(AI_STORAGE_KEY);

  // Optional: auto‑inject default ConvertAPI secret for PDF conversion
  localStorage.setItem(API_STORAGE_KEY, CONVERT_API_SECRET);

  // Hide sign‑in, show app
  document.getElementById("signInPage").style.display = "none";
  document.getElementById("appPage").style.display = "block";

  setStatus("Guest mode activated — using default ConvertAPI key only");
});


function toggleAppVisibility(showApp) {
  document.getElementById("signInPage").style.display = showApp ? "none" : "block";
  document.getElementById("appPage").style.display = showApp ? "block" : "none";
}

/*************************************************
 * SECTION 4 — FILE INPUT HANDLER (ConvertAPI)
 *************************************************/
fileInput?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  previewContainer.innerHTML = "";
  setStatus(`Uploading ${file.name}…`);

  try {
    const secret = localStorage.getItem(API_STORAGE_KEY) || CONVERT_API_SECRET;

    const images = await pdfToImagesOnline(file, secret, (p, t) =>
      setStatus(`Processing: ${Math.round((p / t) * 100)}%`)
    );

    previewContainer.innerHTML = "";
    images.forEach((url) => {
      const img = document.createElement("img");
      img.src = url;
      img.style.maxWidth = "100%";
      img.style.marginBottom = "1em";
      previewContainer.appendChild(img);
    });

    setStatus(`Done — ${images.length} page(s) converted`);
  } catch (err) {
    console.error(err);
    setStatus("Error converting file.");
  }
});

/*************************************************
 * SECTION 5 — AI PROMPT HANDLER
 *************************************************/
sendPromptBtn?.addEventListener("click", async () => {
  const prompt = aiPromptInput.value.trim();
  if (!prompt) return;

  const aiKey = localStorage.getItem(AI_STORAGE_KEY) || AI_API_KEY;
  if (!aiKey) {
    return alert("No AI API key found — sign in or add it to config.");
  }

  setStatus("Sending prompt to AI…");
  aiResponseContainer.textContent = "";

  try {
    const resp = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${aiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4", // Example — change to your model
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || "(No response)";
    aiResponseContainer.textContent = text;
    setStatus("AI response received");
  } catch (err) {
    console.error(err);
    setStatus("Error talking to AI API.");
  }
});

/*************************************************
 * SECTION 6 — CONVERTAPI CALL
 *************************************************/
async function pdfToImagesOnline(file, secret, onProgress) {
  onProgress && onProgress(0, 1);

  const formData = new FormData();
  formData.append("File", file);

  const resp = await fetch(`https://v2.convertapi.com/pdf/to/png?Secret=${secret}`, {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);

  const data = await resp.json();

  if (!data.Files || !Array.isArray(data.Files))
    throw new Error("Invalid response format");

  onProgress && onProgress(1, 1);
  return data.Files.map((f) => f.Url);
}

/*************************************************
 * SECTION 7 — STATUS HELPER
 *************************************************/
function setStatus(msg) {
  statusText.textContent = msg;
}
