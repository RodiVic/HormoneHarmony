/* ================================
   Service Worker Registration
=================================== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then(() => console.log("Service Worker registered"))
      .catch((err) => console.error("Service Worker registration failed:", err));
  });
}

/* ================================
   IndexedDB Setup
=================================== */
let db;
const request = indexedDB.open("HormoneHarmonyDB", 2); // bumped version

request.onupgradeneeded = (event) => {
  db = event.target.result;

  if (!db.objectStoreNames.contains("userProfile")) {
    db.createObjectStore("userProfile", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("symptomLogs")) {
    db.createObjectStore("symptomLogs", { keyPath: "timestamp" });
  }
  if (!db.objectStoreNames.contains("medLogs")) {
    db.createObjectStore("medLogs", { keyPath: "timestamp" });
  }
  if (!db.objectStoreNames.contains("cycles")) {
    db.createObjectStore("cycles", { keyPath: "id", autoIncrement: true });
  }
  if (!db.objectStoreNames.contains("progressLogs")) {
    db.createObjectStore("progressLogs", { keyPath: "timestamp" });
  }
};

request.onsuccess = (event) => {
  db = event.target.result;
  console.log("IndexedDB initialized");
  loadUserProfile();
  renderSymptoms();
  renderMeds();
  renderCycles();
  renderProgress();
  updateDashboard();
};

request.onerror = (event) => {
  console.error("IndexedDB error:", event.target.errorCode);
};

/* ================================
   Utility Functions
=================================== */
function saveData(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readwrite");
    tx.objectStore(storeName).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = (err) => reject(err);
  });
}

function getAllData(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (err) => reject(err);
  });
}

/* ================================
   Onboarding
=================================== */
function loadUserProfile() {
  const tx = db.transaction(["userProfile"], "readonly");
  const store = tx.objectStore("userProfile");
  const req = store.get("main");

  req.onsuccess = () => {
    if (req.result) {
      document.getElementById("greeting").textContent =
        `Welcome back, ${req.result.name || "friend"} 👋`;
    } else {
      document.getElementById("onboardingModal").classList.remove("hidden");
    }
  };
}

document.getElementById("onboardingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const profile = {
    id: "main",
    name: document.getElementById("userName").value.trim(),
    age: document.getElementById("userAge").value,
    height: document.getElementById("userHeight").value,
    weight: document.getElementById("userWeight").value
  };

  await saveData("userProfile", profile);
  document.getElementById("greeting").textContent =
    `Welcome, ${profile.name || "friend"} 👋`;
  document.getElementById("onboardingModal").classList.add("hidden");
});

/* ================================
   Symptom Tracker
=================================== */
document.getElementById("symptomForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const log = {
    timestamp: Date.now(),
    symptom: document.getElementById("symptomName").value,
    severity: document.getElementById("symptomSeverity").value,
    notes: document.getElementById("symptomNotes").value
  };

  await saveData("symptomLogs", log);
  renderSymptoms();
  updateDashboard();
  e.target.reset();
});

async function renderSymptoms() {
  const logs = await getAllData("symptomLogs");
  const list = document.getElementById("symptomList");
  list.innerHTML = logs.slice(-5).reverse().map(l =>
    `<div class="log-entry">
       <strong>${l.symptom}</strong> (Severity: ${l.severity})<br>
       ${l.notes || ""}<br>
       <small>${new Date(l.timestamp).toLocaleString()}</small>
     </div>`
  ).join("");
}

/* ================================
   Medication Tracker
=================================== */
document.getElementById("medForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const log = {
    timestamp: Date.now(),
    name: document.getElementById("medName").value,
    dosage: document.getElementById("medDosage").value,
    site: document.getElementById("medSite").value,
    info: document.getElementById("medInfo").value
  };

  await saveData("medLogs", log);
  renderMeds();
  updateDashboard();
  e.target.reset();
});

async function renderMeds() {
  const logs = await getAllData("medLogs");
  const list = document.getElementById("medList");
  list.innerHTML = logs.slice(-5).reverse().map(l =>
    `<div class="log-entry">
       <strong>${l.name}</strong> – ${l.dosage}<br>
       Site: ${l.site || "N/A"} | ${l.info || ""}<br>
       <small>${new Date(l.timestamp).toLocaleString()}</small>
     </div>`
  ).join("");
}

/* ================================
   Period Tracker
=================================== */
let currentCycle = null;

document.getElementById("startPeriod").addEventListener("click", async () => {
  currentCycle = { start: Date.now(), end: null, notes: "" };
  alert("Period started.");
});

document.getElementById("endPeriod").addEventListener("click", async () => {
  if (!currentCycle) {
    alert("Start a period first.");
    return;
  }
  currentCycle.end = Date.now();
  currentCycle.notes = document.getElementById("periodNotes").value;
  await saveData("cycles", currentCycle);
  currentCycle = null;
  renderCycles();
  alert("Period ended and saved.");
});

async function renderCycles() {
  const cycles = await getAllData("cycles");
  const list = document.getElementById("cycleHistory");

  let avgLength = 0;
  if (cycles.length > 1) {
    const lengths = cycles.filter(c => c.end).map(c =>
      (c.end - c.start) / (1000 * 60 * 60 * 24)
    );
    avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  }

  list.innerHTML = cycles.slice(-5).reverse().map(c =>
    `<div class="log-entry">
       Start: ${new Date(c.start).toLocaleDateString()}<br>
       End: ${c.end ? new Date(c.end).toLocaleDateString() : "Ongoing"}<br>
       Notes: ${c.notes || ""}
     </div>`
  ).join("");

  if (avgLength > 0) {
    const last = cycles[cycles.length - 1];
    if (last.end) {
      const nextExpected = new Date(last.start + avgLength * 24 * 60 * 60 * 1000);
      list.innerHTML += `<p><strong>Next expected period:</strong> ${nextExpected.toLocaleDateString()}</p>`;
    }
  }
}

/* ================================
   Progress Tracker (Weight & BMI)
=================================== */
document.getElementById("progressForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const weight = parseFloat(document.getElementById("weightInput").value);
  if (!weight) return alert("Please enter your weight");

  const tx = db.transaction(["userProfile"], "readonly");
  const store = tx.objectStore("userProfile");
  const req = store.get("main");

  req.onsuccess = async () => {
    const profile = req.result;
    const heightCm = parseFloat(profile?.height || 170);
    const heightM = heightCm / 100;
    const bmi = (weight / (heightM * heightM)).toFixed(1);

    const entry = { timestamp: Date.now(), weight, bmi };
    await saveData("progressLogs", entry);
    renderProgress();
    updateDashboard();
    e.target.reset();
  };
});

async function renderProgress() {
  const logs = await getAllData("progressLogs");
  if (!logs.length) return;

  const ctx = document.getElementById("bmiChart").getContext("2d");
  const labels = logs.map(l => new Date(l.timestamp).toLocaleDateString());
  const weights = logs.map(l => l.weight);
  const bmis = logs.map(l => l.bmi);

  if (window.bmiChartInstance) window.bmiChartInstance.destroy();

  window.bmiChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Weight (kg)", data: weights, borderColor: "#6b4483", fill: false, yAxisID: "y" },
        { label: "BMI", data: bmis, borderColor: "#fb4889", fill: false, yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: { type: "linear", position: "left", title: { display: true, text: "Weight (kg)" } },
        y1: { type: "linear", position: "right", title: { display: true, text: "BMI" }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

/* ================================
   Dashboard Stats Update
=================================== */
async function updateDashboard() {
  const symptoms = await getAllData("symptomLogs");
  const meds = await getAllData("medLogs");
  document.getElementById("symptomCount").textContent = symptoms.length;
  document.getElementById("medCount").textContent = meds.length;

  const progress = await getAllData("progressLogs");
  if (progress.length > 0) {
    const latest = progress[progress.length - 1];
    document.getElementById("latestWeight").textContent = `${latest.weight} kg`;
    document.getElementById("latestBMI").textContent = latest.bmi;
    if (progress.length > 1) {
      const prev = progress[progress.length - 2];
      const trend = latest.bmi > prev.bmi ? "⬆️" : latest.bmi < prev.bmi ? "⬇️" : "➡️";
      document.getElementById("bmiTrend").textContent = trend;
    }
  }
}

/* ================================
   Backup & Export
=================================== */
function exportCSV(data, filename) {
  if (!data.length) return;
  const csv = [
    Object.keys(data[0]).join(","),
    ...data.map(row => Object.values(row).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

document.getElementById("exportCSV").addEventListener("click", async () => {
  const symptoms = await getAllData("symptomLogs");
  const meds = await getAllData("medLogs");
  const cycles = await getAllData("cycles");
  const progress = await getAllData("progressLogs");
  if (symptoms.length) exportCSV(symptoms, "symptoms.csv");
  if (meds.length) exportCSV(meds, "medications.csv");
  if (cycles.length) exportCSV(cycles, "cycles.csv");
  if (progress.length) exportCSV(progress, "progress.csv");
});

// Encryption helpers
async function encryptData(data, passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]);
  const key = await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("hormoneharmony"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  return { encrypted: Array.from(new Uint8Array(encrypted)), iv: Array.from(iv) };
}

async function decryptData(encryptedData, passphrase) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]);
  const key = await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("hormoneharmony"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const iv = new Uint8Array(encryptedData.iv);
  const data = new Uint8Array(encryptedData.encrypted);
  const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(dec.decode(decrypted));
}

document.getElementById("exportEncrypted").addEventListener("click", async () => {
  const allData = {
    profile: await getAllData("userProfile"),
    symptoms: await getAllData("symptomLogs"),
    meds: await getAllData("medLogs"),
    cycles: await getAllData("cycles"),
    progress: await getAllData("progressLogs")
  };
  const passphrase = prompt("Enter passphrase for encryption:");
  if (!passphrase) return;
  const encrypted = await encryptData(allData, passphrase);
  const blob = new Blob([JSON.stringify(encrypted)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "hormone_harmony_backup.json";
  link.click();
});

document.getElementById("importBackup").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  const passphrase = prompt("Enter passphrase to decrypt:");
  if (!passphrase) return;

  try {
    const restored = await decryptData(data, passphrase);
    if (restored.profile?.[0]) await saveData("userProfile", restored.profile[0]);
    restored.symptoms?.forEach(s => saveData("symptomLogs", s));
    restored.meds?.forEach(m => saveData("medLogs", m));
    restored.cycles?.forEach(c => saveData("cycles", c));
    restored.progress?.forEach(p => saveData("progressLogs", p));
    alert("Backup restored successfully!");
    renderSymptoms();
    renderMeds();
    renderCycles();
    renderProgress();
    updateDashboard();
  } catch (err) {
    alert("Failed to decrypt backup. Wrong passphrase?");
  }
});

/* ================================
   Navigation Menu
=================================== */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-section");
    document.querySelectorAll(".tab-section").forEach(sec => sec.classList.add("hidden"));
    document.getElementById(target).classList.remove("hidden");
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});
