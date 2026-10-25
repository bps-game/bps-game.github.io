# BetterPopsauce

Quiz de culture générale multijoueur en temps réel, façon Popsauce — **100% gratuit, sans compte, sans serveur à payer**.

Tout le monde répond en même temps aux mêmes questions, à l'écrit (pas de QCM), avec une correction tolérante aux fautes de frappe, aux titres partiels et aux acronymes. Comme dans Popsauce, une question peut être accompagnée d'un élément visuel à deviner : image, GIF, courte vidéo ou citation. Chaque bonne réponse rapporte entre 1 et 20 points : le premier à trouver a toujours le maximum, puis les points des suivants diminuent avec le temps écoulé depuis cette première bonne réponse, sans jamais descendre sous 1 point. Un tableau des scores en direct (à droite pendant la question) montre qui a trouvé et la dernière tentative fausse de chacun, avec un badge 🔥 pour les séries de bonnes réponses. La partie n'est pas limitée à un nombre fixe de questions : l'hôte fixe un score à atteindre dans le lobby, et la partie s'arrête dès qu'un joueur l'atteint (ou s'il n'y a plus de questions avant que quelqu'un y arrive).

Le tout avec une bonne dose de "juice" : sons synthétisés (zéro fichier audio, bouton 🔊/🔇 pour couper), chiffres qui défilent au lieu de sauter, secousse sur une mauvaise réponse, et confettis au podium final.

## Comment ça marche techniquement

- **Site 100% statique** : HTML/CSS/JS, aucune compilation, aucune dépendance npm. Hébergeable gratuitement sur **GitHub Pages**.
- **Pas de serveur de jeu** : la synchronisation entre joueurs se fait en **pair-à-pair (WebRTC)** via la librairie [PeerJS](https://peerjs.com/), qui utilise un service public gratuit uniquement pour la mise en relation initiale (aucune donnée de jeu ne passe par un serveur tiers après ça).
- La personne qui **crée** la partie devient l'« hôte » : son navigateur fait tourner la logique du jeu (déroulé des questions, chronomètre, calcul des scores) et transmet l'état à tous les autres joueurs connectés.

### Limites à connaître

- **L'hôte doit garder son onglet ouvert** pendant toute la partie : si cet onglet se ferme, la partie s'arrête pour tout le monde (il n'y a pas de serveur central qui tourne en permanence).
- Sur un réseau très restrictif (wifi d'entreprise, CGNAT strict), la connexion directe entre deux joueurs peut occasionnellement échouer. Ça fonctionne normalement très bien sur du wifi/4G/5G classique.

## Déployer gratuitement sur GitHub Pages

1. Crée un nouveau repo GitHub (public) et pousse-y le contenu de ce dossier.
2. Dans le repo GitHub : **Settings → Pages → Build and deployment → Deploy from a branch**, choisis la branche `main` et le dossier `/ (root)`.
3. Après 1-2 minutes, ton site est en ligne à `https://<ton-pseudo-github>.github.io/<nom-du-repo>/`. Partage cette URL à tes amis.

Aucune autre étape : pas de build, pas de variables d'environnement, pas de carte bancaire.

## Tester en local avant de déployer

Comme le jeu charge `questions/questions.json` via `fetch`, il faut le servir via un petit serveur local (pas juste double-cliquer sur `index.html`, qui serait bloqué par le navigateur). Par exemple :

```bash
npx serve .
```

ou, si tu as Python :

```bash
python -m http.server 8080
```

Puis ouvre l'URL affichée dans deux onglets différents pour tester le multijoueur (un onglet crée la partie, l'autre la rejoint avec le code affiché).

## Ajouter tes propres questions

Deux façons de faire :

- **[`editor.html`](editor.html)** : un éditeur visuel à ouvrir dans le navigateur (en local ou via l'URL déployée) pour créer/modifier/supprimer des questions sans toucher au JSON — formulaire avec aperçu en direct (rendu exactement comme dans le jeu) et un testeur de réponse pour vérifier qu'une faute de frappe ou une forme raccourcie serait bien acceptée. Dans Chrome/Edge, il peut lire et réenregistrer directement `questions/questions.json` sur ton disque ; sinon, importe/exporte le fichier JSON manuellement. Rien n'est envoyé nulle part, tout reste dans ton navigateur.
- **À la main** : tout le schéma est documenté dans [`questions/README.md`](questions/README.md) — il suffit d'éditer `questions/questions.json`.

Dans les deux cas, pense ensuite à pousser le fichier modifié sur GitHub pour que le changement soit en ligne.

### Mode "en ligne" : comptes et modération (optionnel)

[`editor.html`](editor.html) a aussi un mode en ligne, pour laisser d'autres personnes **proposer** des questions sans qu'elles touchent directement au fichier, avec validation par un·e admin avant qu'elles soient ajoutées. C'est 100% optionnel — sans configuration, l'éditeur fonctionne exactement comme avant (local, `questions.json`).

**Important sur la sécurité des comptes** : la connexion se fait uniquement via **Google** (bouton "Se connecter avec Google") — aucun mot de passe ne transite ni n'est stocké par ce projet, à aucun moment. C'est Google qui gère entièrement l'authentification ; nous n'avons techniquement aucun moyen de voir ou récupérer le mot de passe de qui que ce soit. Le rôle « admin » est juste une liste d'identifiants Google autorisés dans la base, et cette liste n'est modifiable que depuis la console Firebase (jamais depuis le site) — personne ne peut se nommer admin lui-même.

Ce mode a besoin d'un projet Firebase gratuit (aucune carte bancaire requise) :

1. Va sur [console.firebase.google.com](https://console.firebase.google.com/), crée un projet (gratuit, plan "Spark").
2. **Authentication → Sign-in method** : active le fournisseur **Google**.
3. **Firestore Database** : crée une base (mode production).
4. Dans l'onglet **Règles** de Firestore, colle le contenu de [`firestore.rules`](firestore.rules) à la racine du projet, puis publie.
5. **Paramètres du projet → Général → Tes applications** : ajoute une app web, copie la config fournie dans [`js/firebase-config.js`](js/firebase-config.js) (remplace les `"REMPLACE-MOI"`). Ce n'est pas un secret, tu peux le commiter.
6. **Devenir le premier admin** : dans Firestore, crée manuellement une collection `admins`, puis un document dont l'**ID est ton UID Google** (visible dans Authentication → Users une fois que tu t'es connecté·e une première fois sur `editor.html`). Le contenu du document n'a pas d'importance, seule son existence compte.

Une fois configuré : n'importe qui de connecté peut proposer une question (bouton "Proposer en ligne" dans le formulaire) ; les comptes admin voient la file d'attente avec des boutons Approuver/Rejeter, et une question approuvée est automatiquement ajoutée à la liste locale de l'admin — il ne reste qu'à Enregistrer/Exporter comme d'habitude pour la faire apparaître dans le jeu.

## Pistes d'amélioration futures (non faites pour l'instant)

- Statistiques persistantes entre les parties, comptes joueurs.
- Chat, musique d'ambiance.
- Serveur TURN dédié pour fiabiliser les connexions sur réseaux très restrictifs.
