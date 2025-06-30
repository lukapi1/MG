import { auth, results } from './common/supabase.js';
import { Timer, createLogEntry, exportToCSV } from './timer-utils.js';

export function initializeTimer() {
    // Elementy DOM
    const elements = {
        timerDisplay: document.getElementById("timer"),
        trackSelect: document.getElementById("trackSelect"),
        logList: document.getElementById("log"),
        userEmail: document.getElementById("userEmail"),
        logoutBtn: document.getElementById("logoutBtn"),
        startBtn: document.querySelector(".btn-start"),
        stopBtn: document.querySelector(".btn-stop"),
        resetBtn: document.querySelector(".btn-reset"),
        saveBtn: document.querySelector(".btn-save"),
        exportBtn: document.querySelector(".btn-export"),
        uploadBtn: document.querySelector(".btn-upload")
    };

    // Sprawdzenie czy wszystkie elementy istnieją
    for (const [key, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`Element nie znaleziony: ${key}`);
            return;
        }
    }

  // Inicjalizacja timer-a
    const timer = new Timer();
    let currentUser = null;

  // Funkcje obsługi zdarzeń
  async function handleLogout() {
    const { error } = await auth.signOut();
    if (error) {
      alert("Błąd podczas wylogowania: " + error.message);
    } else {
      window.location.href = "login.html";
    }
  }

  function handleStart() {
    timer.start(time => {
      timerDisplay.textContent = time;
    });
  }

  function handleStop() {
    timer.stop();
  }

  function handleReset() {
    timerDisplay.textContent = timer.reset();
  }

  function handleSave() {
    if (!currentUser) return;
    const entry = createLogEntry(
      trackSelect.value,
      timerDisplay.textContent,
      timer.getRawTime(),
      currentUser.email
    );
    logList.appendChild(entry);
  }

  // Funkcja wysyłania zaznaczonych wyników
  async function handleUpload() {
    if (!currentUser) return;

    const checkboxes = document.querySelectorAll('.upload-checkbox:checked');
    if (checkboxes.length === 0) {
      alert("Zaznacz wyniki do wysłania.");
      return;
    }

    const entries = Array.from(checkboxes).map(checkbox => {
      const li = checkbox.closest("li");
      return {
        user_id: currentUser.id,
        track_name: li.dataset.track,
        result_time_raw: parseInt(li.dataset.timeRaw),
        result_time_display: li.dataset.timeDisplay
      };
    });

    try {
      const { error } = await results.saveResults(entries);
      if (error) throw error;
      
      alert(`✅ Zapisano ${entries.length} wyników!`);
      checkboxes.forEach(checkbox => {
        const li = checkbox.closest("li");
        checkbox.replaceWith(createStatusBadge('✅'));
      });
    } catch (error) {
      console.error("Błąd zapisu:", error);
      alert(`❌ Błąd zapisu: ${error.message}`);
    }
  }

  // Funkcja eksportu dziennika
    function handleExport() {
        if (!exportToCSV("log")) {
        alert("Brak zapisanych przejazdów do eksportu.");
        }
    }

    // Funkcja pomocnicza do tworzenia znacznika statusu
    function createStatusBadge(icon) {
        const span = document.createElement("span");
        span.style.color = icon === '✅' ? '#28a745' : '#dc3545';
        span.style.marginLeft = '10px';
        span.textContent = icon;
        return span;
    }

// Inicjalizacja
  async function init() {
    const { data: { session } } = await auth.getSession();
    
    if (!session?.user) {
      alert("Musisz być zalogowany, aby korzystać z aplikacji.");
      window.location.href = "login.html";
      return;
    }

    currentUser = session.user;
    elements.userEmail.textContent = currentUser.email;

    // Przypisanie event listenerów
    elements.startBtn.addEventListener("click", () => {
      timer.start(time => {
        elements.timerDisplay.textContent = time;
      });
    });

    elements.stopBtn.addEventListener("click", timer.stop.bind(timer));
    elements.resetBtn.addEventListener("click", () => {
      elements.timerDisplay.textContent = timer.reset();
    });

    elements.saveBtn.addEventListener("click", () => {
      if (!currentUser) return;
      const entry = createLogEntry(
        elements.trackSelect.value,
        elements.timerDisplay.textContent,
        timer.getRawTime(),
        currentUser.email
      );
      elements.logList.appendChild(entry);
    });

    elements.exportBtn.addEventListener("click", handleExport);
    elements.uploadBtn.addEventListener("click", handleUpload);
    elements.logoutBtn.addEventListener("click", async () => {
      const { error } = await auth.signOut();
      if (error) {
        alert("Błąd podczas wylogowania: " + error.message);
      } else {
        window.location.href = "login.html";
      }
    });

    elements.trackSelect.addEventListener("change", () => {
      elements.timerDisplay.textContent = timer.reset();
    });
  }

  init();
}