// Petit widget de connexion sur l'écran d'accueil du jeu : juste de quoi se
// connecter/déconnecter, choisir son pseudo public et accéder à l'éditeur
// (qui, lui, gère vraiment les propositions/admins). Même état de connexion
// que editor.html, puisque Firebase Auth la mémorise pour tout le site
// (même origine).
import { signIn, signOutUser, watchAuth } from "./auth.js";
import { fetchPseudo, savePseudo } from "./profile.js";

const $ = (id) => document.getElementById(id);

let currentUser = null;

function showSignedOut() {
  $("btn-account-signin").style.display = "inline-block";
  $("account-pseudo-form").style.display = "none";
  $("account-signed-in").style.display = "none";
}

function showPseudoForm(prefill) {
  $("btn-account-signin").style.display = "none";
  $("account-signed-in").style.display = "none";
  $("account-pseudo-form").style.display = "flex";
  const input = $("account-pseudo-input");
  input.value = prefill || "";
  input.focus();
}

function showSignedIn(pseudo) {
  $("btn-account-signin").style.display = "none";
  $("account-pseudo-form").style.display = "none";
  $("account-signed-in").style.display = "flex";
  $("account-name").textContent = pseudo;
}

async function refreshIdentity() {
  if (!currentUser) {
    showSignedOut();
    return;
  }
  const pseudo = await fetchPseudo(currentUser.uid);
  if (pseudo) showSignedIn(pseudo);
  else showPseudoForm("");
}

async function savePseudoFromInput() {
  const value = $("account-pseudo-input").value.trim();
  if (!value || !currentUser) return;
  try {
    await savePseudo(currentUser.uid, value);
    showSignedIn(value);
  } catch (err) {
    window.UI && window.UI.toast ? window.UI.toast("Échec de l'enregistrement : " + err.message) : null;
  }
}

function init() {
  const widget = $("account-widget");
  if (!widget) return;

  $("btn-account-signin").addEventListener("click", async () => {
    try {
      await signIn();
    } catch (err) {
      window.UI && window.UI.toast ? window.UI.toast("Connexion impossible : " + err.message) : null;
    }
  });

  $("btn-account-signout").addEventListener("click", () => signOutUser());

  $("btn-account-rename").addEventListener("click", async () => {
    const pseudo = await fetchPseudo(currentUser.uid);
    showPseudoForm(pseudo || "");
  });

  $("btn-account-pseudo-save").addEventListener("click", savePseudoFromInput);
  $("account-pseudo-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") savePseudoFromInput();
  });

  watchAuth(async (user) => {
    currentUser = user;
    await refreshIdentity();
  });
}

document.addEventListener("DOMContentLoaded", init);
