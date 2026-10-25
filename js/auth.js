// Connexion/déconnexion Google et vérification du statut admin. Aucun mot
// de passe ne transite jamais ici : l'authentification est entièrement
// déléguée à Google (signInWithPopup). Le statut admin se vérifie en lisant
// un document dans la collection /admins (voir firestore.rules) — cette
// collection n'est modifiable que depuis la console Firebase, jamais
// depuis l'app, donc personne ne peut se rendre admin tout seul.
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db, googleProvider } from "./firebase-app.js";

export function signIn() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

// callback(user | null) à chaque changement d'état de connexion.
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function checkIsAdmin(uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}
