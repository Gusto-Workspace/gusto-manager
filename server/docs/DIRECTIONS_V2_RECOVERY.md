# Directions V2 : primitives et reprise des appels payés

## Cause du rejet réel et limite de l'audit précédent

Avant correction, `homeElements` n'était pas une whitelist de compositions exactes. Le validateur appliquait une whitelist de **primitives**, puis `required=[headline]` pour TOUS les `homepage_primary`, hero compris. Il n'exigeait ni CTA, ni troisième élément. Il refusait donc photo + texte bref faute de headline. Ce prérequis transformait le contrat en recette implicite.

L'ancien contrat primaire autorisait les huit sous-ensembles contenant headline parmi les quatre primitives primaires ; les sept autres compositions non vides étaient rejetées. Les fixtures parfaites et les tests négatifs de l'audit précédent ne couvraient pas ces compositions légitimes. La couverture d'une branche de rejet ne prouvait pas que tous ses rejets étaient légitimes.

## Nouveau contrat de primitives

Enum réel : `headline`, `short_copy`, `photography`, `invitation`, `cta`.

- Primary, hero compris : toute combinaison non vide de headline, short_copy, photography et cta. Aucun titre, CTA ou quota d'éléments imposé. Même un CTA éditorial seul reste possible si le moment le justifie ; sa pertinence relève de la revue artistique.
- Teaser : invitation + cta obligatoires, photographie facultative, destination dédiée concordante et `editorialIntent` valide. Le headline de l'invitation est porté par cet objet ; headline et short_copy comme contenu primaire autonome ne sont pas des primitives de teaser.
- Invitation est réservée au teaser par convention de portée. Les éléments inconnus/fonctionnels sont interdits dans les deux placements. Un tableau vide ne décrit aucun contenu exploitable.
- Les répétitions de primitives sont dédupliquées localement : ce tableau décrit des types d'éléments, pas le nombre de photos à dessiner.
- Hero implique primary/primary ; section accepte primary/primary ou teaser/teaser_only. Les autres couples de portée sont invalides, indépendamment des primitives.

## Matrice exhaustive des ensembles de primitives

Cette table est produite depuis les enums du Structured Output actif. Les colonnes supposent les couples de rôle/placement/portée cohérents et toutes les destinations/sujets valides. L'ordre des primitives est libre.

| homeElements | Hero primary/primary | Section primary/primary | Section teaser/teaser_only |
| --- | --- | --- | --- |
| ∅ | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: home_elements_invalid |
| `headline` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `short_copy` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `headline` + `short_copy` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `photography` | VALID | VALID | INVALID: home_elements_invalid |
| `headline` + `photography` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `short_copy` + `photography` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `headline` + `short_copy` + `photography` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `invitation` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: home_elements_invalid |
| `headline` + `invitation` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `short_copy` + `invitation` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `headline` + `short_copy` + `invitation` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `photography` + `invitation` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: home_elements_invalid |
| `headline` + `photography` + `invitation` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `short_copy` + `photography` + `invitation` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `headline` + `short_copy` + `photography` + `invitation` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `cta` | VALID | VALID | INVALID: home_elements_invalid |
| `headline` + `cta` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `short_copy` + `cta` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `headline` + `short_copy` + `cta` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `photography` + `cta` | VALID | VALID | INVALID: home_elements_invalid |
| `headline` + `photography` + `cta` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `short_copy` + `photography` + `cta` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `headline` + `short_copy` + `photography` + `cta` | VALID | VALID | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `invitation` + `cta` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | VALID |
| `headline` + `invitation` + `cta` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `short_copy` + `invitation` + `cta` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `headline` + `short_copy` + `invitation` + `cta` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `photography` + `invitation` + `cta` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | VALID |
| `headline` + `photography` + `invitation` + `cta` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `short_copy` + `photography` + `invitation` + `cta` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |
| `headline` + `short_copy` + `photography` + `invitation` + `cta` | INVALID: home_elements_invalid | INVALID: home_elements_invalid | INVALID: dedicated_page_detail_not_allowed_in_home_teaser |

Pour chaque ensemble ci-dessus, les autres combinaisons de rôle/placement/portée restent :

| momentRole | placement | contentScope | Résultat avant examen des primitives |
| --- | --- | --- | --- |
| hero | homepage_primary | primary | Matrice ci-dessus |
| hero | homepage_primary | teaser_only | INVALID: home_content_scope_mismatch |
| hero | homepage_teaser | primary | INVALID: hero_must_be_homepage_primary |
| hero | homepage_teaser | teaser_only | INVALID: hero_must_be_homepage_primary |
| section | homepage_primary | primary | Matrice ci-dessus |
| section | homepage_primary | teaser_only | INVALID: home_content_scope_mismatch |
| section | homepage_teaser | primary | INVALID: home_content_scope_mismatch |
| section | homepage_teaser | teaser_only | Matrice ci-dessus |

Formulaire, calendrier, convives, créneaux, service_list, menu ou valeur inconnue : INVALID au schéma ; également bloqués par le validateur métier lorsqu'il est appelé directement. Les éléments manquants, non tableaux et mauvais types restent invalides. La matrice de tests génère les **256 cas**, avec 32 valides et 224 invalides, puis vérifie aussi leur passage dans le plan de maquette pour les cas valides.

## Audit des autres champs compositoires

| Champ | Règle actuelle / justification | Fatal ou warning | Couverture |
| --- | --- | --- | --- |
| assetNeeds | Enum de huit rôles, toutes les combinaisons libres ; aucun rôle obligatoire | Type/enum invalide fatal, aucune combinaison artistique fatale | 256 sous-ensembles du vrai enum, validation et schéma |
| layoutMode, climate, surface, intensity | Chaînes libres, aucune combinaison fermée | Faible variété/répétition = warning | A–J, guidance, valeurs libres uniformes |
| typographicVoice, photographicLanguage, typographySystem, photographySystem, layoutGrammar | Chaînes libres, aucun enum artistique ou paire obligatoire | Type invalide seulement fatal | Schéma complet A/B/C, diversité non bloquante |
| signatureMoves / signatureMovesAllowed / allowedContexts | Descriptions/contextes libres ; nombre 2–4 conseillé ; maxOccurrences entier non négatif | Quotas et répétitions = warnings ; limite non entière/négative = fatal structure | Guidance 0/1/5 gestes, 0/3 occurrences, erreurs -1/1.5, contextes libres |
| graphicLanguage, brandPersonality, antiPatterns | Tableaux de chaînes, cardinalités conseillées | Warnings | Matrice guidance, traits courts/longs, antiPatterns vide, graphismes multiples |
| brandDo, brandDont, divergenceConstraints | Tableaux de chaînes, pas de combinaison fermée ; contraintes Portfolio ajoutées/dédupliquées | Types invalides seulement fatals | Fixtures complètes et tests de séparation Portfolio |
| referenceAnchors / likelyReferenceAnchors | 2–3 références existantes, distinctes, autorisées et documentées ; contrat des inputs Style Frame | Fatal référentiel | Tous les sous-ensembles des trois références synthétiques, matrice anchors invalides |
| contentTopics / classifications / scopes | Sujets de même placement, référence à une affectation existante ; pas de détails dédiés, nav/footer/optional sur home | Fatal métier | Matrice placement/destination/portée, 256 cas compositoires, matrice de rejets |
| primaryPages / dedicatedPageTopics / plans visuels | Un accueil, IDs uniques, destinations dédiées, couverture exacte des moments | Fatal mécanique/référentiel | Matrice exhaustive des rejets |
| colorSystem / sourceType × brandContinuity | Six rôles obligatoires, accent secondaire nullable ; une contrainte de marque existante ne peut être imposée en reinvent | Fatal structure ou contrat utilisateur | 15 couples provenance/continuité, nullabilité et provenance |

Aucune autre comparaison exacte de combinaison de layout, photographie ou typographie n'est présente dans le validateur actif. Les heuristiques de proximité A/B/C et de répétition climat/layout restent des warnings. La sélection d'images limite les inputs et assigne les rôles ; elle n'est pas une whitelist de compositions artistiques.

## Checkpoint persistant, distinct des directions officielles

`SiteProject.directionGenerationCheckpoint` est un état interne Mixed, exclu par défaut des requêtes et retiré de la sérialisation JSON/toObject. Il n'apparaît ni dans directions, ni comme résultat validé utilisateur, ni dans le snapshot d'approbation. Un seul checkpoint peut être en attente par projet.

Il contient génération UUID, contractVersion, validatorVersion, contextHash, count, createdAt/updatedAt, territoriesResult (réponse parsée), territories (validés) et expansions A/B/C. Chaque expansion porte status, result (réponse parsée avant normalisation), attempts et error structurelle minimale. Les statuts sont pending/running/received/valid/failed ; l'état global devient ready lorsque tout est validé.

La route sauvegarde le checkpoint via updateOne sous le token unique du verrou. Une file sérialise les snapshots immuables issus des expansions parallèles, empêchant une réponse lente d'écraser le progrès des autres. La réponse parsée est persistée **avant** validation locale du schéma et du métier, puis son statut est persisté. Les réponses invalides sont donc aussi revalidables après une correction locale.

A/B/C doivent toutes être valides pour promouvoir un nouveau set officiel : l'ancien set devient archivé et les trois nouvelles versions deviennent actives. Le save final du même document Mongo enregistre atomiquement ce versionnement et remet le checkpoint à null. Son filtre porte aussi le token de verrou. Si le save échoue, le checkpoint ready demeure en base ; le prochain run peut terminer sans API. Un stockage indisponible avant le démarrage empêche tout appel payant. Comme toute persistance, ceci ne garantit pas la récupération d'une réponse si le processus meurt avant son écriture ou si Mongo est indisponible pendant son arrivée.

## Reprise ciblée et coût

Le même POST de génération, déclenché manuellement dans l'admin, reprend un checkpoint compatible. Il revalide localement territoires et réponses parsées avec le contrat actif. Il appelle seulement les étapes absentes ou encore invalides. Ainsi, A failed + B/C valid → un seul appel A, mêmes territoires, mêmes anchors, mêmes territoires réservés et même contexte ; puis validation/diversité finale et commit officiel atomique.

Une réponse auparavant invalide mais devenue valide après correction du validateur est réutilisée sans appel. Un qualityWarning ne marque jamais une expansion failed. Une nouvelle erreur A conserve B/C. Il n'existe plus de retry payant automatique, même pour les territoires : tout second appel d'une étape nécessite un nouveau déclenchement manuel.

## Versionnement et abandon explicite

contractVersion est un SHA-256 déterministe des instructions effectives de territoires/expansion, des schémas, du modèle, du raisonnement et d'une version sémantique explicite. contextHash couvre le projet, le payload documentaire/réglages/Portfolio, les références détaillées ordonnées avec IDs/images et les assets utilisés. Modifier prompt, schéma ou modèle invalide la compatibilité ; modifier brief, références, Portfolio utile ou assets aussi.

Le code du validateur n'entre pas dans contractVersion : validatorVersion est distinct et toute réponse conservée est revalidée. Une correction d'acceptation locale peut donc sauver une sortie déjà payée. La compatibilité est volontairement conservatrice pour les changements de prompt/schéma ; aucune conversion implicite ne mélange les contrats. Des territoires devenus invalides avec des expansions présentes bloquent également la reprise pour éviter de réattribuer de nouvelles idées aux sorties conservées.

Un checkpoint incompatible/incomplet reste intact et la route retourne 409 **sans appel API**. Pour repartir explicitement, la route admin authentifiée `DELETE /api/admin/design-lab/projects/:id/directions-checkpoint` l'abandonne, uniquement sur un projet éditable et sans génération en cours. Aucun abandon automatique, aucune TTL supprimant des résultats payés. La régénération d'une seule direction utilise le même mécanisme avec count=1, l'ID de son slot, `targetSlot` et `replacesDirectionId` ; un checkpoint de batch A/B/C ne se mélange pas à ce mode. Les versions de directions entrent dans le hash de contexte. Voir [DIRECTION_VERSIONING.md](./DIRECTION_VERSIONING.md).

## Run réel déjà échoué

Lecture seule de MongoDB TEST : projet le-ventadour trouvé, zéro direction officielle, aucun checkpoint, aucune opération en cours, dernière erreur correspondant à homeElements. Le processus backend était actif, mais ses sorties allaient vers le terminal ; le code ne conserve ni réponse complète dans les logs, ni cache global, ni fichier de résultat. B/C étaient des variables locales à generateDirectionsV2, dont la requête s'est terminée par une exception. Aucun objet complet récupérable via l'application n'a été retrouvé ; le checkpoint protège les runs futurs et ne reconstruit pas ce run passé.

## Tests

Les tests utilisent le parser/service et les handlers réels avec fetch et toutes les lectures/écritures Mongo mockés. Scénarios : succès complet + nettoyage atomique ; A invalide/B/C durables ; reprise A uniquement ; nouvel échec A ; contrat incompatible ; warning non bloquant ; panne réseau ; panne du save final ; revalidation sans API après correctif ; réponse hors schéma persistée avant rejet ; contexte changé ; checkpoint initial indisponible ; territoires invalides et checkpoint incomplet ; masquage API ; abandon protégé. Aucun appel OpenAI réel ni écriture MongoDB TEST exécuté pour ces tests.
