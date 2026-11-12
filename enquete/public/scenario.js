// Scénario de l'enquête « livres photo » — données seulement, aucune logique d'affichage.
// Chaque étape : id, chapitre, texte (ou fonction des réponses), choix, et la suite (id ou fonction).
// a = réponses déjà données, ex. a.Q01 === 'A'. Les textes sont ceux du scénario v1.0, corrigés (voir README).
window.SCENARIO = (() => {
  const C = (...pairs) => pairs.map(([k, t]) => ({ k, t }));
  const never = a => a.Q01 === 'D';                       // n'a jamais créé de livre
  const unfinished = a => a.Q01 === 'B' || a.Q01 === 'C'; // projet de référence = livre laissé en plan
  const finished = a => a.Q01 === 'A' || (unfinished(a) && a.Q16 === 'D'); // livre terminé (au final)
  const noPause = a => a.Q01 === 'A' && (a.Q16 === 'B' || a.Q16 === 'C');

  const chapters = {
    1: 'Le déclic', 2: 'Comment ça s\'est passé', 3: 'Le moment de la pause', 4: 'Tes envies'
  };

  const nodes = [
    { id: 'intro', say: "Salut ! Je cherche à mieux comprendre comment les gens créent leurs livres photo — et pourquoi certains projets restent en plan.", next: 'intro2' },
    { id: 'intro2', say: "Ça prend 8 à 12 minutes selon ton expérience. Surtout des petites questions à choix, sans bonne ou mauvaise réponse. Tu peux passer une question ou arrêter quand tu veux.", next: 'start' },
    { id: 'start', ask: "On commence ?", choices: C(['A', 'Oui'], ['B', 'Pas maintenant']), next: (a, v) => v === 'B' ? 'bye' : 'prenom' },
    { id: 'bye', say: "Aucun souci, merci quand même ! Le lien reste valable si tu changes d'avis.", end: true },

    { id: 'prenom', ask: "Super. Avant de commencer : comment je t'appelle ?", free: 'name', optional: true, next: 'email' },
    { id: 'email', ask: a => `${a.prenom ? 'Merci ' + a.prenom + '. ' : ''}Si tu veux pouvoir reprendre plus tard sur un autre appareil, laisse-moi ton e-mail. Sinon, tu peux passer.`, free: 'email', optional: true, next: 'c1' },

    { id: 'c1', say: "D'abord, quelques questions sur ton expérience.", chapter: 1, next: 'Q01' },
    { id: 'Q01', chapter: 1, ask: "Tu as déjà essayé de créer un livre photo ?",
      choices: C(['A', "Oui, j'en ai terminé au moins un"], ['B', "Oui, j'en ai commencé mais jamais terminé"], ['C', "Oui, j'en ai terminé ET j'en ai laissé en plan"], ['D', "Non, jamais"]),
      next: 'Q02' },
    { id: 'Q02', chapter: 1, ask: a => never(a) ? "Si tu faisais un livre photo, ce serait plutôt pour…" : (a.Q01 === 'C' ? "Pense au dernier livre que tu as laissé en plan. Il concernait quel type de souvenir ?" : "Ce livre concernait quel type de souvenir ?"),
      choices: C(['A', 'Un voyage'], ['B', 'Un mariage ou une fête importante'], ['C', 'Un enfant, une naissance, une première année'], ['D', 'Une année en famille, le quotidien'], ['E', 'Un cadeau ou une autre occasion'], ['F', 'Autre']),
      next: 'Q03' },
    { id: 'Q03', chapter: 1, ask: a => never(a) ? "Qu'est-ce qui pourrait te donner envie de te lancer ?" : "Qu'est-ce qui t'avait donné envie de te lancer ?",
      choices: C(['A', 'Garder une trace de souvenirs importants'], ['B', 'Offrir un objet personnel'], ['C', 'Faire quelque chose de beau à feuilleter'], ['D', 'Mettre enfin de l\'ordre dans mes photos'], ['E', 'Autre chose']),
      next: (a, v) => v === 'E' ? 'Q03b' : 'Q04' },
    { id: 'Q03b', chapter: 1, ask: "Tu préciserais en quelques mots ?", free: 'text', optional: true, next: 'Q04' },
    { id: 'Q04', chapter: 1, ask: a => never(a) ? "Tu imaginerais surtout…" : "Au départ, tu imaginais surtout…",
      choices: C(['A', 'Un album simple avec les plus belles photos'], ['B', 'Un livre racontant une histoire'], ['C', 'Un bel objet, avec une mise en page soignée'], ['D', 'Je n\'avais pas d\'idée précise']),
      next: 'Q05' },
    { id: 'Q05', chapter: 1, ask: a => never(a) ? "L'idée de créer un livre photo te motive à quel point aujourd'hui ?" : "Au moment de commencer, tu étais motivé·e à quel point ?",
      choices: C(['A', 'Très'], ['B', 'Plutôt'], ['C', 'Moyennement'], ['D', 'Peu'], ['E', 'Pas du tout']),
      next: a => never(a) ? 'c4' : 'c2' },

    { id: 'c2', say: "Je vais revenir sur la façon dont ça s'est passé.", chapter: 2, next: 'Q06' },
    { id: 'Q06', chapter: 2, ask: "Tu avais commencé avec quel type d'outil ?",
      choices: C(['A', 'Un site web de livres photo'], ['B', 'Une application sur téléphone'], ['C', 'Un logiciel sur ordinateur'], ['D', 'Un service ou une personne qui s\'en occupait'], ['E', 'Je ne sais plus / autre']), next: 'Q07' },
    { id: 'Q07', chapter: 2, ask: "Tu travaillais surtout sur quel appareil ?",
      choices: C(['A', 'Téléphone'], ['B', 'Ordinateur'], ['C', 'Tablette'], ['D', 'Plusieurs appareils']), next: 'Q08' },
    { id: 'Q08', chapter: 2, ask: "Au départ, tu avais environ combien de photos à gérer ?",
      choices: C(['A', 'Moins de 50'], ['B', 'Entre 50 et 200'], ['C', 'Entre 200 et 500'], ['D', 'Plus de 500'], ['E', 'Je ne sais plus']), next: 'Q09' },
    { id: 'Q09', chapter: 2, ask: "Tes photos étaient principalement…",
      choices: C(['A', 'Déjà regroupées au même endroit'], ['B', 'Éparpillées entre téléphone, ordinateur, cloud…'], ['C', 'Réparties entre plusieurs personnes'], ['D', 'Je ne sais plus']), next: 'Q10' },
    { id: 'Q10', chapter: 2, ask: "Le choix des photos à conserver a été…",
      choices: C(['A', 'Très facile'], ['B', 'Plutôt facile'], ['C', 'Plutôt difficile'], ['D', 'Très difficile'], ['E', 'Je n\'ai pas vraiment fait de tri']), next: 'Q11' },
    { id: 'Q11', chapter: 2, ask: "Quand tu hésitais entre plusieurs photos, c'était surtout parce que…",
      choices: C(['A', 'J\'avais trop de photos ressemblantes'], ['B', 'Chaque photo me rappelait quelque chose'], ['C', 'Je ne savais pas lesquelles rendraient bien dans le livre'], ['D', 'Je n\'hésitais pas vraiment'], ['E', 'Autre / je ne sais plus']), next: 'Q12' },
    { id: 'Q12', chapter: 2, ask: "As-tu dû passer d'un appareil à un autre pendant la création ?",
      choices: C(['A', 'Oui, sans problème'], ['B', 'Oui, et c\'était pénible'], ['C', 'Oui, avec des difficultés pour retrouver mon travail ou mes photos'], ['D', 'Non'], ['E', 'Je ne sais plus']),
      next: (a, v) => v === 'C' ? 'Q12b' : 'Q13' },
    { id: 'Q12b', chapter: 2, ask: "Tu avais perdu des photos, la mise en page, ou simplement ta progression ?", free: 'text', optional: true, next: 'Q13' },
    { id: 'Q13', chapter: 2, ask: "Reprendre ton travail après une pause, c'était…",
      choices: C(['A', 'Très simple'], ['B', 'Assez simple'], ['C', 'Compliqué : je ne retrouvais pas facilement où j\'en étais'], ['D', 'Compliqué : j\'avais peur de perdre mon travail'], ['E', 'Je n\'ai pas essayé de reprendre']), next: 'Q14' },
    { id: 'Q14', chapter: 2, ask: "Organiser les photos dans les pages, tu as trouvé ça…",
      choices: C(['A', 'Facile et agréable'], ['B', 'Faisable, mais long'], ['C', 'Difficile : trop de choix ou manque d\'inspiration'], ['D', 'Frustrant à cause de l\'outil'], ['E', 'Je ne suis pas arrivé·e à cette étape']), next: 'Q15' },
    { id: 'Q15', chapter: 2, ask: "Et pour les textes ou les légendes ?",
      choices: C(['A', 'J\'aimais bien les écrire'], ['B', 'Ça me prenait du temps, mais ça allait'], ['C', 'Je ne savais pas quoi écrire'], ['D', 'Je n\'avais pas envie de rédiger'], ['E', 'Je n\'en ai pas mis / pas atteint cette étape']), next: 'Q16' },

    { id: 'Q16', chapter: 3, ask: a => unfinished(a) ? "Ton projet laissé en plan, aujourd'hui, il est plutôt…" : "Pour ce livre terminé : tu as déjà fait une pause de plus d'une semaine en cours de route ?",
      choices: a => unfinished(a)
        ? C(['A', 'En pause : je pense le reprendre'], ['B', 'En pause, mais je ne sais pas si je le reprendrai'], ['C', 'Abandonné'], ['D', 'Je l\'ai finalement terminé depuis'])
        : C(['A', 'Oui'], ['B', 'Non'], ['C', 'Je ne sais plus']),
      next: a => noPause(a) ? 'Q23' : 'c3' },
    { id: 'c3', say: a => a.Q01 === 'A' || a.Q16 === 'D' ? "Parlons de cette pause." : "Parlons du moment où ça s'est arrêté.", chapter: 3, next: 'Q17' },
    { id: 'Q17', chapter: 3, ask: "À quel moment as-tu commencé à décrocher ?",
      choices: C(['A', 'Pendant la collecte ou le tri des photos'], ['B', 'Au moment de choisir une structure, une mise en page'], ['C', 'Pendant les textes ou les légendes'], ['D', 'Pendant les retouches, les ajustements'], ['E', 'Au moment de finaliser, de commander'], ['F', 'Je ne sais plus']), next: 'Q18' },
    { id: 'Q18', chapter: 3, ask: a => finished(a) ? "Qu'est-ce qui a surtout provoqué la pause ?" : "Qu'est-ce qui a surtout provoqué l'arrêt ?",
      choices: C(['A', 'Je manquais de temps, d\'énergie'], ['B', 'L\'outil était compliqué ou frustrant'], ['C', 'Je ne savais plus comment avancer'], ['D', 'Je n\'avais plus très envie de m\'y remettre'], ['E', 'Le prix, la commande me freinait'], ['F', 'Autre raison']),
      next: (a, v) => v === 'F' ? 'Q18b' : 'Q19' },
    { id: 'Q18b', chapter: 3, ask: "Qu'est-ce qui t'avait bloqué·e à ce moment-là ?", free: 'text', optional: true, next: 'Q19' },
    { id: 'Q19', chapter: 3, ask: "Quand tu t'es arrêté·e, tu pensais…",
      choices: C(['A', 'Reprendre dans la journée'], ['B', 'Reprendre dans les jours suivants'], ['C', 'Reprendre un jour, sans date précise'], ['D', 'Arrêter définitivement'], ['E', 'Je ne sais plus']), next: 'Q20' },
    { id: 'Q20', chapter: 3, ask: "Depuis, tu as essayé de t'y remettre ?",
      choices: C(['A', 'Oui, et j\'ai avancé'], ['B', 'Oui, mais je me suis arrêté·e à nouveau'], ['C', 'Non, même si j\'y pense parfois'], ['D', 'Non, ça ne m\'intéresse plus']),
      next: a => finished(a) ? 'Q22' : 'Q21' },
    { id: 'Q21', chapter: 3, ask: "Aujourd'hui, qu'est-ce qui rendrait la reprise la plus difficile ?",
      choices: C(['A', 'Retrouver mes photos ou mon projet'], ['B', 'Me rappeler ce qui restait à faire'], ['C', 'Reprendre la mise en page, les textes'], ['D', 'Trouver du temps et de l\'énergie'], ['E', 'Rien de particulier'], ['F', 'Autre chose']),
      next: (a, v) => v === 'F' ? 'Q21b' : 'Q22' },
    { id: 'Q21b', chapter: 3, ask: "Tu préciserais en quelques mots ?", free: 'text', optional: true, next: 'Q22' },
    { id: 'Q22', chapter: 3, ask: "Au moment de faire cette pause, tu ressentais surtout…",
      choices: C(['A', 'De la frustration'], ['B', 'De la fatigue, de la lassitude'], ['C', 'Le sentiment que ça prenait trop de temps'], ['D', 'De la déception sur le résultat'], ['E', 'Rien de négatif : j\'avais juste autre chose à faire'], ['F', 'Autre / je ne sais plus']), next: 'Q23' },
    { id: 'Q23', chapter: 3, ask: a => noPause(a) ? "As-tu pu visualiser assez tôt une version qui ressemblait déjà au livre fini ?" : "À ce moment-là, est-ce que tu voyais déjà à quoi ressemblerait le livre fini ?",
      choices: C(['A', 'Oui, j\'avais déjà un aperçu assez abouti'], ['B', 'Un peu, mais pas vraiment convaincant'], ['C', 'Non, ça restait très abstrait'], ['D', 'Je ne sais plus']), next: 'Q24' },
    { id: 'Q24', chapter: 3, ask: a => finished(a) ? "Qu'est-ce qui t'aurait le plus facilité la création ?" : "Qu'est-ce qui t'aurait le plus aidé·e à avancer ?",
      choices: C(['A', 'Moins de tâches manuelles'], ['B', 'Une façon plus simple de retrouver et reprendre mon projet'], ['C', 'Une première version visuellement convaincante plus tôt'], ['D', 'Des idées pour organiser l\'histoire et les pages'], ['E', 'Quelqu\'un pour m\'aider à certains moments'], ['F', 'Rien de tout ça / autre']), next: 'Q25' },
    { id: 'Q25', chapter: 3, ask: a => finished(a) ? "Qu'est-ce qui t'a le plus aidé·e à aller au bout ?" : "Aujourd'hui, ton envie de terminer ce livre est plutôt…",
      choices: a => finished(a)
        ? C(['A', 'L\'envie d\'avoir le livre entre les mains'], ['B', 'Une occasion ou une date précise'], ['C', 'Le plaisir de voir le livre prendre forme'], ['D', 'L\'aide ou la motivation d\'un proche'], ['E', 'Autre chose'])
        : C(['A', 'Forte'], ['B', 'Moyenne'], ['C', 'Faible'], ['D', 'Nulle'], ['E', 'Je ne sais pas']),
      next: 'c4' },

    { id: 'c4', say: "Dernière partie : ce que tu aimerais retrouver dans un livre photo.", chapter: 4, next: 'Q26' },
    { id: 'Q26', chapter: 4, ask: "Pour raconter des souvenirs dans un livre, tu aurais plutôt envie de les organiser…",
      choices: C(['A', 'Dans l\'ordre des événements'], ['B', 'Par lieux ou étapes d\'un voyage'], ['C', 'Autour de personnes importantes'], ['D', 'Autour des moments les plus marquants'], ['E', 'Je préférerais qu\'on me suggère une organisation'], ['F', 'Je ne sais pas']), next: 'Q27' },
    { id: 'Q27', chapter: 4, ask: "En dehors des photos, quels éléments trouverais-tu utiles dans un livre ? Tu peux en choisir jusqu'à trois.", multi: 3,
      choices: C(['A', 'Des dates ou des étapes importantes'], ['B', 'De petites anecdotes'], ['C', 'Des cartes ou des lieux'], ['D', 'Des phrases, messages ou citations de proches'], ['E', 'Des repères visuels sur une évolution (ex. une première année)'], ['F', 'Rien d\'autre, les photos me suffisent']), next: 'Q28' },
    { id: 'Q28', chapter: 4, ask: "Pour rassembler des souvenirs, quelle place donnerais-tu à tes proches ?",
      choices: C(['A', 'J\'aimerais qu\'ils puissent ajouter des photos'], ['B', 'J\'aimerais qu\'ils puissent aussi proposer des anecdotes'], ['C', 'Je préférerais recueillir leurs éléments moi-même'], ['D', 'Je préférerais créer le livre seul·e'], ['E', 'Ça dépend du projet']), next: 'Q29' },
    { id: 'Q29', chapter: 4, ask: "Si tu pouvais voir rapidement une belle couverture et quelques pages d'exemple à partir de tes photos, ce serait…",
      choices: C(['A', 'Très motivant pour continuer'], ['B', 'Plutôt utile, sans être essentiel'], ['C', 'Peu important : je préfère tout construire moi-même'], ['D', 'Je ne sais pas']), next: 'Q30' },
    { id: 'Q30', chapter: 4, ask: "Pour créer un prochain livre photo, tu te sentirais le plus à l'aise avec…",
      choices: C(['A', 'Un outil simple où je fais tout moi-même'], ['B', 'Un outil qui me fait des propositions et me laisse modifier'], ['C', 'Un outil + une personne qui m\'aide à certaines étapes'], ['D', 'Une personne qui s\'occupe de presque tout, avec mon avis'], ['E', 'Je ne sais pas']), next: 'dernier' },
    { id: 'dernier', chapter: 4, ask: "Dernière chose, et c'est libre : une anecdote, une galère, une envie à propos des livres photo ? Sinon tu peux passer.", free: 'text', optional: true, next: 'fin' },
    { id: 'fin', say: a => `C'est terminé ! Tes réponses vont m'aider à mieux comprendre ce qui rend la création d'un livre photo agréable, difficile… ou parfois interminable. Merci d'avoir pris le temps.`, end: true }
  ];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  return { nodes: byId, start: 'intro', chapters };
})();
