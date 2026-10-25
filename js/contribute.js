// Propositions de questions : créer, écouter la file d'attente en direct,
// approuver/rejeter (admin), retirer sa propre proposition. Toute la
// sécurité (qui a le droit de faire quoi) est appliquée côté serveur par
// firestore.rules — ce module ne fait qu'appeler l'API, il ne décide rien.
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase-app.js";

const COLLECTION = "proposals";

export function proposeQuestion(question, user) {
  return addDoc(collection(db, COLLECTION), {
    question,
    proposedBy: user.uid,
    proposedByName: user.displayName || user.email || "Anonyme",
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

// callback(list) à chaque changement de la file d'attente (temps réel).
// Retourne une fonction à appeler pour arrêter l'écoute.
export function watchProposals(callback) {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((docSnap) => list.push(Object.assign({ id: docSnap.id }, docSnap.data())));
    callback(list);
  });
}

export function reviewProposal(proposalId, status, reviewerUid) {
  return updateDoc(doc(db, COLLECTION, proposalId), {
    status,
    reviewedBy: reviewerUid,
    reviewedAt: serverTimestamp(),
  });
}

export function deleteProposal(proposalId) {
  return deleteDoc(doc(db, COLLECTION, proposalId));
}
