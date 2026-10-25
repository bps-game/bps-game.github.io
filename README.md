# BetterPopsauce

Quiz de culture générale multijoueur en temps réel, façon Popsauce — **100% gratuit, sans compte, sans serveur à payer**.

Tout le monde répond en même temps aux mêmes questions, à l'écrit (pas de QCM), avec une correction tolérante aux fautes de frappe, aux titres partiels et aux acronymes. Les points dépendent de la rapidité, et le classement se met à jour en direct.

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

Tout est documenté dans [`questions/README.md`](questions/README.md) — il suffit d'éditer `questions/questions.json`.

## Pistes d'amélioration futures (non faites pour l'instant)

- Questions avec extraits vidéo/audio.
- Statistiques persistantes entre les parties, comptes joueurs.
- Interface d'administration pour éditer les questions sans toucher au JSON.
- Chat, sons/musique d'ambiance.
- Serveur TURN dédié pour fiabiliser les connexions sur réseaux très restrictifs.
