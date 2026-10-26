// Téléversement des fichiers (image/vidéo) joints à une question, vers
// Firebase Storage. Expose window.MediaUpload car editor.js est un script
// classique (ne peut pas importer ce module, même raison que
// window.AccountIdentity / window.QuestionsSync ailleurs dans le projet).
// Tout compte connecté peut téléverser (utile pour illustrer une
// proposition) ; seul un admin peut supprimer — imposé par storage.rules,
// pas par ce fichier.
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { storage } from "./firebase-app.js";

const FOLDER = "questions-media";
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
// Le SDK retente tout seul un envoi en échec (jusqu'à plusieurs minutes) :
// sans ce délai, un Storage mal configuré laisserait "⏳ Envoi…" tourner
// indéfiniment sans jamais remonter d'erreur à l'écran.
const UPLOAD_TIMEOUT_MS = 20000;

function uniqueFileName(file) {
  const extMatch = /\.[a-z0-9]+$/i.exec(file.name || "");
  const ext = extMatch ? extMatch[0] : "";
  const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  return id + ext;
}

export async function uploadQuestionMedia(file) {
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error("Fichier trop volumineux (8 Mo max).");
  }
  const path = FOLDER + "/" + uniqueFileName(file);
  const fileRef = ref(storage, path);
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Trop long — vérifie que Storage est activé dans la console Firebase (voir README).")),
      UPLOAD_TIMEOUT_MS
    )
  );
  await Promise.race([uploadBytes(fileRef, file, { contentType: file.type }), timeout]);
  return getDownloadURL(fileRef);
}

// Accepte une URL de téléchargement Firebase Storage (ce que renvoie
// uploadQuestionMedia) ; ref() sait la reconvertir en référence de fichier.
// L'appelant décide quoi faire d'un échec (voir isStorageUrl ci-dessous,
// utilisé pour ne proposer la suppression que pour un fichier qui vient
// vraiment de Storage).
export function deleteQuestionMedia(url) {
  const fileRef = ref(storage, url);
  return deleteObject(fileRef);
}

// Un chemin statique du dépôt (ex : "assets/img/questions/flags/af.svg")
// n'est pas un fichier Storage : inutile (et trompeur) de proposer de le
// "supprimer" via ce module dans ce cas.
export function isStorageUrl(src) {
  return typeof src === "string" && src.includes("firebasestorage.googleapis.com");
}

window.MediaUpload = {
  upload: uploadQuestionMedia,
};
