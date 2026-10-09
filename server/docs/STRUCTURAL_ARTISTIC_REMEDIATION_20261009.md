# Remédiation artistique ciblée — 9 octobre 2026

**Zéro appel Vision payant, zéro capture réelle, zéro mutation MongoDB/Cloudinary et aucun commit.** Les notes du précédent A/B restent 5/10 V1 et 4/10 V2 pour Tastavents, provisoires ; Cartapani reste non évaluable en comparaison. Aucun nouveau score artistique n'est attribué.

Deux évolutions sont implémentées localement et **activables séparément**, sans activer automatiquement un nouveau pipeline de production : sélecteur expérimental V2 (`selectionConfig.algorithmVersion:2`) et contrat artistique expérimental V3 (`analysisVersion:3`). Défauts artistiques et bénéfice en utilité restent à mesurer réellement. Les defaults restent sélecteur V1 / contrat V2. Aucun domaine ne figure dans les corrections.

## 1. Tastavents : faits et limites causales

Preuves : 23 panneaux originaux du run background, deux locales (entrée y0–900, fin y10530–11430), hauteur 11 556 px, réponses V1/V2 intégrales et manifestes. `panel-assertion-alignment.json` aligne les assertions sur **chacun des 23 panneaux**, par intersection en pixels et pourcentages de page ; les numéros de moments ne servent pas d'équivalence.

| Preuve / composition réellement visible | V1 / V2 contemporaines | Cause démontrée ; contribution de la résolution |
|---|---|---|
| Panneaux 2–3, y585–2070 : introduction brève, puis photographie et grandes lettres | Les deux étendent quietText à 8–18 %. V2 déclare image absent/void dominant. | Généralisation d'une pause à une plage plus large ; photos visibles dans la macro. Une locale aiderait les détails, mais l'absence d'image n'est pas justifiée. |
| Panneaux 4–5, y1755–3031 : lettres géantes derrière portraits/cartes et photographie | V1 collage/grands titres vague ; V2 balanced/adjacent en phase 18–29 %. | Perte d'échelle et superposition malgré preuve visible. Les portraits/états ne prouvent pas plusieurs sections. Résolution locale insuffisante pour les détails, pas pour reconnaître les grandes masses. |
| Panneaux 6–7, y2340–3825 : déclaration centrale sur sombre, médias périphériques | V1 évoque collage/modules ; V2 ne fait dominer le texte qu'à partir de 29 %. | Axe centre/périphérie insuffisamment compris et mauvais ancrage. Ce rapport est déjà lisible dans la macro. |
| Panneaux 8–12, y3510–6228 : editorial décalé, portraits gauche/noms droite, changement d'état, déclaration centrée claire | V1 fusionne modules puis rupture typographique ; V2 appelle 39–53 % une séquence dense dominée par images. | Segmentation et dominance inexactes ; la portion comprend texte et vide. Frontières fines/états moins certains sans locale. Ne pas conclure à une inflation du nombre de moments : les deux sorties en ont neuf. |
| Panneaux 14–17, y6435–9090, ~56–79 % : grandes photos de plats contiguës, puis champ sombre à droite | V1 situe mieux la poussée photographique 52–67 %, mais généralise des grilles ensuite. V2 situe un retour éditorial calme 53–64 %. | **Inversion de dominance V2 et transition mal située**, malgré grande surface image visible. La résolution ne suffit pas à expliquer une telle inversion. |
| Panneaux 18–21 : réservation claire, rectangle indisponible, puis nouvelle déclaration centrale sombre | Les deux restent génériques et ne relient pas précisément les deux déclarations centre/périphérie éloignées. | Relation globale omise ; apparence de l'embed réellement inconnue. Aucun motif à apprendre de son placeholder. |
| Panneaux 22–23 et locale de fin : photo centrale chevauchante, textes latéraux, mot-signe géant | Bien compris dans les deux ; principe V2 plus opérationnel. | Contraste de précision centre/fin compatible avec un bénéfice des locales, **sans prouver cette causalité ni un remède suffisant**. |

La macro disponible est un storyboard 720×1392 de panneaux 240×150 transmis en `low`. Il n'existe aucune locale centrale dans le lot fournisseur ; le vide entre plages détaillées est 9 630 px. Ces entrées ne prouvent ni continuité entre états ni temporalité. Elles permettent néanmoins de vérifier les grandes dominantes manquées.

### Pourquoi le sélecteur n'a-t-il retenu que l'entrée et la fin ?

Dans la capture B1 appliquée du 7 octobre à 17:40:39 UTC : `adaptive`, 23 candidats, zéro fallback, seuil 0,25, maximum cinq ; entrée obligatoire et candidate22/footer retenu à gain 0,2888406. Ce n'est pas une limite de capacité imposant deux vues ni un fallback fixe. Les deux candidats retenus sont déclarés fiables.

Un diagnostic du même site **antérieur, 7 octobre 08:17:34 UTC**, conserve les 23 décisions et les rounds : après entrée et footer, meilleur gain restant candidate9 à y4095 = **0,2460692**, donc arrêt sous seuil. Galerie candidate14/y6435 = **0,1215665** et candidate15/y7020 = **0,0681577** ; lettres/portraits candidate4/y1755 = 0,0114360 ; déclaration centrale candidate7/y2925 = 0,1816938. Dans ce diagnostic les 23 candidats sont fiables. Les poids 0,35/0,35/0,30/0,30 combinent lisibilité L, détails relationnels D, variété V et pénalité de redondance R.

Pour candidate14 : L=0,5893612 ; D=0,2803587 ; V=0,0671023 ; R=0,6765537. Contributions positives ≈0,324533, pénalité ≈0,202966 : gain ≈0,121566. La redondance reste élevée **sans chevauchement spatial avec entrée/footer**, car 80 % de R dépend de similarité de descripteur, 20 % seulement d'intersection des plages. La distance minimale se déduit ici à ≈0,154308. Le code moyenne des cartes et slots, dont beaucoup peuvent être absents, et discrétise grossièrement l'échelle typographique ; ces moyens peuvent diluer une différence de masse structurante. L/D estiment le gain de résolution, pas la difficulté de compréhension artistique. Un grand titre déjà lisible à petite échelle peut donc apporter peu de gain L.

L'estimation `macroCanvas 512×512` est une **hypothèse projective du sélecteur**, pas une mesure de la résolution effective chez le fournisseur. Poids, seuil, résolution et budget n'ont pas été changés pour contourner ces décisions.

**Limite importante :** les scores des deux vues sélectionnées correspondent exactement au B1, et les positions du storyboard correspondent ; toutefois les hashes de l'overview et de l'entrée de ce diagnostic diffèrent du B1, seule sa locale finale est identique. Ses descripteurs et mesures brutes ne sont pas conservés, et l'ancienne tentative appliquée ne possède pas `observationTrace`. On ne peut donc pas prouver tous les gains rejetés du run B1 appliqué ni rejouer son contre-factuel exact. Un autre pool complet du **6 octobre 13:37 UTC** permet un replay numérique exact de **cette autre capture**, explicitement séparé des inputs de l'A/B.

## 2. Cartapani : le rejet ne se résout pas par une substitution de champ

La réponse V2 possède **deux** moments `staggeredColumns` + `regular`, orders 6 et 7. Le validateur s'arrête au premier ; la deuxième contradiction est constatée dans le brut, sans réparation ou réapplication.

Order 6 / `structuralMoments[5]` couvre 54–68 %, soit **y8705,88–10962,96** pour une page de 16 122 px. Panneaux 17–21 : persistance d'un grand énoncé central, photos périphériques changeant de position entre états échantillonnés, puis entrée des cartes de formation vers le panneau y10530. Cela ne démontre pas « plusieurs rangées » de cartes répétées sur toute la plage. La réponse fusionne une portion du dispositif typographique et l'arrivée d'une autre organisation. L'unique locale y7611 est dans la phase précédente ; la locale y12178 soutient les cartes de la phase suivante, pas le moment rejeté.

Order 7 / 68–82 % : la locale y12178 montre une introduction étroite à gauche et une rangée de cartes régulières à droite. Ici la géométrie `regular` est cohérente avec les pixels ; **le label staggeredColumns est le mauvais choix**. Dans order 6, ni le récit en rangées ni la portée de `regular` ne sont suffisamment fidèles à toute la phase. Il ne faut donc changer arbitrairement ni `regular` en `offset` ni le label dans la sortie rejetée.

Le prompt V2 exigeait déjà un décalage observable et interdisait le label de décalage pour une rangée régulière. La définition n'était pas absente ; le modèle n'a pas suivi la contrainte. Le schéma fournisseur acceptait les deux champs indépendamment, la contradiction étant contrôlée seulement après génération. L'absence d'un label dédié aux grilles régulières dans la taxonomie pourrait attirer vers une catégorie voisine, **hypothèse seulement** : `other` et une géométrie précise étaient déjà disponibles. Aucun nouveau label ad hoc n'a été ajouté.

Les causes internes exactes du choix du modèle ne sont pas observables. La confusion états/sections et la fusion des organisations sont des explications compatibles avec les assertions/pixels ; elles ne constituent pas une preuve du raisonnement interne.

## 3. Corrections génériques implémentées

### Sélecteur expérimental V2

`structural-composition-descriptor.js` ajoute des témoins numériques de couverture texte/image/vide, plus grande masse et échelle de texte, distribution centre/périphérie, offsets réellement mesurés et intersection texte/image. **Aucune interprétation de sens artistique, aucun contenu textuel, couleur, domaine ou identité d'image.** Ces rectangles mesurés ne certifient pas une saillance optique.

`structural-observation-selection.js` propose une distance V2 avec géométries présentes et différence maximale des témoins normalisés (norme L∞), évitant la dilution d'un changement distinctif parmi des dimensions inchangées/absentes. L/D, formule marginale, poids, seuil 0,25, maximum cinq, pruning, fallback et fiabilité restent identiques. La norme maximale est plus sensible aux différences et aux outliers : bénéfice artistique et robustesse réelle devront être testés avant activation par défaut.

Les états à géométrie identique restent redondants ; le sélecteur ne produit pas de sections. Les traces V2 conservent ces témoins, la version et les poids, avec allow-list numérique, compression et plafond existant de 256 KiB. Elles ne constituent pas une archive des pixels ou de toutes les mesures DOM permettant n'importe quel futur contre-factuel.

Sur une fixture longue indépendante des domaines, V1 retient une vue et V2 trois : entrée, pause réellement calme, galerie réellement dense ; un doublon de galerie est écarté, deux slots restent libres. Sur le pool complet du 6 octobre : V1 `[pool1,pool22]`, V2 `[pool1,pool14,pool20,pool23]` ; gallery y6435 est retenue à G=0,297568, puis y9360 à G=0,273626 et finale y10656 à G=0,309447. **Pas de contre-factuel exact de l'A/B, pas de garantie d'amélioration Vision.** Les lettres/portraits centraux ne sont toujours pas retenus dans ce replay : insuffisance de couverture encore ouverte, pas un succès complet du sélecteur.

### Contrat artistique expérimental V3

`structural-artistic-v3.js` et le branchement versionné dans `structural-reference.contract.js` :

- Ancres courtes par moment : ID exact de vue/panneau, plage de page, dominance et relation image/texte observées. Pas de raisonnement interne demandé ni de score auto-attribué.
- Moments/preuves avant synthèse globale dans l'ordre du schéma ; géométrie avant classification. Succession des dominantes à vérifier avant relations/principes ; états recouvrants d'un dispositif stable distingués des sections.
- Deux branches `anyOf` empêchent `staggeredColumns/offsetGrid` avec `regular` ou `unknown` en V3. Un décalage non établi appelle `other` et une géométrie incertaine. V1/V2 conservent leurs règles et hashes.
- Validation stricte des IDs d'ancres, citations, plages réellement observées, doubles ancres, couverture d'un `wholeMoment/direct`, concordance de dominance et niveau de preuve des relations. Contradictions absence d'image/texte et superposition refusées. Aucune réparation implicite.
- Persistance V3/ancres supportée par le modèle local ; parcours produit simulé et reprocess validés sans base ni fournisseur. Le défaut produit reste V2.

Le schéma `anyOf` est imbriqué dans les moments, la racine restant un objet. Ce format suit le sous-ensemble documenté pour [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). **L'acceptation exacte de ce nouveau schéma par le fournisseur n'a pas été testée en ligne** ; elle fera partie du prévol autorisé suivant. V3 ne peut certifier automatiquement que les pixels justifient une déclaration de dominance : un modèle pourrait produire des ancres bien formées mais artistiquement fausses. La lecture visuelle indépendante reste indispensable.

Les préparations V2/V3 sur les cinq références conservent le même contenu visuel et les mêmes manifestes. V3 ajoute environ 3,3 ko de prompt et 6,2 ko de schéma pour Tastavents (branches dupliquées) ; plus de tokens n'est pas un gain artistique. Coût et temps restent à mesurer, aucun budget ou plafond de sortie diminué.

## 4. Tests, conservation et portée

- **349 tests** de la suite structurelle élargie passent, zéro échec/ignoré ; dont transport background, budget, captures locales synthétiques, sanitation, fiabilité, phases, guards, endpoints produit simulés et contrats historiques.
- **17 tests finaux ciblés** passent après finalisation V3/trace : 14 nouveaux cas et trois cas historiques de trace, sans échec/ignoré. Ce nombre comprend des reprises de tests, il ne s'ajoute pas comme 17 nouveaux cas distincts aux 349.
- Les neuf fixtures visuelles/structurelles vérifient galerie/pause, typographie/images, centre/périphérie, grille régulière/offset et superposition. Répétitions identiques sans nouveauté ; locales toujours sous gain admissible. Le stress vérifie la compression d'un lot admissible et le rejet explicite d'un lot dépassant 256 KiB ; la limite n'a pas été augmentée.
- Les **13 analyses historiques V1 et 67 images** passent la vérification intégrale ; les dix inputs/prompts/schémas V1/V2 préparés gardent leurs hashes. Cartapani rejetée reste rejetée, intacte.
- Les premiers 33 échecs Chromium étaient dus au lancement dans le sandbox ; la suite a ensuite réussi sous garde bloquant réseau externe, MongoDB, Cloudinary et dotenv, avec credential factice. Un premier test de stress supposait à tort qu'un lot maximal très aléatoire tiendrait sous 256 KiB ; son oracle a été corrigé pour attendre le refus, sans assouplir la protection. Tous les logs sont conservés.
- Contrôle des **601 fichiers préexistants protégés** : quatre fichiers existants changent pour cette tâche (sélecteur, trace, contrat, modèle). Un `.DS_Store` d'un ancien dossier de run diffère aussi du hash initial : métadonnée macOS, cause non établie, laissée intacte et explicitement enregistrée. Aucun fichier de preuve, ledger, note, capture, prompt/schéma archivé, transport ou code de capture ne change. HEAD inchangé, aucun commit. Les identités des sources actuelles ont nécessairement changé pour les évolutions autorisées : ne pas reprendre un ancien prévol gelé avec ces nouveaux fichiers.

Preuves : `server/diagnostics/structural-artistic-remediation-20261009/` contient sources/hashes, alignement 23 panneaux, scores/rounds historiques, diagnostic Cartapani, replay d'ancien pool, neuf SVG et page `fixtures.html`, compatibilité, préparations V3 et logs de tests. Les fixtures prouvent une capacité technique, **aucune note de 8/10**. L'évaluation humaine A/B antérieure reste possible et n'a pas été remplacée.

## 5. Prochain protocole minimal proposé, non autorisé

**Plan factoriel 2×2 sur Tastavents et Cartapani : huit appels maximum proposés**, zéro appel autorisé ou préparé pour dispatch dans ce travail.

| Cellule | Sélection | Contrat |
|---|---|---|
| 00 | Sélecteur V1 | Artistique V2 |
| 10 | Sélecteur V2 expérimental | Artistique V2 |
| 01 | Sélecteur V1 | Artistique V3 expérimental |
| 11 | Sélecteur V2 expérimental | Artistique V3 expérimental |

Un **unique pool commun certifié** par site doit fournir les pixels et mesures de tous les candidats avant les deux sélections. Le pool brut du B1 appliqué n'est pas disponible : impossible de préparer honnêtement les nouvelles locales à partir des seules deux locales et des vignettes. Il faut soit certifier une archive complète utilisable pour cette nouvelle expérience, soit autoriser ensuite une collecte unique conservant toutes les preuves. Ne jamais réutiliser l'ancienne V2 comme contrôle d'une nouvelle capture, extrapoler des locales depuis la macro ou confondre le pool du 6 octobre avec le B1 appliqué.

Pour isoler les facteurs : 00→10 et 01→11 mesurent la sélection ; 00→01 et 10→11 l'interprétation sur **images/manifeste strictement identiques** ; 00→11 observe l'ensemble. Les assertions sont comparées par plages, pas par numéros de moments. La différence des deltas décrit une interaction, sans valeur statistique garantie sur un seul tirage.

**Point de prévol à traiter avant dispatch :** le compilateur actuel adapte la liste des IDs dans les instructions et les enums du schéma au nombre de locales. Une comparaison de sélection ne doit pas modifier subrepticement les instructions artistiques. Figer pour chaque colonne un prompt et schéma communs avec les mêmes IDs possibles ; placer les IDs réellement présents et leurs géométries dans le contexte d'entrée, faire refuser toute citation d'une vue absente. Cette liaison opérationnelle commune doit être identifiée/hachée comme telle, sans réécrire les snapshots V2 du précédent A/B. Vérifier par égalité exacte des instructions/schémas dans chaque colonne et des images/contenus/manifeste dans chaque ligne. Si ces invariants échouent, ne pas lancer l'expérience. La préparation actuelle démontre les invariants artistiques V2→V3 à inputs archivés identiques, pas encore les quatre payloads d'un pool commun disponible.

Même modèle, medium, tier, background, politique de détail et délais ; aucune vue forcée et aucun score injecté. Les nombres de locales et coûts peuvent différer entre sélections, à documenter comme partie du facteur d'entrée. Quatre sorties anonymisées, mapping séparé, grille B1 constante, preuves communes complètes pour l'évaluateur ; notes verrouillées avant dévoilement. Juger aussi hallucinations, relations proches/lointaines, géométrie et conditions des principes. Une amélioration relative sous 8 reste insuffisante ; entrée non certifiable et résultat invalide restent visibles.

Chaque appel doit respecter le coordinateur commun, l'archivage brut avant parsing, une réservation préalable, aucun retry payant et arrêt au premier incident non récupérable. **Nouvelle autorisation et nouveau prévol budgétaire requis.** Le connu cumulé antérieur 0,024139325 USD et l'incertitude réservée 0,36 USD ne sont pas effacés ; l'ancien plafond de 1 USD n'autorise pas une nouvelle série. Aucun montant de facture nouveau dans cette tâche.

Gucci/Cantina/Grupo et les autres B1 restent nécessaires pour évaluer généralisation et non-régression artistique après ce diagnostic minimal ; aucune analyse supplémentaire n'est préparée automatiquement. Salterra nécessite des entrées fiables. Les sept B2 devront chacun atteindre ≥8 ou déclarer honnêtement une impossibilité technique : aucun filtre des faibles notes, garantie codée ou activation par défaut fondée sur ces fixtures.

**Effet attendu, non prouvé :** moins de sous-sélection par dilution géométrique, descriptions mieux localisées, moins de contradictions taxonomiques et moins de propagation de dominances erronées aux principes. Les grandes compositions centrales encore non retenues et la fidélité visuelle des ancres constituent les principales limites ouvertes. Le travail s'arrête ici, sans nouvelle génération ni activation artistique de production.
