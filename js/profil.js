import supabase from './common/supabase.js';
import { auth, results } from './common/supabase.js';

export function initializeProfile() {
  // Elementy DOM
  const userInfo = document.getElementById("userInfo");
  const resultsList = document.getElementById("resultsList");
  const resultsStatus = document.getElementById("resultsStatus");
  const logoutBtn = document.getElementById("logoutBtn");

  // Sprawdzenie sesji i pobranie danych
  async function loadProfile() {
    try {
      // Sprawdzenie sesji
      const { data: { session }, error } = await auth.getSession();
      
      if (!session?.user) {
        alert("Musisz być zalogowany, aby wyświetlić profil.");
        window.location.href = "login.html";
        return null;
      }

      // Wyświetlenie informacji o użytkowniku
      userInfo.innerHTML = `Zalogowany jako: <strong>${session.user.email}</strong>`;

      // Pobranie wyników timerów
      const { data: timerResults, error: timerError } = await results.getUserResults(session.user.id);
      if (timerError) throw timerError;

      // Pobranie wyników wheelie (jeśli tabela istnieje)
      let wheelieResults = [];
      try {
        const { data: wheelieData, error: wheelieError } = await supabase
          .from('wheelie_results')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });
        
        if (!wheelieError) wheelieResults = wheelieData || [];
      } catch (e) {
        console.warn("Błąd pobierania wyników wheelie:", e);
      }

      // Połączenie wyników
      const allResults = [...(timerResults || []), ...wheelieResults]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (allResults.length === 0) {
        resultsStatus.textContent = "Brak zapisanych wyników.";
        return session.user;
      }

      // Wyświetlenie wyników
      resultsStatus.remove();
      allResults.forEach(entry => {
        const li = document.createElement("li");
        
        if (entry.result_time_display) {
          // To jest wynik timera
          const trackName = document.createElement("span");
          trackName.textContent = entry.track_name;
          trackName.className = "track-name";

          const resultTime = document.createElement("span");
          resultTime.textContent = entry.result_time_display;
          resultTime.className = "result-time";

          li.appendChild(trackName);
          li.appendChild(resultTime);
        } else {
          // To jest wynik wheelie
          const wheelieInfo = document.createElement("span");
          wheelieInfo.textContent = `Wheelie: ${entry.duration?.toFixed(2) || '0.00'}s (max: ${entry.max_angle || entry.angle || '0'}°)`;
          wheelieInfo.className = "wheelie-info";
          li.appendChild(wheelieInfo);
        }

        resultsList.appendChild(li);
      });

      return session.user;
    } catch (error) {
      console.error("Błąd ładowania profilu:", error);
      resultsStatus.textContent = "❌ Błąd pobierania danych.";
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