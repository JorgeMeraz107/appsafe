/* ═══════════════════════════════════════════════════════
   SchoolSafe — Service Worker
   Maneja notificaciones push en background
   Compatible con: Chrome Android, Edge, Desktop Chrome
   No compatible con: WebViewGold (necesita FCM para APK)
═══════════════════════════════════════════════════════ */

const SW_VERSION = 'schoolsafe-sw-v3';
const CACHE_NAME = 'schoolsafe-static-v3';

// Assets to cache for immediate offline load
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/firebase.js',
  '/service-worker.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Sora:wght@400;600;700;800&display=swap',
  // Avatares del padre (DiceBear - precacheados para carga instantánea)
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
      console.log('SW: Precaching assets...');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  e.waitUntil(clients.claim());
});

/* ── Estrategia de Cache (Offline Support) ───────────── */
self.addEventListener('fetch', e => {
  // Evitar interceptar llamadas a Firebase Auth/Firestore directamente
  // (Firebase ya tiene su propia persistencia interna IndexedDB)
  if (e.request.url.includes('firestore.googleapis.com') || 
      e.request.url.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      if (cachedResponse) {
        // Stale-while-revalidate: devuelve lo que hay en cache, pero actualiza por detrás
        fetch(e.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});

/* ── Recibe mensajes desde la app principal ──────────── */
// La app le envía eventos detectados (SOS, batería baja, desconexión)
// y el SW los convierte en notificaciones del OS
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

  // Icono y color según tipo
  const icons = {
    sos:        '/icons/icon-sos.png',
    battery:    '/icons/icon-battery.png',
    offline:    '/icons/icon-offline.png',
    info:       '/icons/icon-192.png',
  };

  const options = {
    body,
    icon:  icons[type] || icons.info,
    badge: '/icons/badge-72.png',   // icono pequeño en barra de notificaciones Android
    tag:   `schoolsafe-${type}`,    // reemplaza notif anterior del mismo tipo
    renotify: type === 'sos',       // SOS siempre vibra aunque ya haya una
    requireInteraction: type === 'sos', // SOS no desaparece solo
    vibrate: type === 'sos'
      ? [300, 100, 300, 100, 300]   // patrón de vibración urgente
      : [200],
    data: { url, type, studentName },
    actions: type === 'sos'
      ? [
          { action: 'view',  title: 'Ver ubicación' },
          { action: 'call',  title: 'Llamar' },
        ]
      : [
          { action: 'view',  title: 'Ver' },
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
      // Si la app ya está abierta, enfócala y navega
      const existingClient = clientList.find(c => c.url.includes('schoolsafe'));
      if (existingClient) {
        existingClient.focus();
        // Envía mensaje a la app para navegar a la pantalla correcta
        existingClient.postMessage({
          type: 'NOTIFICATION_CLICK',
          action,
          notifType: type,
        });
        return;
      }
      // Si no está abierta, la abre
      return clients.openWindow(url || '/');
    })
  );
});

/* ── Notificación descartada ─────────────────────────── */
self.addEventListener('notificationclose', e => {
  // Podría registrar en analytics cuando haya servidor
});