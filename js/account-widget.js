// Petit widget de connexion sur l'écran d'accueil du jeu : juste de quoi se
// connecter/déconnecter et accéder à l'éditeur (qui, lui, gère vraiment les
// propositions/admins). Même état de connexion que editor.html, puisque
// Firebase Auth la mémorise pour tout le site (même origine).
import { signIn, signOutUser, watchAuth } from "./auth.js";

const $ = (id) => document.getElementById(id);

function applySignedOutUI() {
  $("btn-account-signin").style.display = "inline-block";
  $("account-signed-in").style.display = "none";
}

function applySignedInUI(user) {
  $("btn-account-signin").style.display = "none";
  $("account-signed-in").style.display = "flex";
  $("account-name").textContent = user.displayName || user.email;
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

  watchAuth((user) => {
    if (user) applySignedInUI(user);
    else applySignedOutUI();
  });
}

document.addEventListener("DOMContentLoaded", init);
