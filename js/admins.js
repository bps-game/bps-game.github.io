// Gestion de la liste des admins (par email). Réservé au super-admin — la
// sécurité réelle est imposée par firestore.rules (allow write: if
// isSuperAdmin()), ce module se contente d'appeler l'API.
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase-app.js";

const COLLECTION = "admins";

export function addAdmin(email, addedByEmail) {
  const id = email.trim().toLowerCase();
  return setDoc(doc(db, COLLECTION, id), {
    role: "admin",
    addedBy: addedByEmail || null,
    addedAt: serverTimestamp(),
  });
}

export function removeAdmin(email) {
  const id = email.trim().toLowerCase();
  return deleteDoc(doc(db, COLLECTION, id));
}

// callback(list) à chaque changement de la liste des admins (temps réel).
export function watchAdmins(callback) {
  return onSnapshot(collection(db, COLLECTION), (snap) => {
    const list = [];
    snap.forEach((docSnap) => list.push(docSnap.id));
    callback(list);
  });
}
