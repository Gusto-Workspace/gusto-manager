# Références structurelles

## Périmètre

`StructuralReference` est une collection indépendante. `DesignReference` décrit un langage visuel ; la référence structurelle décrit la composition spatiale et la progression verticale d’une page, indépendamment du secteur d’origine.

Cette bibliothèque n’est consommée par aucun moteur actuel : Directions, Brand System, Visual System, Style Frame et Homepage restent inchangés. Aucune relation avec `SiteProject`, le Portfolio ou `existingWebsiteContext` n’est ajoutée.

**État de cette phase :** capture sécurisée, modes continuous/sampled, validation géométrique, checkpoint et **Adaptive Structural Observation Selection implémentés**. Validation locale uniquement : aucun nouvel appel Vision autorisé. Les anciennes captures restent lisibles sans migration ; continuous reste indépendant.

## Modèle

- Identification : `title`, `slug` unique, `sourceType`, `sourceUrl`, `originalSiteUrl` après redirection, `domain`.
- Bibliothèque : `active`, `manualTags`, `status`, `lastError`, timestamps.
- Capture : `captures` (type, viewport, publicId, url, dimensions, rectangle source).
- Métadonnées locales : viewport, largeur/hauteur du document et embeds externes indisponibles. Les descripteurs adaptatifs complets restent temporaires/localement ; Mongo conserve la géométrie bornée du storyboard et les résumés des observations sélectionnées dans `captureCoverage`. Pas de HTML, CSS brut, texte source ou palette. Les instantanés utilisés pour une analyse restent dans `StructuralAnalysisAttempt`.
- Résultat : `analysis`, `analyzedAt`.
- Verrou technique : jeton interne non exposé, début d’opération ; expiration après 15 minutes et reprise exclusivement manuelle. Un second déclenchement est refusé pendant une opération active.

Les sources `pinterest` et `discovery` sont réservées dans l’enum Mongoose, mais ni leur ingestion ni leur analyse ne sont activées. L’API de création accepte uniquement `manual_url`. Les tags manuels ne sont jamais produits ni modifiés par Vision.

## Pipeline

1. URL HTTP/HTTPS normalisée et validée : pas de credentials ni ports arbitraires ; contrôle DNS public avant création.
2. Capture Portfolio en mode opt-in `singlePage: true`, sans découverte ni visite d’autres pages ; même sécurité réseau épinglée, contrôle des redirections, blocage IP privées/metadata, limites réseau et timeouts.
   Le transport HTTP/HTTPS sécurisé et le contexte Playwright partagent `CAPTURE_USER_AGENT` : Chrome desktop 145 sur macOS, identique au diagnostic Gucci. Cela couvre aussi les sous-ressources et les redirections ; aucune surcharge temporaire n'est nécessaire.
3. Même viewport desktop 1440 × 900, warm-up normal puis nettoyage cookies/popups. Détection du scroller réel, parcours progressif, attente fonts/images lazy, recalcul de la longueur jusqu'à une fin stable. Le mode `prefers-reduced-motion: reduce` est activé après le warm-up ; les éléments visuels visibles sont attendus à chaque position et `animations: "disabled"` est utilisé uniquement aux screenshots. Aucun style global ne masque les éléments ni ne modifie leur layout.
4. Choix de stratégie après parcours complet. Sans motion structurelle détectée : `continuous`, reconstitution PNG et cinq vues habituelles. Avec transformations dépendantes du scroll : `sampled`, storyboard indépendant issu du parcours complet puis sélection de zéro à cinq observations locales (entrée obligatoire par défaut). Mesures insuffisantes : cinq positions fixes actuelles, avec raison explicite. Aucune FULL PAGE stitchée en sampled. Gates, stabilisation et transport restent identiques. Les WebP sont encodés avec Sharp existant puis uploadés dans `Gusto_Workspace/design-lab/structural-references/<id>/`.
5. Captures sauvegardées avant l’analyse. Un seul appel Vision structuré avec quatre images en `continuous`, une à six en sampled v3. Aucun appel Vision pendant l'implémentation/benchmark local ; validation utilisateur nécessaire avant toute exécution payante.
6. Validation du contrat et remplacement de l’analyse ; les tags manuels restent conservés.

La réanalyse utilise les captures existantes uniquement si les vues attendues sont disponibles et les preuves de nettoyage/couverture valides. `captureCoverage` v2 conserve ses exigences historiques (cinq rôles en sampled). V3 sampled prouve la fin et l'absence d'intervalle manquant via les panneaux du storyboard, indépendamment du nombre de vues locales ; chaque vue locale est stabilisée, identifiée par `observation1`…`observation5` et positionnée en pixels absolus. Les captures anciennes sans preuve, invalides ou bloquées imposent une nouvelle capture avant Vision. Les uploads partiels sont nettoyés ; une erreur Vision conserve les vues et l’analyse précédente valide. Pas de retry Vision automatique, pas de reprise au refresh.

## Nettoyage et validation avant capture

Ce traitement est un callback activé uniquement par l’ingestion StructuralReference. Le comportement par défaut de la capture Portfolio ne change pas.

- Recherche dans le document, les shadow DOM ouverts et jusqu’à 20 frames accessibles. Une CMP est identifiée par une combinaison de texte cookies/préférences/statistiques, contrôles d’acceptation, rôle dialog, position fixed/sticky et empilement, ou identifiants connus (OneTrust, Cookiebot, Didomi, Iubenda, Usercentrics, etc.). Les widgets CMP compacts sont traités quelle que soit leur surface. Un simple lien confidentialité/cookies dans une modale métier ne suffit pas.
- Clic Playwright normal, sans `force`, sur boutons/liens/role button reconnus : Tout accepter, Accepter, J’accepte, Accept all, Accept, Allow all et variantes courtes. Attente de disparition avant tout fallback.
- Si la CMP persiste, retrait uniquement des racines reconnues et des backdrops associés par famille CMP ou voisinage/empilement immédiat. Une iframe et son wrapper vide ne sont associés que si la frame contient exclusivement une CMP reconnue. Aucune suppression générale des dialogs ou éléments fixed ; aucun changement de CSS ou de classes.
- Popups non structurels : reconnaissance distincte combinant position/empilement, rôle dialog, identifiants modal/popup/interstitial, contrôle close/dismiss/× et texte d'annonce/newsletter/promotion. Une petite `modal-news` avec bouton close est reconnue sans exiger un grand backdrop. Header, nav, main, footer, menu et CTA ordinaires sont exclus du retrait. Traitement dans les frames accessibles et shadow DOM ouverts.
- Fermeture normale par clic (sans force), puis Escape, puis retrait DOM uniquement des racines temporaires reconnues et des backdrops adjacents de même empilement. Pas de modification des classes/CSS ni suppression globale d'éléments fixed. Une iframe n'est associée que si son contenu est exclusivement une popup reconnue.
- Après une action, nouveau warm-up et contrôle des images ; stabilisation normale. Puis détection indépendante des overlays restants : dialogs occupant au moins 18 % du viewport, fixed/sticky avec z-index élevé occupant au moins 22 %, backdrops couvrant au moins 50 %. Les navbars compactes sont exclues. Les CMP restantes sont également bloquantes, même si leur bannière est plus petite. Une CMP apparue tardivement fait l'objet d'un second nettoyage local borné ; cela ne déclenche aucun appel modèle.
- Le contrôle est répété aux positions parcourues : une popup apparaissant au scroll ne peut pas être admise dans une vue finale.
- Échec : `blocked_by_popup` si une popup reconnue persiste, `blocked_by_overlay` pour un autre obstacle ou CMP persistant, `incomplete_page_capture` si la couverture n'est pas prouvée. Zéro upload des nouvelles vues et zéro appel Vision ; captures et analyse précédentes restent intactes.

Traces optionnelles, sans migration des documents existants :

- `captureSanitization` : version, consentDetected, consentAction (`clicked`/`removed`/`none`), consentLabel, consentMethod (`click`/`dom_fallback`/`none`), consentHasBackdrop, cookieOverlayDetected/Dismissed, popupDetected/Dismissed, popupActions (type, méthode `click`/`escape`/`dom_fallback`, backdrop, succès ; huit maximum), blockingOverlayDetected, qualityPassed, sanitizedAt et jusqu'à huit descriptions techniques d'overlays.
- `captureCoverage` : stratégie de scroller (`document`, `scroll_container`, `smooth_scroll`), `captureStrategy` (`continuous` ou `sampled`), hauteur réelle, hauteur visible, positions avec rôle/progression réelle/stabilisation/signature, fin atteinte, vues distinctes, complétude, `scrollMotionDetected`, type d'overview et raison d'échec. Aucun HTML, prompt ou base64 stocké.

La fiche affiche « Cookies et popups nettoyés », « Page complète parcourue », ou le blocage popup/overlay/capture incomplète. Aucune analyse existante n'est remplacée avant succès.

L’exécution de la capture réutilise `GUSTO_PORTFOLIO_CAPTURE_ENABLED=true` et le navigateur existant, éventuellement `GUSTO_PORTFOLIO_CHROME_PATH`. Aucune dépendance, aucun navigateur ni téléchargement supplémentaire. La lecture et la réanalyse de captures déjà conservées n’ont pas besoin de Chromium.

## Vues

| Type                                                        | Traitement                                                                                                       | Usage                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `desktop_full` (`continuous`)                               | viewports reconstruits en PNG puis WebP largeur max 2000, qualité 85, ratio conservé                             | master HD/debug, non envoyée à Vision                                       |
| `visionOverview` (`continuous`)                             | resize de la même master PNG, largeur max 720, qualité 80, ratio conservé                                        | unique entrée macro Vision `low`, dérivée technique masquée dans la galerie |
| `top` / `middle` / `bottom` (`continuous`)                  | vrais viewports aux positions 0/50/100 %, largeur max 2000, qualité 85                                           | détail Vision `high`                                                        |
| `overview` (`sampled`)                                      | storyboard séparé par cinq bandeaux libellés avec rôle, progression et position px ; largeur max 720, qualité 80 | macro Vision `low`                                                          |
| `top` / `upper` / `middle` / `lower` / `bottom` (`sampled`) | cinq viewports stabilisés à 0/20/50/80/100 % du parcours, largeur max 2000, qualité 85                           | `top`/`middle`/`bottom` en `high`, `upper`/`lower` en `low`                 |

Ces deux dernières lignes décrivent les captures sampled v2 historiques. En v3, `overview` est un contact sheet de **tout le parcours**, 720 px, trois colonnes de panneaux 240 px avec bandeaux de 24 px ; chaque transformation et plage réelle est enregistrée. `observation1`…`observation5` sont les vues retenues, ordonnées par position réelle, largeur max 2000/qualité 85. `overview` reste `low` ; une vue locale est `high` si L ou D atteint 0,25 (ou si le fallback ne possède pas de score fiable), `low` sinon. Les noms ne désignent aucune région imposée.

Pas d'agrandissement. Les coordonnées des vues indiquent leurs positions réelles dans le parcours. Le document natif et le conteneur sont mesurés séparément : un `documentHeight` de 900 px ne signifie pas qu'une `.app` interne de 5212 px est entièrement visible. Le parcours utilise le scroller natif ou interne ; un wrapper transformé est parcouru par événements de roue réels et déplacement observé. `fullPage` seul n'est plus une preuve de couverture.

Compatibilité sans migration : l'ancien `overview` continuous est accepté comme dérivée `visionOverview` et masqué dans la galerie. Les anciennes analyses restent lisibles, y compris leurs preuves nommées `desktop_full`. Les nouvelles réponses Vision ne peuvent citer cette master non envoyée. Une ancienne overview de type `distributed_viewports` impose une recapture manuelle avant Vision, car elle n'est pas un resize de la master.

Les viewports progressifs se chevauchent, la navbar sticky répétée est retirée uniquement de l'assemblage continu (elle reste présente dans les vues réelles), et aucun intervalle manquant n'est accepté. La hauteur est recalculée après lazy-load, la fin doit être stable sur trois contrôles. Les transformations JS des éléments visuels visibles sont attendues à chaque position ; si elles varient entre positions, la reconstruction n'est plus utilisée comme preuve. Le storyboard sampled juxtapose explicitement des observations distinctes ; les éléments fixed/sticky répétés ne sont pas masqués arbitrairement et le prompt précise qu'ils ne sont pas des sections multiples. Le parcours est borné à 120 s, 120 étapes, 50000 px (visite complète au plus 180 s) ; une limite dépassée donne une capture incomplète et jamais une troncature admise. Sharp refuse également plus de 80 millions de pixels.

## Contrat Vision

Décision validée sur les embeds tiers : un échec réseau ne suffit pas à bloquer une iframe dont l'empreinte reste exploitable. Conserver le rectangle et remplacer uniquement son contenu par un placeholder neutre ; enregistrer domaine, statut réseau, dimensions et `externalEmbedUnavailable: true`. Vision analyse exclusivement sa fonction spatiale. Ne bloquer que si la structure/layout de la zone devient indéterminable ; conserver les autres gates et protections réseau.

### Validation des images et budgets de capture

Politique propre à StructuralReference ; les limites Portfolio par défaut restent inchangées. Pas d'exception par domaine.

| Ressource / enveloppe | Plafond |
| --- | --- |
| Une image | 32 MiB |
| Toutes les images | 128 MiB |
| Document de navigation | 4 MiB |
| Un script, style, font ou autre asset | 8 MiB |
| Un fichier vidéo ou média | 32 MiB |
| Tous les médias vidéo | 64 MiB |
| Toutes les ressources hors images, vidéos incluses | 80 MiB |
| Total par capture | 208 MiB |
| Requêtes uniques / téléchargements simultanés | 160 / 12 |

32 MiB permet une photo de 23 594 708 octets (22,5 MiB) avec environ 42 % de marge. L'enveloppe images de 128 MiB permet plusieurs photographies HD sur une longue page, sans ouvrir un téléchargement illimité. Les vidéos utilisent une enveloppe séparée : 32 MiB par fichier et 64 MiB par capture, adaptée aux cinq vidéos de Salterra observées (environ 62 MiB au total). Toutes les ressources non images restent plafonnées à 80 MiB, et le transfert total à 208 MiB par capture. Les enveloppes restent bornées en transfert et en cache par capture, avec contrôle pendant le flux et rejet anticipé d'un Content-Length excessif. Les requêtes qui attendent une partie de quota déjà réservée attendent la fin des téléchargements en cours ; elles ne sont rejetées que lorsque le budget réellement consommé laisse insuffisamment de place. La page principale reste limitée au domaine saisi ; les sous-frames intégrées peuvent charger un domaine public après validation DNS et chaque redirection est revalidée. Les protections contre localhost, les IP privées, les endpoints metadata et les protocoles non HTTP(S) restent actives.

Les URL identiques (fragment ignoré, paramètres conservés) et leurs destinations de redirection sont mises en cache, y compris les requêtes simultanées et les échecs : aucun nouveau transfert à chaque viewport. Les trackers identifiés et pixels de tracking usuels sont refusés. Les images ont priorité dans la file devant les médias optionnels ; elles ont une réserve indépendante des scripts/styles/fonts/tiers. Le navigateur conserve son lazy-loading normal. Les ressources invisibles potentiellement nécessaires plus tard ne sont pas supprimées arbitrairement. Les captures structurelles disposent de 120 s (au plus 180 s pour la visite complète) ; le budget précédant de 75 s terminait certains parcours de 11–12 kpx avant leurs cinq échantillons de validation. La durée supplémentaire ne modifie aucun critère de couverture ou d’image.

Le gate contrôle la source **active** (`currentSrc`, sinon attribut `src` non vide), après attente bornée et nouvelle inspection du DOM. Il ne lit jamais `img.src` pour un attribut vide et ne teste pas les sources alternatives inactives de `<picture>`. Il tient compte du display, visibility, content-visibility, opacité cumulée, dialog/details fermé, clipping des conteneurs, clip-path dégénéré, dimensions rendues et intersection avec le viewport réellement parcouru. Les pixels, images hors viewport et branches invisibles ne bloquent pas. Les grandes images visibles sont attendues puis décodées ; les backgrounds CSS rendus et les vidéos visibles sans frame ni poster valide sont également contrôlés. L'échec réseau d'une iframe tierce ne bloque pas à lui seul la capture si sa boîte DOM reste mesurable : son iframe garde son rectangle et ses dimensions, son document est remplacé en local par un placeholder neutre, et `localMetadata.externalEmbeds` enregistre son domaine, son statut réseau et sa géométrie. Vision reçoit l'instruction de n'analyser que le rôle spatial de cette boîte, jamais son apparence interne. Les images invisibles/clipées sont exclues du contrôle de stabilisation. Une transition réelle dispose d'une attente maximale d'environ quatre secondes, avec le même critère de stabilité et le budget de capture structural de 120 secondes.

Une image importante absente reste bloquante. Une limite réseau sur sa source active produit `structural_media_budget_exceeded`, avec URL, taille détectée, plafond et catégorie ; le message explicite est conservé dans `lastError` et aucune analyse/upload n'est lancé. Les captures et analyses précédentes restent intactes. `resourceUsage` dans le résultat local de capture donne les octets transférés, dont images, ressources hors images et médias, les requêtes uniques et les hits de cache ; aucun texte/HTML supplémentaire stocké en Mongo.

Modèle : `OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL` (configuration partagée, défaut `gpt-6-luna`). Un seul appel `/responses` et aucun retry automatique. `continuous` : quatre `input_image`, `visionOverview` en `low`, trois vues locales en `high` ; `desktop_full` n'est pas transmise. Sampled v2 conserve ses six entrées historiques. Sampled v3 : une macro `low` et zéro à cinq vues locales, six images maximum, jamais `desktop_full`. Structured Output strict, timeout 120 s, `store:false`. Seuls les WebP préparés et stockés sont transmis. Aucun appel n'a lieu dans le benchmark local.

Le prompt analyse exclusivement une **grammaire spatiale** : grilles, axes, asymétrie, vide, proportions, masses, images, viewport, superpositions, débordements, changements d’échelle et continuité. Il exclut l’identité graphique, la palette de marque, les logos, le contenu commercial et les textes à copier. La typographie est traitée par échelle et placement. Le contenu source est une donnée, pas une instruction.

Toutes les propriétés de `analysis` sont obligatoires et les propriétés supplémentaires refusées :

- `overview` : synthèse spatiale.
- `layoutProfile` : compositionModel, gridStrategy, widthStrategy, alignmentSystem, whitespaceStrategy, densityStrategy, asymmetryLevel, viewportUsage, layering, overflowBehavior, imageBehavior, typographyPlacement, sectionTransitionLogic, rhythmLogic.
- `rhythmSequence` : 1–18 objets ordonnés, un par moment, avec ordre, plage approximative 0–100 %, climat, changement de densité, organisation texte/image, respiration, composition et transitions entrante/sortante. Pas de variété artificielle imposée.
- `sparseMomentsJustification` : chaîne vide normalement ; justification factuelle obligatoire si une page de plus de quatre viewports ne comporte réellement que 1–2 phases distinctes.
- `structuralMoments` : champs spatiaux précédents conservés, plus `evidence` (vues source, plage approximative, observation concrète). Un moment n’est pas une section React.
- `signatureStructuralMoves` : jusqu’à six gestes caractéristiques.
- `transferablePrinciples` : liste courte transposable à un autre secteur.
- `avoidCopying` : layout exact, branding, logos, textes, illustrations propriétaires, motifs et signatures trop reconnaissables.
- `suitableFor`, `avoidWhen` : contraintes de composition et de lecture.

Pour une page longue, la validation exige une progression couvrant début/milieu/fin sans plage importante omise. En v2, la provenance locale distribuée reste exigée. En v3, le storyboard peut assurer cette provenance macro ; aucune vue locale milieu/footer n'est forcée. Tout crop cité doit intersecter le moment décrit ; une citation macro doit intersecter un panneau enregistré. Une analyse pauvre reste rejetée sans remplacement de l'analyse précédente ni retry. Les anciens résultats restent lisibles.

### Géométrie et conservation des réponses reçues

La convention de sortie est `pagePercent = 100 * absoluteY / captureCoverage.totalHeight`. Le pourcentage de scroll disponible (`absoluteY / (totalHeight - viewportHeight)`) est une information de parcours différente. Les labels transmettent `scrollY`, `viewportHeight`, `visibleRangePx` et `approximatePagePercent`, calculés depuis `capture.sourceRect` enregistré. Le validateur convertit la plage du moment en pixels et vérifie son intersection avec la plage réelle de chaque vue citée ; tolérance conservée de 2 points de hauteur totale pour l'arrondi. Les noms des vues sont des identifiants, pas des positions imposées. Les preuves obligatoires de début/milieu/fin sont choisies à partir de la géométrie réelle des captures. Une vue sampled sans géométrie enregistrée est refusée ; aucun emplacement n'est inventé à partir de son nom. Les anciennes vues continuous restent compatibles.

Chaque analyse crée un `StructuralAnalysisAttempt` séparé de la référence active, avant l'appel payant. La réponse OpenAI complète (avec le texte JSON exact dans `output`) est sauvegardée en `rawResponse` et statut `received` **avant parsing/validation**. Le checkpoint conserve l'instantané des captures et de leurs métadonnées, puis `parsedResult` si disponible. Un rejet devient `validation_failed`, avec erreur, champ et géométrie du rejet lorsqu'applicables ; il ne remplace pas l'analyse active. Un log `structural:validation_failed` donne generationId/referenceId et les détails mécaniques, sans clé API ni JSON complet.

Les nouveaux checkpoints conservent aussi `captureSnapshot.visionInput` : ordre exact des identifiants envoyés, URLs, rectangles source, viewport, géométrie absolue, rôle de lecture et niveau `detail`. Un constructeur pur partagé alimente le prompt, le schéma strict limité aux seules vues effectivement envoyées et la validation. Les rôles locaux n'attribuent aucune région depuis leur nom ; les preuves sont résolues par identifiant et rectangle réel. Un manifeste incohérent avec ses captures est refusé avant l'appel. Les anciens attempts sans manifeste restent retraitables depuis leurs captures originales, sans renommage ou migration de leurs preuves.

Une nouvelle analyse sampled ne réutilise plus un cache v2 : elle repasse par la capture/sélection v3 actuelle. Un worker renvoyant encore v2 est refusé avant upload/analyse. Les lots v3 en fallback fixe restent réutilisables au même titre que les lots adaptatifs ; les anciennes captures et analyses demeurent lisibles. Le retraitement d'un attempt v2 ne déclenche jamais cette mise à jour ni une recapture.

Diagnostic confirmé le 6 octobre 2026 : le premier run Tastavents a réutilisé les six images v2 persistées le 5 octobre, pas les observations adaptatives du benchmark. Son crop `middle` est réellement à `[5328, 6228]` sur une page de 11556 px. Une preuve située à 63–74 % (`[7280.28, 8551.44]`) et citant ce crop doit rester rejetée ; aucune nouvelle position ni citation ne peut lui être attribuée pour faire accepter le brut. Le benchmark ne remplace pas les captures persistées.

Routes admin authentifiées, sous `/api/admin/design-lab/structural-references/:id` :

- `GET /analysis-attempts` : liste des tentatives (sans objets volumineux).
- `GET /analysis-attempts/:attemptId` : inspection du brut, de l'instantané et de l'erreur.
- `POST /analysis-attempts/:attemptId/reprocess` : parsing et validation avec le code actuel, puis remplacement de l'analyse active uniquement après succès. **Zéro appel OpenAI, capture ou upload**. Refus si les captures ou leur hauteur/viewport ont changé. Une réponse toujours invalide reste checkpointée ; aucune réparation automatique des valeurs ni retry payant.

La conservation est en Mongo, indépendante du stockage OpenAI (`store:false` inchangé). Les réponses antérieures non checkpointées sont irrécupérables via cette fonctionnalité. Aucun lancement de Vision ni migration n'est nécessaire pour installer le mécanisme. L'interface ne déclenche pas ces actions au refresh.

Modes contrôlés : asymmetricEditorial, fullBleedPhotography, oversizedTypography, layeredPhotography, quietText, contrastPanel, staggeredColumns, collage, functionalMinimal, offsetGrid, viewportEdge, splitUnequal, floatingMedia, wideEditorial, narrowEditorial, typographicStatement, other. Une explication conserve les nuances ; cette liste n’est pas un template.

## Adaptive Structural Observation Selection — implémentée, validation locale avant Vision

### Périmètre et invariants validés

Sélection locale, déterministe et reproductible pour sampled. Aucun appel Vision, embedding, classification artistique ou exception par hostname dans le scoring. Le mode continuous reste indépendant, avec ses quatre entrées Vision et sa master HD non transmise. Sa sélection sampled hypothétique peut être évaluée uniquement en diagnostic local.

### Paramètres et réalisation locale

Le collecteur et le sélecteur sont isolés dans `services/design-lab/structural-observation-selection.js`. Poids et seuil initiaux ci-dessous inchangés pour les cinq références. `GUSTO_STRUCTURAL_SELECTION_THRESHOLD` règle le seuil ; `GUSTO_STRUCTURAL_MACRO_CANVAS_WIDTH/HEIGHT` règlent le canevas conservateur (512 × 512 par défaut). Le quatrième argument de `captureStructuralPage` accepte `selectionConfig` pour les autres paramètres et `onDiagnostic` pour exporter localement les mesures. Le benchmark fige les mêmes valeurs initiales pour les cinq sites.

- Coordonnées DOM arrondies à 0,5 px, score comparé à une précision de 10⁻⁶, ordre stable position/DOM. Aucun hash de screenshot dans la diversité.
- Au plus 6000 nœuds, 384 masses, 768 rectangles de lignes et 64 groupes flex/grid par observation ; au plus 120 panneaux. Douze candidats de limites supplémentaires maximum, répartis dans l'ordre du parcours si la liste dépasse cette borne. Les positions équivalentes/ancêtres aux mêmes limites sont dédupliqués. Les observations du parcours représentent également les changements de géométrie sans landmark propre.
- Les surfaces occupées sont calculées par union rectangulaire exacte. Les lignes sont obtenues par `Range.getClientRects`, avec taille de police numérique ; les branches cachées, sources inactives, pixels techniques et navigation persistante sont exclus. Les groupes flex/grid ajoutent rectangles des enfants et relations de gaps/axes/offsets. Un embed contribue seulement comme boîte.
- Descripteur : grille 8 × 8 texte/image/vide ; quatre masses par type (image, texte, surface, embed), classées par surface décroissante puis y/x/DOM ; quatre groupes flex/grid de même ordre ; slots absents à zéro ; distribution du vide par lignes/colonnes ; huit bins d'échelle relative du texte et proportion de chevauchement. Les différences utilisent les moyennes des écarts absolus avec les poids V documentés.
- L : poids de chaque groupe plafonné à 15 % de la surface du viewport, regroupement texte/image. D : relations > 2 px, au plus 32 par type. Pas de relation fiable → D=0 ; collecte tronquée → fallback.
- Fiabilité : couverture mesurée minimale 85 %, surface inconnue maximale 8 %. Canvas, shadow DOM non décrit, clips non rectangulaires, rotations/skews/perspective non mesurables contribuent à la surface inconnue. Les clips rectangulaires et translations/scales mesurables sont traités géométriquement. Une instabilité bloquée par les gates existants reste une erreur de capture, jamais une réussite via fallback.
- Représentativité : part de hauteur dont les descripteurs sont proches (distance ≤ 0,12), pondérée par les intervalles de parcours ; cadrage : fraction visible des masses principales. Départage : G, représentativité+cadrage, proximité de la zone médiane, position puis ordre DOM. Aucun score additionnel pour le footer.
- Après les ajouts, une passe déterministe d'échanges améliore la somme des gains marginaux et vérifie l'admissibilité des vues facultatives. Les vues facultatives devenues sous le seuil sont retirées. Aucun remplissage à cinq.

- Le parcours complet jusqu'au footer reste obligatoire, avec les gates et budgets actuels.
- Le storyboard macro `low` doit provenir des observations du **parcours complet**, footer inclus, indépendamment des vues locales sélectionnées. Contact sheet segmenté, jamais fausse page continue ; les éléments fixed/sticky répétés restent identifiés comme persistants.
- **De zéro à cinq observations locales complémentaires au storyboard**, jamais un objectif de remplissage. Dans le scénario validé, l'entrée de page reste obligatoire et compte dans le plafond de cinq : puis zéro à quatre ajouts selon le gain. Le cas zéro local relève de la capacité du contrat variable, sans retirer l'entrée obligatoire de ce scénario. Ne jamais additionner « cinq supplémentaires » à la première vue.
- Deux, trois ou quatre observations sont préférables à cinq si elles suffisent. Chaque vue facultative doit dépasser le seuil minimal de gain marginal.
- Milieu et zone finale sont des préférences de couverture/départage, jamais des quotas imposant une vue redondante ou sous le seuil. Le storyboard assure la couverture macro.
- La fenêtre finale indicative représente les derniers 15–20 % de **hauteur réelle de page**, pas du scroll disponible. Aucun slot unique réservé à cette fenêtre ; plusieurs vues peuvent y être sélectionnées.
- Footer = candidat normal : aucun slot automatique, bonus ou pénalité liés à la position terminale. Pré-footer et footer peuvent être retenus ensemble. Le footer Tastavents (photo centrale, masses latérales sombres, rupture d'échelle typographique) illustre une vraie composition à mesurer, pas un résultat à hardcoder.
- Maximum **six images**, un seul appel Vision : storyboard low + au plus cinq vues locales. High réservé au détail nécessaire, pas automatiquement cinq vues high. Aucun retry automatique ni augmentation des enveloppes réseau/capture.

### Candidats et collecte locale nécessaire

Réutiliser le parcours réel après warm-up, nettoyage et stabilisation. Les limites de sections/landmarks donnent des candidats, pas leur valeur. Ajouter des candidats aux changements importants de photographie dominante/texte, largeur contenue/pleine largeur, colonnes/axes, densité, surfaces, superpositions et échelle.

Sans sections propres, agréger les groupes visibles autour des titres, grandes images et conteneurs flex/grid. Dédupliquer les ancêtres imbriqués et positions équivalentes. Les intitulés métier ne déterminent aucun score artistique.

| Donnée | Disponibilité et utilisation |
| --- | --- |
| Position, viewport, sourceRect, longueur et fin atteinte | Déjà disponibles ; unique référence géométrique |
| Rectangles/transformations et stabilité des éléments visuels | Mesurés par le contrôle de motion ; collecte ciblée, insuffisante à elle seule pour le descripteur complet |
| Images actives, visibilité et clipping des ancêtres | Contrôles actuels à réutiliser ; sources inactives et branches cachées exclues |
| Rectangles visibles des autres masses | Collectés via getBoundingClientRect, intersection viewport/clipping et visibilité effective |
| Lignes de texte et échelle typographique | Collectées via Range.getClientRects et computed font-size ; sens du texte inutilisé |
| Gaps, axes, colonnes et chevauchements | À dériver des rectangles visibles regroupés |
| Groupes flex/grid et surfaces | Collectés localement comme descripteurs géométriques, sans CSS brut |
| Transformation viewport → panneau du storyboard | À enregistrer lors de sa construction depuis le parcours complet |

Ces mesures sont collectées pendant le parcours et les visites de candidats, puis utilisées localement. Candidats/descripteurs temporaires et bornés ; pas de HTML, CSS brut, textes complets ni ensemble des observations persistés dans Mongo. Les surfaces sont calculées par union pour ne pas additionner plusieurs fois les mêmes pixels. Pixels techniques, menus fermés et branches inactives sont exclus ; la navbar répétée ne devient pas une différence structurelle. Un placeholder d'embed contribue par sa boîte seulement, jamais par sa couleur ou son contenu.

### Projection et résolution macro

Connaître pour chaque panneau la transformation depuis le viewport source. Deux réductions sont prises en compte : viewport → panneau du fichier storyboard, puis fichier → canevas macro de référence. Ce second canevas est un **paramètre configurable d'évaluation locale conservatrice**, pas une affirmation sur le redimensionnement interne exact d'OpenAI. La largeur globale de 720 px ne suffit pas à estimer la résolution utile d'un panneau dans une grande mosaïque.

```text
s_macro = s_panneau × s_canevas_macro
dimension_macro = dimension_réelle × s_macro
dimension_locale = dimension_réelle × s_vue_locale
```

Mesurer les dimensions/clippings effectivement produits. L'échelle locale vient du fichier préparé, pas du label de la vue. Garder le même storyboard pendant toute une sélection : ne pas modifier la mosaïque au fil des ajouts, sinon la référence macro des scores changerait.

Exemple à s_macro = 0,10 : texte de 32 px → 3,2 px ; image 300 × 400 px → 30 × 40 px ; espace de 20 px → 2 px. Les proportions peuvent subsister alors que les relations fines disparaissent. Ce calcul mesure une disponibilité géométrique d'information, pas sa compréhension par un modèle.

### Scores L / D / V / R / G

Mesures après stabilisation/clipping ; scores entre 0 et 1. **Poids, seuils de résolution, seuil de gain et limites de fiabilité sont des paramètres initiaux à calibrer**, pas des vérités universelles.

#### L — lisibilité supplémentaire

```text
résolution(d, seuil) = min(1, max(0, d / seuil))
gain_élément = max(0, résolution_locale − résolution_macro)
L = moyenne pondérée des gains des éléments pertinents
```

Mesurer la hauteur des lignes rendues pour le texte (seuil initial 12 px) et le plus petit côté visible d'une masse photographique (64 px). Poids fondés sur la surface visible, plafonnés et regroupés pour qu'une multitude de petits textes/icônes n'écrase pas une grande composition ; aucune double comptabilisation via les ancêtres. L mesure la résolution supplémentaire, pas l'intérêt du contenu ni la compréhension d'un texte.

#### D — détail de composition supplémentaire

Mesurer les gaps entre voisins, différences d'axes, intersections de superposition, offsets de colonnes et différences de largeur/hauteur des masses principales. Même fonction résolution/gain, avec seuil initial de 6 px projetés. D = moyenne des gains des relations pertinentes, regroupées par type ; relations nulles/insignifiantes exclues.

Exemple : décalage réel 24 px, macro 2,4 px, local 24 px → gain `1 − 2,4 / 6 = 0,60`. Aucune relation pertinente avec mesures fiables → D = 0 ; collecte inconnue/incomplète → baisse de fiabilité, pas faux zéro rassurant.

#### V — diversité supplémentaire

Descripteur normalisé : cartes d'occupation texte/image/vide sur grille 8 × 8, positions/proportions des masses principales, distribution du vide, échelles relatives du texte et proportions de chevauchement. Chaque différence = moyenne d'écarts absolus entre composantes normalisées. Fixer dans l'implémentation et les fixtures l'ordre des masses et le traitement des composantes absentes.

```text
distance(a,b) =
  0,40 × écart des cartes d'occupation
+ 0,25 × écart de géométrie des masses
+ 0,20 × écart de distribution du vide
+ 0,15 × écart d'échelle et de chevauchement

nouveauté(c,S) = min(distance(c,s) pour s dans S)
perte_macro(c) = (L(c) + D(c)) / 2
V(c,S) = nouveauté(c,S) × perte_macro(c)
```

S = vues locales déjà retenues ; nouveauté = 1 si S est vide. Une composition différente déjà lisible dans le storyboard ne mérite pas automatiquement un sample. Aucun secteur, contenu de photo, nom de section, palette de marque, embedding ou jugement esthétique dans le descripteur.

#### R — redondance

```text
similarité(c,s) = 1 − distance(c,s)
recouvrement(c,s) = longueur(intersection des plages visibles px)
                    / longueur(union des plages visibles px)
R(c,S) = max(0,80 × similarité(c,s) + 0,20 × recouvrement(c,s))
```

Maximum sur S ; R = 0 si S est vide. Des régions éloignées mais géométriquement proches peuvent être redondantes. Le recouvrement seul ne doit pas supprimer une vraie rupture entre compositions voisines.

#### G — gain marginal final

```text
G(c,S) = clamp(0,35 × L(c) + 0,35 × D(c)
             + 0,30 × V(c,S) − 0,30 × R(c,S), 0, 1)
seuil_initial = 0,25
```

Représentativité (part du parcours présentant un descripteur proche) et qualité géométrique du cadrage (masses présentes, peu de coupures accidentelles) départagent les candidats admissibles, sans autoriser une vue sous le seuil. Leurs normalisations sont décrites dans « Paramètres et réalisation locale » et couvertes par les fixtures. Milieu/fin ne doivent jamais annuler le seuil.

### Sélection et arrêt reproductibles

1. Construire candidats fiables et storyboard du parcours complet ; calculer les projections/descripteurs.
2. Conserver l'entrée obligatoire, comptée dans le plafond total de cinq.
3. Calculer G de chaque candidat restant face au storyboard et à S.
4. Ajouter le meilleur **uniquement si G dépasse le seuil configurable**.
5. Recalculer V/R/G après chaque ajout. Arrêter dès qu'aucun candidat ne dépasse le seuil ou à cinq vues locales. Aucun quota de régions ni remplissage.
6. Passe déterministe d'échanges pour améliorer la combinaison, sans ajout sous le seuil ni retrait de l'entrée obligatoire. Pré-footer/footer peuvent coexister ; aucune exclusivité dans la fenêtre finale.
7. Ordonner les vues retenues par position réelle et produire les raisons de sélection/rejet dans le rapport local.

Ordre de collecte, précision des coordonnées, configuration et départages stables : gain, représentativité/cadrage, préférence de couverture entre admissibles, position absolue puis ordre DOM. Aucun identifiant aléatoire de motion, timestamp, hostname ou hash exact d'image utilisé comme score de diversité. Mêmes mesures/configuration → même sélection ; la variabilité du site entre visites est distincte de celle de l'algorithme.

### Fiabilité et fallback fixe

La collecte parcourt également les Shadow DOM ouverts, dans l'ordre composé. Une racine ouverte effectivement décrite ne constitue plus une surface inconnue par principe ; une racine fermée ou non décrite reste inconnue. Le clipping overflow respecte le containing block réel : un descendant absolute/fixed peut échapper à un wrapper intermédiaire de hauteur nulle. Les clips effectifs, rotations, perspectives et limites de fiabilité restent contrôlés.

#### Couches persistantes fixed/sticky

Les identifiants locaux servent uniquement à suivre les mêmes éléments DOM sur le parcours. La géométrie inclut les descendants visibles débordant d'un hôte nul. Confirmation déterministe : au moins trois positions distinctes, rectangle stable à 2 px, au moins 60 % du parcours représenté et 60 % de span. Un sticky limité à sa section ne satisfait pas cette preuve. Les features appartenant à un contrôle périphérique confirmé sont retirées du calcul de diversité/relations ; les surfaces inconnues et la fiabilité restent inchangées.

La déduplication visuelle est limitée aux petits contrôles interactifs périphériques (surface ≤18 %, largeur ≤60 %, hauteur ≤50 %, au plus 128 descendants), sans landmark visible ni média de composition significatif. Header/nav/main/footer/section/article, h1 et rôles navigation/main sont protégés. Un rôle ARIA banner de largeur ≥60 % près du haut reste protégé ; un rôle banner seul n'assimile pas un petit panneau promotionnel en bordure basse à une navbar. Les descendants cachés ne constituent pas une composition visible. Aucun sélecteur de domaine.

Le storyboard et une locale représentative conservent le contrôle. Pour les autres locales retenues, recapture à la même position réelle : géométrie reverifiée, `visibility:hidden!important` temporaire sur les seuls descendants du contrôle, capture puis restauration exacte des propriétés visibility et priorités. Aucune suppression DOM ni modification de dimensions. Les metadata `observationSelection.persistentElements` enregistrent géométrie, couverture, protection, observation représentative, suppressions et refus. Si la preuve ou la recapture échoue, le contrôle reste visible ou la capture est bloquée selon le gate ; aucune couche structurelle n'est supprimée aveuglément.

#### Galeries/carousels animés : stabilisation contrôlée

`structural-animated-components.js` identifie des bandes horizontales/verticales ou slides superposées, avec plusieurs médias rendus, enveloppe de clipping/perspective visible stable et mouvement intérieur continu. Après warm-up normal, jusqu'à cinq mesures espacées de 150 ms contrôlent l'enveloppe à 0,5 px, les tailles de layout, la topologie et les sources. Collecte bornée à 6000 nœuds, 24 composants et 256 descendants par composant. Aucun nom de bibliothèque, classe, sélecteur de site ou interception globale de timers.

Lorsque la preuve est fiable, une feuille CSS locale à la racine DOM/Shadow DOM fige les propriétés de mouvement calculées **dans leur état courant** avec priorité importante ; animations CSS mises en pause, transitions neutralisées dans ce seul composant, Web Animations actives mises en pause. Les écritures JS de transforms peuvent continuer mais ne changent plus le rendu du composant. Ni dimensions, ni display, ni clipping, ni perspective, ni sources ne sont remplacés. Aucun placeholder. Les timers extérieurs continuent.

Le gate visuel existant s'applique à cet état, et une vérification supplémentaire compare tous les rectangles, propriétés de layout/clipping, sources et identités avant/après capture et collecte géométrique. Tout changement invalide le gel. La feuille temporaire et ses attributs sont retirés dans un finally immédiatement après capture/collecte, même en cas d'erreur ; les Web Animations reprennent leur état antérieur. Une enveloppe mouvante, une topologie/source remplacée ou un gel non vérifiable restent soumis au blocage existant.

Une configuration courante représentative suffit ; aucune exploration automatique de slides. Le composant reste dans les screenshots, masses, candidats et storyboard. Le gel impose sampled pour éviter un faux stitch entre phases animées. Les metadata `observationSelection.animatedComponents` enregistrent position, enveloppe, nombre de nœuds, mécanisme de gel et mécanismes détectés (CSS animation/transition, Web Animation, mises à jour inline/calculées). Stabiliser une galerie 3D ne rend pas sa perspective fiable pour le scoring : le fallback fixe peut rester nécessaire. Poids, seuils et protections réseau inchangés.

Fallback vers la sélection actuelle 0/20/50/80/100 % **du scroll disponible** si les mesures ne sont pas fiables : géométrie/projection inconnue, couverture insuffisante des masses visibles par les descripteurs, canvas ou transformations non mesurables, instabilité persistante. Centraliser/tester les limites de fiabilité et donner une raison explicite du fallback dans le rapport.

Gains faibles mais fiables → moins de vues, **pas fallback**. Aucun fallback ne relâche les gates, budgets, SSRF ou stabilité. Une capture invalide reste bloquée ; aucune réussite forcée ni appel Vision pour résoudre le diagnostic.

### Intégration et compatibilité

Ces adaptations sont désormais intégrées ensemble, sans refonte du pipeline sécurisé :

- collecte bornée des candidats/descripteurs et storyboard indépendant du parcours complet ;
- identification des observations indépendamment de leur position/nom ;
- `coverageIsComplete` : nombre variable de vues, preuve de fin depuis parcours/storyboard, stabilité de chaque vue locale ;
- préparation/stockage/affichage/entrées Vision variables, tout en lisant les anciennes captures ;
- provenance Vision : intersection avec géométrie réelle conservée, mais plus d'exigence forçant un détail local milieu/footer sous le seuil ; storyboard cité seulement pour ce qu'il montre effectivement ;
- politique low/high selon le détail nécessaire, six images maximum.

Pas de refonte des rubriques d'analyse spatiale, de changement des modèles OpenAI, ni d'effet sur DesignReference, Portfolio, existingWebsite ou les moteurs artistiques. Ne pas réparer artificiellement les raccords d'une page animée pour lui imposer continuous. Les checkpoints et le retraitement gratuit sont conservés.

### Benchmark local AVANT Vision payante

Comparaison visuelle **Tastavents / Salterra / Gucci Osteria / Amici / Khufu’s (`https://khufusbistro.com/`)**, avec le pipeline réel, uniquement en diagnostic local : zéro OpenAI, Mongo/Cloudinary sans écriture. Aucun nouveau run Vision avant validation locale explicite du benchmark comparatif par l'utilisateur.

Pour chaque site : ancienne et nouvelle sélection côte à côte, storyboard final et footer atteint, positions/plages absolues, dimensions projetées, L/D/V/R/G et paramètres, candidats retenus/écartés avec raisons, fiabilité et fallback éventuel. Rejouer sur les mêmes mesures enregistrées pour prouver la reproductibilité ; conserver captures/rapports localement.

Cas à examiner : ruptures intérieures/Espacio Singular et footer Tastavents, médias volumineux Salterra, progression complète Gucci, motion Amici sans fausse continuité. Ces cas servent au benchmark ; aucune liste de résultats par domaine dans le sélecteur.

Critères d'acceptation de cette phase :

- Au plus cinq vues locales + une macro low, six images maximum, un appel Vision et aucun retry ; arrêt sous cinq prouvé par fixtures.
- Aucun candidat facultatif sous le seuil retenu pour couvrir une région ; scores explicables/déterministes et projection réelle testée.
- Paramètres calibrables ; footer/pré-footer peuvent coexister sans bonus ni pénalité terminale.
- Fallback expliqué seulement si mesures non fiables, jamais pour simples gains faibles ; aucun contournement d'un gate.
- Géométrie absolue, anciennes captures, conservation des réponses rejetées et retraitement sans OpenAI préservés.
- Cookies/popups/images/embeds, stabilité, budgets réseau et SSRF inchangés ; autres bibliothèques/moteurs artistiques inchangés.
- Tests existants/nouveaux verts et benchmark des cinq sites inspecté/validé localement **avant autorisation Vision**.

### Fichiers de référence

- `docs/STRUCTURAL_REFERENCES.md` : présente spécification et séparation actuel/futur.
- `services/design-lab/structural-page-capture.service.js` : parcours, modes, storyboard, positions fixes et quality gate.
- `services/design-lab/capture-image-visibility.js`, `capture-sanitization.service.js`, `popup-sanitization.service.js` : visibilité, consentements/popups, embeds.
- `services/design-lab/portfolio-capture.service.js`, `structural-resource-policy.js` : transport sécurisé et budgets.
- `services/design-lab/structural-reference.contract.js`, `structural-reference.service.js`, `openai.service.js` : géométrie, préparation des vues, entrée Vision et checkpoint.
- `models/structural-reference.model.js`, `structural-analysis-attempt.model.js`, `routes/admin/design-lab-structural.routes.js` : stockage, inspection/retraitement.
- `tests/design-lab-structural*.test.js`, `design-lab-capture-sanitization.test.js`, `design-lab-portfolio.test.js` : fixtures/mocks actuels.
- Avant adaptation UI : `client/src/components/dashboard/admin/sites/structural-reference.component.js`, `structural-capture-display.js` (depuis la racine gusto-manager).

## API / admin

Routes protégées par authentification et rôle admin, sous `/api/admin/design-lab/structural-references` : liste GET, création/capture/analyse POST, détail GET `/:id`, édition PATCH `/:id` (titre/tags manuels/active uniquement), réanalyse POST `/:id/analyze`, suppression DELETE `/:id` avec nettoyage des captures appartenant à la référence.

La création et la réanalyse répondent après traitement ; l’interface attend jusqu’à 10 minutes et affiche un état réel sans pourcentage. Une référence avec une erreur de capture/Vision reste consultable. Le polling utilise uniquement GET ; aucun appel payant n’est relancé automatiquement. Un verrou client et le verrou serveur empêchent les doubles déclenchements d’analyse.

Admin : Design Lab → Références structurelles. Liste avec preview, domaine, tags manuels, statut, activation, réanalyse et suppression. Détail avec le type de capture et ses vues ouvrables en pleine définition ; en continuous, la master globale est affichée une seule fois avec les dimensions de sa dérivée Vision, profil en champs lisibles, séquence de rythme et cartes de moments, principes et précautions de copie.

## Vérification sans crédits

`node --test tests/design-lab-structural-selection.test.js tests/design-lab-structural.test.js tests/design-lab-structural-images.test.js tests/design-lab-capture-sanitization.test.js tests/design-lab-structural-page-capture.test.js tests/design-lab-portfolio.test.js` : sélection/projection/répétabilité/fallback, vues variables, contrat/service/checkpoint/retraitement, budgets/images/embeds, nettoyage, scrollers et gates. Les fixtures Chrome sont locales avec réseau bloqué ; Mongo, Cloudinary et OpenAI sont mockés.

`node scripts/benchmarkStructuralSelection.script.js diagnostics/structural-selection all` : capture réelle des cinq sites, sans OpenAI/Mongo/Cloudinary. Cette commande sert à régénérer les sorties locales ; elle n'est pas exécutée lors d'un nettoyage. Le script interdit les imports de ces services et les requêtes HTTP autres que GET/HEAD ; il réutilise le transport sécurisé existant. Il génère les mesures rejouables, 20 rejeux identiques, tous les scores/dimensions/projections/raisons, les images de chaque candidat, les storyboards, les planches comparatives PNG et un index HTML local. La sélection fixe et l'adaptive utilisent les observations d'une même visite pour limiter le biais de variabilité entre chargements. Les arguments facultatifs de snapshot nécessitent des fichiers explicitement fournis : le cinquième argument permet une comparaison contrefactuelle avec un ancien collecteur/sélecteur sur les mêmes positions et le même storyboard, sans prétendre rejouer l'ancien pipeline de stabilisation. Aucun snapshot de benchmark n'est nécessaire au produit. Pour les sites continuous, la macro de production inchangée est conservée séparément et la comparaison adaptive est explicitement diagnostique.

### Décisions conservées du benchmark local du 5 octobre 2026

Les cinq références ont été capturées et inspectées jusqu'à leur fin, avec au plus cinq observations locales et un storyboard low-res. Les poids L=0,35 / D=0,35 / V=0,30 / R=0,30 et le seuil strict G>0,25 sont restés identiques pour tous les sites. Aucune règle par domaine ni bonus/pénalité de footer. Aucun appel OpenAI/Vision, aucune écriture MongoDB/Cloudinary.

| Référence | Hauteur px | Positions locales px | Résultat | Répétabilité |
| --- | --- | --- | --- | --- |
| Tastavents | 11556 | 0, 3924, 10530 | adaptive, 3 locales | 20/20 |
| Salterra | 11800 | 0, 2180, 8461, 9360, 10530 | adaptive, 5 locales | 20/20 |
| Gucci Osteria | 5212 | 0, 862, 2156, 3450, 4312 | fixed_fallback : insufficient_measured_coverage | 20/20 |
| Amici | 4429 | 0, 706, 1765, 2823, 3529 | fixed_fallback : unmeasurable_canvas_clip_or_transform | 20/20 |
| Khufu's Bistro (`https://khufusbistro.com/`) | 7283 | 0, 1277, 3192, 5106, 6383 | fixed_fallback : unmeasurable_canvas_clip_or_transform | 20/20 |

20/20 signifie vingt exécutions du sélecteur sur les **mêmes mesures enregistrées**, pas vingt visites de sites vivants. Ces positions et hauteurs sont des résultats observés à cette date, jamais des fixtures de production ni des positions imposées par domaine. Vidéos, widgets et contenu peuvent varier entre visites et entre une capture brute et une recapture locale ultérieure à la même position.

Trois correctifs génériques ont été confirmés :

- **Clipping et collecte composée.** Les images Tastavents réellement peintes hors d'un wrapper overflow de hauteur nulle étaient absentes des mesures. Respecter leur containing block et décrire les Shadow DOM ouverts corrige l'information géométrique sans modifier le scoring ni traiter une perspective inconnue comme fiable. Aucun nouveau descripteur artistique n'a été nécessaire sur ce benchmark.
- **Contrôles persistants.** Le panneau Salterra est porté par un hôte Shadow DOM ouvert de taille nulle ; son emprise visible mesure 525 × 270 px, poignée incluse, à x=0/y=585 pour un viewport 1440 × 900. Couverture et span de persistance : 100 %. Il reste dans le storyboard et une locale représentative ; les quatre autres locales sont nettoyées temporairement avec restauration. Son rôle ARIA banner périphérique ne doit pas être assimilé à une navbar. Le header de 1440 × 135 px reste protégé partout. Les critères de déduplication restent géométriques et sémantiques, sans sélecteur de ce widget.
- **Galeries animées.** Le même gel contrôlé préserve la galerie Tastavents (transitions CSS/écritures inline) et la galerie 3D Khufu's (écritures inline), avec enveloppe, sources, rectangles et layout vérifiés puis restauration. Le baseline strict Khufu's était bloqué par l'autoplay ; la capture finale conserve la vraie galerie, sans placeholder. Son enveloppe mesure 1440 × 388,78 px pour 56 nœuds ; sa perspective continue de justifier le fallback. Une animation non identifiable ou non neutralisable proprement reste soumise au gate existant.

Pour Tastavents, le contrefactuel sur la même visite sélectionnait 0/3924/7605 px avec les anciennes mesures, contre 0/3924/10530 après correction. Le faux gain à 7605 passe de 0,3758 à 0,1737 lorsque les photos sont correctement décrites. Le gain à 10530 passe de 0,2407 à 0,2898 : L/D inchangés, V passe de 0,1090 à 0,1774 et R de 0,6484 à 0,5532. La composition pré-footer/footer franchit le seuil générique ; elle n'est pas forcée. Les masses typographiques à 5850, galeries à 6435/7020 et réservation à 9360 restent dans le storyboard ; leurs gains finaux respectifs 0,2074 / 0,1666 / 0,1238 / 0,2174 ne justifient pas de locale supplémentaire. Après sélection de 10530, la vue terminale 10656 est redondante (R=0,8556, G=0,1422).

Les fallbacks Gucci et Amici conservent leurs cinq positions historiques : limites normales, aucune régression confirmée sur les cinq références. Gucci possède un candidat à 3310 px avec couverture 0,8333, sous la limite de 0,85. Amici conserve des surfaces inconnues importantes dues aux rotations/perspectives, jusqu'à 100 % du viewport, au-dessus de la limite de 8 %. Stabiliser une animation ne rend pas ces mesures adaptatives fiables. Les variations temporelles de vidéo ou de témoignage ne sont pas attribuées au masquage des contrôles.

Validation locale effectuée le 5 octobre : **734/734 tests backend réussis**, aucun échec ni test ignoré, et build manager réussi (165 pages). Avertissements non bloquants du build : téléchargement Google Fonts indisponible, données Browserslist anciennes. Aucun lancement Vision n'est autorisé par ce résultat historique.

Le 6 octobre 2026, les six dossiers locaux `server/diagnostics/structural-selection-*` ont été supprimés après conservation de cette synthèse. Ils contenaient uniquement captures, planches, mesures/rapports JSON, HTML et copies de sources/garde propres aux benchmarks ; aucun service ni test du produit ne dépend de ces fichiers. `server/diagnostics/` est ignoré par Git et réservé aux sorties locales reproductibles. Le script de benchmark, les services, tests, documents permanents, données StructuralReference et réponses Vision conservées restent indépendants de ces sorties. Le nettoyage ne rejoue ni benchmark, ni test, ni build, et ne modifie pas le comportement du pipeline.
