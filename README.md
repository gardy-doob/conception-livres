# Chemin de fer — conception livre

Application web (HTML, CSS, JavaScript, sans installation) pour préparer des livres photo :
chemin de fer par planches, événements, mises en page, définition des photos par page et export vers InDesign.

## Utilisation
Ouvrir `index.html` dans Chrome ou Edge (ou l'adresse GitHub Pages du dépôt).

- Les données sont enregistrées dans le navigateur (IndexedDB) ; « Sauvegarder (.json) » et « Menu ☰ › Restaurer » pour les transférer.
- Les photos sont lues directement sur l'ordinateur (dossiers choisis par livre) et ne sont jamais envoyées en ligne.
- « Export InDesign » produit un script `placer_photos.jsx` qui ouvre une palette de placement dans InDesign.
