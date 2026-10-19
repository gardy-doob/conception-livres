# moodbook — conception livre

Application web (HTML, CSS, JavaScript, sans installation) pour préparer des livres photo :
chemin de fer par planches, événements, mises en page importées d'InDesign, définition des photos par bloc,
rédaction des textes avec relecture, et retour vers InDesign.

Adresse : https://gardy-doob.github.io/conception-livres/

## Utilisation
- Les livres sont enregistrés dans le navigateur et, une fois connecté, dans l'espace en ligne (Supabase).
- Les photos sont lues directement sur l'ordinateur (dossiers choisis par livre) et ne sont jamais envoyées en ligne.

## Mises en page (fichiers MEP)
1. `scripts/Export MEP - moodbook.jsx` (aussi téléchargeable depuis l'onglet Mises en page) : à copier dans
   le dossier Scripts « Utilisateur » d'InDesign, puis à lancer sur le fichier MEP ouvert.
2. Il crée « <fichier> - export MEP » : `mep.json` (blocs photo et texte, formes, superpositions, chaînages,
   colonnes, styles de paragraphe) et un aperçu basse définition de chaque page.
3. Glisser ce dossier sur le livre voulu (onglet Mises en page). Chaque page devient une mise en page de ce livre
   uniquement ; un nouvel export du même fichier met à jour ses mises en page.

## Retour vers InDesign
« Export InDesign » produit `placer_photos_textes.jsx` : palette de placement des photos (dans le bloc choisi dans
l'application) et versement des textes rédigés, sans toucher à la mise en forme de la maquette.

## Espace en ligne (Supabase)
- Tables : `supabase-setup.sql` (Supabase › SQL Editor).
- Adresse du projet et clé publique « anon » : `config.js`.
- Relecture des textes : fonction `supabase/functions/relecture` (Edge Function « relecture ») avec le secret
  `ANTHROPIC_API_KEY`. Facultatif : `RELECTURE_EMAILS` (adresses autorisées, séparées par des virgules),
  `RELECTURE_MODEL` (modèle Claude, par défaut claude-haiku-5-5).

## Phase Création : synchronisation avec InDesign
- Base : lancer aussi `supabase-creation.sql` (partage des livres, blocs, verrous, présence).
- Panneau InDesign : `indesign/moodbook.ccx` (double-clic pour l'installer, InDesign 2023 ou plus récent), sources dans `indesign/plugin/`.
- « Passer en création » (dans le panneau, document final ouvert) envoie pages, blocs photo et textes ; la conception est alors terminée.
- Chaque bloc a une version et un verrou ; synchronisation en direct seulement quand quelqu'un d'autre est actif sur le livre,
  sinon à l'enregistrement. Fermeture sans enregistrer ou plantage : les modifications InDesign non enregistrées sont annulées en ligne
  et celles du site réappliquées au document.
- Partage d'un livre avec un autre compte : bouton « Partager » dans l'en-tête du livre.
