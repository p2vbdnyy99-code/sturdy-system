// popup.js — toolbar popup: auth, credits, and quick links.

function send(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response) return reject(new Error('No response from background.'));
      if (response.error) return reject(new Error(response.error));
      resolve(response.data);
    });
  });
}

const $ = (id) => document.getElementById(id);
let mode = 'login'; // 'login' | 'register'

function setMessage(text, kind = '') {
  const el = $('authMsg');
  el.textContent = text || '';
  el.className = `msg ${kind}`;
}

async function getConfig() {
  const raw = await chrome.storage.local.get('config');
  return raw.config || {};
}

function showSignedIn(user) {
  $('authView').classList.add('hidden');
  $('accountView').classList.remove('hidden');
  $('credits').classList.remove('hidden');
  $('accountEmail').textContent = user.email;
  $('accountCredits').textContent = `${user.credits} cr`;
  $('credits').textContent = `${user.credits} cr`;
}

function showSignedOut() {
  $('accountView').classList.add('hidden');
  $('authView').classList.remove('hidden');
  $('credits').classList.add('hidden');
}

async function refresh() {
  const config = await getConfig();
  if (config.token && config.user) {
    showSignedIn(config.user);
    // Best-effort refresh of live credit balance.
    try {
      const { user } = await send({ type: 'AUTH_ME' });
      showSignedIn(user);
    } catch {
      /* keep cached view */
    }
  } else {
    showSignedOut();
  }
}

$('toggleMode').addEventListener('click', () => {
  mode = mode === 'login' ? 'register' : 'login';
  $('submitBtn').textContent = mode === 'login' ? 'Sign in' : 'Create account';
  $('toggleMode').textContent =
    mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in';
  setMessage('');
});

$('submitBtn').addEventListener('click', async () => {
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) {
    setMessage('Enter your email and password.', 'error');
    return;
  }
  $('submitBtn').disabled = true;
  setMessage(mode === 'login' ? 'Signing in…' : 'Creating account…');
  try {
    const type = mode === 'login' ? 'AUTH_LOGIN' : 'AUTH_REGISTER';
    const { user } = await send({ type, email, password });
    setMessage('Success!', 'success');
    showSignedIn(user);
  } catch (err) {
    setMessage(err.message, 'error');
  } finally {
    $('submitBtn').disabled = false;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await send({ type: 'AUTH_LOGOUT' });
  showSignedOut();
});

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

// Submit on Enter from the password field.
$('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('submitBtn').click();
});

refresh();
