// Orchestrateur du mode "en ligne" de l'éditeur : connexion Google, file de
// propositions en direct, actions admin. Module ES séparé (le SDK Firebase
// l'exige) qui communique avec editor.js (script classique) via
// window.EditorBridge et window.Questions, déjà exposés par ces fichiers.
import { signIn, signOutUser, watchAuth, checkIsAdmin, isSuperAdminEmail } from "./auth.js";
import { proposeQuestion, watchProposals, reviewProposal, deleteProposal } from "./contribute.js";
import { addAdmin, removeAdmin, watchAdmins } from "./admins.js";
import { fetchPseudo, savePseudo } from "./profile.js";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentPseudo = null;
let currentIsAdmin = false;
let currentIsSuperAdmin = false;
let latestProposals = [];
let latestAdmins = [];
let stopWatchingProposals = null;
let stopWatchingAdmins = null;

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._hideTimeout);
  el._hideTimeout = setTimeout(() => el.classList.remove("show"), 2500);
}

function statusLabel(status) {
  if (status === "approved") return "✅ Approuvée";
  if (status === "rejected") return "❌ Rejetée";
  return "⏳ En attente";
}

function renderProposals() {
  const container = $("online-proposals-list");
  container.innerHTML = "";

  if (!currentUser || !currentPseudo) return;

  if (latestProposals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Aucune proposition pour l'instant.";
    container.appendChild(empty);
    return;
  }

  latestProposals.forEach((p) => {
    const card = document.createElement("div");
    card.className = "proposal-card status-" + p.status;

    const main = document.createElement("div");
    main.className = "proposal-main";

    const title = document.createElement("div");
    title.className = "proposal-title";
    title.textContent = (p.question && p.question.question) || "(sans texte)";

    const meta = document.createElement("div");
    meta.className = "proposal-meta";
    const cat = (p.question && p.question.category) || "Sans catégorie";
    meta.textContent = cat + " · proposée par " + (p.proposedByName || "Anonyme") + " · " + statusLabel(p.status);

    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "proposal-actions";

    if (currentIsAdmin && p.status === "pending") {
      const approveBtn = document.createElement("button");
      approveBtn.className = "btn-secondary";
      approveBtn.textContent = "✅ Approuver";
      approveBtn.addEventListener("click", () => approveProposal(p));

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "btn-secondary btn-danger";
      rejectBtn.textContent = "❌ Rejeter";
      rejectBtn.addEventListener("click", () => rejectProposal(p));

      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
    }

    if (!currentIsAdmin && p.status === "pending" && p.proposedBy === currentUser.uid) {
      const withdrawBtn = document.createElement("button");
      withdrawBtn.className = "btn-secondary btn-danger";
      withdrawBtn.textContent = "Retirer";
      withdrawBtn.addEventListener("click", () => withdrawProposal(p));
      actions.appendChild(withdrawBtn);
    }

    card.appendChild(main);
    if (actions.childNodes.length > 0) card.appendChild(actions);
    container.appendChild(card);
  });
}

function renderAdminList() {
  const container = $("admin-list");
  if (!container) return;
  container.innerHTML = "";

  if (latestAdmins.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Aucun admin ajouté pour l'instant (à part toi, le super-admin).";
    container.appendChild(empty);
    return;
  }

  latestAdmins.forEach((email) => {
    const row = document.createElement("div");
    row.className = "admin-row";

    const label = document.createElement("span");
    label.textContent = email;

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-secondary btn-danger";
    removeBtn.textContent = "Retirer";
    removeBtn.addEventListener("click", async () => {
      if (!confirm("Retirer les droits admin de " + email + " ?")) return;
      try {
        await removeAdmin(email);
        toast("Admin retiré.");
      } catch (err) {
        toast("Erreur : " + err.message);
      }
    });

    row.appendChild(label);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

async function addAdminFromInput() {
  const input = $("f-admin-email");
  const email = input.value.trim();
  if (!email) return;
  try {
    await addAdmin(email, currentUser.email);
    input.value = "";
    toast(email + " est maintenant admin.");
  } catch (err) {
    toast("Erreur : " + err.message);
  }
}

async function approveProposal(proposal) {
  try {
    await reviewProposal(proposal.id, "approved", currentUser.uid);
    window.EditorBridge.addApprovedQuestion(proposal.question);
    toast("Proposition approuvée et ajoutée à ta liste locale — pense à Enregistrer/Exporter.");
  } catch (err) {
    toast("Erreur lors de l'approbation : " + err.message);
  }
}

async function rejectProposal(proposal) {
  try {
    await reviewProposal(proposal.id, "rejected", currentUser.uid);
    toast("Proposition rejetée.");
  } catch (err) {
    toast("Erreur : " + err.message);
  }
}

async function withdrawProposal(proposal) {
  if (!confirm("Retirer cette proposition ?")) return;
  try {
    await deleteProposal(proposal.id);
    toast("Proposition retirée.");
  } catch (err) {
    toast("Erreur : " + err.message);
  }
}

async function proposeFromModal() {
  if (!currentUser) return;
  const draft = window.EditorBridge.buildDraftFromForm();
  const errors = window.Questions.validateOne(draft);
  if (errors.length > 0) {
    $("modal-error").textContent = errors.join(" · ");
    return;
  }
  try {
    await proposeQuestion(draft, currentUser, currentPseudo);
    toast("Question proposée ! Elle apparaîtra dans la file d'attente en attendant une validation admin.");
    $("btn-cancel").click();
  } catch (err) {
    $("modal-error").textContent = "Échec de l'envoi : " + err.message;
  }
}

function applySignedOutUI() {
  $("btn-google-signin").style.display = "inline-block";
  $("btn-google-signout").style.display = "none";
  $("online-pseudo-form").style.display = "none";
  $("online-user-info").style.display = "none";
  $("btn-online-rename").style.display = "none";
  $("online-admin-badge").style.display = "none";
  $("super-admin-panel").style.display = "none";
  $("online-offline-hint").style.display = "block";
  $("btn-propose-online").style.display = "none";
  $("online-proposals-list").innerHTML = "";
  currentIsAdmin = false;
  currentIsSuperAdmin = false;
  currentPseudo = null;
}

// Tant qu'aucun pseudo n'est choisi, on ne montre que le formulaire de
// pseudo : pas de propositions/admin tant que l'identité publique du compte
// n'est pas définie.
function showPseudoForm(prefill) {
  $("btn-google-signin").style.display = "none";
  $("btn-google-signout").style.display = "inline-block";
  $("online-offline-hint").style.display = "none";
  $("online-pseudo-form").style.display = "block";
  $("online-user-info").style.display = "none";
  $("btn-online-rename").style.display = "none";
  $("online-admin-badge").style.display = "none";
  $("super-admin-panel").style.display = "none";
  $("btn-propose-online").style.display = "none";
  $("online-proposals-list").innerHTML = "";
  $("online-pseudo-input").value = prefill || "";
}

async function applySignedInUI(user) {
  $("btn-google-signin").style.display = "none";
  $("btn-google-signout").style.display = "inline-block";
  $("online-offline-hint").style.display = "none";
  $("online-pseudo-form").style.display = "none";

  const info = $("online-user-info");
  info.textContent = "Connecté·e en tant que " + currentPseudo;
  info.style.display = "block";
  $("btn-online-rename").style.display = "inline-block";

  $("btn-propose-online").style.display = "inline-block";

  currentIsSuperAdmin = isSuperAdminEmail(user.email);
  currentIsAdmin = currentIsSuperAdmin || (await checkIsAdmin(user));
  $("online-admin-badge").style.display = currentIsAdmin && !currentIsSuperAdmin ? "block" : "none";
  $("super-admin-panel").style.display = currentIsSuperAdmin ? "block" : "none";

  renderProposals();
}

async function refreshIdentity(user) {
  currentPseudo = await fetchPseudo(user.uid);
  if (currentPseudo) await applySignedInUI(user);
  else showPseudoForm("");
}

async function savePseudoFromInput() {
  if (!currentUser) return;
  const value = $("online-pseudo-input").value.trim();
  if (!value) return;
  try {
    await savePseudo(currentUser.uid, value);
    currentPseudo = value;
    await applySignedInUI(currentUser);
  } catch (err) {
    toast("Erreur : " + err.message);
  }
}

function init() {
  if (!$("online-panel")) return; // page sans mode en ligne

  $("btn-google-signin").addEventListener("click", async () => {
    try {
      await signIn();
    } catch (err) {
      toast("Connexion impossible : " + err.message);
    }
  });

  $("btn-google-signout").addEventListener("click", () => signOutUser());
  $("btn-propose-online").addEventListener("click", proposeFromModal);
  $("btn-online-rename").addEventListener("click", () => showPseudoForm(currentPseudo || ""));
  $("btn-online-pseudo-save").addEventListener("click", savePseudoFromInput);
  $("online-pseudo-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") savePseudoFromInput();
  });
  $("btn-add-admin").addEventListener("click", addAdminFromInput);
  $("f-admin-email").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addAdminFromInput();
  });

  watchAuth(async (user) => {
    currentUser = user;

    if (stopWatchingProposals) {
      stopWatchingProposals();
      stopWatchingProposals = null;
    }
    if (stopWatchingAdmins) {
      stopWatchingAdmins();
      stopWatchingAdmins = null;
    }

    if (!user) {
      applySignedOutUI();
      return;
    }

    await refreshIdentity(user);

    stopWatchingProposals = watchProposals((list) => {
      latestProposals = list;
      renderProposals();
    });

    if (currentIsSuperAdmin) {
      stopWatchingAdmins = watchAdmins((list) => {
        latestAdmins = list;
        renderAdminList();
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
