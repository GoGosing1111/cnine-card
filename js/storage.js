const STORAGE_KEY = "cnine_card_user_v2";

function saveUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function getSavedUser() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
}

function clearUser() {
  localStorage.removeItem(STORAGE_KEY);
}
