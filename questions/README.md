# Ajouter ou modifier des questions

Toutes les questions du jeu vivent dans [`questions.json`](questions.json), sous forme d'un tableau d'objets. Il suffit d'éditer ce fichier (avec n'importe quel éditeur de texte) puis de pousser le changement sur GitHub : pas de build, pas de redémarrage de serveur.

## Schéma d'une question

```jsonc
{
  "id": "q41",                  // identifiant unique, libre (ex: "q41")
  "category": "Cinéma",         // affiché pendant la question, purement informatif
  "type": "qcm",                 // "qcm" (choix multiples) ou "libre" (réponse tapée au clavier)
  "question": "Texte de la question ?",
  "image": null,                  // optionnel : chemin relatif, ex "assets/img/questions/q41.jpg", sinon null

  // --- uniquement pour "type": "qcm" ---
  "choices": ["Bonne réponse", "Fausse 1", "Fausse 2", "Fausse 3"],
  "correctIndex": 0,              // index (0 = premier choix) de la bonne réponse dans "choices"

  // --- uniquement pour "type": "libre" ---
  "acceptableAnswers": ["reponse", "variante acceptee"],
  // La comparaison ignore automatiquement les accents, la casse et la ponctuation,
  // et tolère une petite faute de frappe. Mets juste 1-3 formulations simples qui suffisent.

  "timeLimit": 15,                 // secondes laissées aux joueurs pour répondre
  "points": 1000                    // points de base si bonne réponse (bonus de rapidité ajouté par-dessus)
}
```

## Conseils

- **QCM** : mets toujours la bonne réponse dans `choices`, à l'index indiqué par `correctIndex` (l'ordre affiché aux joueurs est mélangé automatiquement par le jeu, donc l'ordre dans le fichier n'a pas d'importance).
- **Réponse libre** : liste 1-3 variantes acceptées suffit (ex: `["sherlock holmes", "sherlock"]`), la normalisation (minuscules, sans accents, tolérance aux fautes de frappe) fait le reste.
- **Images** : dépose l'image dans `assets/img/questions/` et référence-la avec son chemin relatif dans le champ `image`. Pas d'image = laisse `null`.
- **Temps/points** : `12s` pour un QCM et `20s` pour une réponse libre sont de bons points de départ, à ajuster selon la difficulté.
- Le jeu mélange l'**ordre des questions** à chaque partie — pas besoin de les ranger dans un ordre précis dans le fichier.
- Si le fichier JSON contient une erreur de syntaxe (virgule oubliée, guillemet manquant...), le jeu affichera une erreur de chargement au démarrage. Un outil en ligne comme [jsonlint.com](https://jsonlint.com/) permet de vérifier rapidement la validité du fichier avant de le pousser sur GitHub.
