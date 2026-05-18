/* ═══════════════════════════════════════════════════════
   SchoolSafe — Service Worker v4
   ───────────────────────────────────────────────────────
   Estrategia: Cache-First para assets estáticos,
   Network-First para contenido dinámico.
   Garantiza que el loader y la app se muestren sin internet.
   Compatible con: Chrome Android, Edge, Desktop Chrome
═══════════════════════════════════════════════════════ */

const SW_VERSION = 'schoolsafe-sw-v5';
const CACHE_NAME = 'schoolsafe-static-v5';

// ── Assets críticos para carga offline instantánea ──
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/firebase.js',
  '/gemini-service.js',
  '/service-worker.js',
  '/favicon.ico',

  // Logo del Loader (Splash Screen) — CRÍTICO para offline
  '/assets/logo-schoolsafe.png',

  // Iconos PWA
  '/icons/icon-192.png',

  // Sonidos del sistema (UX interactiva)
  '/sounds/ai_magic.mp3',
  '/sounds/alert_pop.mp3',
  '/sounds/login_welcome.mp3',
  '/sounds/modal_open.mp3',
  '/sounds/nav_page.mp3',
  '/sounds/nav_tab.mp3',
  '/sounds/panel_in.mp3',
  '/sounds/panel_out.mp3',
  '/sounds/save_done.mp3',
  '/sounds/save_error.mp3',
  '/sounds/sos_alarm.mp3',

  // Fuentes de Google (tipografía profesional)
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Sora:wght@400;600;700;800&display=swap',

  // Avatares del padre (DiceBear - precacheados)
  'https://api.dicebear.com/7.x/micah/svg?seed=Aneka&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/micah/svg?seed=Mimi&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/micah/svg?seed=Avery&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/micah/svg?seed=Jasmine&backgroundColor=d1d4f9',
  'https://api.dicebear.com/7.x/micah/svg?seed=Nala&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/micah/svg?seed=Lilly&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/micah/svg?seed=Sophie&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/micah/svg?seed=Chloe&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/micah/svg?seed=Felix&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/micah/svg?seed=Jude&backgroundColor=d1d4f9',
  'https://api.dicebear.com/7.x/micah/svg?seed=Leo&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/micah/svg?seed=Oliver&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/micah/svg?seed=Max&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/micah/svg?seed=Jack&backgroundColor=d1d4f9',
  'https://api.dicebear.com/7.x/micah/svg?seed=Oscar&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/micah/svg?seed=Caleb&backgroundColor=b6e3f4',
  // Avatares de alumnos (DiceBear)
  'https://api.dicebear.com/7.x/notionists/svg?seed=Felix',
  'https://api.dicebear.com/7.x/notionists/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/notionists/svg?seed=Nova',
];

/* ── Instalación ─────────────────────────────────────── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW v4: Precaching assets for offline loader...');
      // Usar addAll con manejo de errores individual para no fallar si un recurso externo no responde
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn(`SW: No se pudo cachear ${url}:`, err.message);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

/* ── Activación: Limpia caches anteriores ────────────── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log(`SW v4: Eliminando caché antigua: ${key}`);
          return caches.delete(key);
        })
      );
    })
  );
  e.waitUntil(clients.claim());
});

/* ── Estrategia de Cache (Offline Support) ───────────── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. No interceptar Firebase Auth / Firestore / Gemini API
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // 2. Para navegación (HTML): Network-First (intenta red, fallback a caché)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Guardar la versión más reciente en caché
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => {
          // Sin internet: servir desde caché (loader + app completa)
          return caches.match(e.request).then(cached => {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // 3. Para assets estáticos: Stale-While-Revalidate
  //    (respuesta instantánea desde caché, actualiza por detrás)
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      const fetchPromise = fetch(e.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

/* ── Recibe mensajes desde la app principal ──────────── */
self.addEventListener('message', e => {
  const { type, payload } = e.data || {};
  if (type === 'PUSH_NOTIFICATION') {
    showNotification(payload);
  }
});

/* ── Recibe push del servidor VAPID (cuando haya servidor) ── */
self.addEventListener('push', e => {
  if (!e.data) return;
  try {
    const payload = e.data.json();
    e.waitUntil(showNotification(payload));
  } catch {
    e.waitUntil(showNotification({
      title: 'SchoolSafe',
      body: e.data.text(),
      type: 'info'
    }));
  }
});

/* ── Muestra la notificación nativa del OS ───────────── */
function showNotification(payload) {
  const { title, body, type = 'info', studentName = '', url = '/' } = payload;

  const icons = {
    sos: '/icons/icon-sos.png',
    battery: '/icons/icon-battery.png',
    offline: '/icons/icon-offline.png',
    info: '/icons/icon-192.png',
  };

  const options = {
    body,
    icon: icons[type] || icons.info,
    badge: '/icons/badge-72.png',
    tag: `schoolsafe-${type}`,
    renotify: type === 'sos',
    requireInteraction: type === 'sos',
    vibrate: type === 'sos'
      ? [300, 100, 300, 100, 300]
      : [200],
    data: { url, type, studentName },
    actions: type === 'sos'
      ? [
        { action: 'view', title: 'Ver ubicación' },
        { action: 'call', title: 'Llamar' },
      ]
      : [
        { action: 'view', title: 'Ver' },
      ],
  };

  return self.registration.showNotification(title, options);
}

/* ── El padre toca la notificación ──────────────────── */
self.addEventListener('notificationclick', e => {
  e.notification.close();

  const { action } = e;
  const { url, type } = e.notification.data || {};

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existingClient = clientList.find(c => c.url.includes('schoolsafe'));
      if (existingClient) {
        existingClient.focus();
        existingClient.postMessage({
          type: 'NOTIFICATION_CLICK',
          action,
          notifType: type,
        });
        return;
      }
      return clients.openWindow(url || '/');
    })
  );
});

/* ── Notificación descartada ─────────────────────────── */
self.addEventListener('notificationclose', e => {
  // Podría registrar en analytics cuando haya servidor
});