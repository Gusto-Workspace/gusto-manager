# Références structurelles

## Périmètre

`StructuralReference` est une collection indépendante. `DesignReference` décrit un langage visuel ; la référence structurelle décrit la composition spatiale et la progression verticale d’une page, indépendamment du secteur d’origine.

Cette bibliothèque n’est consommée par aucun moteur actuel : Directions, Brand System, Visual System, Style Frame et Homepage restent inchangés. Aucune relation avec `SiteProject`, le Portfolio ou `existingWebsiteContext` n’est ajoutée.

**État courant, 6 octobre 2026 :** le séquencement Phase A + cinq fixes + registre de fiabilité v1 est désormais le pipeline normal de capture utilisé par `Analyser / Réanalyser`. La bascule ne lance aucun appel Vision ; aucune nouvelle exécution payante n'est autorisée par cette validation. Les anciennes captures restent lisibles et retraitables sans migration ; continuous reste indépendant.

**Nettoyage du 7 octobre 2026 :** le mode temporaire `structural-platform-validation` est retiré de l'application. Le démarrage ordinaire (crons et écoute du serveur) est celui de `develop`, avec les trois routes Design Lab et le recovery Khufu conservés. Le pipeline produit, les diagnostics passifs B1 et le dry-run local autonome restent inchangés. Les comptes rendus de validation plateforme ci-dessous sont historiques.

**Correction transport du 8 octobre 2026 :** les nouvelles tentatives StructuralReference utilisent Responses background, avec `store:false`, un checkpoint avant création et un suivi par le même `response.id`. Le timeout synchrone Vision de 120 s décrit dans les validations historiques est remplacé par des délais distincts : création 30 s, récupération HTTP 15 s, suivi global 9 min. Aucun retry de création ni fallback synchrone. Les captures, contrats artistiques V1/V2 et règles de validation restent inchangés. La validation présente est hors ligne ; aucune nouvelle analyse réelle n'a été lancée. Voir [correction et limites](STRUCTURAL_VISION_BACKGROUND.md) et [plan de reprise A/B non autorisé](STRUCTURAL_B1_AB_RESUME_PLAN.md).

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
4. Choix de stratégie après parcours complet et les cinq contrôles fixes post-parcours inchangés. Sans motion structurelle détectée : `continuous`, reconstitution PNG et cinq vues habituelles. Avec transformations dépendantes du scroll : `sampled`, storyboard du parcours complet, registre de fiabilité v1 et sélection de zéro à cinq observations locales sur Phase A + cinq fixes (entrée obligatoire par défaut). Registre `unreliable`/`unproven` ou mesures insuffisantes : cinq fixes déjà validées, avec raison explicite. Aucune tournée facultative de candidats et aucune FULL PAGE stitchée en sampled. Les seules recaptures finales concernent la fraîcheur des locales Phase A et le nettoyage persistant déjà prévu, avec les gates existants. Gates, stabilisation et transport restent identiques. Les WebP sont encodés avec Sharp existant puis uploadés dans `Gusto_Workspace/design-lab/structural-references/<id>/`.
5. Captures sauvegardées avant l’analyse. Un seul appel Vision structuré avec quatre images en `continuous`, une à six en sampled v3. Aucun appel Vision pendant l'implémentation/benchmark local ; validation utilisateur nécessaire avant toute exécution payante.
6. Validation du contrat et remplacement de l’analyse ; les tags manuels restent conservés.

La réanalyse utilise les captures existantes uniquement si les vues attendues sont disponibles et les preuves de nettoyage/couverture valides. Pour une nouvelle analyse sampled, le lot doit aussi porter `captureCoverage.observationSelection.sequencing = "phase_a_fixed_pool_v1"` ; les lots v2 ou v3 de l'ancienne tournée sans ce marqueur sont recapturés par le pipeline normal. Cette condition ne s'applique pas à la lecture ni au retraitement local d'un attempt conservé. `captureCoverage` v2 conserve ses exigences historiques (cinq rôles en sampled). V3 sampled prouve la fin et l'absence d'intervalle manquant via les panneaux du storyboard, indépendamment du nombre de vues locales ; chaque vue locale est stabilisée, identifiée par `observation1`…`observation5` et positionnée en pixels absolus. Les captures anciennes sans preuve, invalides ou bloquées imposent une nouvelle capture avant Vision. Les uploads partiels sont nettoyés ; une erreur Vision conserve les vues et l’analyse précédente valide. Pas de retry Vision automatique, pas de reprise au refresh.

### Séquencement commun au produit et aux diagnostics

`captureStructuralPage` exécute ce séquencement sans option expérimentale. Le registre conserve les preuves de toutes les visites Phase A/fixes, indépendamment de la déduplication ou de la sélection artistique. `reliable` autorise le sélecteur L/D/V/R/G inchangé ; il ne force jamais une décision adaptive si ses propres mesures ou le budget de recapture imposent le fallback. Le budget global de capture reste 120 s, ainsi que les contrôles réseau/SSRF, poids, seuils, tolérances et gates.

La capacité `structural-local-experiment.js`, le verrou rejetant les captures `localExperiment` et la tournée de frontières facultatives sont supprimés. Le collecteur validé devient `structural-reliability.service.js` sans changement de ses critères. Ses codes diagnostiques historiques `shadow_*` restent conservés pour compatibilité. Les détails complets sont retournés dans `captureDiagnostics`, hors metadata du contrat Vision et hors résultat distant d'analyse ; seuls le marqueur de séquencement et les résumés de sélection existants sont conservés dans `captureCoverage`.

Le dry-run local autonome appelle le même `captureAndPrepare`, la même capture et le même builder v3 que le produit. `--experimental-sequencing` est désormais refusé par le script avec indication de retirer ce flag : il n'existe plus de pipeline parallèle à activer. Les renderers locaux acceptent toujours les rapports historiques `localExperiment`, uniquement comme entrées de comparaison offline. Le mode temporaire de validation depuis la plateforme est supprimé ; aucun flag ni champ de requête ne peut l'activer.

Les sections ci-dessous relatant les phases shadow/expérimentales et la première validation plateforme décrivent les états historiques avant cette bascule, pas un mode nécessaire au produit courant.

Fichiers de la bascule (les changements antérieurs du chantier restent conservés) :

| Fichier sous `server/` | Changement |
| --- | --- |
| `services/design-lab/structural-page-capture.service.js` | Séquencement normal unique, registre sur les visites existantes, suppression de la tournée facultative, fraîcheur des locales finales et marqueur de séquencement. Bloc des cinq fixes inchangé. |
| `services/design-lab/structural-reference.service.js` | Même capture/préparation pour produit et diagnostics, retrait du verrou expérimental, recapture des anciens lots sampled sans marqueur lors d'une nouvelle analyse. |
| `services/design-lab/structural-reliability.service.js` | Renommage de `structural-reliability-shadow.js` ; algorithme v1 inchangé, retrait du libellé `shadowOnly`. |
| `services/design-lab/structural-observation-shadow.js` | Import du registre commun pour les comparaisons offline. |
| `scripts/dryRunStructuralReference.script.js` | Séquencement normal sans flag ni collecteur parallèle, garde dry-run conservée. |
| `scripts/renderStructuralLocalSequencingReport.script.js` | Lecture du diagnostic courant et compatibilité avec les rapports historiques `localExperiment`. |
| `tests/design-lab-structural-sequencing.test.js` | Captures Chromium du chemin normal et du chemin enregistré : preuves fixes identiques, pool réel, fraîcheur, défaut SVG et primitive opaque indépendants du scoring. Remplace le test de capacité locale. |
| `tests/design-lab-structural.test.js` | Équivalence produit/dry-run des octets et contrats, migration des lots v3 anciens, acceptation du pipeline normal et conservation du retraitement. |
| `tests/design-lab-structural-reliability-shadow.test.js` | Import du registre renommé ; cas v1 conservés. |
| `services/design-lab/structural-local-experiment.js`, `tests/design-lab-structural-local-experiment.test.js` | Supprimés : capacité d'activation et verrou devenus inutiles. |
| `docs/STRUCTURAL_REFERENCES.md` | État courant, compatibilité et décisions de bascule. |

Aucun changement de cette bascule dans le frontend, les routes, les modèles, le builder Vision, le stabilisateur, le scoring ou la politique Portfolio/réseau. Les boutons et leur endpoint restent les mêmes ; c'est leur service de capture normal qui adopte le séquencement validé.

Validation de la bascule : **776/776 tests backend + 14/14 tests client**, aucun échec ni test ignoré au passage complet final. Syntaxe, chargement des routes, sérialisation Mongoose du marqueur et `git diff --check` vérifiés. Les tests comparent produit/dry-run : mêmes octets préparés, géométries, manifeste, textes, schéma et instructions ; seules les URLs inline/upload mocké diffèrent. Le bloc des cinq fixes, le déplacement du scroller et la stabilisation sont identiques à la source validée avant bascule. Le serveur local a rechargé les fichiers runtime et fonctionne en démarrage ordinaire, sans mode de validation.

Un premier passage parallèle a refusé la stabilisation d'une galerie RAF synthétique (774/775 tests). Ce test a passé isolément, puis dans toute la suite exécutée avec `--test-concurrency=1`, sans modifier gate, fixture, délai ni stabilisateur. La cause précise de ce refus transitoire n'est pas démontrée. Le passage complet final est vert ; il ne remplace pas les validations de sites vivants précédentes. Tous les tests de cette bascule ont utilisé des gardes bloquant les accès distants et des providers/modèles mockés : **0 appel Vision/OpenAI, 0 écriture MongoDB/Cloudinary réelle**. Aucun nouveau clic d'analyse payante ni benchmark distant n'a été lancé.

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

Les URL identiques (fragment ignoré, paramètres conservés) et leurs destinations de redirection sont mises en cache, y compris les requêtes simultanées et les échecs : aucun nouveau transfert à chaque viewport. Les trackers identifiés et pixels de tracking usuels sont refusés. Les images ont priorité dans la file devant les médias optionnels ; leur enveloppe d'octets est indépendante des scripts/styles/fonts/tiers. Cette priorité ne réserve actuellement aucun slot du plafond global de 160 requêtes : l'admission est débitée avant la file de transfert. Le navigateur conserve son lazy-loading normal. Les ressources invisibles potentiellement nécessaires plus tard ne sont pas supprimées arbitrairement. Les captures structurelles disposent de 120 s (au plus 180 s pour la visite complète) ; le budget précédant de 75 s terminait certains parcours de 11–12 kpx avant leurs cinq échantillons de validation. La durée supplémentaire ne modifie aucun critère de couverture ou d’image.

Audit d'admission du 7 octobre 2026 : deux captures fraîches Salterra atteignent exactement 160 requêtes avec la même configuration. Dans l'état dégradé, des images déclarées dès le HTML sont refusées pour `requests` avant le premier gate de parcours ; la couverture mesurée tombe à 0,8 à 8775 px et 0,7777777777777778 à 9945 px, sous le seuil inchangé de 0,85. Dans l'état correctement chargé, ces sources répondent HTTP 200, les témoins correspondants valent 12/12 et 15/15, et les quatre locales 0/2217/9945/11087 sont retenues normalement. Le fallback précédent est cohérent avec ses mesures mais ne démontre pas une non-régression des contenus chargés. Atteindre le footer et passer la preuve pixel ne certifie pas la présence de chaque média déclaré.

Une reconstruction hors ligne conservant toutes les ressources hors sous-frames identifiées a besoin de 148 ou 138 slots selon l'état, consentement et 16 plages vidéo inclus. C'est une preuve de marge potentielle, pas une politique d'admission validée : la provenance utilisée est connue après visite, une sous-frame n'est pas nécessairement non structurelle, et son propriétaire peut être encore caché/non mesurable à sa création. Une réservation d'images seules peut évincer les plages vidéo et les dépendances de consentement ; elle ne doit pas être activée. La piste générique exige un inventaire précoce des obligations de rendu effectivement sélectionnées, incluant initialisation, styles/fonts, images et frame/poster, avec réservation déterministe avant admission des ressources secondaires certifiées. Les sources dynamiques/ambiguës ne doivent pas être supprimées pour obtenir le verdict désiré. Aucun filtre par fournisseur, quota arbitraire, relèvement de 160 ni changement du scoring n'est introduit par cet audit.

Le prototype local de réservation du 7 octobre reste hors du chemin applicatif. Il vérifie l'invariant `requêtes consommées + obligations distinctes encore réservées <= 160`, sans quota fixe : une admission secondaire est refusée si elle entame la capacité réservée. Les URL/paramètres et plages exactes suivent les clés du cache existant ; cache, requêtes en cours et échecs ne recréent pas de slots. Une obligation invalidée avec preuve libère uniquement sa réservation non consommée ; une requête déjà transférée n'est jamais remboursée. Les déclarations non certifiées ne réservent rien, et une demande certifiée dépassant la capacité est explicitement non prouvée, sans choisir arbitrairement les premières sources.

Avec l'inventaire rétrospectif fourni avant le rejeu, le compteur prédit l'admission des treize médias et des seize plages observées dans les deux ordres, à 160 slots. Aucun nouveau chargement de ces médias ni capture de page n'est démontré par ce rejeu. L'union des inventaires comporte 149 obligations : selon l'ordre, une ou onze ne sont jamais demandées et restent réservées sans preuve précoce permettant de les libérer. Le parseur du HTML archivé retrouve les treize déclarations, mais une déclaration lazy n'est pas une preuve de branche sélectionnée et de rôle dans le layout. Ce HTML provient d'une réponse séparée, pas des deux générations exactes ; ses tokens dynamiques ne prouvent pas l'inventaire disponible au moment de leur admission.

La borne vidéo de 2 MiB est un **maximum** par plage, pas une taille minimale ni une garantie de quatre requêtes par vidéo. Le plafond représentatif de 8 MiB n'établit pas le nombre de seeks nécessaires au décodeur. Un test sur la politique inchangée accepte huit petites plages distinctes pour seulement 512 KiB ; réserver uniquement l'URL ou quatre slots ne protège donc pas toutes les obligations possibles. Les futures plages, dépendances d'initialisation/consentement et sources réellement sélectionnées doivent être certifiées assez tôt avant toute activation de cette admission. Le prototype ne satisfait pas encore cette preuve : aucune réservation runtime, blacklist, hausse de plafond ou nouveau lot de validation des sept sites n'est activé sur cette base.

Le gate contrôle la source **active** (`currentSrc`, sinon attribut `src` non vide), après attente bornée et nouvelle inspection du DOM. Il ne lit jamais `img.src` pour un attribut vide et ne teste pas les sources alternatives inactives de `<picture>`. Il tient compte du display, visibility, content-visibility, opacité cumulée, dialog/details fermé, clipping des conteneurs, clip-path dégénéré, dimensions rendues et intersection avec le viewport réellement parcouru. Les pixels, images hors viewport et branches invisibles ne bloquent pas. Les grandes images visibles sont attendues puis décodées ; les backgrounds CSS rendus et les vidéos visibles sans frame ni poster valide sont également contrôlés. L'échec réseau d'une iframe tierce ne bloque pas à lui seul la capture si sa boîte DOM reste mesurable : son iframe garde son rectangle et ses dimensions, son document est remplacé en local par un placeholder neutre, et `localMetadata.externalEmbeds` enregistre son domaine, son statut réseau et sa géométrie. Vision reçoit l'instruction de n'analyser que le rôle spatial de cette boîte, jamais son apparence interne. Les images invisibles/clipées sont exclues du contrôle de stabilisation. Une transition réelle dispose d'une attente maximale d'environ quatre secondes, avec le même critère de stabilité et le budget de capture structural de 120 secondes.

Une image importante absente reste bloquante. Une limite réseau sur sa source active produit `structural_media_budget_exceeded`, avec URL, taille détectée, plafond et catégorie ; le message explicite est conservé dans `lastError` et aucune analyse/upload n'est lancé. Les captures et analyses précédentes restent intactes. `resourceUsage` dans le résultat local de capture donne les octets transférés, dont images, ressources hors images et médias, les requêtes uniques et les hits de cache ; aucun texte/HTML supplémentaire stocké en Mongo.

Robustesse pré-Vision : l'attente locale de décodage conserve son plafond de **5 s**. Si une source visible refusée est encore dans la file ou en transfert du transport partagé, l'orchestration structural attend une seule fois ces promesses existantes, dans le budget de **120 s**, puis repasse le même gate. Aucune nouvelle requête n'est créée par cette attente. Une vidéo sans `currentSrc` est également découverte depuis le premier `<source>` jouable et compatible avec son media query ; une vidéo visible encore sans source demeure pending pendant cette même attente, sans inventer d'URL ni la charger artificiellement. Elle n'est plus omise avant le contrôle strict de frame/poster. Si son initialisation attend encore le chargement du document, seules les dépendances déjà en cours sont attendues. Une image responsive pending dont `currentSrc` n'est pas encore engagé attend les transferts images déjà en cours, puis sa source réellement sélectionnée est redécouverte et contrôlée ; aucune branche `<picture>` inactive n'est téléchargée pour la remplacer.

Une image, une dépendance d'initialisation script/style/font ou une vidéo visible peut bénéficier d'une seule récupération interne de transport après timeout vérifié (`ABORT_ERR` causé par `TimeoutError`), `ECONNRESET`, `ETIMEDOUT` ou `EAI_AGAIN`. Elle reste dans la même promesse de cache, avec au moins les 12 s du plafond de transport disponibles sur les échéances originales. La nouvelle tentative compte dans le plafond de requêtes et tous les octets partiels restent débités des enveloppes. Aucun retry de HTTP refusé, SSRF, budget, annulation volontaire ou décodage cassé. Le second échec est terminal ; la première erreur et l'issue de récupération restent diagnostiquées. **Aucun retry Vision**.

Pour le GET de navigation principal, une récupération de transport est admise uniquement si le signal local a réellement expiré, avant réception de headers et avant toute redirection. La preuve comprend `responseStarted=false`, `signalAborted=true`, `abortReason=TimeoutError`, la cause native `TimeoutError` et `redirectsObserved=0`. Une sous-frame, navigation déjà répondue/redirigée, annulation volontaire ou abort sans preuve reste terminal. Cela ne réexécute pas `page.goto` : la même requête interceptée attend au plus une seconde tentative avant livraison du document à Chromium, dans les délais et plafonds existants. Stage socket/TLS/attente headers et cause d'abort restent diagnostiqués sans remplacer l'erreur native. La trace Khufu historique confirme un abort du transport de 12,003 s, mais n'archive pas son stage précis ; une réponse 200 d'une visite ultérieure ne démontre pas rétroactivement la cause distante.

Certains loaders lazy utilisent un `Image` détaché, attendent son décodage puis affectent `src` à l'élément peint dans un callback frame/idle. Une URL active vide ne signifie alors pas absence de requête : le journal global Gucci montrait un transfert en cours, absent de l'association du gate à cause de cette URL vide. Une déclaration `data-src` sans source/branche picture active peut désormais servir uniquement de clé de correspondance avec une promesse de transfert **déjà engagée par le site**. Elle ne devient ni une source active ni une preuve de décodage, et n'est jamais téléchargée/assignée par le collecteur. Après settlement existant, le même gate redécouvre `currentSrc` et exige les dimensions réellement décodées. Sans requête existante/déclencheur du site, la déclaration reste bloquante. Les tests de route produit couvrent succès après callback IntersectionObserver natif et refus de la simple déclaration non activée.

### Smoke regression du vrai chemin produit pré-Vision

Toute évolution importante de StructuralReference doit être vérifiée par `scripts/smokeStructuralProductPath.script.js --core <dossier-hors-repository>`, après les tests synthétiques. Le noyau comprend Waldhaus, Salterra, Khufu's Bistro, Gucci Osteria, Amici, Tastavents et Castello. Le script poste sur la vraie route Express `analyze`, appelle le `service.run` normal, ses mêmes callbacks de capture/sanitation et la préparation réelle du contrat. Seules les frontières d'authentification de test, de persistance/upload en mémoire et d'envoi Vision sont substituées. Il ne crée aucun mode alternatif runtime et n'importe pas `app.js`.

Chaque visite est fraîche ; les résultats s'arrêtent à `ready_for_vision`, sans analyse artistique ni résultat distant. Des gardes bloquent OpenAI, MongoDB, Cloudinary et les mutations réseau externes. Les captures, manifeste, contrat, preuve d'identité des octets, diagnostics et timings sont enregistrés hors des dossiers surveillés pour éviter un redémarrage pendant le parcours. Le `dryRun` autonome demeure utile, mais ne remplace pas cette preuve d'orchestration route/service complète.

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

### Interruption serveur et expiration des verrous

Pour le benchmark aveugle B1, le serveur local reste en mode produit normal, Vision et persistance compris. L'argument de développement `--structural-product-diagnostics-output=<chemin sous server/diagnostics/>` ajoute uniquement une archive passive `product-run.json` par référence/génération : phases et temps de capture, couverture/hauteur, registre, décision, locales et recaptures, URLs et manifeste exact préparé pour Vision, résultat final ou erreur. Cette archive ne modifie aucun paramètre, aucune décision ni les metadata/prompt envoyés à Vision ; elle ne génère aucune analyse. L'absence de l'argument laisse le fonctionnement inchangé. Les checkpoints locaux sont remplacés atomiquement ; une erreur d'archivage est signalée sans changer le résultat applicatif. Aucun run B1 n'est lancé automatiquement.

Depuis le 7 octobre 2026, les verrous `capturing`/`analyzing` expirés sont réconciliés au démarrage du serveur normal, toutes les minutes, à la lecture des références et avant une reprise manuelle. Le TTL existant de 15 minutes reste inchangé. Une opération encore active dans le processus ou un verrou renouvelé n'est pas interrompu ; les écritures conditionnelles protègent les changements concurrents.

La référence passe en `error`, son verrou est libéré et une tentative encore `running`/`received`/`validated` passe en `failed` avec `interruptedAt` et `interruption.code = STRUCTURAL_OPERATION_INTERRUPTED`. Les captures, leur instantané, l'analyse précédente, le brut, le résultat parsé et les erreurs conservées restent intacts. Une tentative terminale n'est pas réécrite. Une tentative orpheline après libération du verrou est également réconciliée. Le dry-run local autonome reste sans accès distant.

Cette réconciliation ne capture, ne téléverse, ne parse et n'appelle jamais OpenAI. Elle ne transforme jamais une interruption en succès et ne relance jamais automatiquement une analyse. Si une réponse exploitable existe, seul le retraitement explicite existant peut terminer sa validation sans appel payant. Sinon, une reprise manuelle est nécessaire. La création d'un attempt et de son manifeste ne prouve pas l'envoi HTTP à OpenAI ; sans réponse checkpointée ni trace de transport conservée, l'envoi et une éventuelle réception en mémoire restent indéterminés.

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

Les couches certifiées persistantes et non structurelles sont exclues de **tous** les buffers destinés à Vision, dès chaque screenshot : panneaux Phase A composant le storyboard/overview, fixes, locales adaptatives et recaptures finales. Aucune vue représentative commerciale n'est conservée dans l'entrée Vision. Le collecteur artistique et le registre continuent à mesurer le DOM original, avant le masquage temporaire ; leurs poids, règles et verdicts ne changent pas.

Le nettoyage partagé `structural-vision-cleanup.service.js` réutilise les identifiants/géométries et la transaction de visibilité existants, y compris les descendants Shadow DOM ouverts. Il exige une interface périphérique certifiable (sémantique commerciale/widget, interface flottante déclarée ou contrôle de fermeture), protège navigation/header et sticky narratif. Chaque mutation de visibilité et sa preuve de conservation des rectangles, layout, textes, sources médias actives et dimensions s'exécutent dans une même tâche DOM, puis les styles/priorités sont restaurés immédiatement après screenshot. La visibilité masquée est contrôlée avant/après screenshot. Les pseudo-éléments sont masqués par une règle temporaire bornée aux seuls nœuds certifiés, retirée avec leurs attributs après capture. Seules les transitions CSS de la propriété `visibility` provoquées par le masque et sa restauration sont terminées immédiatement ; les autres animations/transitions restent sous le contrôle du pipeline existant. Ce contrôle causal n'ajoute pas un gate global sur les animations autonomes du site ou leur désactivation/rétablissement par le screenshot : les gates de stabilité/gel existants restent inchangés. Le clipping rectangulaire de descendants est vérifié avec leurs vrais containing blocks ; aucun débordement échappé n'est inventé comme clippé. Une couche ambiguë, un refus de masquage, une altération structurelle causée par le masque ou une restauration non certifiable bloque la capture, sans produire d'entrée Vision silencieusement contaminée. Aucun élément n'est supprimé du DOM.

`captureCoverage.visionCleanliness` porte la preuve versionnée `exclude_nonstructural_persistent_v1`. Une nouvelle analyse recapture les lots persistés qui n'ont pas cette preuve, même sampled v3 ; le retraitement local d'un attempt historique reste inchangé. Les détails des couches supprimées restent exclusivement dans `captureDiagnostics.visionCleanup`, avec géométrie, mécanisme et restauration ; ils sont retirés des metadata de composition Vision. La vérification plateforme compare manifeste/contrat/octets préparés et conserve `vision-cleanup.json` local. Les observations historiques mentionnant une locale représentative ci-dessous décrivent l'ancien comportement, désormais remplacé.

Un dialogue de consentement caché peut laisser son backdrop vide peint, avant les screenshots. `structural-consent-backdrop.service.js` traite ce cas **avant le blocking-overlay gate inchangé** : surface fixe vide, association exclusive avec des pairs cachés ayant sémantique de dialogue/région, texte de consentement et contrôle explicite « accepter tout », empilement cohérent. Aucun identifiant, classe, fournisseur ou domaine ne sert de règle. La transaction réutilise les preuves de conservation du layout/sources existantes, inclut les réactions microtask au masquage, contrôle la visibilité pendant les screenshots et restaure exactement le DOM en fin de capture, y compris après erreur initiale. Tout overlay isolé/ambigu ou masquage altérant une source/layout reste bloquant. La preuve détaillée reste dans les diagnostics ; seules complétude et restauration sont jointes à `visionCleanliness`.

Validation du 7 octobre 2026 : le vrai bouton Salterra non payant prépare un storyboard + cinq locales propres en 83,63 s, avec suppression/restauration certifiée du panneau périphérique dans les 27 captures sources et maintien du header structurel. La visite reste en fallback pour couverture 9/11 à 10530 (0,81818 < 0,85), sans modification du registre. Replays frais finaux : Tastavents reliable/adaptive 0 / 10530 en 111,29 s avec une recapture de fraîcheur ; Gucci unproven/fallback cinq fixes en 40,37 s, sans visite à 3310. Suite backend complète : 791 tests verts, y compris les primitives ambiguës, sticky structurels, Shadow DOM, pseudo-éléments, transitions `visibility`, restauration et buffers de tous les modes. Tous les contrats sont préparés uniquement à partir des images certifiées, sans appel Vision ni écriture MongoDB/Cloudinary.

#### Galeries/carousels animés : stabilisation contrôlée

`structural-animated-components.js` identifie des bandes horizontales/verticales ou slides superposées, avec plusieurs médias rendus, enveloppe de clipping/perspective visible stable et mouvement intérieur continu. Après warm-up normal, jusqu'à cinq mesures espacées de 150 ms contrôlent l'enveloppe à 0,5 px, les tailles de layout, la topologie et les sources. Collecte bornée à 6000 nœuds, 24 composants et 256 descendants par composant. Aucun nom de bibliothèque, classe, sélecteur de site ou interception globale de timers.

Lorsque la preuve est fiable, une feuille CSS locale à la racine DOM/Shadow DOM fige les propriétés de mouvement calculées **dans leur état courant** avec priorité importante ; animations CSS mises en pause, transitions neutralisées dans ce seul composant, Web Animations actives mises en pause. Les écritures JS de transforms peuvent continuer mais ne changent plus le rendu du composant. Ni dimensions, ni display, ni clipping, ni perspective, ni sources ne sont remplacés. Aucun placeholder. Les timers extérieurs continuent.

Le gate visuel existant s'applique à cet état, et une vérification supplémentaire compare tous les rectangles, propriétés de layout/clipping, sources et identités avant/après capture et collecte géométrique. Tout changement invalide le gel. La feuille temporaire et ses attributs sont retirés dans un finally immédiatement après capture/collecte, même en cas d'erreur ; les Web Animations reprennent leur état antérieur. Une enveloppe mouvante, une topologie/source remplacée ou un gel non vérifiable restent soumis au blocage existant.

Une configuration courante représentative suffit ; aucune exploration automatique de slides. Le composant reste dans les screenshots, masses, candidats et storyboard. Le gel impose sampled pour éviter un faux stitch entre phases animées. Les metadata `observationSelection.animatedComponents` enregistrent position, enveloppe, nombre de nœuds, mécanisme de gel et mécanismes détectés (CSS animation/transition, Web Animation, mises à jour inline/calculées). Stabiliser une galerie 3D ne rend pas sa perspective fiable pour le scoring : le fallback fixe peut rester nécessaire. Poids, seuils et protections réseau inchangés.

Fallback vers la sélection actuelle 0/20/50/80/100 % **du scroll disponible** si les mesures ne sont pas fiables : géométrie/projection inconnue, couverture insuffisante des masses visibles par les descripteurs, canvas ou transformations non mesurables, instabilité persistante. Centraliser/tester les limites de fiabilité et donner une raison explicite du fallback dans le rapport.

Gains faibles mais fiables → moins de vues, **pas fallback**. Aucun fallback ne relâche les gates, budgets, SSRF ou stabilité. Une capture invalide reste bloquée ; aucune réussite forcée ni appel Vision pour résoudre le diagnostic.

Si le parcours complet et les cinq vues fixes sont déjà valides mais que le budget restant ne permet plus conservativement les observations adaptatives facultatives et la finalisation, arrêter ces observations et conserver le lot fixe : `fixed_fallback`, raison `adaptive_budget_exhausted`. Le storyboard reste issu du parcours réellement validé. Une opération facultative abandonnée pour son allocation de temps n'ajoute aucune image non vérifiée ; les étapes obligatoires et les erreurs de qualité restent bloquantes. Le budget global demeure 120 secondes.

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

Comparaison visuelle **Tastavents / Salterra / Gucci Osteria / Amici / Khufu’s (`https://khufusbistro.com/`)**, avec les primitives de capture produit et des hooks de diagnostic comparatif local : zéro OpenAI, Mongo/Cloudinary sans écriture. Ce benchmark complète le dry-run applicatif partagé décrit plus bas ; il ne le remplace pas. Aucun nouveau run Vision avant validation locale explicite par l'utilisateur.

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

### Dry-run du parcours produit avant Vision

Depuis le 6 octobre 2026, `node scripts/dryRunStructuralReference.script.js https://tastavents.com/ diagnostics/structural-product-dry-run 3` réalise trois visites fraîches consécutives. Le script s'arrête au premier échec, sans retry. Il ne lit aucun benchmark ni aucune capture persistée. Le mode `service.run(null, { dryRun: true, sourceUrl })` entre avant tout accès aux modèles et utilise le même `captureAndPrepare` que l'analyse/réanalyse : transport sécurisé, sanitization, capture complète, stabilisation/gel, gates, sélection adaptive/fallback, storyboard et préparation WebP. Le contrat est préparé par le même `buildStructuralVisionRequest` que l'analyse payante et le snapshot d'attempt.

Le script bloque les frontières OpenAI, MongoDB et Cloudinary avant les imports applicatifs, ainsi que les requêtes autres que GET/HEAD. Il ne démarre pas le serveur ni ses crons et charge uniquement les paramètres opérationnels de capture et le nom non secret du modèle d'analyse depuis l'environnement. Les images préparées sont encodées inline dans le manifeste/requête locale : mêmes octets, identifiants, géométries, rôles, ordre, détail, instructions et schéma ; les URL Cloudinary ne peuvent être produites sans upload. Les WebP, manifestes, requêtes et résultats avec compteurs d'interdiction restent dans `diagnostics/`, ignoré par Git. Aucune persistance ni analyse n'est exécutée après cette préparation.

Un benchmark 20/20 sur des mesures déjà enregistrées prouve le déterminisme du sélecteur, pas la stabilité de vingt visites. Le benchmark comparatif comporte aussi une capture préalable du premier viewport et des callbacks de diagnostic ; il n'établit pas l'identité du timing avec l'UI. La validation avant un nouveau run payant doit donc utiliser les visites fraîches du parcours partagé, sans hooks de benchmark.

Le blocage UI Tastavents signalé vers **07:32 UTC le 6 octobre 2026**, référence `6ac39cff599b9a26b2dc05d2`, n'a pas de trace détaillée retrouvée dans les logs locaux accessibles. Le code de cette version créait l'attempt seulement après capture/upload et ne journalisait pas les rectangles/sources du gel refusé. Son generationId, le composant et les valeurs avant/après ne sont donc pas établis ; aucune attribution à une race condition, un état transitoire ou une différence UI n'est démontrée. Les deux raisons seules ne prouvent pas un remplacement de média : `component_envelope_changed` compare l'enveloppe à 0,5 px ou une limite de taille ; `visible_structure_or_source_changed` couvre aussi l'identité, les rectangles, la topologie et le layout des descendants. Le gate et le gel restent inchangés.

Les nouveaux diagnostics de refus comprennent composant DOM, enveloppes, ancêtres, rectangles/layout/sources des nœuds modifiés, phase et budget restant. Le parcours produit journalise `structural:capture_failed` avec horodatage, référence et generationId même avant la création d'un attempt. Le dry-run conserve automatiquement ces détails dans son résultat local.

Un échec **distinct** a été reproduit à 07:57 UTC : screenshot du candidat facultatif à 8363 px après 120597 ms, soit 597 ms après le budget de 120000 ms, alors que le parcours complet et les cinq captures fixes étaient validés. La garde fixe de 1500 ms admettait une opération plus longue que le temps disponible. L'admission des seuls candidats facultatifs utilise maintenant le coût maximum mesuré d'une opération complète sur la visite courante, avec réserve équivalente pour finalisation et recaptures possibles des contrôles persistants. Les candidats non démarrés et la réserve sont explicités dans `captureCoverage.optionalCandidateBudget`. Si le temps conservativement nécessaire manque, la collecte facultative s'arrête et la sélection devient explicitement `fixed_fallback`, raison `adaptive_budget_exhausted`, avec les cinq vues fixes déjà validées et un storyboard complet. Les délais facultatifs sont bornés pour préserver la réserve ; un timeout de cette allocation peut être abandonné avec restauration du DOM et fallback, sans admettre son image. Aucun délai, poids, seuil, stabilisateur ou gate n'est augmenté ; une capture obligatoire ou une géométrie réellement invalide reste bloquante. Cette cause de timeout n'explique pas rétroactivement le refus animé de 07:32.

Validation applicative finale du 6 octobre, après adoption de ce fallback explicite : **trois visites fraîches consécutives passent**, de 08:06 à 08:12 UTC. Toutes sont `sampled v3 / fixed_fallback`, raison unique `adaptive_budget_exhausted`, avec cinq positions réelles identiques : 0 / 2131 / 5328 / 8525 / 10656 px pour 11556 px de page et un viewport 1440 × 900. Leurs identifiants restent `observation1…5`, sans nom de région implicite ; ces captures neuves ne sont pas une réutilisation v2. Le storyboard complet contient respectivement 31 / 30 / 31 panneaux, selon le nombre de candidats facultatifs effectivement capturables dans le budget. Durées de capture : 114,199 / 111,577 / 113,794 s ; réserves : 5,801 / 8,423 / 6,206 s. Les sources envoyables contiennent six images au maximum, overview low + cinq locales high. Chaque manifeste, prompt, schéma et instruction a été reconstruit à l'identique avec le builder produit ; les octets des images inline correspondent aux WebP préparées. Compteurs interdits : OpenAI 0, MongoDB 0, Cloudinary 0, requêtes d'écriture distantes 0. Ces trois visites ne reproduisent pas le refus animé historique et ne démontrent pas sa cause.

Vérification backend de cette phase : **744/744 tests réussis**, aucun échec ni test ignoré, avec les accès externes bloqués ; chargement des routes StructuralReference et vérification de syntaxe des sources modifiées réussis. Aucun frontend modifié. `git diff --check` passe. Aucun appel Vision n'est lancé après cette validation locale.

### Profiling du parcours produit — 6 octobre 2026

Le dry-run partagé expose un profil **passif** de capture/préparation : phases, opérations, compteurs, temps inclusifs/exclusifs et positions/cibles. `capturePerformance` et `pipelinePerformance` sont hors `captureCoverage`, `localMetadata`, manifeste et contrat Vision. Ces mesures n'alimentent aucune décision, aucun délai ni aucun réglage du sélecteur. Les callbacks du parcours produit restent identiques.

Deux visites témoins fraîches terminent en `sampled v3 / fixed_fallback`, raison `adaptive_budget_exhausted`, à **114,508 / 115,110 s** de capture. Parcours complet : **68,312 / 68,357 s** ; cinq fixes : **16,165 / 16,198 s** ; huit frontières sur douze : **27,426 / 27,809 s** ; storyboard/sélection : **1,117 / 1,236 s** ; finalisation : **0,989 / 1,010 s**. Aucune recapture de couche persistante nécessaire. Préparation des images/contrat mesurée séparément, hors budget de capture. Chaque témoin conserve 31 panneaux et cinq locales neuves aux positions 0 / 2131 / 5328 / 8525 / 10656 px ; contrat, manifeste et octets envoyables reconstruits à l'identique.

Le coût dominant est le nettoyage : **71 contrôles, 53,237 / 53,422 s**, dont 35,5 s nominales d'attentes existantes (200 + 300 ms par passage). Les 35 screenshots comprennent 22 vues de parcours (dont trois au bas pour confirmer la hauteur), cinq fixes revalidées après parcours/lazy-loading et huit frontières supplémentaires. Le storyboard réutilise leurs buffers sans recapture. Les retours au sommet et contrôles répétés sont réels ; leur suppression exige une preuve de réutilisation équivalente des sources/pixels/layout, que la seule égalité des rectangles ou de la hauteur ne fournit pas. Au coût moyen des huit frontières observées, les quatre manquantes représenteraient environ 13,7 s ; cette extrapolation n'est pas un run complet mesuré.

Trois essais de réduction des lectures DOM répétées, sans modifier les critères ou délais, sont refusés à **36,695–37,267 s**, position **6435 px** : `component_envelope_changed` et `visible_structure_or_source_changed`. Le composant mesuré (galerie dans une enveloppe 1440 × 900) est figé, mais son ancêtre de scroll continue sa translation ; l'enveloppe et ses 56 nœuds dérivent verticalement de **0,650–0,692 px**, au-delà de la tolérance existante de **0,5 px**. Identités/nombre/dimensions restent identiques, aucune source média ne change. Le témoin après retrait passe de nouveau. Ces traces attestent ce mouvement lors des essais accélérés ; elles ne prouvent pas rétrospectivement la cause du refus historique à 07:32 UTC.

**Aucune optimisation fonctionnelle retenue** : essais DOM retirés, seule l'instrumentation passive demeure. Aucun changement du gel, des gates, poids/seuils ou budget 120 s ; aucune capture facultative non validée déclarée adaptive. Les trois réussites adaptatives fraîches demandées ne sont pas obtenues ; le replay des cinq références, conditionné à ces réussites, n'est pas lancé. Arrêt après diagnostic local sans présenter une extrapolation comme réussite. Tous les essais gardent OpenAI 0 / MongoDB 0 / Cloudinary 0 / écritures distantes 0. Vérification de l'instrumentation et des mécanismes StructuralReference : **162/162 tests locaux ciblés**, aucun échec ni test ignoré, routes chargées et contrôle de diff réussi ; cette vérification ne remplace pas le replay vivant des cinq références.

`node --test tests/design-lab-structural-selection.test.js tests/design-lab-structural.test.js tests/design-lab-structural-images.test.js tests/design-lab-capture-sanitization.test.js tests/design-lab-structural-page-capture.test.js tests/design-lab-portfolio.test.js` : sélection/projection/répétabilité/fallback, vues variables, contrat/service/checkpoint/retraitement, budgets/images/embeds, nettoyage, scrollers et gates. Les fixtures Chrome sont locales avec réseau bloqué ; Mongo, Cloudinary et OpenAI sont mockés.

`node scripts/benchmarkStructuralSelection.script.js diagnostics/structural-selection all` : capture réelle des cinq sites, sans OpenAI/Mongo/Cloudinary. Cette commande sert à régénérer les sorties locales ; elle n'est pas exécutée lors d'un nettoyage. Le script interdit les imports de ces services et les requêtes HTTP autres que GET/HEAD ; il réutilise le transport sécurisé existant. Il génère les mesures rejouables, 20 rejeux identiques, tous les scores/dimensions/projections/raisons, les images de chaque candidat, les storyboards, les planches comparatives PNG et un index HTML local. La sélection fixe et l'adaptive utilisent les observations d'une même visite pour limiter le biais de variabilité entre chargements. Les arguments facultatifs de snapshot nécessitent des fichiers explicitement fournis : le cinquième argument permet une comparaison contrefactuelle avec un ancien collecteur/sélecteur sur les mêmes positions et le même storyboard, sans prétendre rejouer l'ancien pipeline de stabilisation. Aucun snapshot de benchmark n'est nécessaire au produit. Pour les sites continuous, la macro de production inchangée est conservée séparément et la comparaison adaptive est explicitement diagnostique.

### Shadow du séquencement Phase A / Phase B — 6 octobre 2026

Le séquencement produit reste inchangé : parcours obligatoire, cinq contrôles fixes post-parcours, candidats facultatifs, sélection et livraison. Le dry-run accepte `--shadow` pour conserver, uniquement en mémoire, les buffers/mesures réellement validés pendant le parcours obligatoire. Il ne provoque aucune opération navigateur supplémentaire et ne modifie aucun gate, capture livrée, paramètre ou manifeste. Le shadow est calculé hors capture, après préparation du contrat, par `structural-observation-shadow.js`, avec le sélecteur et le générateur de storyboard partagés. Il ne fournit jamais de données à Vision.

Commande depuis `server` : `node scripts/dryRunStructuralReference.script.js <url> diagnostics/structural-shadow/<reference> 1 --shadow`. Une seule visite fraîche ; gardes OpenAI/MongoDB/Cloudinary/écritures distantes installées avant imports. `node scripts/renderStructuralShadowReport.script.js diagnostics/structural-shadow` rend les cinq dossiers `tastavents/salterra/gucci/amici/khufu`, vérifie contrat/manifeste/octets et produit index, planches PNG et tableaux. Ces noms servent uniquement au rapport ; aucune règle de capture ou sélection par domaine. Les fichiers enregistrés servent au rendu/rejeu déterministe après la visite, jamais comme captures/mesures d'entrée d'une nouvelle visite.

Le pool shadow contient exclusivement les viewports A réellement observés, dédupliqués avec la même règle que le collecteur. Les ancrages non visités ne deviennent pas des candidats. Le storyboard A fournit la projection effective de chaque observation. Les poids et le seuil restent identiques. En fallback, les cinq cibles sont des plans à recapturer en Phase B, sans pixels/mesures/scores inventés. Les aperçus A illustrent l'état du parcours ; ils ne remplacent pas une future recapture finale ni son nettoyage des couches persistantes.

Résultats de cinq visites fraîches, toutes `sampled v3` avec leurs gates actuels valides :

| Référence | Actuel : mode / positions px | Shadow : mode / positions px | Panneaux actuel → A | Capture actuelle / estimation conditionnelle |
| --- | --- | --- | --- | --- |
| Tastavents | fallback budget : 0/2131/5328/8525/10656 | adaptive : 0/10530 | 31 → 20 | 114,64 / 77,33 s |
| Salterra | adaptive : 0/2139/5800/8845/9982 | adaptive : 0/10697 | 35 → 20 | 106,21 / 62,10 s |
| Gucci Osteria | fallback couverture mesurée : 0/862/2156/3450/4312 | adaptive : 0 | 24 → 9 | 68,75 / 28,69 s |
| Amici | fallback géométrie inconnue : 0/706/1765/2823/3529 | même fallback, cinq cibles planifiées | 23 → 8 | 67,73 / 39,08 s |
| Khufu’s Bistro (`https://khufusbistro.com/`) | fallback géométrie inconnue : 0/1277/3192/5106/6383 | même fallback, cinq cibles planifiées | 27 → 12 | 71,00 / 43,90 s |

Les cinq parcours A couvrent haut/milieu/bas sans trou avec trois confirmations de fin. Les cinq panneaux observés les plus proches des cibles passent le vrai prédicat préalable sampled : cinq signatures distinctes et triplet haut/milieu/bas distinct. **L'équivalence complète de qualité n'est pas démontrée** :

- Les cibles fixes restent hors tolérance de 180 px pour Tastavents (209/250 px), Salterra (201/217 px), Gucci (277/184 px) et Khufu (267 px). Aucun panneau voisin n'est prétendu capturé à la cible. Seul Amici satisfait les cinq cadrages/hauteurs.
- Les deux premiers contrôles A de Salterra ont une hauteur différente de 266 px de la hauteur finale, au-delà des 8 px admis pour les contrôles post-parcours.
- Aucun des cinq ensembles A ne fournit cinq revalidations après parcours ni de preuve de conservation croisée des sources/layout après lazy-loading. Une observation stable à son instant ne démontre pas cette conservation.
- Gucci devient adaptive parce que son candidat non fiable à 3310 px n'appartient pas au pool A. Le seuil reste identique, mais cette population différente ne prouve pas une mesure globalement meilleure. Le fallback produit reste légitime.

Tastavents n'a pas observé le cadrage historique 3924 px pendant A ; celui à 4095 px est sous le seuil (G≈0,2258). Aucun cadrage n'est forcé. Les aperçus Salterra conservent le panneau périphérique, identifié/exclu des descripteurs dans les deux sélections ; son nettoyage final exigerait toujours une recapture, incluse une fois dans l'estimation. Les galeries réelles restent visibles, dont la perspective Khufu qui continue à justifier le fallback.

Répétabilité **20/20** sur les mêmes mesures fraîches de chaque visite, pas vingt visites. Les gains estimés de 27–44 s utilisent le profil réellement mesuré et le coût moyen des contrôles fixes pour la livraison proposée ; ils excluent le mécanisme de preuve manquant. Aucune Phase B optimisée exécutée, aucune promesse de gain validé. Les cinq contrats/manifeste/octets produit sont reconstruits à l'identique et restent exempts de shadow. Zéro OpenAI/Vision/MongoDB/Cloudinary/écriture distante. Le séquencement produit reste conservé après ce benchmark. Validation : **749/749 tests backend réussis**, aucun échec ni test ignoré ; routes chargées, syntaxe et `git diff --check` réussis. Aucun frontend modifié par cette phase.

### Shadow conservant les cinq captures fixes — 6 octobre 2026

Après le shadow Phase A seule, une deuxième architecture diagnostique conserve intégralement les cinq captures fixes post-parcours et retire uniquement les candidats issus de visites supplémentaires. Elle reste **hors produit**. `dryRunStructuralReference.script.js` accepte `--shadow-fixed` : le parcours applicatif actuel reste la vérité et s'exécute intégralement ; seulement après sa préparation du contrat, le shadow construit son pool avec les observations du parcours et les cinq fixes réelles. Les fixes les plus récentes remplacent les doublons à une même position selon la règle existante, sans géométrie extrapolée. Toutes les captures de rupture facultatives restent exclues de ce pool. Aucun probe implémenté.

Le sélecteur L/D/V/R/G et ses paramètres sont partagés et inchangés. Chaque `fixedId` du shadow correspond à une capture post-parcours réelle, permettant un fallback sur les cinq buffers déjà validés. Une locale adaptive issue du parcours exige une recapture finale ; une fixe peut être réutilisée, sauf nettoyage persistant nécessaire, diagnostiqué et estimé séparément. Les aperçus shadow restent distincts des captures préparées/envoyables du produit. La simulation ne réalise aucune recapture finale et ne remplace jamais le manifeste actuel.

Commande depuis `server` : `node scripts/dryRunStructuralReference.script.js <url> diagnostics/structural-shadow-fixed-pool/<reference> 1 --shadow-fixed`. Le renderer `renderStructuralFixedPoolShadowReport.script.js` produit les planches, tableaux de pool/scoring/preuves, profils estimés, vérification du contrat et verdict global. Les noms de références servent uniquement à organiser les rapports. Aucun nouvel accès OpenAI/MongoDB/Cloudinary ; sorties reproductibles ignorées par Git.

**L'identité des cinq preuves fixes ne démontre pas la conservation de tous les verdicts de fiabilité.** Gucci le confirme sur une visite fraîche : les cinq fixes aux positions 0/862/2156/3450/4312 px sont conservées, signatures et gates inchangés ; le candidat supplémentaire non fiable à 3310 px (`insufficient_measured_coverage`) est absent du pool parcours + fixes. Le même sélecteur produit alors adaptive au lieu du fallback actuel. Ce défaut était détecté dans un candidat de rupture, pas dans les cinq contrôles fixes. Aucun seuil n'est modifié et aucune règle par domaine ne force son fallback.

Le benchmark distingue explicitement l'équivalence de preuve des cinq contrôles (`scope: five_fixed_control_evidence_only`) et la conservation du fallback de mesure. La condition de cohérence globale échoue si un fallback lié à la mesure disparaît. Un fallback de budget retiré avec la tournée facultative constitue un cas différent. La mesure du séquencement optimisé est conditionnée à cette cohérence : elle n'est pas exécutée lorsque Gucci perd son fallback. Les estimations ne sont jamais présentées comme des temps optimisés mesurés. Aucun basculement produit autorisé par ce shadow.

Le benchmark consolidé est terminé sur les cinq références. Tous les runs actuels sont frais, `sampled v3`, avec contrat/manifeste/images préparés vérifiés à l'identique et gardes OpenAI/MongoDB/Cloudinary à zéro. Les vingt répétitions par référence portent sur les mêmes mesures, pas sur vingt visites. Les cinq preuves fixes restent identiques pour chaque référence.

| Référence | Décision actuelle → shadow | Pool parcours + fixes | Locales proposées px | Capture actuelle / estimation shadow |
| --- | --- | --- | --- | --- |
| Tastavents | fallback budget → adaptive | 23 | 0 / 10530 | 113,91 / 89,79 s |
| Salterra | adaptive → adaptive | 23 | 0 / 2180 / 9945 / 10900 | 107,59 / 78,87 s |
| Gucci Osteria | fallback couverture → adaptive, **preuve perdue** | 12 | 0 | 69,08 / 36,71 s |
| Amici | fallback géométrie inconnue conservé | 11 | 0 / 706 / 1765 / 2823 / 3529 | 68,19 / 39,30 s |
| Khufu's Bistro | fallback géométrie inconnue conservé | 15 | 0 / 1277 / 3192 / 5106 / 6383 | 71,05 / 43,76 s |

Seules 10530 pour Tastavents et 9945 pour Salterra nécessiteraient une recapture de fraîcheur ; les autres locales proposées disposent déjà d'un buffer fixe post-parcours. Salterra exige en plus trois nettoyages persistants, inclus séparément dans l'estimation ; ses aperçus shadow bruts ne sont pas présentés comme déjà nettoyés. Aucun temps du nouveau séquencement n'est mesuré et les estimations n'incluent pas un futur mécanisme de conservation des preuves.

Une visite actuelle Gucci supplémentaire, instrumentée uniquement pour enregistrer les cellules du contrôle existant, reproduit le défaut à 3310 px. Un point de signal à x=810/y=618,75 touche un `<textPath>` SVG, hors de la surface décrite x=416/y=0/w=608,5/h=608. Le rectangle du texte atteint y≈645,429. Les descendants SVG sont exclus des masses/lignes actuelles, mais la grille rencontre leur texte : 5/6 points couverts, soit 0,833333 < 0,85. Les cadrages réels 2925/3223/3450/3510 ont respectivement 8/8, 8/8, 9/9 et 6/6 points couverts. Les douze vues shadow ont couverture 1 et aucune surface inconnue ; ce sont des ratios de points, pas une certification de toute l'encre. Le candidat 3310 apporte donc une preuve négative de complétude du descripteur, indépendante de son utilité comme locale. Les détails des cellules proviennent de cette visite instrumentée, pas d'une reconstruction du premier run.

Gucci perd son seul témoin non fiable. Amici retire douze témoins non fiables mais conserve la même limite dans ses onze vues ; Khufu retire trois témoins mais conserve ceux à 2925/3192/3510. Aucun défaut capturé n'est retiré sur Tastavents/Salterra ; les positions facultatives 6531/7904/8363/9609 de Tastavents étaient toutefois non mesurées pour budget, et leur fiabilité ne peut être affirmée.

**Proposition de conservation générique des preuves — non implémentée :** séparer le pool de scoring d'un registre de fiabilité par région, conserver toute preuve négative acquise pendant les visites A/fixes, et observer de manière bornée les primitives peintes mais ignorées ou hors des emprises représentées. Distinguer fiable, non fiable et non démontré ; une encre structurelle importante non certifiable impose un fallback prudent, sans fabriquer un ratio pour un cadrage absent. Ne pas bannir tous les SVG/carousels et ne modifier aucun score. D'éventuels témoins ciblés ultérieurs ne seraient admissibles qu'aux ancrages déjà détectés, avec gates/budget inchangés ; l'incertitude restante impose le fallback. Ce mécanisme pourrait produire des fallbacks supplémentaires et une raison différente du ratio actuel : à valider explicitement en shadow avant adoption. Les agrégats actuels seuls ne garantissent pas les verdicts de tous les candidats retirés.

Validation locale consolidée : **752/752 tests backend**, dont six tests shadow ; syntaxe des modules/scripts et chargement des routes vérifiés. Le rapport/planches reproductibles résident dans `diagnostics/structural-shadow-fixed-pool-2026-10-06/`. Arrêt après diagnostic et proposition : ni nouvelle architecture ni mécanisme de fiabilité basculé dans le produit.

### Registre de fiabilité — première version exclusivement shadow

`dryRunStructuralReference.script.js --shadow-reliability` active le pool A + cinq fixes et un registre indépendant. Aucun branchement du service produit ne l'active. Aux seules visites A/fixes existantes, le hook diagnostique appelle **la fonction DOM du produit inchangée**, puis l'inspection de peinture, synchroniquement dans la même évaluation navigateur. Aucun scroll, screenshot, probe, changement de DOM visuel ni visite supplémentaire. Le budget de capture et tous les gates restent inchangés ; le temps diagnostique consomme ce même budget.

Les deux lectures doivent être dans la même tâche navigateur : un premier prototype en deux évaluations séparées produisait de faux témoins sur Tastavents, avec un décalage temporel ≈1,16 px d'éléments déjà représentés. La correction synchronise les lectures, sans augmenter la tolérance. Un test synthétique avec déplacement CSS continu vérifie cette distinction.

`structural-reliability-shadow.js` compare les primitives importantes visibles avec les masses/lignes de même provenance DOM, sans utiliser un grand fond de page pour masquer une absence de texte ou média. Pour les descendants SVG/textPath, les extents des glyphes et leur screen CTM sont comparés à l'emprise réellement représentée ; un point peint et touché hors de celle-ci constitue une preuve `unreliable`. Une emprise SVG entièrement représentée, y compris affine certifiable, reste admissible. Les définitions SVG non peintes ne sont pas des témoins. Overflow/containing blocks, exclusions de navigation et clipping rectangulaire respectent la portée de collecte existante.

Géométrie opaque ou non certifiable, clipping/perspective non représentable, inspection tronquée/échouée ou visite manquante produisent `unproven`. Un défaut effectivement observé produit `unreliable`; sans défaut ni incertitude dans la portée inspectée, `reliable`. Les seuils de couverture/surfaces inconnues du collecteur sont réutilisés tels quels. Les inspections sont bornées par ses limites de nœuds, lignes/glyphes et masses. Ce registre ne constitue pas une décomposition pixel exhaustive, une certification des pseudo-éléments ou des cadrages jamais visités.

Toutes les visites et preuves restent dans le registre, y compris doublons aux mêmes positions et vues écartées du scoring. La dernière fixe peut remplacer une vue A dans le pool artistique sans effacer son témoin négatif. `shadow.scoringSelection` conserve le résultat L/D/V/R/G inchangé ; l'éligibilité issue du registre peut uniquement imposer les cinq IDs fixes dans la livraison **shadow**, avec raison explicite. Aucun ratio ni score n'est inventé à un cadrage absent. Contrat, captures préparées et manifeste produit restent indépendants du registre.

Le coût ajouté est mesuré par `performance.now()` autour de l'inspection synchrone dans Chromium. Le temps de l'évaluation partagée inclut aussi le collecteur existant, transport et scheduling : il ne faut pas le présenter intégralement comme surcoût. L'agrégation du registre est mesurée séparément, après la capture ; les vingt répétitions portent sur le verdict/scoring aux mêmes mesures et non vingt visites.

Benchmark frais final du 6 octobre, dossier `diagnostics/structural-shadow-reliability-2026-10-06-final/` :

| Référence | Scoring seul → livraison shadow | Registre | Inspection DOM ajoutée | Positions shadow px |
| --- | --- | --- | --- | --- |
| Tastavents | adaptive → adaptive | reliable | 2,918 s / 27 visites | 0 / 10530 |
| Salterra | adaptive → adaptive | reliable | 2,761 s / 27 visites | 0 / 2139 / 9945 |
| Gucci Osteria | adaptive → fixed_fallback | unreliable | 0,519 s / 16 visites | 0 / 862 / 2156 / 3450 / 4312 |
| Amici | fixed_fallback conservé | unproven | 1,815 s / 15 visites | 0 / 706 / 1765 / 2823 / 3529 |
| Khufu's Bistro | fixed_fallback conservé | unproven | 1,090 s / 19 visites | 0 / 1277 / 3192 / 5106 / 6383 |

Gucci est détecté dès A à 2925 : glyphes du textPath au-dessus de la surface décrite y=385, point touché x≈735,282/y≈376,680. Le registre n'utilise jamais le candidat 3310 ; la tournée actuelle continue de le visiter parce que le produit n'est pas basculé. Les preuves fixes sont inchangées sur les cinq références, les fallbacks de mesure conservés et la sélection/éligibilité répétable 20/20 aux mêmes mesures. Le contrat/manifeste/octets préparés restent ceux du produit courant, sans données shadow. Tastavents/Salterra n'ont aucun témoin négatif ni incertitude dans cette portée. Salterra mesure ici 11597 px, une variation du site vivant ; un premier essai prototype bloqué par le backdrop OneTrust reste documenté, sans modification du gate. L'instrumentation peut consommer la marge facultative et ces deux runs courants sont en fallback budget ; ce n'est pas un fallback du registre. Aucun séquencement optimisé exécuté, aucun probe ajouté, aucun appel Vision/OpenAI/MongoDB/Cloudinary.

Validation du registre v1 : **766/766 tests backend** (dont 20 tests ciblés registre/shadow), zéro échec ni test ignoré, syntaxe/routes/diff vérifiés et cinq planches inspectées. Les cas synthétiques incluent SVG/textPath débordant et représenté, emprises affines certifiables, défaut intrinsèque entre cadrages, primitive opaque `unproven`, clipping connu/inconnu, overflow et synchronisation temporelle. Cette validation autorise uniquement le résultat shadow, pas une bascule du séquencement produit.

### Séquencement expérimental exclusivement local — historique avant bascule

`dryRunStructuralReference.script.js <url> <sortie> [1..3] --experimental-sequencing` exécute le vrai parcours applicatif, avec les gardes de sorties distantes du dry-run. L'activation repose sur une capacité en mémoire non sérialisable créée par `structural-local-experiment.js` ; aucun flag d'environnement ni endpoint produit ne l'expose. Le service de ce script refuse tout `run` non dry-run avant accès au modèle. Un second verrou refuse toute capture portant `localExperiment` avant préparation/upload/attempt/analyse dans un service produit ordinaire.

Le bloc des cinq contrôles fixes post-parcours n'est pas modifié : mêmes fractions, images, signatures 64×64, géométrie, hauteur, diversité et gates. Le registre v1 inspecte uniquement les visites Phase A/fixes, synchroniquement avec le collecteur. Toute preuve négative reste dans le registre même si son observation disparaît par déduplication du pool artistique. Le sélecteur L/D/V/R/G reçoit exclusivement ce pool réellement observé, dédupliqué avec priorité à la dernière fixe, et le storyboard composé par la fonction actuelle. Aucun poids, seuil, tolérance ou budget n'est modifié.

Seule la tournée des cadrages de rupture facultatifs est omise dans ce mode. Les positions que le produit aurait envisagées sont comptées dans le diagnostic, jamais visitées. `unreliable`/`unproven` imposent les cinq fixes ; `reliable` laisse le sélecteur décider normalement. Une locale issue de Phase A est recapturée post-parcours avec les opérations/gates du bloc de recapture existant : scroll/settle, sanitation, mesure géométrique, image gate, stabilisation/gel, intégrité avant/après screenshot et restauration. Une fixe déjà validée n'est pas recapturée, sauf nettoyage persistant nécessaire. Fraîcheur et nettoyage concernant la même locale sont effectués ensemble. Le contrôle conservateur existant du budget facultatif est réutilisé avant admission de ces recaptures ; le budget global reste 120 s.

`localExperiment` et les profils sont retournés uniquement au script local, hors metadata du contrat : registre, résultat artistique indépendant, pool, cinq témoins fixes, livraison/fraîcheur et nombre de cadrages omis. Le contrat/manifeste est préparé avec les vrais octets, IDs v3 et positions finales, puis sauvegardé localement sans appel. Les tests synthétiques comparent les signatures des cinq fixes entre les deux séquencements, vérifient l'absence de tournée facultative, le fallback opaque et les verrous locaux. Les rapports reproductibles sont ignorés par Git ; les captures anciennes ne servent qu'à l'inspection comparative, jamais d'entrée au nouveau parcours.

La première exécution réelle de ce mode sur les cinq références est terminée (`diagnostics/structural-experimental-sequencing-2026-10-06/`). Toutes passent les gates/contrats locaux en sampled v3, sans tournée facultative ni capture/mesure ancienne réutilisée :

| Référence | Capture réellement mesurée | Registre / décision | Locales livrées px | Recaptures finales HD |
| --- | --- | --- | --- | --- |
| Tastavents | 95,02 s | reliable / adaptive | 0 / 10530 | 1 de fraîcheur |
| Salterra | 85,36 s | unreliable / fixed_fallback | 0 / 2217 / 5544 / 8870 / 11087 | 4 nettoyages persistants |
| Gucci Osteria | 46,45 s | unreliable / fixed_fallback | 0 / 862 / 2156 / 3450 / 4312 | 0 |
| Amici | 41,28 s | unproven / fixed_fallback | 0 / 706 / 1765 / 2823 / 3529 | 0 |
| Khufu's Bistro | 44,46 s | unproven / fixed_fallback | 0 / 1277 / 3192 / 5106 / 6383 | 0 |

Gucci est refusé depuis le témoin textPath de Phase A à 2925, sans visite à 3310. Les tentatives existantes de nettoyage persistant sur Gucci refusent le masquage pour `geometry_or_composition_changed` : elles coûtent du temps mais ne produisent aucun screenshot supplémentaire. Les buffers fixes sont alors conservés. Salterra n'est pas forcé en adaptive : sa nouvelle visite mesure 11987 px (contre 11597 auparavant), avec une couverture 9/11 = 0,8181818 à 10530, sous la limite inchangée de 0,85. Le scoring seul refuse lui aussi ce pool ; ce n'est pas une pénalité propre au registre. Un média de presse apparaît non rendu dans l'aperçu, mais les traces ne démontrent ni l'identité des deux cellules non couvertes ni la cause complète du changement de hauteur. Aucune seconde visite ne cherche à obtenir le verdict souhaité. L'adaptive Salterra lorsque ses mesures sont reliable reste possible par le branchement générique, sans preuve supplémentaire sur cette visite.

Après réussite de ces cinq visites, **trois runs Tastavents frais consécutifs** passent en adaptive : **93,67 / 93,45 / 92,33 s**, positions identiques 0/10530, une vraie recapture finale chacun, marges **26,33 / 26,55 / 27,67 s** sur le plafond de capture inchangé. Les temps complets du service pour ces trois runs sont ≈104,64 / 102,30 / 101,60 s. Les manifestes v3/octets/contrats, cinq preuves fixes et fraîcheur des locales sont vérifiés. Le benchmark précédent sert uniquement de comparaison ; le gain entre visites vivantes n'est pas attribuable au seul séquencement avec certitude. Validation finale : **770/770 tests backend**, syntaxe/routes/diff et huit contrats/manifeste/octets vérifiés. Aucun basculement produit, OpenAI/Vision ou accès MongoDB/Cloudinary.

### Validation non payante depuis la plateforme réelle — première validation avant bascule

**Historique : mode supprimé le 7 octobre 2026.** L'activation, les garde-fous et le panneau décrits ci-dessous relatent la validation passée ; ce mode n'est plus disponible dans l'application. Son service, son test dédié et son renderer exclusivement plateforme ont été supprimés. `app.js` reprend les crons et l'écoute ordinaires de `develop`, avec uniquement les routes Design Lab et le démarrage inconditionnel du recovery produit en plus. Le dry-run CLI autonome et l'archive passive B1 restent disponibles ; aucune décision de capture ni requête Vision n'est modifiée. Une ancienne requête de navigateur portant `requirePlatformValidation=true` reste refusée pour empêcher sa conversion silencieuse en appel payant.

La validation passée utilisait les vrais boutons `Analyser / réessayer` et `Réanalyser`, le même endpoint authentifié et le même service, avec préparation du contrat avant toute écriture distante ou appel Vision. Les garde-fous temporaires, les conditions sur les crons et le panneau UI ont été retirés après validation. Les résultats historiques, captures, manifestes, timings et preuves de persistance inchangée restent conservés pour comparaison et diagnostic ; ils ne sont jamais utilisés comme entrée de capture ou de sélection.

Validation du 6 octobre, vrais boutons de Tastavents et Gucci (`diagnostics/structural-platform-validation-2026-10-06/`) :

| Référence | Capture mesurée | Pipeline navigateur/préparation | Service avec diagnostics locaux | Registre / décision | Locales livrées px | Screenshots / recaptures finales |
| --- | --- | --- | --- | --- | --- | --- |
| Tastavents | 94,76 s | 104,35 s | 106,81 s | reliable / adaptive | 0 / 10530 | 28 / 1 |
| Gucci Osteria | 46,71 s | 53,33 s | 54,69 s | unreliable / fixed_fallback | 0 / 862 / 2156 / 3450 / 4312 | 16 / 0 |

Les cinq fixes de chaque site sont exécutées par le bloc commun inchangé, après parcours, avec zéro écart de position et hauteur, cinq signatures distinctes et gates passés. Tastavents réutilise la fixe haute et recapture/revalide la locale Phase A à 10530. Gucci conserve le témoin intrinsèque SVG/textPath dès Phase A 2925 : premier glyphe visible x≈719,302/y≈347,509, largeur≈31,960/hauteur≈58,342 ; emprise décrite x=416/y=385, largeur=608,5/hauteur=515 ; point peint x≈735,282/y≈376,680. Aucune visite à 3310. Les tentatives existantes de nettoyage persistant refusent le masquage pour `geometry_or_composition_changed` ; zéro screenshot de recapture et buffers fixes conservés.

Aucune tournée facultative dans les deux visites ; les 12 cadrages que chaque tournée aurait pu envisager sont omis. Le nombre n'est pas assimilé à 12 screenshots réellement économisés, car le pipeline précédent pouvait déjà s'arrêter pour budget. Contrat/manifeste/octets v3 reconstruits à l'identique avec le builder applicatif, diagnostics expérimentaux exclus des metadata, références/attempts identiques avant/après et compteurs OpenAI/MongoDB/Cloudinary/écritures distantes tous à zéro. Les temps et décisions correspondent aux mêmes branches que les dry-runs locaux précédents (Tastavents 95,02 s ; Gucci 46,45 s), sans chercher l'identité pixel ou temporelle de visites distinctes d'un site vivant.

Un premier clic Tastavents a été bloqué par `blocked_by_overlay` pendant la sanitation initiale, avant Phase A. Cette première trace n'a pas conservé l'identité de l'overlay : **sa cause exacte n'est pas démontrée**. Après ajout de conservation des diagnostics d'échec uniquement, une seconde visite fraîche via le même bouton a passé les gates inchangés et produit le résultat ci-dessus. Le blocage reste conservé dans le rapport ; aucun contournement ni modification du stabilisateur n'en découle. La validation se limite à ces deux références, sans visite des dix nouveaux sites ni bascule définitive du produit.

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

### Protection de peinture et vidéo représentative — B1, 7 octobre 2026

Le warm-up et l'activation lazy natifs des vidéos ne sont pas remplacés par un gel précoce de leurs posters. Au viewport de capture, une vraie frame présentée est privilégiée dès qu'elle est disponible. Un poster natif décodable peut servir dans un état volontairement poster-only (sans source active, ou preload=none sans autoplay, erreur média, chargement ou lecture actifs). Un poster chargé ne certifie jamais une vidéo demandée mais non résolue : cet état reste bloquant. Un poster générique ne doit pas empêcher l'activation normale d'une galerie. Les callbacks ne peuvent plus modifier le DOM après restauration. Une vidéo OGG ou sans extension est reconnue par sa correspondance réelle avec `<video>/<source>` ; l'audio garde le traitement ordinaire. Les plages déjà mises en cache ne consomment aucune réservation vidéo supplémentaire.

Le warm-up existant précède une attente bornée de contenu principal effectivement visible (maximum cinq secondes dans le délai existant), avant `reduced-motion` et gel des animations. Ce contrôle inspecte rectangles, opacité cumulée, display/visibility et primitives visibles ; il ne force aucun style de reveal. Une racine de SPA vide reste bloquante. Si la navigation a réellement changé vers une autre URL du même domaine pendant l'hydratation et a laissé cette racine vide, la seconde navigation déjà autorisée réconcilie uniquement cette URL observée. Aucun chemin/langue n'est inventé et aucune boucle de retry n'est ajoutée.

Les URL saisies/navigation restent limitées à 2 000 caractères. Les requêtes internes StructuralReference de contenu peuvent atteindre 16 384 caractères : les requêtes GROQ observées dépassaient 3 100 caractères. Origin et Accept-Language réellement émis par le navigateur sont transmis au transport épinglé ; aucune autorisation CORS n'est inventée. Validation protocole/credentials/ports, DNS public, adresse épinglée et contrôle de chaque redirection restent actifs. Portfolio conserve ses options ordinaires.

Avant livraison, une preuve pixel sur les buffers réellement capturés après `visionCleanliness` refuse un lot entièrement uniforme de même couleur et un viewport uniforme contredisant du texte déclaré peint dans ce cadrage. Un espace narratif vide ou un aplat volontaire reste possible si le lot contient du contenu ou des compositions de couleurs distinctes ; un texte très petit sur fond blanc suffit et aucune densité artistique minimale n'est imposée. Les rectangles de texte sont ceux des glyphes réellement dans le viewport, pas le grand rectangle de leur parent. `captureCoverage.paintEvidence` certifie ce contrôle. Une nouvelle analyse recapture les anciennes captures sans cette preuve ; le retraitement d'une réponse Vision historique conservée reste inchangé.

Les vidéos StructuralReference conservent leur élément, sources et layout natifs. Les requêtes vidéo utilisent des plages d'au plus 2 MiB, avec un plafond représentatif de 8 MiB par source (réduit si le budget média existant est inférieur), et restent comptées dans les budgets médias/global/requêtes existants. Les plages simultanées sont réservées et le cache est distinct par plage. Un serveur ignorant Range peut fournir le préfixe initial : le transfert est interrompu après ce préfixe, ses octets réels sont comptés, jamais le fichier entier volontairement téléchargé. Les plages ultérieures incompatibles ou une taille non certifiable restent bloquantes. La limite ordinaire de 32 MiB n'est pas supprimée pour les autres ressources ; médias cumulés 64 MiB, total 208 MiB et budget capture 120 s restent inchangés.

Un poster natif décodable peut servir de représentation. Sinon, une vraie frame décodée et présentée au compositeur (`requestVideoFrameCallback` lorsque disponible) est requise avant pause. `readyState` seul n'est pas une preuve de peinture. Pour une vidéo déjà en pause sans preuve de présentation conservée, un seek au même instant demande la présentation de la frame décodée existante : aucun avancement artificiel, attente de callback bornée, échec bloquant si aucune présentation n'est certifiée. Le chargement de cette source est arrêté une fois la représentation obtenue. Le gate vérifie source, rectangle et état/temps de la frame autour du screenshot ; une modification ou un média sans frame/poster reste bloquant. Préchargement, interception temporaire de play, listeners et autoplay initial sont restaurés en sortie, y compris en erreur. Les diagnostics enregistrent mécanisme, sources, géométrie, frame présentée, octets/plages et restauration. Le registre de fiabilité, L/D/V/R/G, leurs seuils/poids et les cinq contrôles fixes sont inchangés.

### Erreurs, incertitude Vision et conservation des preuves — 8 octobre 2026

Toute exception de l'orchestration produit est journalisée (`structural:operation_failed`, ou `structural:route_failed` pour les erreurs API hors opération). `operationDiagnostic` conserve sur la référence, et sur la tentative lorsqu'elle existe, les identifiants, phase, code normalisé, durée, budget restant lorsqu'il est connu, statut des checkpoints, état du transport Vision et chaîne de causes bornée. Les clés, bearer tokens, credentials URL et paramètres de requête sont expurgés. La sanitation et les contrôles de capture restent strictement identiques.

**Historique avant correction background :** le délai StructuralReference OpenAI était **120 000 ms**. Les étapes dispatch, headers et réception étaient observées ; une réponse complète reçue après expiration était conservée sans transformer le timeout en succès. Ce comportement reste pertinent pour les tentatives historiques et leur retraitement local. Les nouvelles tentatives séparent création, traitement fournisseur, récupération et validation/application ; leur requête originale, identifiant client, identifiant de réponse et réservation budgétaire sont durables. Sans identifiant de réponse ni accusé brut permettant de le retrouver, aucun nouveau POST n'est permis sur cette tentative. `X-Client-Request-Id` aide l'investigation, sans garantir l'idempotence. `store:false` reste inchangé ; background implique néanmoins une rétention temporaire fournisseur d'environ dix minutes, qui limite la reprise après une longue panne.

Le recovery historique des leases expirées conserve son rythme de 60 s et ne crée ni capture ni réponse Vision. Un suivi distinct toutes les 5 s reprend uniquement les nouvelles tentatives background actives de leur génération actuelle, par GET du même identifiant ; il ne consomme aucune nouvelle autorisation de création. Le suivi repart au démarrage et à la lecture de la référence, sous lease/CAS ; une ancienne réponse supplantée ne peut être appliquée. Le brut terminal précède parsing/validation ; sa présence autorise une reprise locale même après expiration fournisseur. L'administration distingue récupération d'une réponse identifiée et retraitement d'une réponse déjà conservée. Une erreur de requête frontend entraîne une relecture, jamais la répétition automatique de la création payante. Les anciens timeouts sans identifiant conservent leur incertitude et exigent une nouvelle confirmation pour toute nouvelle création.

Une recapture n'efface plus préalablement les certifications existantes. `analysisCaptureSnapshot` conserve les preuves de l'analyse antérieure ; les buffers appartenant à cette analyse ou à une tentative persistée ne sont pas détruits par remplacement. `retainedCaptureIds` en garde la propriété jusqu'à la suppression explicite de la référence. Les uploads partiels non appliqués et anciens buffers sans propriétaire utile restent nettoyés.

StructuralReference mémorise avant les scripts du site les primitives natives Window/Element de défilement pour ses propres visites. Un site peut légitimement remplacer `window.scrollTo` par un helper d'ancres ; ses contrôles continuent à l'utiliser, tandis que le warm-up et le collecteur appellent les primitives natives conservées. Le global du site n'est pas réécrit. Positions, événements natifs, validations, couverture et budgets ne sont pas assouplis ; Portfolio sans capture structurelle conserve son comportement antérieur.
