import { auth } from './common/supabase.js';

export function initializeLogin() {
  let isLogin = true;

  // Pobranie elementów DOM
  const form = document.getElementById('auth-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const message = document.getElementById('message');
  const formTitle = document.getElementById('form-title');
  const submitBtn = document.getElementById('submit-btn');
  const toggleText = document.getElementById('toggle-text');
  const toggleModeBtn = document.getElementById('toggle-mode');

  // Funkcja przełączania trybu logowanie/rejestracja
  function toggleMode() {
    isLogin = !isLogin;
    formTitle.textContent = isLogin ? 'Zaloguj się' : 'Zarejestruj się';
    submitBtn.textContent = isLogin ? 'Zaloguj' : 'Zarejestruj';
    toggleText.innerHTML = isLogin
      ? 'Nie masz konta? <span class="toggle" id="toggle-mode">Zarejestruj się</span>'
      : 'Masz już konto? <span class="toggle" id="toggle-mode">Zaloguj się</span>';
    
    // Ponowne przypisanie event listenera
    document.getElementById('toggle-mode').addEventListener('click', toggleMode);
  }

  // Obsługa formularza
  async function handleSubmit(e) {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;
    message.textContent = '';

    try {
      if (isLogin) {
        const { error } = await auth.signIn(email, password);
        if (error) throw error;
        message.textContent = '✅ Zalogowano pomyślnie!';
        setTimeout(() => window.location.href = 'timer.html', 1000);
      } else {
        const { error } = await auth.signUp(email, password);
        if (error) throw error;
        message.textContent = '✅ Konto utworzone! Sprawdź e-mail i potwierdź.';
      }
    } catch (error) {
      message.textContent = `❌ Błąd: ${error.message}`;
    }
  }

  // Inicjalizacja event listenerów
  toggleModeBtn.addEventListener('click', toggleMode);
  form.addEventListener('submit', handleSubmit);
}