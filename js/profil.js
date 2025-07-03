import supabase from './common/supabase.js';
import { auth, results } from './common/supabase.js';

export function initializeProfile() {
  // Elementy DOM
  const userInfo = document.getElementById("userInfo");
  const resultsList = document.getElementById("resultsList");
  const resultsStatus = document.getElementById("resultsStatus");
  const logoutBtn = document.getElementById("logoutBtn");
  const totalWheelies = document.getElementById("totalWheelies");
  const bestWheelie = document.getElementById("bestWheelie");
  const tabButtons = document.querySelectorAll(".tab-button");
  const sortSelect = document.getElementById("sortSelect");
  
  let currentTab = "timer"; // Default to timer tab since we removed "all"
  let allResults = [];
  let currentSort = "date-desc";

  // Obsługa zmiany sortowania
  sortSelect.addEventListener("change", (e) => {
    currentSort = e.target.value;
    filterResults();
  });

  // Obsługa przełączania zakładek
  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      tabButtons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
      currentTab = button.dataset.tab;
      filterResults();
    });
  });

  // Filtrowanie wyników
  function filterResults() {
    resultsList.innerHTML = "";
    
    let filteredResults = currentTab === "timer" ? 
      allResults.filter(r => r.result_time_display) :
      allResults.filter(r => r.duration);

    // Sortowanie wyników
    filteredResults = sortResults(filteredResults, currentSort);

    if (filteredResults.length === 0) {
      resultsStatus.textContent = currentTab === "timer" ? 
        "Brak wyników timerów" : "Brak wyników wheelie";
      resultsStatus.style.display = "block";
      return;
    }

    resultsStatus.style.display = "none";
    displayResults(filteredResults);
  }

  // Nowa funkcja sortująca
  function sortResults(results, sortMethod) {
    switch(sortMethod) {
      case 'date-desc':
        return [...results].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      case 'date-asc':
        return [...results].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      case 'duration-desc':
        return [...results].sort((a, b) => {
          const durA = a.duration || 0;
          const durB = b.duration || 0;
          return durB - durA;
        });
      case 'duration-asc':
        return [...results].sort((a, b) => {
          const durA = a.duration || 0;
          const durB = b.duration || 0;
          return durA - durB;
        });
      case 'track':
        return [...results].sort((a, b) => {
          const trackA = a.track_name || '';
          const trackB = b.track_name || '';
          return trackA.localeCompare(trackB);
        });
      default:
        return results;
    }
  }

  // Wyświetlanie wyników
  function displayResults(results) {
    results.forEach((entry, index) => {
      const li = document.createElement("li");
      li.className = "result-item";

      if (entry.result_time_display) {
        // Wynik timera
        li.innerHTML = `
          <div class="result-content">
            <div class="result-position">${index + 1}</div>
            <div class="result-details">
              <div class="result-type">Czas przejazdu</div>
              <div class="track-name">${entry.track_name || 'Nieznana trasa'}</div>
              <div class="result-value">${entry.result_time_display}</div>
              <div class="result-date">${formatDate(entry.created_at)}</div>
            </div>
          </div>
        `;
      } else {
        // Wynik wheelie
        li.innerHTML = `
          <div class="result-content">
            <div class="result-position">${index + 1}</div>
            <div class="result-details">
              <div class="result-type">Wheelie</div>
              <div class="wheelie-duration">${entry.duration?.toFixed(2) || '0.00'}s</div>
              <div class="wheelie-angle">Max: ${entry.max_angle || entry.angle || '0'}°</div>
              <div class="result-date">${formatDate(entry.created_at)}</div>
            </div>
          </div>
        `;
      }

      resultsList.appendChild(li);
    });
  }

  // Formatowanie daty
  function formatDate(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleString("pl-PL");
  }

  // Obliczanie statystyk
  function calculateStats(results) {
  // Wheelie results only
  const wheelieResults = results.filter(r => r.duration);
  
  // Liczba wheelie
  totalWheelies.textContent = wheelieResults.length;

  // Najdłuższe wheelie
  if (wheelieResults.length > 0) {
    const best = wheelieResults.reduce((max, current) => 
      current.duration > max.duration ? current : max);
    bestWheelie.textContent = `${best.duration.toFixed(2)}s (${best.max_angle || best.angle || '0'}°)`;
  } else {
    bestWheelie.textContent = "-";
  }
}

  // Sprawdzenie sesji i pobranie danych
async function loadProfile() {
  try {
    console.log("⏳ Inicjalizacja profilu...");

    // Sprawdzenie sesji
    const { data: { session }, error } = await auth.getSession();
    console.log("➡️ Sesja:", session);

    if (!session?.user) {
      alert("Musisz być zalogowany, aby wyświetlić profil.");
      window.location.href = "login.html";
      return;
    }

    // Wyświetlenie informacji o użytkowniku
    userInfo.innerHTML = `Zalogowany jako: <strong>${session.user.email}</strong>`;

    // Pobranie wyników timerów
    const { data: timerResults, error: timerError } = await results.getUserResults(session.user.id);
    console.log("✅ Wyniki timera:", timerResults);
    if (timerError) throw timerError;

    // Pobranie wyników wheelie
    let wheelieResults = [];
    try {
      const { data: wheelieData, error: wheelieError } = await supabase
        .from('wheelie_results')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (!wheelieError) {
        wheelieResults = wheelieData || [];
        console.log("✅ Wyniki wheelie:", wheelieResults);
      } else {
        console.warn("⚠️ Błąd pobierania wyników wheelie:", wheelieError.message);
      }
    } catch (e) {
      console.warn("❌ Wyjątek podczas pobierania wheelie:", e);
    }

    // Połączenie i posortowanie wyników
    allResults = [...(timerResults || []), ...wheelieResults]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Obliczenie statystyk
    calculateStats(allResults);

    // Wyświetlenie wyników
    filterResults();

    return session.user;

  } catch (error) {
    console.error("❌ Błąd ładowania profilu:", error);
    let message = "❌ Błąd pobierania danych.";
    if (error.message) {
      message += ` (${error.message})`;
    } else if (typeof error === "string") {
      message += ` (${error})`;
    } else {
      message += " (nieznany błąd)";
    }
    resultsStatus.textContent = message;
    resultsStatus.style.display = "block";
    userInfo.innerHTML = "⚠️ Nie udało się załadować profilu.";
    return null;
  }
}

  // Obsługa wylogowania
  async function handleLogout() {
    const { error } = await auth.signOut();
    if (error) {
      alert("Błąd podczas wylogowania: " + error.message);
    } else {
      window.location.href = "login.html";
    }
  }

  // Inicjalizacja
  logoutBtn.addEventListener("click", handleLogout);
  loadProfile();
}