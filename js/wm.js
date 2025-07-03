import supabase from './common/supabase.js';
import { auth } from './common/supabase.js';

/**
 * Konfiguracja aplikacji
 */
const config = { 
  wheelieThreshold: 10, 
  dangerThreshold: 27, 
  updateInterval: 50 
};

/**
 * Główny stan aplikacji
 */
const state = {
  user: null, 
  isMeasuring: false,
  isWheelie: false,
  isSessionActive: false,
  startTime: 0,
  currentAngle: 0,
  maxAngle: 0,
  calibrationOffset: 0,
  measurements: [],
  isLightMode: false,
  unsavedResults: null,
  wheelieAngles: [],
  sessionId: generateSessionId(),
  isTrainingSession: false,
  sessionStartTime: 0,
  sessionTimer: null,
  sessionDuration: 0,
  isCalibrating: false,
  hasBeenCalibrated: false,
  sessionName: "",
};

/**
 * Generuje losowe ID sesji (UUID v4)
 */
function generateSessionId() {
  return crypto.randomUUID();
}

async function generateSessionName(userId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Pobierz liczbę sesji użytkownika danego dnia
  const { data, error } = await supabase
    .from('wheelie_results')
    .select('session_name', { count: 'exact', head: false })
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00`)
    .lte('created_at', `${today}T23:59:59`);

  if (error) {
    console.error("Błąd przy sprawdzaniu liczby sesji:", error);
    return `${today} #?`;
  }

  // Zlicz unikalne nazwy sesji (może być wiele wpisów w 1 sesji)
  const sessionNumbers = new Set();
  data.forEach(entry => {
    const match = entry.session_name?.match(/#(\d+)$/);
    if (match) {
      sessionNumbers.add(parseInt(match[1], 10));
    }
  });

  const nextNumber = sessionNumbers.size + 1;
  return `${today} #${nextNumber}`;
}


/**
 * Referencje do elementów DOM
 */
const elements = {
  userEmail: document.getElementById('userEmail'),
  logoutBtn: document.getElementById('logoutBtn'),
  angleDisplay: document.getElementById('angle-display'),
  timeDisplay: document.getElementById('time-display'),
  status: document.getElementById('status'),
  gaugeFill: document.getElementById('gauge-fill'),
  resetBtn: document.getElementById('resetBtn'),
  saveBtn: document.getElementById('saveBtn'),
  calibrateBtn: document.getElementById('calibrateBtn'),
  themeBtn: document.getElementById('themeBtn'),
  history: document.getElementById('history'),
  calibrationValue: document.getElementById('calibration-value'),
  sessionBtn: document.getElementById('sessionBtn'),
  endSessionBtn: document.getElementById('endSessionBtn'),
  sessionTimeDisplay: document.getElementById('session-time-display')
};


/**
 * Inicjalizacja aplikacji
 */
async function init() { 
  // Sprawdź czy użytkownik jest zalogowany
  const { data: { session }, error } = await auth.getSession();
  
  if (!session?.user) {
    alert("Musisz być zalogowany, aby korzystać z Wheelie Meter");
    window.location.href = "login.html";
    return;
  }

  state.user = session.user;
  elements.userEmail.textContent = session.user.email;

  // Inicjalizacja przycisków
  elements.resetBtn.addEventListener('click', resetSession);
  elements.saveBtn.addEventListener('click', saveSession);
  elements.calibrateBtn.addEventListener('click', calibrate);
  elements.themeBtn.addEventListener('click', toggleTheme);
  elements.logoutBtn.addEventListener('click', handleLogout); 
  elements.sessionBtn.addEventListener('click', startTrainingSession);
  elements.endSessionBtn.addEventListener('click', endTrainingSession);

  elements.resetBtn.disabled = true;
  elements.saveBtn.disabled = true;

  loadSettings();

  if (!window.DeviceOrientationEvent) {
    elements.status.textContent = "Twoje urządzenie nie wspiera czujników orientacji";
    elements.sessionBtn.disabled = true;
    return;
  }

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    elements.sessionBtn.textContent = "DOTKNIJ ABY ZACZĄĆ";
    elements.sessionBtn.addEventListener('click', () => {
      requestPermission().then(granted => {
        if (granted) {
          setupSensor(); // Dodajemy to!
          elements.sessionBtn.textContent = "START SESJI";
          elements.sessionBtn.removeEventListener('click', requestPermission);
          elements.sessionBtn.addEventListener('click', startTrainingSession);
        }
      });
    });
  } else {
    setupSensor(); // Dodajemy to dla innych przeglądarek
    elements.sessionBtn.addEventListener('click', startTrainingSession);
  }
  
  elements.endSessionBtn.addEventListener('click', endTrainingSession);
  elements.status.textContent = "Wykonaj kalibrację przed rozpoczęciem sesji";
}

/**
 * Rozpoczyna pomiar
 */
function toggleMeasurement() {
  if (!state.user) {
    showNotification("Musisz być zalogowany", "error");
    return;
  }

  state.isSessionActive = true;
  state.isMeasuring = true;
  elements.startBtn.disabled = true;
  elements.resetBtn.disabled = false;
  elements.status.textContent = "Czekam na wheelie...";
}

/**
 * Resetuje sesję
 */
function resetSession() {
  if (confirm("Czy na pewno chcesz zresetować sesję? Wyniki nie zostaną zapisane.")) {
    // Zatrzymaj timer sesji jeśli aktywny
    if (state.sessionTimer) {
      clearInterval(state.sessionTimer);
    }
    
    // Resetuj stan
    state.isSessionActive = false;
    state.isMeasuring = false;
    state.isTrainingSession = false;
    state.sessionDuration = 0;
    state.sessionId = generateSessionId();
    state.calibrationOffset = 0; // Resetujemy kalibrację
    state.hasBeenCalibrated = false; // RESETUJEMY FLAGĘ

    // Resetuj stan pomiarów
    resetMeasurementState();
    
    // Zresetuj interfejs
    elements.history.innerHTML = "";
    elements.timeDisplay.textContent = "0.00s";
    elements.sessionTimeDisplay.textContent = "SESJA: 00:00:00";
    elements.sessionBtn.disabled = false;
    elements.endSessionBtn.disabled = true;
    elements.resetBtn.disabled = true;
    elements.saveBtn.disabled = true;
    elements.status.textContent = "Gotowy do pomiaru. Wykonaj kalibrację.";
    elements.angleDisplay.textContent = "0°";
    elements.gaugeFill.style.width = "0%";
    updateCalibrationDisplay();
  }
}

/**
 * Zapisuje wyniki do bazy danych
 */
async function saveSession() {
  if (!state.user?.id) {
    showNotification("Błąd autoryzacji", "error");
    return;
  }
  
  if (state.measurements.some(m => m.angle > 90 || m.angle < 0)) {
    showNotification("Nieprawidłowe wartości kątów", "error");
    return;
  }

  if (!state.user) {
    alert("Musisz być zalogowany, aby zapisywać wyniki!");
    return;
  }

  if (!state.measurements || state.measurements.length === 0) {
    alert("Brak wyników do zapisania!");
    return;
  }

  if (!state.unsavedResults) {
    alert("Te wyniki już zostały zapisane.");
    return;
  }
  elements.saveBtn.classList.add('saving');
  // Po zapisie:
  elements.saveBtn.classList.remove('saving');
  elements.saveBtn.disabled = true;
  elements.status.textContent = "Zapisywanie do bazy...";

  try {
    const sessionId = state.sessionId;
    const entries = state.measurements.map(m => ({
      user_id: state.user.id,
      angle: parseFloat(m.angle.toFixed(1)),
      avg_angle: parseFloat(m.avgAngle.toFixed(1)),
      duration: parseFloat(m.duration.toFixed(2)),
      max_angle: parseFloat(m.angle.toFixed(1)),
      session_name: state.sessionName,
      created_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('wheelie_results').insert(entries);

    if (error) throw error;

    elements.status.textContent = `✅ Zapisano ${entries.length} wyników (sesja ${sessionId.slice(0, 8)}...)`;
    showNotification(`Zapisano ${entries.length} wyników ✅`, 'success');

    // Wyłączenie dalszego zapisu
    state.unsavedResults = null;
    state.measurements = [];
    elements.saveBtn.disabled = true;
    elements.resetBtn.disabled = true;
  } catch (error) {
    elements.status.textContent = `❌ Błąd zapisu: ${error.message}`;
    showNotification("❌ Błąd zapisu do bazy!", 'error');
    console.error("Błąd zapisu:", error);
    elements.saveBtn.disabled = false;
  }
}

/**
 * Obsługa wylogowania
 */
async function handleLogout() {
  const { error } = await auth.signOut();
  if (error) {
    alert("Błąd podczas wylogowania: " + error.message);
  } else {
    window.location.href = "login.html";
  }
}

/**
 * Kalibruje czujnik
 */
function calibrate() {
  // Tymczasowo włączamy pomiar tylko na czas kalibracji
  const wasMeasuring = state.isMeasuring;
  state.isMeasuring = true;
  
  // Czekamy na aktualny odczyt z czujnika
  setTimeout(() => {
    if (state.currentAngle !== null) {
      state.calibrationOffset = state.currentAngle;
      state.hasBeenCalibrated = true;
      updateCalibrationDisplay();
      
      elements.status.textContent = `Wykalibrowano (offset: ${state.calibrationOffset.toFixed(1)}°)`;
      showNotification("Kalibracja wykonana pomyślnie", "success");
      
      // Przywracamy poprzedni stan pomiaru
      state.isMeasuring = wasMeasuring;
      
      // Włączamy przycisk startu sesji
      elements.sessionBtn.disabled = false;
    } else {
      elements.status.textContent = "Błąd kalibracji - brak danych z czujnika";
      state.isMeasuring = wasMeasuring;
    }
  }, 100);
}

/**
 * Aktualizuje wyświetlaną wartość kalibracji
 */
function updateCalibrationDisplay() {
  elements.calibrationValue.textContent = `Kalibracja: ${state.calibrationOffset.toFixed(1)}°`;
}

/**
 * Prosi o uprawnienia na iOS
 */
function requestPermission() {
  return DeviceOrientationEvent.requestPermission()
    .then(response => {
      if (response === 'granted') {
        setupSensor();
        return true;
      } else {
        elements.status.textContent = "Brak dostępu do czujników";
        return false;
      }
    })
    .catch(error => {
      console.error(error);
      return false;
    });
}


/**
 * Ustawia nasłuchiwanie czujnika
 */
function setupSensor() {
  window.addEventListener('deviceorientation', handleOrientation);
}

/**
 * Obsługuje dane z czujnika
 */
function handleOrientation(event) {
  if (!state.isMeasuring && !state.isCalibrating) return;
  
  let angle = Math.abs(event.beta);
  if (angle > 90) angle = 180 - angle; // Poprawiamy zakres dla niektórych urządzeń
  state.currentAngle = angle;
  
  // Jeśli nie jesteśmy w trakcie sesji, pokazujemy surowy kąt
  if (!state.isSessionActive) {
    elements.angleDisplay.textContent = angle.toFixed(1) + "°";
  } else {
    angle = Math.abs(angle - state.calibrationOffset);
    updateDisplay(angle);
    checkWheelie(angle);
  }
}

/**
 * Aktualizuje interfejs
 */
function updateDisplay(angle) {
  const roundedAngle = Math.round(angle * 10) / 10;
  elements.angleDisplay.textContent = roundedAngle + "°";

  // Nowe obliczenia dla paska (25° = 50% wypełnienia)
  const maxAngle = 50; // Maksymalny kąt (100% wypełnienia)
  let fillPercentage;
  
  if (angle <= 25) {
    // 0–25° → 0–50% wypełnienia
    fillPercentage = (angle / 25) * 50;
  } else {
    // 25–50° → 50–100% wypełnienia
    fillPercentage = 50 + ((angle - 25) / (maxAngle - 25)) * 50;
  }

  elements.gaugeFill.style.width = Math.min(fillPercentage, 100) + "%";

  if (angle >= config.dangerThreshold) {
    elements.angleDisplay.style.color = "var(--primary-color)";
    elements.status.textContent = "UWAGA! ZBYT DUŻY KĄT!";
  } else if (angle >= config.wheelieThreshold) {
    elements.angleDisplay.style.color = "var(--success-color)";
    elements.status.textContent = "WHEELIE!";
  } else {
    elements.angleDisplay.style.color = "var(--primary-color)";
    elements.status.textContent = "Gotowy do pomiaru";
  }
  
  if (state.isWheelie) {
    const currentTime = (Date.now() - state.startTime) / 1000;
    elements.timeDisplay.textContent = currentTime.toFixed(2) + "s";
  }
}

/**
 * Sprawdza czy wykryto wheelie
 */
function checkWheelie(angle) {
  if (angle >= config.wheelieThreshold) {
    if (!state.isWheelie) {
      state.isWheelie = true;
      state.startTime = Date.now();
      state.maxAngle = angle;
      state.wheelieAngles = [angle]; // Inicjalizacja tablicy
    } else {
      state.maxAngle = Math.max(state.maxAngle, angle);
      state.wheelieAngles.push(angle); // Dodajemy kolejny kąt
    }
  } else {
    if (state.isWheelie) {
      endWheelie();
    }
  }
}

/**
 * Kończy wheelie i przygotowuje dane
 */
function endWheelie() {
  state.isWheelie = false;
  const endTime = Date.now();
  const duration = (endTime - state.startTime) / 1000;
  
  // Oblicz średni kąt z wszystkich pomiarów podczas tego wheelie
  const avgAngle = state.wheelieAngles.reduce((sum, a) => sum + a, 0) / state.wheelieAngles.length;
  
  const measurement = {
    angle: state.maxAngle,
    avgAngle: avgAngle, // Dodajemy średni kąt
    time: duration,
    date: new Date().toLocaleTimeString(),
    duration: duration
  };
  
  state.measurements.unshift(measurement);
  state.unsavedResults = measurement;
  updateHistory(measurement);
  
  // Resetujemy tablicę kątów dla następnego wheelie
  state.wheelieAngles = [];
  
  elements.status.textContent = `Wheelie: ${duration.toFixed(2)}s (max: ${state.maxAngle.toFixed(1)}°, avg: ${avgAngle.toFixed(1)}°)`;
  elements.saveBtn.disabled = false;

  // Krótka blokada przed następnym wheelie
  state.isMeasuring = false;
  setTimeout(() => {
    state.isMeasuring = true;
  }, 1000);
}

/**
 * Dodaje wpis do historii
 */
function updateHistory(measurement) {
  const entry = document.createElement('div');
  entry.innerHTML = `
    <div class="history-entry">
      <span class="history-time">${measurement.date}</span>
      <span class="history-duration">${measurement.duration.toFixed(2)}s</span>
      <span class="history-max-angle">${measurement.angle.toFixed(1)}°</span>
      <span class="history-avg-angle">${measurement.avgAngle.toFixed(1)}°</span>
    </div>
  `;
  elements.history.insertBefore(entry, elements.history.firstChild);
}

/**
 * Przełącza tryb jasny/ciemny
 */
function toggleTheme() {
  if (state.isLightMode) {
    document.body.classList.remove('light-mode');
    elements.themeBtn.textContent = "TRYB JASNY";
  } else {
    document.body.classList.add('light-mode');
    elements.themeBtn.textContent = "TRYB CIEMNY";
  }
  
  state.isLightMode = !state.isLightMode;
  saveSettings();
}

/**
 * Włącza tryb jasny
 */
function enableLightMode() {
  document.body.classList.add('light-mode');
  elements.themeBtn.textContent = "TRYB CIEMNY";
  state.isLightMode = true;
}

/**
 * Wczytuje ustawienia
 */
function loadSettings() {
  const savedTheme = localStorage.getItem('wheelieMeterTheme');
  if (savedTheme === 'light') enableLightMode();
  
  // Resetujemy kalibrację przy każdym ładowaniu
  state.calibrationOffset = 0;
  updateCalibrationDisplay();
}

/**
 * Pokazuje widoczny komunikat (powiadomienie)
 */
function showNotification(message, type = 'info') {
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  const notification = document.createElement('div');
  notification.textContent = `${icon} ${message}`;
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.backgroundColor = type === 'success' ? '#4caf50' :
                                       type === 'error' ? '#f44336' : '#2196f3';
  notification.style.color = '#fff';
  notification.style.padding = '12px 24px';
  notification.style.borderRadius = '8px';
  notification.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
  notification.style.zIndex = '9999';
  notification.style.fontSize = '16px';
  document.body.appendChild(notification);

  setTimeout(() => {
    document.body.removeChild(notification);
  }, 4000);
}


/**
 * Zapisuje ustawienia
 */
function saveSettings() {
  localStorage.setItem('wheelieMeterTheme', state.isLightMode ? 'light' : 'dark');
  // Nie zapisujemy już kalibracji
}

function startTrainingSession() {
  if (!state.user) {
    showNotification("Musisz być zalogowany", "error");
    return;
  }

  // SPRAWDZENIE FLAGI
  if (!state.hasBeenCalibrated) {
    showNotification("Najpierw wykonaj kalibrację!", "error");
    elements.calibrateBtn.classList.add('calibrating');
    setTimeout(() => {
      elements.calibrateBtn.classList.remove('calibrating');
    }, 2000);
    return;
  }

  // Rozpoczynamy sesję
  state.isSessionActive = true;
  state.isMeasuring = true;
  state.isTrainingSession = true;
  state.sessionStartTime = Date.now();
  state.sessionId = generateSessionId();

  generateSessionName(state.user.id).then(name => {
    state.sessionName = name;
    updateSessionTimer(); // pokaż nazwę sesji od razu
  });

  
  // Resetujemy stan pomiarów
  resetMeasurementState();
  
  // Aktualizujemy interfejs
  elements.sessionBtn.disabled = true;
  elements.resetBtn.disabled = false;
  elements.saveBtn.disabled = true;
  elements.status.textContent = "Czekam na wheelie...";
  
  // Rozpoczynamy timer sesji
  state.sessionTimer = setInterval(updateSessionTimer, 1000);
  elements.endSessionBtn.disabled = false;
  
  showNotification("Sesja treningowa rozpoczęta", "success");
}

// Dodajemy nową funkcję pomocniczą do resetowania stanu pomiarów
function resetMeasurementState() {
  state.measurements = [];
  state.unsavedResults = null;
  state.wheelieAngles = [];
  state.maxAngle = 0;
  state.isWheelie = false;
  state.startTime = 0;
  state.currentAngle = 0;
}

async function endTrainingSession() {
  if (!state.isTrainingSession) return;

  // Zatrzymanie timera sesji
  clearInterval(state.sessionTimer);
  
  // Zatrzymanie pomiarów
  state.isMeasuring = false;
  state.isTrainingSession = false;
  
  // Przygotowanie danych sesji do zapisu
  const endTime = new Date();
  const sessionData = {
    user_id: state.user.id,
    session_name: state.sessionName,
    start_time: new Date(state.sessionStartTime).toISOString(),
    end_time: endTime.toISOString(),
    duration: state.sessionDuration,
    measurements_count: state.measurements.length,
    max_angle: Math.max(...state.measurements.map(m => m.angle)),
    created_at: endTime.toISOString()
  };

  try {
    const { error } = await supabase.from('training_sessions').insert([sessionData]);
    if (error) throw error;
    showNotification("✅ Sesja zapisana w training_sessions", "success");
  } catch (err) {
    console.error("Błąd zapisu sesji:", err);
    showNotification("❌ Nie udało się zapisać sesji", "error");
  }


  
  // Aktualizacja interfejsu
  elements.sessionBtn.disabled = false;
  elements.endSessionBtn.disabled = true;
  elements.status.textContent = `Sesja zakończona. Czas: ${formatTime(state.sessionDuration)}`;
  
  // Możliwość zapisu całej sesji
  saveSessionData(sessionData);
}

function updateSessionTimer() {
  state.sessionDuration = Math.floor((Date.now() - state.sessionStartTime) / 1000);
  elements.sessionTimeDisplay.innerHTML = `${state.sessionName || 'SESJA'}: ${formatTime(state.sessionDuration)}`;
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Inicjalizacja aplikacji
export function initializeWheelieMeter() {
  document.addEventListener('DOMContentLoaded', init);
}