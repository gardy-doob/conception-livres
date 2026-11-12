# Enquête « livres photo » — chatbot (POC Netlify)

Une page de conversation (`public/`) + une fonction (`netlify/functions/api.mts`) qui enregistre les réponses dans Netlify Blobs.
Le scénario est dans `public/scenario.js` : textes, choix et embranchements, modifiables sans toucher au moteur (`public/app.js`).

## Déployer
Netlify › Add new project › Import from Git › ce dépôt, branche `enquete-poc`, **Base directory** `enquete`
(le `netlify.toml` du dossier fait le reste). Variables d'environnement :
- `ENQUETE_ADMIN_KEY` : clé d'accès à `/admin.html` (lecture et export CSV des réponses)
- `ANTHROPIC_API_KEY` (facultatif) : permet de rattacher une réponse tapée librement à un choix du QCM ; sans elle, la réponse est gardée telle quelle en « autre »
- `ENQUETE_MODEL` (facultatif, défaut `claude-haiku-5-5`)

Dans Site configuration › Access & security, vérifier que les visiteurs n'ont pas besoin d'un compte Netlify (sinon vos amies ne pourront pas ouvrir le lien).

## Corrections apportées au scénario v1.0
- `intro` et `start` séparés, prénom et e-mail (facultatifs) demandés après le « Oui » pour permettre la reprise
- Q02 : ajout de « Autre »
- Relances prévues par le scénario transformées en vraies étapes facultatives : Q03=E, Q12=C, Q18=F, Q21=F
- Q16 : deux formulations selon Q01 ; le chemin « terminé sans pause » saute Q17–Q22 ; Q20 saute Q21 pour un livre terminé
- Q25 : version « livre terminé » si Q01=A ou Q16=D
- Une question libre finale (« dernier ») : la seule chance de récolter une anecdote
- Le lien de « remerciement sans suite » reste valable : la personne peut revenir
