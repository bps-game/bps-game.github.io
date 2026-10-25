// Pseudo public d'un compte Google (distinct du pseudo de partie, saisi à
// chaque création/connexion à une salle). Stocké dans Firestore sous
// profiles/{uid}, lisible/modifiable uniquement par son propriétaire (voir
// firestore.rules) — jamais le nom/email du compte Google qui n'est utilisé
// nulle part dans l'affichage une fois le pseudo choisi.
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase-app.js";

function profileRef(uid) {
  return doc(db, "profiles", uid);
}

export async function fetchPseudo(uid) {
  const snap = await getDoc(profileRef(uid));
  return snap.exists() ? snap.data().pseudo || null : null;
}

export function savePseudo(uid, pseudo) {
  return setDoc(profileRef(uid), { pseudo: pseudo.trim() }, { merge: true });
}
