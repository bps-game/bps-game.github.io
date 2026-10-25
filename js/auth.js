// Connexion/déconnexion Google et vérification des statuts admin/super-admin.
// Aucun mot de passe ne transite jamais ici : l'authentification est
// entièrement déléguée à Google (signInWithPopup). Le statut admin se
// vérifie en lisant un document dans /admins, par email (voir
// firestore.rules) ; le super-admin est reconnu automatiquement par son
// adresse email, codée en dur côté règles de sécurité — la copie ci-dessous
// n'est là que pour l'affichage (afficher/cacher les boutons de gestion),
// la vraie sécurité est imposée par Firestore, pas par ce fichier.
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db, googleProvider } from "./firebase-app.js";

// Doit être identique à la valeur codée dans firestore.rules.
export const SUPER_ADMIN_EMAIL = "advestankv@gmail.com";

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

export function isSuperAdminEmail(email) {
  return !!email && email.toLowerCase() === SUPER_ADMIN_EMAIL;
}

export async function checkIsAdmin(user) {
  if (!user || !user.email) return false;
  if (isSuperAdminEmail(user.email)) return true;
  const snap = await getDoc(doc(db, "admins", user.email.toLowerCase()));
  return snap.exists();
}
