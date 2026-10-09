# StructuralReference — plan de remédiation B1

Date : 8 octobre 2026. Statut : **phases 3–4 autorisées et implémentées localement ; validations techniques consignées ci-dessous ; qualité artistique V2 non évaluée**.

Le plan des phases 1–2 a été validé par l'utilisateur, qui a autorisé les corrections locales des phases 3–4. Le registre d'exécution distingue les changements réalisés des expériences conditionnelles non activées. L'audit associé est [STRUCTURAL_B1_FINAL_AUDIT.md](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/docs/STRUCTURAL_B1_FINAL_AUDIT.md>). Les nouvelles visites réelles, appels Vision et mutations de données historiques restent soumis à une autorisation distincte. Les budgets, seuils et règles de sécurité actuels restent les invariants.

**Mise à jour du prévol artistique, 8 octobre 2026 :** l'utilisateur a élargi l'expérience proposée à Tastavents, Cartapani, Grupo, Gucci et Cantina, soit cinq paires et dix appels maximum envisagés. Le seul protocole actif `STRUCTURAL_B1_AB_PREPARED.json` est actualisé ; les trois paires précédentes sont préservées. Les propositions antérieures de six appels dans ce plan décrivent le périmètre historique et sont remplacées par le [prévol actualisé](STRUCTURAL_B1_AB_PREFLIGHT.md). Estimation 0,06 USD HT, fourchette 0,05–0,10 USD, plafond recommandé 1 USD ; **zéro appel autorisé** à ce stade. Aucun autre site B1 ni Salterra n'est préparé automatiquement.

**Exigence de maturité ajoutée par l'utilisateur : chaque site B2 certifiable et raisonnablement analysable doit atteindre au moins 8/10 en « Utilité Design Lab ».** Ce résultat doit être démontré indépendamment sur les sept sites inconnus, avec la grille constante et les preuves visuelles. Une note de 4 à 7 est une insuffisance du système à investiguer ; elle reste dans la cohorte et dans le bilan. Aucun filtre, score automatique, augmentation artificielle ou retry payant n'est introduit. Les descriptions d'actions des lots ci-dessous sont le plan approuvé ; leur exécution et leurs limites sont indiquées en section 11.

## 1. Décision et ordre d'exécution

StructuralReference a terminé B1 au sens de la persistance des 13 analyses. Il n'est pas encore prêt pour B2 au niveau de qualité demandé. Le plan corrige des causes communes dans les composants existants ; il ne propose ni moteur parallèle, ni treize traitements par domaine, ni intégration anticipée du fingerprint.

| Ordre | Lot | Problèmes de l'audit | Position avant B2 | Validation principale |
|---|---|---|---|---|
| 0 | Figer les preuves et critères | Tous | Indispensable | Identités, hashes, compatibilité des 13 analyses |
| 1 | Application et incertitude Vision durables | OP-01, OP-02 | Indispensable | Injection de pannes et concurrence, sans Vision |
| 2 | Médias : certification honnête puis admission réseau | CAP-01, NET-01, MED-01 | Indispensable pour la certification ; admission conditionnée aux preuves | Fixtures réseau et peinture ; visite réelle ultérieure si autorisée |
| 3A | Trace de sélection et diagnostic du fallback | OBS-01, OBS-02, DIAG-01 | Indispensable à la mesure ; clarification diagnostique non bloquante seule | Rejeu déterministe, coût de trace borné |
| 3B | Information spatiale perdue et choix des locales | OBS-01, OBS-02 | Expérience nécessaire ; changement uniquement si gain démontré | Comparaison hors ligne, puis validation visuelle ciblée autorisée |
| 4 | Contrat artistique versionné et analyse globale | ART-01, ART-02, TAX-01 | Indispensable à la qualité artistique avant B2 | Compatibilité locale puis A/B Vision autorisé séparément |
| 5 | Non-régressions croisées et bilan | Tous, DIAG-02 | Indispensable | Invariants de sécurité, données, capture et qualité |
| 6 | Benchmark B2 gelé | Généralisation | Après acceptation des lots précédents | Sept sites inconnus, règles figées |

Les lots 1 et 2 ne dépendent pas d'une nouvelle sortie Vision. Le lot 3A précède toute décision sur 3B : les descripteurs rejetés de la génération finale Tastavents ne sont pas tous conservés en base. Le lot 4 peut être préparé après le gel du contrat d'entrée ; son efficacité artistique ne peut être déclarée sans une nouvelle mesure. Un défaut de capture doit être résolu ou refusé explicitement avant d'essayer de le compenser par le prompt.

## 2. Lot 0 — préserver une baseline exploitable

**Objectif.** Comparer une correction à une génération identifiée, sans confondre les dry-runs, anciennes tentatives et résultats appliqués.

**Prérequis.** Validation du plan. Les artefacts locaux de l'audit sont dans `/private/tmp/gusto-structural-b1-audit-20261008` ; ce répertoire temporaire n'est pas une archive pérenne. Le snapshot brut privé ne doit pas être ajouté au dépôt ni publié.

**Action exacte.** Constituer un index expurgé des 13 références : referenceId, attemptId appliqué, generationId, versions, géométrie du manifeste, détail Vision, hashes des octets disponibles, hashes des analyses, dates et usage. Conserver les originaux distants et les réponses brutes sans les réécrire. Distinguer « hash calculé maintenant » d'un hash historique d'envoi : le second manque pour la plupart des buffers. Documenter les cinq locales Salterra qui correspondent octet pour octet au smoke archivé, et l'overview qui diffère.

**Fichiers.** Les deux documents d'audit ; outils de diagnostics existants, notamment [structural-product-diagnostics.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-product-diagnostics.js>). Aucun changement d'analyse nécessaire.

**Tests et acceptation.** Les 13 résultats restent validables avec leur manifeste enregistré ; analyse appliquée = parsedResult de la tentative appliquée ; captures actuelles = captureSnapshot associé. Les défauts artistiques de la baseline ne doivent pas être « corrigés » par un reparsing. Tous les résultats futurs restent dans des générations distinctes.

**Risque.** Faible ; principal risque : exporter des snapshots sensibles ou traiter les hashes géométriques comme des fingerprints artistiques. **Gain attendu :** traçabilité, pas amélioration Vision.

## 3. Lot 1 — application idempotente et garde d'appel incertain

### 3.1. OP-01 : fermer le défaut entre application et dernier checkpoint

**Défaut démontré.** `execute` applique l'analyse à la référence et libère son token, puis marque l'attempt `applied`. Si ce dernier enregistrement échoue, le catch peut marquer l'attempt `failed` alors que la référence est `analyzed`. Un crash dans le même intervalle laisse un attempt `validated` que le recovery classe ensuite comme orphelin échoué. Réponse brute et résultat parsé sont conservés ; la cohérence de leur état final ne l'est pas.

**Fichiers et fonctions.** [structural-reference.service.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-reference.service.js>), `execute`, `saveAttempt`, `run` ; [structural-operation-recovery.service.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-operation-recovery.service.js>), `reconcile`, `interruptAttempt` ; modèles StructuralReference et StructuralAnalysisAttempt ; `listAttempts` et affichage d'état.

**Mécanisme proposé.** Ajouter sur la référence un marqueur d'application durable liant generationId et attemptId, enregistré dans la même mutation atomique que l'analyse. Le dernier checkpoint d'attempt devient une finalisation idempotente : son échec produit un diagnostic de finalisation à reprendre, jamais une affirmation de rejet de l'analyse déjà appliquée. `reconcile` vérifie ce marqueur avant de qualifier un attempt d'orphelin ; s'il concorde, il termine `applied` sans capture, sans nouvelle analyse, sans modifier le résultat. Toutes les mutations vérifient la génération et le token attendus ; la finalisation ne doit jamais promouvoir l'attempt d'une génération supplantée. Préférer ce mécanisme explicite à une transaction MongoDB supposée disponible sans vérifier l'environnement.

**Données et compatibilité.** Champs additionnels optionnels. Anciennes générations sans marqueur : rester prudent ; ne pas déduire une application par la seule égalité de deux textes ou par un titre de référence. Aucun backfill des 13 références durant l'implémentation sans autorisation de mutation. Les nouvelles générations peuvent fournir le marqueur ; les anciennes conservent leur statut connu.

**Tests à créer avant correction.** Panne après mutation de référence ; panne de chacun des checkpoints ; crash avec attempt `validated` ; deux recoveries concurrents ; nouvelle génération acquise avant finalisation de l'ancienne ; réponse brute disponible mais validation refusée. Réutiliser les reproductions OP-FINALIZE et OP-CRASH de l'audit en doubles mémoire, puis les fixtures produit.

**Acceptation.** Dans tous ces cas, une seule analyse appliquée à la bonne génération ; résultat et brut préservés ; état final convergent ; aucun nouvel appel ni upload. Les cas réellement non appliqués restent échoués ou retraitables et ne sont pas promus artificiellement. **Risque : moyen**, sur la concurrence et la rétrocompatibilité. **Gain attendu :** vérité des checkpoints et recovery fiable.

### 3.2. OP-02 : conserver l'incertitude jusqu'à une résolution explicite

**Défaut démontré.** `uncertainPreviousCall` et le frontend examinent principalement le diagnostic courant de la référence. Après un ancien timeout incertain, une relance confirmée qui échoue avant l'envoi peut remplacer ce diagnostic par `manual_retry`. Une relance suivante atteint alors l'analyseur sans la confirmation prévue, bien que l'ancien attempt incertain soit conservé.

**Fichiers.** Service ci-dessus ; [structural-operation-diagnostic.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-operation-diagnostic.js>), `uncertainPreviousCall`, `failureDiagnostic` ; recovery ; modèles ; [structural-operation-display.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/client/src/components/dashboard/admin/sites/structural-operation-display.js>), garde frontend ; route `run`.

**Mécanisme proposé.** La décision d'un nouveau dispatch doit utiliser les attempts incertains non résolus, et pas uniquement le dernier message d'erreur. Enregistrer une confirmation liée à l'attempt incertain et à la génération de relance. Ne la considérer consommée ou supplantée qu'au dispatch effectif d'une nouvelle tentative explicitement autorisée ; une panne préalable ne résout pas l'incertitude. Une réponse reçue, un rejet fournisseur explicite ou la prise de risque confirmée ont des états distincts. Éviter une garde éternelle contre un ancien attempt déjà explicitement supplanté. Le frontend expose la décision backend et l'attempt concerné ; il ne reconstitue pas seul l'historique avec des regex.

**Compatibilité.** Pour les vieux attempts sans tous les champs transport, utiliser les diagnostics conservés et une résolution explicite, sans inventer un état fournisseur. Aucun retry automatique. Aucun changement du timeout Vision.

**Tests.** Ancien timeout → confirmation → échec de création/checkpoint avant dispatch → relance non confirmée refusée ; relance confirmée réellement dispatchée ; rejet fournisseur déterminé ; réponse conservée retraitée gratuitement ; deux clics concurrents ; perte du lease. Vérifier qu'une panne locale ne transforme jamais un état fournisseur inconnu en « non appelé » pour l'ancien attempt.

**Acceptation.** Une relance non confirmée n'atteint jamais le transport tant qu'une incertitude non résolue exige une confirmation ; le reprocess reste sans Vision ; l'autorisation ne migre pas entre générations. **Risque : moyen. Gain :** contrôle des appels payants. OP-01 doit être fixé avant de stabiliser ce nouvel historique.

## 4. Lot 2 — distinguer peinture, fidélité des médias et admission réseau

### 4.1. CAP-01 / MED-01 : une image variée n'atteste pas tous les médias

**Défaut.** Salterra présente des médias manquants dans une locale envoyée à Vision, avec les certifications générales au vert. Vision transforme ensuite ce vide en principe de composition. Le gate vérifie notamment la peinture globale et les images visibles détectées ; il ne démontre pas la présence de tous les médias structurels de toute la séquence.

**Fichiers et fonctions.** [structural-page-capture.service.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-page-capture.service.js>), `captureStructuralPage` et moments de stabilisation ; [capture-image-visibility.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/capture-image-visibility.js>) ; [structural-paint.service.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-paint.service.js>), `waitForMainPaint`, `assertPaintedBatch` ; reliability et resource diagnostics ; `captureAndPrepare` du service StructuralReference.

**Mécanisme proposé.** Rattacher aux états effectivement capturés un registre borné d'obligations de rendu : média exposé par le site, source réellement choisie, rectangle/visibilité, état de décodage ou frame/poster, transfert existant, refus et preuve après stabilisation. Réutiliser les inspections disponibles ; ne pas reconstituer des sources à partir de `data-src`. Distinguer trois cas : média connu manquant/refusé ; géométrie impossible à mesurer ; média opaque mais peinture réelle vérifiée. Le premier ne doit pas obtenir une certification globale de fidélité ni déclencher un appel payant. Les deux autres exigent une formulation honnête et les gates actuels, sans rendre automatiquement invalide toute page avec transform/canvas.

La certification de couverture reste géométrique. Ajouter une preuve de complétude des médias inspectés et son périmètre, pas renommer `complete` en garantie artistique. Propager les obligations non satisfaites dans le diagnostic d'erreur. La liste des images principales présentes ne constitue pas une preuve des images absentes.

**Tests.** Photo principale peinte mais image secondaire structurelle en échec ; image de 119 px et logo utile ; lazy dont le conteneur est temporairement réduit ; image de fond ; pseudo-élément ; source existante en transfert ; source jamais activée par le site ; image opaque bien peinte ; vrai vide éditorial sans obligation média ; iframe inconnu ; frame vidéo validée et poster seul volontaire.

**Acceptation.** Fixture Salterra analogue : média requis absent → refus diagnostic avant Vision, malgré buffer non uniforme. Vrai vide → accepté sans remplir artificiellement. Gucci/Amici avec géométrie non mesurable → protections maintenues, sans refus par amalgame. Aucun `src` forcé, aucune frame inventée, aucune tolérance élargie. **Risque : élevé**, de faux refus sur compositions opaques. **Gain attendu :** empêcher l'interprétation artistique d'une capture dégradée. L'identification exacte du chemin aveugle de Salterra reste à confirmer avec une visite réelle autorisée.

### 4.2. NET-01 : prioriser avant l'admission, sous preuve d'obligations

**Défaut démontré.** Les 160 admissions peuvent être consommées avant qu'une image tardive prioritaire arrive. Le tri de la queue ne récupère pas les admissions déjà comptées. La reproduction hors ligne refuse cette image avec seulement 160 octets transférés : augmenter un budget d'octets ne traite pas cette cause.

**Fichiers.** [structural-resource-policy.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-resource-policy.js>), `createStructuralResourcePolicy`, `fetch`, admission/cache/queue et `fetchVideoRange` ; transport public sécurisé ; resource diagnostics ; registre d'obligations du lot précédent.

**Intervention précise.** D'abord tracer demande, admission, départ, completion/refus et priorité ; démontrer quelles obligations sont certifiables au moment d'une admission. Ensuite expérimenter une réservation dynamique pour les obligations déjà connues mais non satisfaites, avec invariant `utilisées + réservées <= 160`. Les ressources nouvelles sont dédupliquées ; un refus n'est pas un succès ; libérer une réserve uniquement sur preuve de rendu, source substituée réellement choisie ou obligation devenue inatteignable. Ne pas réserver forfaitairement « quatre ranges par vidéo » : les plages partielles effectives et réservations d'octets existantes sont à respecter. Ne pas transformer un prototype disposant de l'inventaire final en algorithme prétendument disponible au début de la visite.

Si les obligations tardives ne sont pas connaissables suffisamment tôt, documenter la limite et conserver un refus honnête. Ne pas activer un quota arbitraire de ressources secondaires. Le déblocage réel de Salterra sous 160 admissions sera une mesure future, pas une promesse.

**Tests.** 160 demandes secondaires avant image structurelle ; arrivée progressive des obligations ; source vidéo changeante et ranges courts ; déduplication ; réservations libérées ; redirects ; ressource annulée ; obligations supérieures au plafond ; timeout ; totaux images/non-images/médias/total et SSRF inchangés. Rejouer la trace Salterra en séparant un oracle rétrospectif de la simulation causale en ligne.

**Acceptation.** Pas de dépassement de 160/12 ni des limites d'octets ; plus d'obligations connues satisfaites dans le scénario reproductible ; refus précis si impossible ; aucune admission frauduleusement « gratuite ». Une future visite peut confirmer ou infirmer l'efficacité sur la source. **Risque : élevé**, famine de scripts indispensables, démarrage et vidéo. **Gain :** meilleure utilisation du budget existant. **Dépendance :** registre fiable du lot 2.1.

## 5. Lot 3 — sélectionner l'information, pas remplir cinq cases

### 5.1. Lot 3A : trace complète, bornée et rattachée à la génération

**Fichiers.** `structural-page-capture.service.js`, `captureStructuralPage` ; [structural-observation-selection.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-observation-selection.js>), `prepareCandidate`, `marginal`, `selectStructuralObservations` ; [structural-reliability.service.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-reliability.service.js>), `applyReliabilityRegistry` ; product diagnostics et modèle d'attempt.

**Modification.** Conserver une trace numérique compacte pour tous les candidats, y compris rejetés : identités, positions, descripteurs géométriques, fiabilité, score initial et tours de gain, décision du scoring puis décision livrée après registre et contrainte temporelle. Versionner configuration et descripteur ; joindre hashes du pool et de l'entrée Vision. Ne pas envoyer cette trace au modèle ni conserver systématiquement tout le DOM. Choisir un stockage borné dans les diagnostics d'attempt ou une archive locale durable explicitement référencée ; mesurer sa taille avant décision.

Séparer `scoringReason` de `deliveryReason`. Si le registre impose `fixed_fallback`, le champ expliquant la sélection effective doit être `fixed_fallback`/cause du registre. Préserver le rejet théorique, mais ne pas afficher `selected: true` avec une unique raison `gain_at_or_below_threshold`.

**Tests/acceptation.** Rejeu exact mêmes scores/IDs ; fixture Waldhaus : décision initiale rejetée conservée et sélection finale fixe expliquée sans contradiction ; trace coupée par crash détectée ; coût de sérialisation mesuré ; absence de secrets/texte DOM ; ancien attempt sans trace toujours lisible. **Risque : faible à moyen. Gain :** causalité vérifiable. Ce lot ne prouve aucun gain artistique.

### 5.2. Lot 3B : mesurer les pertes de topologie dans D et la redondance

**Insuffisance.** L mesure la lisibilité et D des gains de détail géométrique ; les descripteurs actuels peuvent sous-représenter une domination typographique, une bascule d'axe ou un collage lisible en miniature. Tastavents et Torre ont de grandes plages centrales sans locale. Le nombre seul n'est pas le défaut : l'information perdue et les erreurs Vision sont les critères.

**Expérience préalable.** Sur fixtures génériques annotées, comparer macro projetée à la locale : grande typo centrale + photos périphériques, diptyques gauche/droite, photo avec titre superposé, rail régulier, mosaïque dense, footer lisible. Vérifier si les descripteurs distingueraient ces compositions et si le détail permet de récupérer une relation réellement perdue. Aucun bonus « chef », « section importante » ou « footer ». Pour les générations B1 sans tous les descripteurs, inscrire « contre-factuel exact impossible » ; ne pas remplacer par une vieille trace de dimensions différentes.

**Changement envisagé sous réserve.** Enrichir le descripteur par les relations entre les masses principales : axe, domination relative, topologie image/texte, superposition et distribution du vide. Intégrer les différences effectivement perdues dans le gain D et la similarité descriptive de R. Conserver la formule de gain, les seuils et le maximum de cinq ; aucune sélection de remplissage. Si ces features ne donnent pas un signal fiable, ne pas changer le sélecteur au prétexte d'une mauvaise sortie Vision.

**Continuous.** Garder le master hors Vision et la différence entre couverture géométrique et information détaillée. Tester trois vues vs candidats géométriquement informatifs sur pages statiques complexes ; un changement de stratégie nécessite une perte observable et un gain mesuré. Absence de mouvement détecté ne prouve pas absence de mouvement. Aucune conversion systématique vers sampled ni ajout forcé de locales.

**Tests/acceptation.** Une composition distinctive récupérable passe avant une zone redondante dans les fixtures où la perte est démontrée ; zones déjà compréhensibles en macro non sélectionnées artificiellement ; fallback de mesure inchangé ; persistance des cinq contrôles obligatoires ; comparaison Gucci/Tastavents/Torre/Cantina/Cartapani/Grupo sur preuves compatibles. Efficacité de la nouvelle entrée à mesurer sur sortie Vision distincte. **Risque : élevé**, sélection de transformations trompeuses, coût et régression de la redondance. **Gain attendu :** meilleure information spatiale ; non mesuré aujourd'hui.

## 6. Lot 4 — rendre la composition globale explicite et vérifiable

**Fichiers.** [structural-reference.contract.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-reference.contract.js>), `structuralAnalysisSchema`, `structuralInstructions`, `validateStructuralAnalysis`, `buildStructuralVisionRequest` ; [openai.service.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/openai.service.js>), `analyzeStructuralReference` ; modèles d'analyse/attempt ; rendu de la référence dans [structural-reference.component.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/client/src/components/dashboard/admin/sites/structural-reference.component.js>).

**Ce qui manque.** Le prompt actuel demande déjà un raisonnement global. Le problème n'est pas l'absence d'instruction : les relations sont surtout stockées en prose libre, la segmentation n'est pas confrontée systématiquement à toute la phase et la validation ne peut détecter une photo inventée. Dix-sept labels mêlent géométrie, contenu et rôle ; augmenter ce catalogue seul ne corrige pas l'intelligence.

**Contrat proposé, version artistique 2 distincte de coverage v2/v3 et du manifeste v1 :**

- Ajouter un objet géométrique court par moment : placement image et texte (`left/right/center/full/multiple/unknown`), masse dominante (`image/text/balanced/void/unknown`), grille (`regular/offset/free/none/unknown`), superposition (`present/absent/uncertain`). Ce sont des observations qualitatives, pas des coordonnées numériques inventées.
- Ajouter une liste bornée de relations globales, au plus huit : moments concernés, relation décrite, effet sur axes/échelle/densité, sources visuelles et statut `direct/inferred/unknown`. Inclure des relations non adjacentes quand la preuve le permet. L→R→L de Grupo doit relier les moments précis, pas seulement dire « alternance ».
- Préciser le périmètre d'évidence : phase entière en overview, fragment local, ou plusieurs états échantillonnés. Une petite portion vide ne prouve pas qu'une composition entière est vide.
- Garder les principes transférables mais leur demander mécanisme, effet et condition d'emploi. L'identité, la succession exacte et les motifs signatures restent dans `avoidCopying`.
- Définir `staggeredColumns` comme décalage observable des colonnes, `offsetGrid` comme grille à offsets, `splitUnequal` comme déséquilibre visible ; utiliser `other` + géométrie si le catalogue n'offre pas de label juste. Aucun besoin immédiat d'ajouter dix labels.

**Ordre demandé au modèle.** Repérer d'abord les masses/axes globaux et zones réellement distinctes ; poser les frontières avec les panels et la hauteur réelle ; comparer les compositions voisines et éloignées ; vérifier chaque assertion contre les sources ; seulement ensuite classifier. Sur une longue série d'états montrant le même ancrage central avec périphérie changeante, conserver ce mécanisme commun sans le transformer en nouvelles grilles fictives. Une relation de lecture du haut vers le bas n'est pas une durée d'animation. Les transformations temporelles non prouvées restent inconnues.

**Validation locale.** Ordre, intersections et bornes actuels conservés ; vérifier les IDs des relations, sources, nombre maximal, version et périmètre. Signaler les contradictions structurelles manifestes du JSON (grille déclarée régulière avec label offset sans justification), sans prétendre valider par du code la présence d'une photo. Un éventuel avertissement ne doit pas transformer une analyse médiocre en succès artistique.

**Compatibilité.** Lire intégralement v1 ; ne pas fabriquer de relations v2 à partir d'anciennes descriptions ; affichage adapté avec champs absents explicites. Version/prompt hash enregistrés dans l'attempt ; reparsing historique utilise son schéma enregistré, sans migration ni nouvelle Vision automatique. Tester le retraitement des 13 captures/manifeste/résultats existants.

**Tests.** Schémas anciens/nouveaux ; relations vers moments absents ; sources hors phase ; ratio inconnu ; fragmentation locale ; grille régulière classifiée avec prudence ; limites de taille. Les exemples artistiques attendus couvrent Tastavents (dominance et densité centrale), Cartapani (ancrage et états), Grupo (L→R→L), Castello (collage agricole), Amrit (photo tardive absente), Torre (texte superposé). Les fixtures de contrat ne prouvent pas la compréhension du modèle.

**Risque : moyen à élevé.** Sortie plus longue, généralisation de relations artificielles, hallucinations plus structurées, rétrocompatibilité et coût. Borner les relations et réduire les redites existantes plutôt qu'ajouter de longs paragraphes. **Gain attendu :** grammaire exploitable et prudente ; seule une sortie nouvelle comparable peut le confirmer.

## 7. Lot 5 — validation et protections à ne pas affaiblir

Conserver SSRF/DNS épinglé, redirections validées, GET distant, blocage service workers/WebSocket, plafonds réseau, scroll natif, contrôles fixes post-traversée, registre et freshness, gate paint, CMP à provenance multiple, conservation des landmarks et sidebar, nettoyage de tous les buffers et restauration. Les widgets dans le flux ne sont pas automatiquement des overlays à retirer.

**Suites.** Capture/page/animation/native-scroll/sequencing ; selection/shadow/reliability ; resource-recovery/image-diagnostics ; paint-video ; consent/vision-cleanup ; structural contract/service/operation recovery ; produit complet sur doubles mémoire ; frontend operation-display. Interdire transport distant, Mongo réel, Cloudinary et chargement de `app.js` dans ces tests. Ne pas lancer l'application complète : startup et certains GET déclenchent le recovery avec écritures.

**Non-régression B1.** Contrats et manifestes 13/13 ; brut/parsed/générations préservés ; aucune réanalyse automatique. Sur les mesures compatibles : IDs/positions/détails, fallback, coverage et motifs de refus comparés. Une capture actuelle du site n'est jamais la preuve de l'ancien état. Sanitation : Nannina sidebar et badge, Cartapani/Torre CMP, Amrit widget dans le flux ; réseau : Salterra refus et ranges. Évaluer séparément chaque modification de sélecteur et du prompt pour ne pas attribuer à l'un le gain de l'autre.

**Instabilité vidéo actuelle.** Un test MediaRecorder échoue dans la sélection parallèle puis passe isolément. Établir s'il s'agit d'une contention, d'un codec ou d'un état de fixture ; ne pas supprimer l'assertion ni présenter le replay isolé comme une preuve de stabilité complète. DIAG-02 inclut aussi un libellé de sanitation/couverture explicite et une description de stratégie qui ne confond pas toute détection dynamique avec une animation liée au scroll.

**Acceptation.** Chaque défaut dispose d'une reproduction avant et d'un résultat après ; invariants inchangés ; aucune régression significative inexpliquée ; logs complets et limites publiées. Tests verts = validation technique, pas artistique.

## 8. Validation artistique payante future — autorisation distincte

**Premier A/B minimal proposé :** Tastavents, Grupo et Cartapani, sur exactement les mêmes assets gelés et le même modèle/paramètres. A = prompt/contrat actuel exécuté à nouveau ; B = version proposée. Six appels maximum, un par variante et site ; aucune relance automatique. Un contrôle Gucci ajouterait deux appels, uniquement après autorisation supplémentaire. Une comparaison de B à la seule réponse historique est moins coûteuse mais ne constitue pas un A/B contemporain ; l'étiqueter ainsi si cette option est choisie.

**Coût chiffrable.** Les trois générations historiques totalisent 60 634 tokens ; une paire de passages comparable représenterait un ordre de grandeur de 121 268 tokens, non une garantie de facturation ou un plafond. Input/output, cache et raisonnement doivent être estimés séparément selon la tarification disponible au moment de l'autorisation. Définir avant dispatch un plafond monétaire, un plafond de six appels, les limites de sortie et le traitement des timeouts. Ne pas inventer un prix dans ce document. Le corpus final actuel totalise 279 226 tokens pour ses 13 derniers appels appliqués, hors tentatives précédentes/incertaines.

**Évaluation aveugle.** Même grille de neuf scores, deux lectures indépendantes si possible, différences justifiées par source et moment. Exiger disparition des erreurs critiques identifiées : phase centrale de Tastavents, grille fictive Cartapani, relation L→R→L et inférence fragment→phase Grupo. L'objectif de maturité est ≥8/10 en Utilité Design Lab pour chaque analyse certifiable et raisonnablement réalisable ; un progrès de deux points ne suffit pas si le résultat reste insuffisant. Zéro photo/masse critique inventée, aucune perte d'une singularité reconnue par A. Les notes de capture, fidélité structurelle et intelligence artistique restent séparées. S'il n'y a pas de gain mesuré, ne pas conserver B pour son seul JSON plus riche ; conserver et investiguer tous les échecs.

**Sélection/capture.** Des entrées modifiées nécessitent un test distinct à prompt constant. Les nouvelles visites ciblées de Salterra ou d'un cas de sélection, et les appels associés, exigent leur propre autorisation et l'objectif mesurable. Ne pas lancer treize captures/analyses pour combler les lacunes de la baseline.

## 9. Protocole B2 proposé — sept sites sélectionnés plus tard

Avant sélection, figer commit ou état de fichiers validé, versions capture/sanitation/contrat/manifest/prompt/modèle, budgets, seuils, grille et critères de refus. Préenregistrer les sept URLs et critères de diversité sans adapter le moteur aux domaines.

| Famille | Ce que le site doit mettre à l'épreuve |
|---|---|
| Sobre, peu d'images | Typographie, vide intentionnel, pas de détails forcés |
| Diptyques réguliers | Alternances gauche/droite, axes et proportions |
| Editorial expressif | Typographie monumentale, collage, superpositions |
| Longue page complexe | Plus de 15 000 px, états répétés/ancrages et segmentation |
| Navigation/dynamique atypique | Scroll natif, éléments persistants, limites statiques |
| Médias exigeants | Lazy, vidéo/poster/frame, iframe et réseau limité |
| Interfaces périphériques | CMP, badges, overlays, distinction avec structure |

Les familles peuvent se croiser ; inclure des pages calmes et complexes, pas sept sites spectaculaires similaires. Aucun domaine proposé ni visité ici.

**Données à conserver par génération.** Manifeste, octets/hashes Vision, rectangle/position/range, preuve de sanitation/restauration/paint/médias, descripteurs et motifs de sélection/rejet, état fournisseur, checkpoints, durées par phase, admissions/refus/octets/ranges, token usage, modèle/version et coût réel. Une comparaison de fidélité exige une preuve source de la même visite autorisée ; les captures choisies ne suffisent pas à leur propre validation. Ne pas prétendre faire Motion Observation avec ce recueil statique.

**Critères de sortie B2, avec exigence utilisateur de maturité ≥8/10.**

1. Les sept cas inconnus restent dans le bilan. Pour chacun dont la capture est certifiable et l'analyse complète raisonnablement réalisable, une nouvelle analyse doit atteindre ≥8/10 en Utilité Design Lab. Un refus ou une limite technique est déclaré et justifié ; il n'est pas converti en succès ni retiré pour améliorer une moyenne. Aucun minimum de six analyses ne suffit à déclarer le système mature.
2. Aucun média structurel connu absent certifié présent ; aucune pollution non structurelle certifiée propre ; aucun contournement SSRF/budget ; aucun appel non autorisé ou retry automatique ; checkpoints cohérents.
3. Évaluation indépendante de nouvelles sorties, grille identique à B1, preuves visuelles par moment et relation. Chaque note <8 en Utilité Design Lab est une insuffisance à investiguer sur capture, sélection, géométrie, compréhension globale, prompt/contrat, fidélité et principes. Les autres dimensions restent publiées ; aucun défaut critique n'est noyé dans la note d'utilité ou une moyenne. Aucune notation produite par le moteur ne remplace cette évaluation.
4. Zéro relation/photo critique inventée ; phases principales concordantes avec les preuves ; labels et géométrie cohérents ; principes décrivant mécanisme/effet/condition sans copier l'identité.
5. Non-régression de la baseline B1 documentée sur les composants modifiés ; tests ciblés et sécurité acceptés ; coût et durée restent dans les budgets figés, limites expliquées.
6. Aucun réglage opportuniste pendant la cohorte. Un bug bloquant suspend la cohorte ; sa correction est versionnée, générique et les cas affectés sont rejoués seulement après autorisation. Les résultats de versions différentes ne sont pas amalgamés.

Ces critères humains ne modifient aucun gate, score ou budget produit. Si les sept cas ne satisfont pas le critère de maturité applicable, verdict **maturité non démontrée**. Des réserves peuvent permettre de poursuivre une investigation, mais ne diminuent pas le seuil de 8/10 et ne transforment pas sept JSON enregistrés en validation artistique.

## 10. Après B2 et sujets différés

Motion Observation peut commencer après acceptation de la stabilité opérationnelle, de la fidélité inspectable, du gain artistique nouveau mesuré et de B2. Il prendra en charge durée, ordre causal, animation liée au scroll, transformation, continuité et chorégraphie. StructuralReference doit lui transmettre les incertitudes, pas les masquer.

Peuvent attendre : optimisation de performance non bloquante, politique d'archivage/suppression d'attempts (LIFE-01), extensions de taxonomy uniquement si besoin démontré, mémoire/fingerprint sémantique, Global Composition Director et consommation par les directions. Aucun résultat B1 ne valide encore une homepage générée au niveau du Ventadour.

## 11. Registre des phases 3–4 autorisées

| Lot | Statut actuel | Preuve après correction | Autorisation supplémentaire |
|---|---|---|---|
| 0 | Réalisé localement | Index durable 13 générations / 67 hashes ; compatibilité 13/13 | Aucun accès distant effectué |
| 1 | Implémenté et testé | Marqueur atomique, recovery idempotent, CAS et incertitude conservée ; injections de panne | Aucun essai Vision réel autorisé |
| 2 | Certification limitée implémentée ; admission inchangée | Média secondaire manquant refusé ; opaque/vide/iframe distingués ; trace d'admission en ligne passive | Visite Salterra ciblée et preuve source, seulement après accord |
| 3A | Implémenté | Trace versionnée bornée dans l'attempt, liée à génération et manifeste ; théorie/livraison distinguées | Nouvelle capture réelle pour valider sa représentativité en production |
| 3B | Algorithme conservé | Descripteurs discriminants dans cinq familles synthétiques ; aucun gain de sélection établi | Inventaire complet des candidats contemporains et comparaison hors ligne ; visites distinctes si nécessaires |
| 4 | V2 implémenté ; qualité non mesurée | Compatibilité V1, géométrie/preuve/principes/relations V2 ; trois paires A/B préparées, zéro dispatch | Protocole final et plafond monétaire pour les six appels |
| 5 | Vérifications locales réalisées | Résultats détaillés dans la section 14 de l'audit et le rapport JSON de validation | Pas de réanalyse B1 implicite |
| 6 | Non lancé ; maturité non démontrée | Critère ≥8/10 sur chacun des sept sites applicable, sans éviction des échecs | Sélection/gel/visites/appels B2 après décision séparée |

**Point d'arrêt des phases 3–4 : corrections et preuves locales livrées ; zéro nouvelle visite externe, zéro appel Vision, zéro mutation distante, zéro commit. StructuralReference reste non prêt pour B2 tant que de nouvelles sorties comparables n'ont pas démontré sa qualité artistique.**

Les problèmes initiaux, fonctions/fichiers modifiés, tests, risques, preuves manquantes et autorisations nécessaires sont détaillés par lot en section 14 de l'audit. Le protocole auto-suffisant [STRUCTURAL_B1_AB_PREPARED.json](STRUCTURAL_B1_AB_PREPARED.json) conserve les entrées publiques géométriques et les images des trois paires, les hashes de prompt/schéma/contenu, les paramètres proposés et `authorizedCalls: 0`. Le script `prepareStructuralB1Validation.script.js` ne possède aucune capacité de dispatch. Les historiques bruts privés ne sont pas ajoutés au dépôt.
