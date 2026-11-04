// SanoFarmacia — Sesión, PIN administrativo y contraseña
import {
  auth, signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from './firebase.js';
import { store } from './store.js';
import { openModal, esc } from './utils.js';
import { icon } from './icons.js';

export const DOMAIN = 'sanofarmacia.app';
export const SUPER_EMAIL = `admin@${DOMAIN}`;

export const session = {
  user: null,
  isSuper: false,
  pinUnlockedUntil: 0
};

export function toEmail(userOrEmail) {
  const v = String(userOrEmail || '').trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${DOMAIN}`;
}
export function usernameOf(email) {
  const e = String(email || '');
  return e.endsWith('@' + DOMAIN) ? e.split('@')[0] : e;
}

export function authErrorMessage(err) {
  const c = err?.code || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/invalid-login-credentials'].includes(c)) return 'Usuario o contraseña incorrectos.';
  if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (c === 'auth/network-request-failed') return 'Sin conexión a internet. Verifica tu red.';
  if (c === 'auth/user-disabled') return 'Esta cuenta está deshabilitada. Contacta al administrador.';
  if (c === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
  if (c === 'auth/requires-recent-login') return 'Por seguridad, vuelve a iniciar sesión e inténtalo de nuevo.';
  return err?.message || 'Ocurrió un error inesperado.';
}

export async function login(userOrEmail, password) {
  let email = toEmail(userOrEmail);
  const v = String(userOrEmail || '').trim().toLowerCase();
  if (v && !v.includes('@')) {
    // Sedes creadas con un correo propio: el usuario se resuelve a su correo
    try { const { getUsername } = await import('./store.js'); const u = await getUsername(v); if (u?.email) email = u.email; } catch (_) {}
  }
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  store.stop();
  session.pinUnlockedUntil = 0;
  try { sessionStorage.removeItem('sf_view_tenant'); } catch (_) {}
  await signOut(auth);
}

export async function changePassword(current, next) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay sesión activa.');
  const cred = EmailAuthProvider.credential(user.email, current);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, next);
}

/** Pide el PIN de administrador. Resuelve true si se autoriza. */
export function requirePin(reason = 'Acción protegida', { always = false } = {}) {
  if (session.isSuper) return Promise.resolve(true);
  if (!always && Date.now() < session.pinUnlockedUntil) return Promise.resolve(true);
  return new Promise((resolve) => {
    let ok = false;
    const m = openModal({
      title: 'PIN de administrador',
      sub: esc(reason) + (store.isDemo ? '<br><b class="text-brand">En la demo el PIN es 1234</b>' : ''),
      size: 'sm',
      body: `
        <form class="stack" data-f>
          <div class="field">
            <label>Ingresa el PIN</label>
            <input class="input input-lg center" type="password" inputmode="numeric" autocomplete="off" maxlength="12" autofocus data-pin placeholder="••••">
          </div>
          <div class="error-msg" data-err></div>
        </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('unlock')} Autorizar</button>`,
      onClose: () => resolve(ok)
    });
    const input = m.el.querySelector('[data-pin]');
    const err = m.el.querySelector('[data-err]');
    const submit = async (e) => {
      e?.preventDefault();
      const pin = input.value.trim();
      if (!pin) return;
      if (await store.verifyPin(pin)) {
        ok = true;
        session.pinUnlockedUntil = Date.now() + 10 * 60 * 1000;
        m.close();
      } else {
        err.textContent = 'PIN incorrecto.';
        input.value = '';
        input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
        input.focus();
      }
    };
    m.el.querySelector('[data-f]').onsubmit = submit;
    m.el.querySelector('[data-ok]').onclick = submit;
  });
}
