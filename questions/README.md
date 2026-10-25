# Ajouter ou modifier des questions

Toutes les questions du jeu vivent dans [`questions.json`](questions.json), sous forme d'un tableau d'objets. Il suffit d'éditer ce fichier (avec n'importe quel éditeur de texte) puis de pousser le changement sur GitHub : pas de build, pas de redémarrage de serveur.

Toutes les questions sont **à réponse libre** (tapée au clavier) — il n'y a pas de QCM.

## Schéma d'une question

```jsonc
{
  "id": "q41",                  // identifiant unique, libre (ex: "q41")
  "category": "Jeux vidéo",     // affiché pendant la question, purement informatif
  "question": "De quel jeu est tirée cette image ?",

  "media": null,                 // optionnel : l'élément visuel façon Popsauce (voir ci-dessous), sinon null/absent

  "acceptableAnswers": ["La réponse complète"],
  "timeLimit": 18                // secondes laissées aux joueurs pour répondre
}
```

## L'élément visuel (`media`), façon Popsauce

Comme dans Popsauce, une question peut associer un texte de consigne générique (« De quel jeu est tirée cette image ? », « De quel film est tirée cette réplique ? »...) à un **élément visuel à deviner**. C'est optionnel : une question sans `media` reste une question texte classique.

Trois types sont supportés :

```jsonc
// Image fixe ou GIF animé (un GIF est juste une image, aucune config spéciale)
"media": { "type": "image", "src": "assets/img/questions/q41.jpg" }

// Vidéo courte (muette et en boucle par défaut, comme un GIF qui aurait du son en option)
"media": { "type": "video", "src": "assets/video/questions/q41.mp4" }
// ou, pour une vidéo avec le son (ex: deviner un film à partir d'un extrait sonore) :
"media": { "type": "video", "src": "assets/video/questions/q41.mp4", "muted": false, "loop": false }

// Citation à deviner (affichée en grand, en italique)
"media": { "type": "quote", "text": "I'll be back." }
```

- **Images/GIFs** : dépose le fichier dans `assets/img/questions/` et référence-le avec son chemin relatif dans `media.src`.
- **Vidéos** : dépose le fichier dans `assets/video/questions/` (à créer) et référence-le dans `media.src`. Format `.mp4` recommandé (compatibilité maximale). Par défaut la vidéo démarre automatiquement, est muette et boucle — passe `"muted": false` et/ou `"loop": false` si tu veux une vidéo avec son ou qui ne boucle pas.
- **Citations** : juste le texte dans `media.text`, pas de fichier à fournir. Pense à rester sur des citations courtes et à ne pas mettre la réponse (le titre de l'œuvre) dans le texte affiché, évidemment.
- **Droits d'auteur** : à toi de vérifier que tu as le droit d'utiliser les images/vidéos que tu ajoutes (captures que tu as prises toi-même, contenu libre de droits...). Ce dépôt ne fournit aucune image ou vidéo par défaut, seulement quelques exemples de citations.

## Comment les points sont calculés

Une bonne réponse rapporte entre **1 et 20 points**, et ça ne dépend pas du temps écoulé depuis le début de la question, mais du temps écoulé **depuis la première bonne réponse** :

- Le premier joueur à trouver la bonne réponse a toujours **20 points**, quel que soit le temps qu'il a mis.
- À partir de cet instant, les points des bonnes réponses suivantes diminuent progressivement, jusqu'à un plancher de **1 point** environ 12 secondes après cette première bonne réponse (au-delà, une bonne réponse rapporte toujours ce minimum de 1 point — jamais 0, contrairement à une mauvaise réponse ou une absence de réponse).

Ça encourage à répondre vite une fois qu'on sait que quelqu'un a déjà trouvé, plutôt que de comparer chaque joueur au chrono global de la question.

## Comment la correction fonctionne

Le moteur du jeu compare ce que le joueur a tapé à chaque entrée de `acceptableAnswers`, en ignorant automatiquement les accents, la casse et la ponctuation, puis en essayant **plusieurs niveaux de tolérance** :

1. **Égalité exacte** (une fois normalisée).
2. **Fautes de frappe** : une petite distance d'erreur est tolérée, proportionnelle à la longueur du mot (quasi aucune tolérance pour un mot très court, jusqu'à 2-3 caractères d'écart pour une phrase longue).
3. **Titre partiel** : si ce que le joueur a tapé correspond à une **suite de mots contiguë** de la réponse complète (ou l'inverse), c'est accepté. Exemple : si `acceptableAnswers` contient `"The Legend of Zelda: Tears of the Kingdom"`, alors `"Tears of the Kingdom"`, `"Zelda Tears of the Kingdom"` ou même la réponse complète mal orthographiée sont automatiquement acceptés.
4. **Sigles/acronymes** : les initiales de n'importe quelle suite d'au moins 3 mots consécutifs de la réponse sont reconnues automatiquement. Avec le même exemple, `"TOTK"` est accepté sans rien configurer de plus (ce sont les initiales de "Tears Of The Kingdom").

**Concrètement : il suffit en général de renseigner le titre officiel complet.** Pas besoin de lister toutes les variantes à la main — les formes raccourcies et les sigles les plus naturels sont déjà couverts. Ajoute des entrées supplémentaires dans `acceptableAnswers` seulement pour les surnoms qui n'ont pas de lien direct avec les mots du titre (ex : un jeu dont le surnom courant n'est l'acronyme d'aucune partie du titre officiel).

## Conseils

- **Un seul mot/nombre comme réponse** (ex : `"206"`, `"Mario"`) : une seule entrée dans `acceptableAnswers` suffit largement.
- **Titres longs ou noms propres composés** : mets le titre complet et officiel, la détection de titre partiel et de sigle fera le reste. Ajoute une 2e entrée seulement si tu veux couvrir un surnom vraiment différent (ex : un jeu connu sous deux noms totalement distincts selon les régions).
- **Élément visuel** : voir la section `media` ci-dessus. Pas d'élément visuel = omets simplement le champ `media`.
- **Temps** : `15s` pour une réponse courte (nombre, un seul mot) et `18-22s` pour une réponse plus longue à taper sont de bons points de départ. C'est juste la fenêtre pendant laquelle on peut encore répondre — ça n'influence plus le nombre de points gagnés (voir ci-dessus).
- Le jeu mélange l'**ordre des questions** à chaque partie — pas besoin de les ranger dans un ordre précis dans le fichier.
- Si le fichier JSON contient une erreur de syntaxe (virgule oubliée, guillemet manquant...), le jeu affichera une erreur de chargement au démarrage. Un outil en ligne comme [jsonlint.com](https://jsonlint.com/) permet de vérifier rapidement la validité du fichier avant de le pousser sur GitHub.
