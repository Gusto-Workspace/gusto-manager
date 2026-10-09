# B1 V1/V2 background — résultats partiels et arrêt au rejet Cartapani

## État définitif de cette série

**Trois nouveaux POST sur dix maximum ; deux sorties validées ; une seule paire complète.** Tastavents V1/V2 a été produit en background. La troisième réponse, Cartapani V2, est complète chez le fournisseur et son usage est cohérent, mais elle échoue au validateur artistique existant. La cohorte s'arrête immédiatement : Cartapani V1 et les six appels des trois autres sites n'ont pas été effectués. Aucun retry ni complément automatique.

La comparaison Tastavents est provisoire : **utilité V1 5/10, V2 4/10, delta −1**. V2 améliore la prudence et la formulation des principes, mais plusieurs dominantes centrales sont moins fidèlement ancrées. Aucun site n'a démontré ≥8 dans cette série. Les quatre autres paires sont **non évaluables**, sans note zéro ni substitution par un résultat historique.

Run : `server/diagnostics/structural-b1-ab-background-20261008/runs/2026-10-08T21-04-36-758Z-66b511e9/`. État terminal `stopped`, motif `invalid_structural_analysis`, 2026-10-08T21:08:34.474Z. Ce rapport est un nouvel artefact ; l'ancien rapport synchrone et ses preuves restent immuables.

## Intégration technique et vérifications

L'exécutant isolé réutilise le coordinateur `structural-vision-background.js` et le transport HTTP commun. L'adaptateur fichier possède un ledger atomique faisant autorité pour checkpoints, créneaux et finances ; un verrou de worker empêche deux exécutants concurrents. Les corps exacts sont figés avant le premier dispatch. Une création est durablement enregistrée et réservée avant HTTP ; une reprise ne recrée jamais une tentative déjà envoyée. Les IDs client servent au diagnostic, pas à une idempotence fournisseur présumée.

Fichiers préexistants modifiés pendant cette intégration :

- `server/scripts/runStructuralVisionAB.script.js` : chemin background, persistance et verrous ; refus de l'ancien déclencheur synchrone en CLI. Les fixtures historiques restent accessibles aux tests.
- `server/services/design-lab/openai.service.js` : import du transport partagé extrait ; aucun changement artistique.

Nouveaux fichiers : `server/services/design-lab/openai-transport.js` (transport commun extrait), `server/tests/design-lab-structural-ab-background.test.js`, avenant `STRUCTURAL_B1_AB_BACKGROUND_PREFLIGHT.md`, ce rapport et archives locales. Le coordinateur existant, les prompts et contrats artistiques, la sélection locale, la sanitation et la capture n'ont pas changé pendant cette expérience.

**252 tests hors ligne réussis, zéro échec ou ignoré** : 132 sur exécutant/coordinateur/contrats/protocole ; 99 sur les autres parcours du transport commun ; 21 sur finalisation/recovery. Les nouvelles fixtures couvrent un traitement simulé >120 s, interruption GET, arrêt réel d'un processus puis récupération du même ID, concurrence, perte d'accusé, états terminaux anormaux, refus, JSON invalide, incohérence d'usage, deadline, hashes et plafond cumulatif. Garde hors ligne avec faux credential ; aucun dispatch lors des tests. Logs et contrôle des dix requêtes conservés dans le répertoire diagnostic parent.

Les dix requêtes préparées passent les invariants : mêmes octets, hashes, ordre, dimensions, détails, manifestes et géométries par paire ; seul prompt/schéma artistique diffère. Le seul ajout opérationnel au corps original est `background:true`, commun aux deux variantes. Modèle réel `gpt-6-luna`, reasoning `medium`, tier `default`, `store:false`, aucune réduction de sortie. Réservation de 0,36 USD avant chaque nouveau POST, cap cumulatif 1 USD incluant l'ancien run. Création 30 s / GET 15 s / suivi 540 s.

### Fonctionnement observé

| Appel | Résultat | POST | GET | HTTP création | HTTP dernier GET | Création→brut terminal durable | Coût calculé USD HT |
|---|---|---:|---:|---:|---:|---:|---:|
| Tastavents V1 | Validé | 1 | 9 | 1,861 s | 0,710 s | 61,020 s | 0,005360925 |
| Tastavents V2 | Validé | 1 | 14 | 1,311 s | 2,127 s | 91,003 s | 0,005836300 |
| Cartapani V2 | Fournisseur completed, validation rejetée | 1 | 13 | 1,282 s | 0,561 s | 83,882 s | 0,007295050 |

Total : **3 POST, 36 GET**, aucun retry de création. Les 39 échanges ont chacun un corps brut et des métadonnées ; les trois IDs réels passent de `queued` à `in_progress` puis `completed`. Aucun timeout HTTP, abandon de génération, erreur fournisseur ou interruption GET n'a été observé dans ce run.

Les durées sont mesurées par l'exécutant et incluent suivi, attente entre GET et persistance. Elles ne sont pas une mesure exacte du calcul serveur fournisseur. Le fonctionnement réel background est confirmé ; **aucun appel réel ici ne dépasse 120 s**. La capacité >120 s et la reprise après crash sont prouvées hors ligne, pas par une interruption réelle de cette série. La récupération reste limitée par la rétention temporaire fournisseur, environ dix minutes avec `store:false` ([documentation OpenAI](https://developers.openai.com/api/docs/guides/background)).

L'approbation automatique a initialement refusé le lancement, faute de reconnaissance de la nouvelle autorisation dans sa vue du transcript. Aucun processus ni POST n'avait alors commencé. Le même lancement a été accepté après fourniture du texte humain joint vérifié et de son hash ; aucune protection n'a été contournée. L'arrêt final est distinct : il provient du validateur artistique.

### Rejet exact Cartapani

Sixième moment, plage 54–68 %, `structuralMoments[5]` :

```json
{
  "layoutMode": "staggeredColumns",
  "geometry": { "gridRegularity": "regular" }
}
```

`regular` est bien une valeur autorisée du schéma JSON. **Ce n'est ni une erreur de parsing, ni une valeur hors enum, ni un incident background.** Le validateur existant refuse la combinaison `staggeredColumns`/`regular` (`structural-reference.contract.js`, contrôle `label_geometry_contradiction`). La prose décrit elle aussi des axes, dimensions et gouttières répétitifs. Le prompt gelé précise déjà qu'une rangée régulière ne doit pas recevoir un label de décalage.

Preuve : `calls/S2-A/parsed.json`, `validation.json`, `output-text.txt`, `terminal-response.json`, `provider-metadata.json` et tous les HTTP. Le brut terminal et l'usage/coût sont enregistrés avant ce rejet. La réservation du nouvel appel a été remplacée par son coût cohérent ; l'ancienne réservation incertaine de 0,36 reste bloquée.

Le schéma fournisseur autorise les deux champs individuellement ; la cohérence interchamps est contrôlée après génération. Une réponse strictement conforme au schéma fournisseur peut donc être rejetée par le contrat métier. Cette limite est désormais observée réellement. La seule contradiction ne démontre pas à elle seule toute la justesse visuelle de la phase ; elle suffit au motif d'arrêt convenu. Aucun label n'a été corrigé automatiquement, aucune règle assouplie et aucun appel complémentaire payé.

## Budget effectivement conservé

| Appel | Input | Cache écriture (inclus dans input) | Cache lecture | Output (raisonnement inclus) | Raisonnement (inclus dans output) | USD HT |
|---|---:|---:|---:|---:|---:|---:|
| Tastavents V1 nouveau | 10 444 | 10 441 | 0 | 8 111 | 1 139 | 0,005360925 |
| Tastavents V2 nouveau | 11 235 | 11 232 | 0 | 8 864 | 1 846 | 0,005836300 |
| Cartapani V2 nouveau | 17 653 | 17 650 | 0 | 10 177 | 2 350 | 0,007295050 |

Tarifs Standard revérifiés au prévol : entrée 0,10, cache lecture 0,01, cache écriture 0,125 et sortie 0,50 USD/M tokens ([tarifs OpenAI](https://developers.openai.com/api/docs/pricing)). Le cache et les tokens de raisonnement ne sont pas additionnés une seconde fois. Le ledger conserve l'usage exact et la politique tarifaire. Ces coûts sont calculés à partir de l'usage retourné, **pas une facture ou un contrôle du solde compte**.

- Nouveaux appels : **0,018492275 USD HT**.
- Ancien Tastavents V1 connu : 0,005647050 USD HT.
- Connu cumulé : **0,024139325 USD HT**.
- Ancien Tastavents V2 incertain : **0,36 USD HT réservés**, aucun ID reconstitué, aucune libération présumée.
- Exposition prudente cumulée : **0,384139325 USD HT** sur **1,00 USD HT**.
- Disponible comptable conservateur : 0,615860675 USD HT ; l'arrêt artistique reste impératif malgré ce disponible.

Sur la seule paire complète, V2 coûte 0,000475375 USD de plus, soit environ **+8,87 %**. Cela n'est pas une estimation fiable du surcoût sur les cinq sites. L'estimation initiale de ~0,06 USD pour dix appels ne peut pas être confrontée à une cohorte complète : sept appels n'ont pas eu lieu. Aucune facturation exacte de l'ancienne tentative incertaine n'est connue.

## Évaluation artistique provisoire

Lecture Codex distincte du générateur Vision, connaissant toutefois le projet et le contrat V2. Les notes ont été enregistrées sous IDs A/B avant ouverture du mapping privé, puis engagées par SHA-256. Les champs et le style peuvent révéler la variante ; **l'aveugle est partiel et ce n'est pas une validation humaine externe indépendante**. Une lecture tierce peut contredire les scores. Aucun appel évaluateur supplémentaire.

Grille et échelle B1 inchangées : 3–4 = perte importante ou erreur bloquante ; 5–6 = exploitable avec réserves ; 7 = compréhension spécifique généralement juste ; 8 = lecture riche, cohérente et fiable des mécanismes globaux et singularités. Capture/fidélité porte sur les buffers accessibles ; la fidélité intégrale au site historique reste non évaluable. Aucun score auto-attribué par le générateur n'est utilisé.

| Site | Utilité V1 contemporaine | Utilité V2 | Delta | Objectif ≥8 |
|---|---:|---:|---:|---|
| Tastavents | 5 | 4 | −1 | Non atteint dans les deux sorties |
| Cartapani | NE, non appelée | NE, réponse rejetée | NE | Non démontré ; paire incomplète |
| Grupo Isabella's / Carmina | NE | NE | NE | Non démontré ; aucun appel |
| Gucci Osteria | NE | NE | NE | Non démontré ; aucun appel |
| Cantina del Sol | NE | NE | NE | Non démontré ; aucun appel |

### Neuf scores contemporains Tastavents

| Critère B1 | V1 | V2 | Delta | Justification |
|---|---:|---:|---:|---|
| Capture/fidélité* | 7 | 7 | 0 | Même storyboard, seules entrée/fin en locales ; aucune fidélité intégrale source certifiée. |
| Structure | 5 | 4 | −1 | V1 approxime mais situe mieux la galerie ; V2 avance les images denses dans les portraits et calme la galerie réelle. |
| Texte→image | 5 | 4 | −1 | Hero/footer compris ; V2 perd les lettres géantes derrière portraits et les déclarations centrales à fragments périphériques. |
| Densité | 5 | 4 | −1 | Galerie dense partiellement reconnue par V1, inversion à 53–64 % dans V2. |
| Transitions | 5 | 4 | −1 | Relations V2 explicites mais fondées sur cette inversion ; récurrences lointaines sous-décrites. |
| Principes transférables | 5 | 6 | +1 | V2 précise mécanisme/condition/effet du chevauchement de frontière et du recadrage non essentiel ; plusieurs principes restent génériques. |
| Prudence | 6 | 7 | +1 | V2 qualifie sampledStates/inferred et ne présume pas une animation/grille ; une dominance centrale erronée reste déclarée direct. |
| Taxonomie | 5 | 5 | 0 | Hero mieux qualifié V2 ; catégories centrales mal situées, axes/asymétrie du footer approximatifs. |
| Utilité Design Lab | 5 | 4 | −1 | Quelques mécanismes exploitables V1 ; V2 transmettrait une grammaire centrale trompeuse malgré hero/footer précis. |

Pour Cartapani, Grupo, Gucci et Cantina, **les neuf scores V1, les neuf scores V2 et leurs neuf deltas sont tous NE**. La réponse rejetée Cartapani reste une preuve diagnostique intégrale, sans note artistique comparative. Les fichiers d'évaluation rendent ces absences explicites ; aucun ancien score n'est importé pour remplir une cellule.

### Comparaison par plage visuelle Tastavents

Preuves originales communes : `blind/S1/overview.webp` (23 panneaux légendés en pixels), `observation1.webp`, `observation2.webp` et `input-manifest.json`. Hauteur totale 11 556 px ; les pourcentages ci-dessous désignent la hauteur de page, jamais le rang du panneau. Les plages de captures se recouvrent et représentent des états stabilisés : **elles ne prouvent pas des sections distinctes ou un mouvement complet**.

| Preuve archivée / plage visible | Composition directement lisible | V1 contemporaine | V2 contemporaine | Verdict visuel |
|---|---|---|---|---|
| Locale entrée y0–900, ~0–8 % | Photo plein champ, grand texte serif centré superposé, navigation périphérique. | Description précise ; fullBleedPhotography. | Geometry plein champ/centre/overlap ; layeredPhotography. | Acquis commun ; meilleur label V2, pas un gain majeur de compréhension. |
| Panneaux 2–3, y585–2070 | Petite introduction dans champ crème, puis photographie et grands titres. | Étend quietText sur 8–18 %. | Même plage 8–18 % ; image absent/void dominant. | Pause reconnue, portée trop large dans les deux ; V2 fige trop catégoriquement l'absence d'image. |
| Panneau 4, y1755–2655, ~15–23 % | Lettres géantes derrière trois portraits/cartes ; superposition et recadrage. | Collage 18–30 %, grands titres et superpositions évoqués sans mécanisme exact. | AsymmetricEditorial 18–29 %, balanced/adjacent/overlap uncertain. | Persistance de perte de dominance ; V2 moins spécifique, le rapport géant/petits portraits manque. |
| Panneaux 6–7, y2340–3825, ~20–33 % | Déclaration centrale sur sombre, photographies fragmentaires périphériques. | Collage puis modules, sans axe central clairement expliqué. | Mixte balanced jusqu'à 29 %, contrastPanel text à 29–39 %. | V2 reconnaît le texte dominant plus tard mais le décale ; omissions communes sur organisation centre/périphérie. |
| Panneaux 8–12, y3510–6228, ~30–54 % | Editorial décalé, puis portraits gauche / nom à droite et changement d'état échantillonné ; déclaration centrée sur crème. | Fusion staggeredColumns 30–42 %, puis oversizedTypography 42–52 %. | Panneau textuel 29–39 %, puis collage dense dominé par images 39–53 %. | Segmentation approximative V1 ; erreur V2 de dominance image et minimal whitespace sur une phase aussi textuelle/aérée. Ne pas compter les états de portraits comme preuve de plusieurs sections. |
| Panneaux 14–17, y6435–9090, ~56–79 % | Grandes photos de plats contiguës, densité élevée ; ensuite panneau sombre étroit à droite. | Photos dominantes 52–67 %, puis unités répétées 67–79 % ; grille/offsets trop généralisés. | SplitUnequal calme 53–64 %, puis phase mixte plus aérée 64–76 %. | Régression centrale nette V2 : le retour calme est mal situé ; V1 conserve mieux le crescendo malgré frontières/catégorie fragiles. |
| Panneaux 18–21, y8525–10845, ~74–94 % | Réservation centrée claire avec masse média/rectangle indisponible, puis nouvelle déclaration centrale sombre à petites photos périphériques. | Blocs éditoriaux et rectangle de demi-largeur vers 79–90 %, peu spécifique. | ContrastPanel 76–91 %, rectangle situé par metadata ; disposition générique. | Les deux évitent de donner une identité artistique au contenu manquant ; les deux manquent la relation entre les déclarations centrales éloignées. |
| Locale fin y10530–11430, ~91–99 %, panneau 23 jusqu'à 11556 | Vide crème puis panneau sombre ; grande photo centrale chevauchante, textes latéraux, mot-signe géant inférieur. | Trois masses équilibrées, échelle et chevauchement précis. | Même structure, principe frontière vide/dense plus opérationnel. | Gain de formulation V2 ; qualifier toute la clôture d'asymétrique et primaryAxis multiple est moins précis que l'axe central réellement fort. |

Les textes cités et tous les champs restent consultables dans les JSON ; le tableau ne remplace pas les assertions intégrales. Les frontières exactes restent approximatives : aucun pixel continu ou scénario temporel n'est reconstitué entre panneaux.

### Erreurs corrigées, persistantes et nouvelles

**Améliorations observées V2 :** statut des preuves plus explicite (`sampledStates`, `inferred`) ; retenue sur grille et animation ; hero qualifié comme image/texte superposés ; principe final liant chevauchement central, frontière de surfaces et contenu non essentiel recadré. Ces gains concernent prudence et opérabilité de certains mécanismes, sans résoudre la composition globale.

**Défauts persistants :** quietText étendu au-delà de la pause ; perte du rapport entre typographie géante et portraits ; organisation centrale à images périphériques insuffisamment distinguée ; segmentation centrale approximative ; récurrences éloignées et rapports d'échelle insuffisamment reliés. Les deux sorties restent très supérieures dans les locales d'entrée/fin au milieu macro seul.

**Régressions observées dans V2 :** images dominantes/presque sans vide attribuées à 39–53 %, puis reprise éditoriale calme à 53–64 % au lieu de la galerie dense. Les relations globales propagent cette mauvaise succession. La signature globale omet le dispositif central de lettres géantes et retient surtout hero/footer.

**Hallucinations/abus de généralisation :** V1 formule des recadrages variant « au fil du mouvement » ; sur ces images statiques, cela reste une extrapolation temporelle ambiguë, pas une preuve d'animation inventée avec durée. Ses grilles et répétitions ne sont pas suffisamment étayées. V2 n'invente pas de mouvement détaillé, mais l'absence d'image généralisée à la plage calme et la dominance image déclarée `direct` au mauvais endroit sont des assertions spatiales non fidèles. Aucune des variantes ne donne une apparence interne à l'embed indisponible ni ne doit en tirer un motif source.

**Relations globales :** V2 comporte quatre liens explicites, principalement continuité/contraste entre voisins. Le lien [3,4,5,6] dépend d'une séquence mal placée ; présence du champ `globalRelations` ne signifie donc pas exactitude. Les deux déclarations sombres centre/périphérie et le retour des grandes lettres à la fin ne forment pas une grammaire éloignée précise. V1 décrit aussi un rythme global mais reste générique et surestime certains regroupements.

**Principes :** la condition « image autonome, textes voisins séparés » du chevauchement final est utilisable sans recopier l'identité. Les conseils de varier échelles/densités sont trop interchangeables avec beaucoup de sites. L'amélioration rédactionnelle V2 ne suffit pas si le principe vient d'une dominance mal située. Une mémoire artistique alimentée par ces sorties pourrait générer une alternance calme/dense absente du milieu réel.

### Limites d'entrée et hypothèses causales

Faits : Tastavents a 23 panneaux de storyboard de 240×150, overview transmis en low detail, mais seulement deux locales entrée/fin. Le vide entre plages détaillées est de 9 630 px (y900→10530). Les grandes dominantes centrales restent visibles dans le storyboard ; il n'y a donc pas de preuve que leurs inversions soient inévitables. La macro sampled ne prouve ni la continuité entre états ni la temporalité des animations. L'embed externe est indisponible mais son rectangle est connu.

Hypothèse, confiance moyenne : manque de résolution et d'observations locales centrales favorise généralisation et confusion de positions/états. La bonne précision du footer dans les deux sorties est compatible avec un bénéfice des locales. Ce contraste ne prouve pas qu'ajouter des images résoudrait tout, ni qu'une capture est défectueuse.

Hypothèse, confiance moyenne : le contrat V2 réussit à imposer une prudence verbale sans imposer un ancrage visuel suffisant des dominances. Ses champs peuvent devenir des valeurs approximatives cohérentes grammaticalement avec un récit erroné. Le rejet Cartapani montre en outre que le prompt n'assure pas la cohérence label/géométrie, même avec schéma strict.

Non déterminé : part spécifique du prompt, du schéma, du modèle et de la variabilité d'une génération. Un seul couple de sorties ne permet pas une attribution causale forte ; aucun des trois autres contrôles artistiques n'a pu être exécuté. **La supériorité générale V2 n'est pas démontrée.** La régression Tastavents est un résultat observé de cette paire, pas une conclusion statistique sur toutes les V2.

## Dossier d'évaluation humaine et conservation

`blind/index.html` contient la paire Tastavents complète, la réponse Cartapani rejetée signalée comme diagnostic non noté, les 25 images originales communes des cinq sites avec dimensions/détail/plages et les manifestes. Les sept réponses absentes sont déclarées absentes. Les formulaires des quatre paires incomplètes sont désactivés. Le bouton exporte des notes localement ; aucune connexion externe.

Les fichiers A/B conservent toutes les assertions ; seule `analysisVersion`, métadonnée révélant directement la variante, est omise dans la copie aveugle. Les JSON fournisseur complets restent dans `calls/`. Style/champs et arrêt partiel peuvent faciliter le dévoilement : aveugle imparfait explicitement déclaré. Aucun ancien score, score Codex ou mapping n'est inclus dans `blind/`.

Séparation des preuves :

- `provisional-anonymized-evaluation.json` : neuf notes et justifications A/B, quatre paires explicitement NE.
- `provisional-evaluation-commitment.json` : hash des notes fixé avant ouverture du mapping.
- `private-unblind-mapping.json` et `mapping-commitment.json` : mapping séparé et engagement vérifié.
- `blind/blank-evaluation-grid.json` : grille humaine vierge, neuf critères inchangés.
- `blind-packet-verification.json` : 25 hashes originaux vérifiés, trois sorties présentes et inventaire du paquet.
- `technical-execution-summary.json`, `ledger.json`, `calls/*/http`, enveloppes terminales, parsing et validation : cycle technique, coûts et arrêt.
- Prévol et sources exactes exécutées copiés dans le run, source humaine autorisant les dix nouveaux appels identifiée par hash.

Contrôle final : **1 167 fichiers préexistants protégés**, seules les deux modifications d'intégration déclarées autorisées ; hashes des captures, analyses, anciennes tentatives et ancien run conservés. Les **13 analyses historiques V1 archivées et 67 images** restent compatibles et inchangées. HEAD `2bd44a3321ec11f9d3b5263ecb47673eccf3e3ef` inchangé. Aucun commit, nouvelle capture ou visite externe, mutation MongoDB/Cloudinary, appel des huit autres B1 ou B2. Aucune base live n'a été relue pour transformer cette conservation locale en certification actuelle de son état ; le chemin expérimental ne charge ni serveur, ni modèle MongoDB, ni service Cloudinary.

L'ancien plan de reprise décrivait une intégration encore à faire et une autorisation alors absente. C'est une description historique désormais dépassée par l'avenant et ce run ; elle reste conservée, pas réécrite comme si elle avait toujours décrit le fonctionnement actuel. Les anciennes sorties ne servent pas à valider ce nouveau transport ou cette paire.

## Diagnostic prioritaire avant une suite autorisée

1. **D'abord investiguer hors ligne la cohérence Cartapani**, contre les preuves originales : distinguer choix de label erroné, moment fusionnant plusieurs organisations et limite du contrat. Ne pas simplement changer `regular` en `offset`, assouplir le validateur ou payer un retry. La correction doit être générique, étayée et discutée avant toute intervention artistique.
2. **Traiter l'ancrage des masses centrales Tastavents** : relier les assertions à positions/plages réellement visibles et vérifier les transitions de dominance, les centres/périphéries et les récurrences, plutôt que valoriser la présence de champs géométriques. Hypothèses contrat et couverture locale doivent rester séparées jusqu'à preuves supplémentaires ; aucune modification d'entrée pendant l'A/B.
3. **Faire noter la paire humaine à l'aveugle partiel**, avant une conclusion indépendante. Les contrôles positifs Gucci/Cantina et la généralisation Grupo restent non observés : aucune extension aux huit autres sites ou B2 ne peut être justifiée par ce run partiel.

Le raccordement technique background fonctionne et les protections ont arrêté une sortie contradictoire. Le gain artistique attendu n'est pas acquis : Tastavents reste sous 8 et régresse provisoirement en utilité. La priorité concrète est le diagnostic local du rejet et des mauvaises dominantes, puis une décision humaine sur une correction et un éventuel nouveau protocole. **Aucun appel complémentaire ni modification du moteur ne suit ce rapport.**
