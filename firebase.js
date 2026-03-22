/* ═══════════════════════════════════════════════════════════════
   SCHOOLSAFE — Firebase + Firestore
   ───────────────────────────────────────────────────────────────
   Proyecto: school-safe-app-9fe53
   SDK: Firebase 12.10.0 (ESModules — se importa desde CDN)
   ═══════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithRedirect,
    getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore,
    enableIndexedDbPersistence,
    doc,
    collection,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ── Configuración del proyecto ────────────────────────────────── */
const firebaseConfig = {
    apiKey: "AIzaSyCIpJRDZHweSb48pWyODa3NWRD7bsCv6r0",
    authDomain: "school-safe-app-9fe53.firebaseapp.com",
    projectId: "school-safe-app-9fe53",
    storageBucket: "school-safe-app-9fe53.firebasestorage.app",
    messagingSenderId: "807596016988",
    appId: "1:807596016988:web:7b695ce8b86549f6bcad99",
    measurementId: "G-C5P7WCK050",
};

/* ── Inicialización ─────────────────────────────────────────────── */
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn("Firestore persistence target already active in another tab.");
    } else if (err.code == 'unimplemented') {
        console.warn("Firestore persistence not supported by this browser.");
    }
});

/* ═══════════════════════════════════════════════════════════════
   ESTRUCTURA REAL DE FIRESTORE
   ───────────────────────────────────────────────────────────────

   /users/{uid}
     name          (string)      — nombre del padre
     email         (string)
     phone         (string)      — ej. "50499998888"
     plan          (string)      — "free" | "premium"
     fcmToken      (string|null) — token para push notifications
     oneSignalId   (string|null)
     createdAt     (timestamp)

   /students/{studentId}          ← colección RAÍZ (no subcollección)
     name          (string)       — "Sofía García"
     grade         (string)       — "9no Grado"
     school        (string)       — "Colegio INTEC"
     phone         (string)       — "50488887777"
     initial       (string)       — "S"
     status        (string)       — "safe" | "warn" | "danger"
     parentid      (string)       — UID del padre (referencia a /users)
     linkCode      (string)       — código de vinculación (ej. "847291")
     linked        (boolean)      — true si ya fue vinculado con la app alumno
     linkedAt      (timestamp)
     createdAt     (timestamp)

   /student_live/{studentId}      ← mismo ID que en /students
     lat           (number|null)
     lng           (number|null)
     accuracy      (number)
     battery       (number)       — 0.0–1.0 (1 = 100%)
     charging      (boolean)
     sos           (boolean)
     motion        (string)       — "" | "walking" | "running" | etc.
     mode          (string)       — "full" | "low"
     speed         (number)
     ts            (timestamp)    — última actualización
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   AUTH — Inicio / cierre de sesión
   ═══════════════════════════════════════════════════════════════ */

/** Inicia sesión con email y contraseña. Crea el doc en users si no existe. */
export async function loginWithEmail(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(cred.user);
    return cred;
}

/** Registra una nueva cuenta con email y contraseña. Crea el doc en users. */
export async function registerWithEmail(email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(cred.user);
    return cred;
}

/** Inicia sesión con Google. (Usa Redirect para soporte nativo de Android APKs) */
export async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    // Esto recargará la página y enviará al usuario a la pantalla de Google
    await signInWithRedirect(auth, provider);
}

// Al volver de Google y recargarse la app, capturamos el resultado para asegurar el perfil
getRedirectResult(auth)
    .then(async (cred) => {
        if (cred) {
            console.log("Sesión iniciada correctamente tras redirección de Google");
            await ensureUserProfile(cred.user);
        }
    })
    .catch((error) => {
        console.error("Error al retornar del login de Google:", error);
    });

/** Cierra la sesión actual. */
export async function logout() {
    return signOut(auth);
}

/**
 * Escucha cambios de autenticación (login / logout / recarga de página).
 * @param {function} callback — recibe (user | null)
 * @returns {function} unsubscribe
 */
export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

/** Retorna el usuario actualmente autenticado, o null. */
export function currentUser() {
    return auth.currentUser;
}

/* ═══════════════════════════════════════════════════════════════
   PERFIL DE USUARIO  — /users/{uid}
   ═══════════════════════════════════════════════════════════════ */

/**
 * Crea o actualiza el perfil del padre en Firestore.
 * Campos esperados: { name, email, phone, plan, fcmToken, oneSignalId }
 */
export async function saveUserProfile(uid, data) {
    await setDoc(doc(db, "users", uid), {
        ...data,
        createdAt: serverTimestamp(),
    }, { merge: true });
}

/**
 * Se asegura de que el usuario tenga un doc en Firestore.
 * Llamado internamente tras cada login exitoso.
 */
async function ensureUserProfile(user) {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
        await saveUserProfile(user.uid, {
            email: user.email,
            name: user.displayName || "Usuario Nuevo",
            phone: user.phoneNumber || "",
            plan: "free",
            fcmToken: null,
            oneSignalId: null
        });
    }
}

/**
 * Lee el perfil del padre.
 * @returns {Promise<object|null>}
 */
export async function getUserProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* ═══════════════════════════════════════════════════════════════
   ALUMNOS  — /students/{studentId}  (colección RAÍZ)
   Los alumnos están ligados al padre por el campo `parentid`.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Obtiene todos los alumnos de un padre (una sola vez).
 * @param {string} uid — UID del padre
 * @returns {Promise<object>} — { [studentId]: data }
 */
export async function getStudentsFS(uid) {
    const q = query(collection(db, "students"), where("parentid", "==", uid));
    const snap = await getDocs(q);
    const result = {};
    snap.forEach(d => { result[d.id] = { id: d.id, ...d.data() }; });
    return result;
}

/**
 * Suscribe en tiempo real a los alumnos de un padre.
 * @param {string}   uid      — UID del padre
 * @param {function} onChange — callback con { [studentId]: data }
 * @returns {function} unsubscribe
 */
export function subscribeStudents(uid, onChange) {
    const q = query(collection(db, "students"), where("parentid", "==", uid));
    return onSnapshot(q, snap => {
        const result = {};
        snap.forEach(d => { result[d.id] = { id: d.id, ...d.data() }; });
        onChange(result);
    });
}

/**
 * Guarda (crea o actualiza) los datos de un alumno.
 * Usa merge:true para no sobreescribir campos como linkCode/linked.
 * @param {object} data      — campos a guardar
 * @param {string|null} studentId — ID del doc (null si es nuevo)
 */
export async function saveStudentFS(data, studentId = null) {
    let docRef;
    if (studentId) {
        docRef = doc(db, "students", studentId);
    } else {
        // Genera un ID automático si es alumno nuevo
        docRef = doc(collection(db, "students"));
        // Asignar código de vinculación inicial si no existe
        if (!data.linkCode) {
            data.linkCode = Math.floor(100000 + Math.random() * 900000).toString();
        }
        data.linked = false;
        data.createdAt = serverTimestamp();
    }
    await setDoc(docRef, data, { merge: true });
}

/**
 * Elimina un alumno de Firestore.
 */
export async function deleteStudentFS(studentId) {
    await deleteDoc(doc(db, "students", studentId));
}

/* ═══════════════════════════════════════════════════════════════
   UBICACIÓN EN VIVO  — /student_live/{studentId}
   Esta colección es escrita por la app del ALUMNO.
   La app del PADRE solo lee (onSnapshot).
   ═══════════════════════════════════════════════════════════════ */

/**
 * Suscribe en tiempo real al estado en vivo de un alumno.
 *
 * Datos disponibles: { lat, lng, accuracy, battery, charging,
 *                      sos, motion, mode, speed, ts }
 *
 * @param {string}   studentId
 * @param {function} onChange — callback con data del doc (o null)
 * @returns {function} unsubscribe
 */
export function subscribeStudentLive(studentId, onChange) {
    const ref = doc(db, "student_live", studentId);
    return onSnapshot(ref, snap => {
        onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
}

/**
 * Suscribe al historial de eventos de un alumno.
 */
export function subscribeStudentHistory(studentId, onChange) {
    const q = query(
        collection(db, "students", studentId, "history"),
        orderBy("serverTs", "desc"),
        limit(20)
    );
    return onSnapshot(q, snap => {
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        onChange(events);
    });
}

/**
 * Lee una sola vez el estado en vivo de un alumno.
 * @returns {Promise<object|null>}
 */
export async function getStudentLiveFS(studentId) {
    const snap = await getDoc(doc(db, "student_live", studentId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICACIONES — /notifications
   ───────────────────────────────────────────────────────────────
   Usado para el panel de la campana y alertas unificadas.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Suscribe en tiempo real a las NOTIFICACIONES del padre.
 * @param {string}   uid      — UID del padre
 * @param {function} onChange — callback con array de notificaciones
 * @returns {function} unsubscribe
 */
export function subscribeNotifications(uid, onChange) {
    const q = query(
        collection(db, "notifications"),
        where("parentid", "==", uid),
        orderBy("ts", "desc"),
        limit(50)
    );
    return onSnapshot(q, snap => {
        const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        onChange(notifs);
    });
}

/**
 * Marca una notificación como leída en Firestore.
 */
export async function markNotificationRead(notifId) {
    await setDoc(doc(db, "notifications", notifId), {
        unread: false
    }, { merge: true });
}

/**
 * Marca TODAS las notificaciones del padre como leídas.
 */
export async function markAllNotificationsRead(uid) {
    const q = query(
        collection(db, "notifications"),
        where("parentid", "==", uid),
        where("unread", "==", true)
    );
    const snap = await getDocs(q);
    const promises = snap.docs.map(d => markNotificationRead(d.id));
    await Promise.all(promises);
}

/* ═══════════════════════════════════════════════════════════════
   EXPORTA instancias base para uso directo si se necesita
   ═══════════════════════════════════════════════════════════════ */
export { auth, db };
