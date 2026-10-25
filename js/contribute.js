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
  setDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase-app.js";

const COLLECTION = "proposals";
const QUESTIONS_COLLECTION = "questions";

export function proposeQuestion(question, user, displayName) {
  return addDoc(collection(db, COLLECTION), {
    question,
    proposedBy: user.uid,
    proposedByName: displayName || user.displayName || user.email || "Anonyme",
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

// Publication en direct d'une question dans le jeu (collection /questions,
// fusionnée avec questions/questions.json par js/questions.js) : admin
// uniquement, imposé par firestore.rules. Pas d'étape d'export/commit — la
// question est live dès que cet appel réussit.
export function publishQuestion(question) {
  return setDoc(doc(db, QUESTIONS_COLLECTION, question.id), Object.assign({}, question, { deleted: false }));
}

// Retire une question publiée (y compris une question dont le socle vient du
// fichier statique) sans supprimer le document : on pose un repère
// "deleted", filtré à la fusion (voir js/questions.js). Garde le document
// plutôt que deleteDoc pour que la suppression s'applique même à une
// question qui n'a encore jamais été publiée depuis l'éditeur.
export function unpublishQuestion(id) {
  return setDoc(doc(db, QUESTIONS_COLLECTION, id), { id, deleted: true });
}
