# Locus Magnus

*A big place for small days.*

Quand tu te sens petit, va dans un endroit qui est grand. Locus Magnus affiche un mantra ou une citation à la fois, en anglais, tirés au hasard dans un pool mélangé. Chaque jour, un texte du jour est proposé à l'ouverture, puis le bouton « Next » (ou un balayage vers la gauche) passe au texte suivant.

C'est une application web progressive (PWA) : elle s'installe sur l'écran d'accueil du téléphone et fonctionne hors ligne.

## Structure

```
index.html              page de l'application
style.css               styles
app.js                  logique (chargement, tirage, affichage)
sw.js                   service worker (hors ligne)
manifest.webmanifest    installation sur l'écran d'accueil
icons/                  icônes de l'application
fonts/                  polices (Cormorant Garamond, Jost — licence SIL OFL)
data/mantras.json       textes originaux (en anglais)
data/quotes.json        citations d'autres auteurs (en anglais)
```

## Ajouter un texte

Ouvrez `data/mantras.json` ou `data/quotes.json`, ajoutez une entrée, puis enregistrez (Commit changes). Le site est mis à jour en une minute environ.

```json
{
  "id": "m-0007",
  "type": "mantra",
  "text": "Your text here.",
  "author": null,
  "lang": "en",
  "tags": ["calm"]
}
```

- `id` doit être unique et ne jamais être réutilisé (`m-` pour les mantras, `q-` pour les citations).
- `type` vaut `mantra` ou `quote`.
- Tout le contenu est en anglais. Pour les citations traduites, privilégiez des traductions anciennes (domaine public).
- Les entrées sont séparées par une virgule, sans virgule après la dernière.

## Mettre à jour le code

Après toute modification de `index.html`, `style.css`, `app.js` ou des icônes, augmentez `VERSION` dans `sw.js` (`v1` → `v2`…) pour que les téléphones récupèrent la nouvelle version. Ce n'est pas nécessaire quand vous ajoutez seulement des textes.

## Licences

*(À compléter : voir la section dédiée lorsque vous choisirez vos licences.)*

- Code : tous droits réservés pour l'instant.
- Textes originaux (`data/mantras.json`) : ©Emilien LECOFFRE, tous droits réservés.
- Citations (`data/quotes.json`) : appartiennent à leurs auteurs respectifs ou relèvent du domaine public ; elles ne sont pas couvertes par les mentions ci-dessus.
- Polices : Cormorant Garamond et Jost, sous licence SIL Open Font License 1.1 (voir `fonts/`).
