# Gusto Design Lab — passation technique et fonctionnelle B1

**État arrêté au 8 octobre 2026.** Document de reprise, sans autorisation de capture, mutation distante ou appel IA. Lire ce fichier avant toute investigation nouvelle. Il transmet les décisions et limites connues ; il ne remplace pas les sources ni une validation artistique humaine.

## 0. Lecture rapide et niveau de preuve

- La dernière validation non payante Grupo/Cantina est **terminée** : unique capture réelle Grupo après correctif native-scroll réussie ; six captures Cantina accessibles et réutilisables. **Cantina a ensuite réussi un nouvel appel Vision autorisé depuis l'interface**, génération `d1e9963c-2992-433f-aefa-cf254baca837`, analyse appliquée le 08/10 à **15:42:12 Paris**, lot existant conservé. **Grupo reste la seule analyse B1 à réaliser**, techniquement prête avec recapture normale requise (§4). Aucun appel Vision n'a été exécuté par Codex pour cette validation ni cette actualisation.
- Le pipeline StructuralReference normal est celui de **Phase A + registre v1 + cinq fixes + sélection + recaptures finales nécessaires**. Aucun mode expérimental ni mode plateforme non payant actif. Le serveur normal peut appeler Vision sur action admin explicite.
- Ne pas reprendre la réservation réseau Salterra, modifier les poids/seuils/gates, ni lancer automatiquement le reste de B1. La recherche d'admission est suspendue ; son problème n'est pas résolu.
- En lecture MongoDB native **sans mutation**, à **2026-10-08 13:57:51 UTC / 15:57:51 Paris**, les 13 références demandées sont retrouvées : **12 `analyzed` avec réponse brute/parsée et attempt `applied`**, dont Cantina ; **Grupo seul reste `error`**, sans analyse. Aucun token d'opération actif sur ces 13 références. Cela atteste la persistance, pas l'approbation artistique des douze analyses.
- Dernière suite complète documentée : **875 tests backend verts**, **16 client verts**, build dashboard isolé réussi. Pas de nouvelle suite/build pour la validation suivante ni pour cette rédaction, car aucun moteur n'a changé.
- Dépôt : `gusto-manager`, branche **`site`**, HEAD **`2bd44a3321ec11f9d3b5263ecb47673eccf3e3ef`**. **58 chemins préexistants non committés** avant création de ce document. Ne pas reset/revert/commit sans instruction.

### Convention

Tous les chemins `server/...` et `client/...` sont relatifs au dépôt `gusto-manager`, situé dans le workspace `gusto-workspace`. `AGENTS.md` et `docs/CONTEXT.md`, `docs/API_CONTRACT.md` sont au niveau du workspace. Les fichiers `/private/tmp/...` et `server/diagnostics/...` sont des preuves **locales temporaires**, pas des dépendances produit ni des artefacts garantis dans un autre checkout.

**Vérifié** = source lue, valeur persistée lue ou rapport/log existant identifiable. **Historique** = preuve datée, pouvant différer d'un site vivant. **Hypothèse / non vérifié** = ne pas transformer en cause démontrée. Une fixture verte ne prouve pas à elle seule un site réel. `ready_for_vision` ne signifie ni appel OpenAI, ni analyse artistique réussie, ni approbation humaine.

## 1. Architecture réelle et maturité

### 1.1 Organisation et flux distincts

API Express monolithique sous `/api`, MongoDB/Mongoose, assets Cloudinary ; dashboard Next.js pages router. Design Lab est privé admin, JWT et rôle admin. Aucun champ Design Lab ajouté au payload public `Restaurant` pour ce chantier.

| Module implémenté | Responsabilité réelle | Sources principales |
|---|---|---|
| Projets Design Lab | Brief, contexte restaurant, réglages/styles, assets et rôles, inspirations choisies, directions/versionnement, Style Frames, générations, sélection/approbation | `server/models/site-project.model.js`, `server/routes/admin/design-lab.routes.js`, `server/services/design-lab/design-lab.service.js`, `client/src/pages/dashboard/admin/sites/[id].page.js` |
| DesignReference | Inspiration visuelle importée, tags manuels/visuels/métier, analyse/caractéristiques ; présélection locale pour le moteur créatif | `server/models/design-reference.model.js`, `server/services/design-lab/design-lab.service.js`, `server/services/design-lab/openai.service.js`, `client/src/pages/dashboard/admin/sites/references.page.js` |
| Ancien site du restaurant | Extraction documentaire de texte, sans emprunter son design ; brief manuel prioritaire | `server/services/design-lab/existing-website.service.js`, `SiteProject.brief.existingWebsite` et `existingWebsiteContext` |
| Portfolio Gusto | Sites Gusto réalisés : capture/analyse, profil de comparaison et anti-répétition ; pas une inspiration positive copiée | `server/models/gusto-portfolio-site.model.js`, `server/routes/admin/design-lab-portfolio.routes.js`, `server/services/design-lab/portfolio.service.js`, `portfolio-analysis.service.js`, `client/src/pages/dashboard/admin/sites/portfolio.page.js` |
| StructuralReference | Bibliothèque séparée de composition/rythme spatial ; homepage URL, captures certifiées, analyse Vision, preuves | `server/models/structural-reference.model.js`, `structural-analysis-attempt.model.js`, `server/routes/admin/design-lab-structural.routes.js`, `server/services/design-lab/structural-reference.service.js` |
| Directions V 2 | Territoires A/B/C, expansions, architecture d'information, systèmes artistiques ; versionnement des slots et checkpoints | `server/services/design-lab/design-engine-v2.service.js`, `direction-versioning.service.js`, `directions-checkpoint.service.js`, `server/docs/DIRECTIONS_V2_CONTRACT.md`, `DIRECTION_VERSIONING.md`, `DIRECTIONS_V2_RECOVERY.md` |
| Style Frame | Proposition, affinement, validation, preuves d'inputs et tentative récupérable | `server/services/design-lab/style-frame.service.js`, `server/models/style-frame-generation-attempt.model.js`, `server/docs/STYLE_FRAME_PIPELINE.md`, `client/src/components/dashboard/admin/sites/style-frame-refinement.component.js` |
| Homepage visuelle | Génération en chapitres, assemblage, checkpoints, reprise/finalisation ; variations liées à une parente | `server/services/design-lab/homepage-generation.service.js`, `image-assembly.service.js`, `server/models/homepage-generation-attempt.model.js`, `server/docs/HOMEPAGE_V2_RECOVERY.md`, `client/src/components/dashboard/admin/sites/homepage-attempt.component.js` |
| Approbation | `approvedSnapshot` immuable, projet verrouillé, réouverture archivante | `server/services/design-lab/approval.service.js`, `server/models/site-project.model.js`, routes de sélection/approbation/réouverture |

Les routes Design Lab, Portfolio et Structural sont montées dans `server/app.js`. Crons et `server.listen` ont leur fonctionnement normal ; le recovery structurel démarre après connexion MongoDB, puis périodiquement. **Ne pas remplacer `app.js` par celui de develop** : conserver routes/app.use Design Lab et recovery générique.

Le moteur créatif actuel utilise les **DesignReference**, les assets client, le brief/contexte documentaire et la comparaison Portfolio. StructuralReference est actuellement une bibliothèque séparée : **pas de branchement artistique automatique démontré dans le moteur de directions**. `engineVersion: v2` désigne le contrat actuel, pas une sélection de moteurs concurrents.

### 1.2 Relations réellement persistées

- **StructuralReference** : identité/source/type/activation/tags manuels ; statut `new`, `capturing`, `analyzing`, `analyzed` ou `error` ; captures, `localMetadata`, `captureSanitization`, `captureCoverage`, analyse et `analyzedAt`, dernier message/diagnostic, lease/token.
- Chaque capture porte rôle/type, URL et `publicId`, dimensions, viewport, rectangle source/progression lorsqu'applicable. Les buffers sont préparés avant upload ; en produit normal, Cloudinary reçoit ces octets et MongoDB conserve leurs identités/géométries.
- **GenerationId** : UUID d'une opération, utilisé pour lease, logs/diagnostics et attempt ; ne pas confondre avec ObjectId de référence ni de tentative. Une panne avant création de l'attempt peut n'avoir que le diagnostic de référence ; les anciens runs n'archivaient pas toujours le generationId après déverrouillage.
- **StructuralAnalysisAttempt** : collection séparée, `referenceId`, generationId unique, `captureSnapshot` (captures + metadata + manifeste), `rawResponse`, `parsedResult`, erreur/diagnostic, transport Vision, dates réception/application/interruption. Statuts : `running`, `received`, `validation_failed`, `validated`, `applied`, `failed`.
- Résultat artistique : `overview`, `layoutProfile`, `rhythmSequence`, `structuralMoments` avec mode, descriptions, principes transférables et preuves `sourceViews/startPercent/endPercent/observation`, gestes signature, contexte d'usage et anti-copie. Contrat strict dans `structural-reference.contract.js`, schéma dans `structural-reference.model.js`.
- `analysisCaptureSnapshot` et `retainedCaptureIds` préservent/propriétarisent les preuves d'une analyse antérieure et d'attempts lors d'un remplacement de captures. Pas de destruction des preuves encore référencées.
- Les signatures pixels des contrôles prouvent diversité/stabilité ; SHA-256 de buffers dans les diagnostics prouvent la concordance technique. **Ce ne sont pas des StructuralFingerprint/MotionFingerprint artistiques.** Aucun modèle/module dédié ni connexion de ces fingerprints à DesignReference n'a été identifié dans les sources Design Lab consultées : étape future.
- Les checkpoints directions/homepage utilisent leurs propres context hashes/versions et tentatives. Ne pas leur attribuer les règles de StructuralAnalysisAttempt par analogie.

## 2. StructuralReference : un seul pipeline normal

### 2.1 Orchestration, navigateur et livraison

Sources de référence : `server/services/design-lab/structural-reference.service.js` (`createStructuralService`, `run`, `captureAndPrepare`, `prepareStructuralViews`), `portfolio-capture.service.js` (`capturePortfolioSite`, transport/warm-up/images), `structural-page-capture.service.js` (`captureStructuralPage`, `coverageIsComplete`).

```text
Bouton réel Analyser / Réanalyser
  → route admin /analyze → service.run → récupération/acquisition du lease
  → garde d'appel précédent incertain et compatibilité des captures existantes
  → si recapture nécessaire : captureAndPrepare
       navigation sécurisée + warm-up natif + sanitation initiale
       Phase A complète : scroll réel, médias/peinture/stabilité, mesures, screenshots propres
       registre v1 sur les visites réellement existantes
       cinq contrôles fixes post-parcours : screenshots/signatures/gates inchangés
       continuous OU sampled ; pool sampled = Phase A + cinq fixes
       sélection inchangée ; registre unreliable/unproven → fallback fixe
       recapture/revalidation des seules locales finales sans fixe fraîche équivalente
       storyboard / préparation WebP / certifications / manifeste
  → sauvegarde du lot de captures avant Vision
  → contrat et StructuralAnalysisAttempt snapshotés
  → un appel Vision → checkpoint brut → parsing → validation → persistance de l'analyse
```

- Homepage seule : `singlePage:true`, collecte géométrique, callbacks structurels ; aucune exploration des pages internes comme le Portfolio.
- Chrome via `playwright-core`, viewport **1440×900**, scale 1, UA Chrome desktop partagé avec transport épinglé, service workers bloqués, pas de téléchargements ni WebSockets. Configuration runtime détaillée conservée dans les diagnostics.
- Warm-up réel pour reveals/lazy avant reduced-motion ; pas de CSS de simulation ni de reveal forcé. Les primitives Window/Element natives conservées avant les scripts évitent une collision avec le `window.scrollTo` du site.
- Attente bornée du contenu principal réellement peint avant reduced-motion/gel ; DOM présent ne suffit pas. Sanitization/paint/gates autour de chaque viewport et autour du screenshot nettoyé. Un timing historique n'est pas une garantie du prochain site vivant.
- Scroller document, conteneur ou smooth-scroll réellement mesuré ; progression jusqu'à fin/hauteur stable. Rectangles, positions et signatures réels ; aucune position locale extrapolée à partir d'un nom.
- Phase A : tous les panneaux réellement observés/validés ; mesure du descripteur et du registre dans les mêmes visites.
- Cinq fixes post-parcours historiques **conservées intégralement** : positions, sources, signatures, cadrage, hauteur, stabilisation et gates. Ce sont des preuves obligatoires, pas cinq slots artistiques obligatoires.
- **Aucune tournée facultative de candidats adaptatifs**. Recapturer uniquement les finales nécessaires ; réutiliser une fixe post-parcours équivalente uniquement si valide/fraîche. Les sources Phase A destinées au storyboard doivent elles aussi être propres.

### 2.2 Stratégies, versions et limite des images

| Stratégie | Choix et inputs effectifs |
|---|---|
| `continuous` | Pas de motion structurelle détectée ; master document entière, overview optimisée + locales `top`, `middle`, `bottom` : **quatre images Vision**. Les cinq contrôles fixes existent quand même. Master HD archivée, non transmise. Couverture version 2 normale ; ce n'est pas un sampled v2 legacy. |
| `sampled / adaptive` | Motion structurelle ; storyboard complet low-res + **0 à 5 locales**, identifiées `observation1…5`, détail high. Dans la configuration actuelle l'entrée obligatoire compte déjà parmi les cinq. Aucune obligation de remplir. Couverture sampled **v3**, séquencement `phase_a_fixed_pool_v1`. |
| `sampled / fixed_fallback` | Géométrie/scoring non fiables, registre `unreliable` ou `unproven`, ou manque conservateur de budget pour finales facultatives : storyboard + les **cinq fixes fraîches déjà validées**. Motifs explicites ; aucun fallback maquillé en adaptive. |

Un storyboard sampled est une **planche de panneaux** avec positions/plages/projections, jamais une fausse full-page stitchée d'une page animée. Au plus **six images Vision** en sampled, et **un seul appel** par action ; pas de retry payant automatique. Continuous et fallback ne sont pas des échecs artistiques en eux-mêmes.

**Séparation indispensable** : le registre juge la fidélité du **collecteur**, le sélecteur juge l'utilité des **locales**. Une preuve négative découverte sur une visite non sélectionnée ne disparaît pas. Un SVG/carousel/canvas n'est pas interdit par son type ; une géométrie réellement incomplète ou impossible à certifier reste `unreliable`/`unproven`.

### 2.3 Sélecteur et registre : invariants figés pendant B1

`structural-observation-selection.js` : collecte DOM déterministe, clipping et géométrie réels, lignes/masses/groups, grille et descripteurs d'échelle/vide ; projection **réelle** dans le storyboard. Scores reproductibles, coordonnées arrondies, départages stables et gains recalculés après ajout.

- **L** : gain de lisibilité locale vs macro (texte/image).
- **D** : gain de détail des relations de composition (gaps, axes, offsets, chevauchements).
- **V** : nouveauté structurelle pondérée par l'information perdue dans le storyboard.
- **R** : redondance face aux vues retenues (similarité + recouvrement).
- **G = clamp(0,35 L + 0,35 D + 0,30 V − 0,30 R, 0, 1)** ; seuil initial/configuré de référence **0,25**. Recalcul marginal puis échanges déterministes ; aucun tuning par site.
- Couverture DOM mesurée minimale **0,85** ; aire inconnue maximale **0,08** ; paramètres complets et formules dans `STRUCTURAL_REFERENCES.md` / code. Le footer est un candidat normal, sans quota, bonus ni pénalité.
- Répétabilité historique **20/20 sur les mêmes mesures/configuration**, pas vingt navigations identiques. Ne pas promettre la répétabilité d'un site vivant.

`structural-reliability.service.js` : registre v1 `reliable / unreliable / unproven`, descendants SVG/textPath débordants, painted overflow, transform/perspective/clipping non représentables, primitives opaques ; preuves attachées aux visites Phase A/fixes. Certains motifs gardent un préfixe **`shadow_*` historique**, même en produit : ce libellé ne signifie pas un runtime shadow actif.

### 2.4 Nettoyage, gel et média réellement peint

| Mécanisme | Règle et source |
|---|---|
| Consentement/popups | Sanitation générique puis contrôle des overlays ; backdrop certifiable lié à une interface consentement traitable avant refus fatal. Un overlay structurel ou ambigu reste bloquant. `capture-sanitization.service.js`, `popup-sanitization.service.js`, `structural-consent-backdrop.service.js`. |
| Couches persistantes | Détection/déduplication par géométrie et parcours ; header/nav/section sticky narrative conservés. Couche périphérique non structurelle certifiée retirée de **tous les buffers Vision**, y compris Phase A/storyboard/fallback/overview ; styles restaurés et géométrie/source contrôlées. `structural-persistent-elements.js`, `structural-vision-cleanup.service.js`. |
| Attribution externe | Nannina : preuve concordante libellé « Made/Built/Powered… », meta generator, destinataire externe, contrôle isolé périphérique et absence de rôle structurel. Aucune règle Webflow/domaine/classe. Preuve absente → refus. `structural-vision-cleanup.service.js`. |
| Préférences CMP | Sémantique explicite consent/cookies/tracking/privacy + petit contrôle périphérique + absence navigation/métier + provenance CMP certifiée. Cartapani : preuves des événements/sanitation. La Torre : gestion explicite du consentement et callback délégué certifiable via inspection passive bornée CDP ; wrapper partagé seul insuffisant. Aucun fournisseur/classname reconnu comme preuve. `structural-consent-preferences.service.js`. |
| Carousel/galerie | Après warm-up, gel temporaire de l'état courant si enveloppe extérieure stable et état/source/layout vérifiables ; restauration immédiate. Aucune simulation, aucun remplacement si rendu possible. Enveloppe/layout changeants restent bloquants. `structural-animated-components.js`. |
| Reveal / pixels vides | Contenu DOM doit être réellement visible/peint avant gel ; buffer final vérifié. Refus d'un lot uniforme invisible et d'une contradiction texte peint/pixels uniformes, sans imposer une densité artistique à un design minimaliste. `structural-paint.service.js`. |
| Images lazy | Attente/décodage du vrai élément visible et de ses backgrounds, pas des attributs arbitrairement promus en sources. Diagnostics URL, natural dimensions, visible rect, réseau, attente et sortie. `capture-image-visibility.js`, `structural-resource-diagnostics.js`, `portfolio-capture.service.js`. |
| Vidéo | Élément/layout natifs conservés ; vraie frame décodée **présentée** puis pause, ou poster natif dans un état réellement poster-only certifiable. Poster ne remplace pas une source active non résolue. `requestVideoFrameCallback` si disponible ; readyState seul insuffisant. Seek au même instant possible pour présenter une frame déjà décodée. Restauration autoplay/play/listeners/source contrôlée. `structural-video.service.js`. |
| Embeds indisponibles | Placeholder neutre gardant le rectangle uniquement pour iframe tierce indisponible à structure certifiable, diagnostic réseau/géométrie ; jamais utilisé comme vraie frame/photo. Géométrie indéterminée → blocage. `portfolio-capture.service.js`, collecteur/contrat. |

Les captures brutes de diagnostic peuvent montrer un élément restauré après nettoyage ; **elles ne sont jamais les inputs Vision**. Inspecter les buffers préparés et la preuve d'octets, pas une planche brute avant sanitation. Les rectangles placeholder/lazy non résolus ne prouvent pas une vraie peinture média.

### 2.5 Budgets et sécurité actuels

Sources : `structural-resource-policy.js`, `portfolio-capture.service.js`, `existing-website.service.js`, `structural-page-capture.service.js`. Valeurs de code, aucune modification pendant cette passation.

| Enveloppe | Limite |
|---|---:|
| Capture structurelle | **120 000 ms** |
| Visite navigateur/site globale | **180 000 ms** |
| Requêtes uniques / transferts simultanés | **160 / 12** |
| Image unitaire / toutes images | **32 / 128 MiB** |
| Document principal | **4 MiB** |
| Script/style/font/autre asset | **8 MiB** |
| Média ordinaire unitaire / vidéos cumulées | **32 / 64 MiB** |
| Non-images totales / total capture | **80 / 208 MiB** |
| Plage vidéo représentative / source représentative | **≤2 MiB / ≤8 MiB**, réduite si enveloppe média inférieure |
| Gate images local | **5 000 ms** dans les échéances existantes |
| Attente contenu principal réellement peint | **≤5 000 ms**, bornée par délai existant |
| Transport épinglé par attente locale | **≤12 000 ms**, borné par échéance restante |
| OpenAI StructuralReference | **120 000 ms**, indépendant du budget capture |
| Lease opération | **15 minutes**, sweep recovery **60 s** |
| Requête UI structurelle | **600 000 ms**, pas le timeout OpenAI |

URLs HTTP(S) publiques sans credentials/ports arbitraires ; DNS vérifié, IP épinglée à la connexion, chaque redirection revalidée (borne 3) ; IP privées/locales/metadata interdites. Navigation principale limitée au domaine ; sous-ressources/sous-frames publiques validées, sans permissivité globale. Méthodes non-GET bloquées côté capture. URL navigation ≤2 000 caractères, requêtes internes structurelles de contenu ≤16 384 ; Origin/Accept-Language réellement émis transmis, pas de permission CORS inventée.

Cache par URL sans fragment, paramètres conservés, cache partagé inflight/échecs ; vidéo par URL/plage. Octets réellement transférés et réservations inflight comptés. Range ignoré par serveur : seul préfixe initial borné possible, flux interrompu après préfixe, pas de téléchargement volontaire complet. Ne pas déduire un nombre de requêtes vidéo d'un simple plafond d'octets.

La priorité de la file des images ne réserve **aucun slot des 160** avant admission. C'est la cause ouverte Salterra, pas une nouvelle garantie. Les réservations d'octets inflight existantes ne sont pas le prototype de réservation de slots abandonné/suspendu.

Une récupération de transport **au plus une fois**, bornée et comptée, est implémentée pour certaines erreurs transitoires certifiées, sans retry HTTP/SSRF/budget. Document principal : seulement GET non livré, `ABORT_ERR` causé par `TimeoutError`, signal réellement expiré, zéro header et zéro redirection, temps/budgets suffisants. Ce n'est pas un deuxième `page.goto`. Image/script/style/font et média visible suivent les critères existants de récupération partagée. Ne jamais généraliser cela à un retry Vision.

### 2.6 Contrat partagé, analyse et reprocessing

`structural-reference.contract.js` : `buildStructuralVisionRequest`, manifeste, contextes/geometry, schéma/instructions, `validateStructuralAnalysis`. **Prompt, captureSnapshot et validateur utilisent le même manifeste réel** : identifiants, rectangle/plage réelle et ordre des vues. Les noms `top/upper/middle/lower/bottom` historiques ne permettent pas de déduire une géométrie adaptative. Version manifeste et version couverture sont distinctes (manifest v1, sampled coverage v3).

`server/services/design-lab/openai.service.js` : `openaiRequest`, `structured`, `parseStructuredResponse`, `analyzeStructuralReference`. Responses API, Structured Outputs, modèle `MODEL_CONFIG.referenceAnalysisModel` configurable, effort `medium` pour StructuralReference, timeout 120 s, `store:false`, **aucun retry automatique**. Le contrat est reconstruit/contrôlé contre le manifeste transmis.

Checkpoint pré-dispatch disponible avant POST ; progression transport attendue (dispatch, headers, requestId/status si connus). Réponse brute complète persistée **avant** parsing/validation. Réponse rejetée conservée séparément. Réponse complète tardive checkpointable sans transformer le timeout en succès : reprocessing explicite seulement.

Le reprocessing d'un attempt compatible reparse/revalide la réponse conservée sans OpenAI. Identités de captures, géométries, hauteur et certifications doivent concorder ; pas de récupération inventée depuis un attempt vide. Une lecture/revalidation historique ne déclenche pas la migration payante des captures.

Pour **nouvelle analyse** sampled : absence des certifications/vues attendues, paintEvidence, v3 ou marqueur `phase_a_fixed_pool_v1`, ou ancien overview distribué → recapture normale avant Vision. Un lot compatible peut être réutilisé ; preuve concrète Cantina en §4. Les anciennes analyses et leurs preuves restent disponibles même si une nouvelle capture/Vision échoue.

### 2.7 Routes, UI, erreurs et reprise

Racine `/api/admin/design-lab/structural-references` : liste/détail GET, création POST (peut déclencher analyse), patch/delete, `POST /:id/analyze`, liste/détail des `analysis-attempts`, `POST /:id/analysis-attempts/:attemptId/reprocess`. Routes privées ; ne pas employer la création/analyse pour un simple diagnostic en lecture seule.

UI : `client/src/pages/dashboard/admin/sites/structural-references.page.js`, `structural-references/[id].page.js`, `client/src/components/dashboard/admin/sites/structural-reference.component.js`, `structural-capture-display.js`, `structural-operation-display.js`, shell/shared Design Lab. Bouton « Réanalyser » si analyse existante ; sinon « Analyser / réessayer ». Tentatives consultables, raw/reprocessing selon disponibilité, confirmation si appel précédent incertain. Après échec HTTP/frontend : relecture GET uniquement, jamais répétition automatique du POST.

`structural-operation-diagnostic.js` borne/expurge messages, secrets, credentials et queries : referenceId/generationId, phase, code, causes chaînées, durée/budget lorsqu'applicable, transport, checkpoints et action de reprise. Logs universels `structural:operation_failed`, `structural:route_failed`, erreurs capture enrichies. Une route peut renvoyer **HTTP 200 avec référence.status=error** si le service a finalisé son échec ; ne pas inférer le succès de l'HTTP seul.

`structural-operation-recovery.service.js` : reconciliation au démarrage, périodique, lecture et reprise ; leases expirées/orphans seulement, opérations actives du processus exclues, mises à jour conditionnelles contre course. Jamais capture/analyse/retry automatique. Réponse/ancienne analyse conservées ; attempt interrompu sans réponse = appel incertain, pas succès.

**Ancien mode plateforme non payant supprimé.** Reste le refus HTTP 409 de `requirePlatformValidation:true` dans `/analyze`, avec test : sécurité de rétrocompatibilité pour qu'un vieux client ne déclenche pas un appel payant. Ne pas supprimer pour obtenir zéro occurrence historique. Aucun flag de ce mode ne doit être réintroduit. Les rapports anciens ne peuvent pas l'activer.

## 3. B1 : état des treize références demandées

### 3.1 Inventaire persistant vérifié en lecture seule

Pour les 12 références ayant des captures, les valeurs persistées lues indiquent sanitation `qualityPassed=true`, coverage `complete/reachedEnd=true`, `paintEvidence.complete=true`, `visionCleanliness.complete/restorationVerified=true`. **Cela n'est pas une nouvelle visite ni une inspection exhaustive des images Cloudinary** ; seule Cantina a fait l'objet de six lectures GET pendant la validation non payante antérieure. Son lot et ses certifications sont inchangés après le nouvel appel autorisé. Qualité artistique globale des analyses : **non vérifiée dans cette passation** ; les constats Cantina transmis par l'utilisateur sont consignés comme points d'audit en §6.

`S/F` = sampled v3/fixed_fallback ; `S/A` = sampled v3/adaptive ; `C` = continuous (coverage v2). En C, le tableau donne les trois locales Vision, pas les cinq contrôles.

| Référence / ObjectId | URL persistée exacte | État actif / Vision | Hauteur ; stratégie ; locales Vision (px) |
|---|---|---|---|
| Gucci Osteria — `6ac3603eb929a05351c55263` | `https://www.gucciosteria.com/en/florence/homepage/` | `analyzed`, réponse brute/parsée appliquée | **5212 ; S/F ; 0 / 862 / 2156 / 3450 / 4312** |
| Khufu’s Bistro — `6ac37c4ca39769ebfb35d4ad` | `https://khufusbistro.com/` | `analyzed`, réponse appliquée ; ancien attempt interrompu conservé | **7283 ; S/F ; 0 / 1277 / 3192 / 5106 / 6383** |
| Amici — `6ac37d61a39769ebfb35d589` | `https://restaurant-amici.com/restaurant/lesquin/` | `analyzed`, réponse appliquée | **6128 ; S/F ; 0 / 1046 / 2614 / 4182 / 5228** |
| Salterra — `6ac39d3c599b9a26b2dc0603` | `https://www.salterra.com/` | `analyzed`, réponse appliquée ; admission/médias ouverts | **11395 ; S/F ; 0 / 2099 / 5248 / 8396 / 10495** |
| Tastavents — `6ac39cff599b9a26b2dc05d2` | `https://tastavents.com/` | `analyzed`, réponse appliquée ; ancien rejet brut conservé | **11556 ; S/A ; 0 / 10530** |
| Waldhaus Sils — `6ac652aed3bfc71ea373557c` | `https://www.waldhaus-sils.ch/` | `analyzed`, réponse appliquée | **8654 ; S/F ; 0 / 1551 / 3877 / 6203 / 7754** |
| Castello del Sole — `6ac65489ac0bc16f77491344` | `https://www.castellodelsole.com/en/` | `analyzed`, réponse appliquée | **9748 ; C ; 0 / 4424 / 8848** |
| Amrit Palace — `6ac74fff5b813a6c08e250b5` | `https://amritpalace.com/` | `analyzed`, réponse appliquée | **10294 ; S/F ; 0 / 1879 / 4697 / 7515 / 9394** |
| Nannina — `6ac752195b813a6c08e2531c` | `https://www.nannina.de/` | `analyzed`, réponse appliquée | **6709 ; C ; 0 / 2905 / 5809** |
| Cartapani — `6ac758d7d7b33e9ce0039cea` | `https://cartapani.it/en/` | `analyzed`, réponse appliquée | **16122 ; S/F ; 0 / 3044 / 7611 / 12178 / 15222** |
| La Torre del Saracino — `6ac76fe00423e958f07a6396` | `https://torredelsaracino.it/en/` | `analyzed`, réponse appliquée | **10088 ; S/A ; 0 / 7350 / 9188** |
| Cantina del Sol — `6ac786fa95ac4c5a6cc51523` | `https://cantinadelsol.it/en` | `analyzed`, nouvelle réponse brute/parsée appliquée ; ancien timeout conservé | **9518 ; S/F ; 0 / 1724 / 4309 / 6894 / 8618**, lot existant inchangé |
| Grupo Isabella’s — `6ac789a195ac4c5a6cc51831` | `https://grupoisabellas.com/es/restaurantes/carmina/` | `error`, zéro capture/attempt distant ; **test local prêt** | Persisté : **non disponible**. Test réel : **8467 ; C ; 0 / 3784 / 7567** |

### 3.2 Generations/attempts : points d'entrée de preuve

Dernière génération appliquée retrouvée par référence (ou génération d'incident si non appliquée). Pas de retraitement/autre appel effectué pour cette lecture.

| Référence | GenerationId | Date `analyzedAt` UTC / état |
|---|---|---|
| Gucci | `8c04190b-81d6-4cc6-ba66-d57afc769e32` | 08/10 07:52:11 ; applied |
| Khufu | `86951429-38eb-4917-b51b-421044235fb3` | 08/10 07:55:33 ; applied |
| Amici | `a7ee4148-75f8-4c09-8d46-d9798e40c968` | 08/10 07:49:28 ; applied |
| Salterra | `24a894e6-e000-4f26-a898-25d9b5b7e6bc` | 08/10 08:03:03 ; applied |
| Tastavents | `c5b09056-69a2-4c95-8d62-3c13afa86b39` | 08/10 07:58:27 ; applied |
| Waldhaus | `7ecccd46-93e3-4ea6-9771-59fd8c281274` | 08/10 07:37:48 ; applied |
| Castello | `0e5b4cf0-dc04-418f-95bf-4b0130564b6d` | 08/10 07:41:00 ; applied |
| Amrit | `3a1ff431-dc9a-4512-8670-f0e100ff3832` | 08/10 08:13:04 ; applied |
| Nannina | `50fa79fc-a398-47cb-87ce-30c4fadaedca` | 08/10 08:45:02 ; applied |
| Cartapani | `e438b87d-3bbe-4c7a-a383-7df0f6b1f5e7` | 08/10 10:12:13 ; applied |
| La Torre | `28238cb4-7ad2-4d32-b26d-4237b1d624c8` | 08/10 12:02:09 ; applied |
| Cantina — analyse actuelle | `d1e9963c-2992-433f-aefa-cf254baca837` | 08/10 13:42:12 UTC / 15:42:12 Paris ; applied, réponse conservée |
| Cantina — timeout initial | `c61fb7e9-96c3-4964-8d5d-0063e4fc3be5` | failed, sans réponse ; historique conservé en §4 |
| Grupo | Historique : **non retrouvé** | Pas d'attempt ; génération du test local : `4a61bb5c-d866-4eb9-9982-11bf99fe71fd` |

### 3.3 Incidents, correctifs et limites par référence

**Gucci.** Le candidat historique à 3310 px révélait une représentation SVG/textPath incomplète. Le pool Phase A + fixes seul perdait ce verdict ; le registre v1 le retrouve depuis une visite existante autour de 2925 px, sans visite spéciale. Fallback actif : `unmeasurable_canvas_clip_or_transform`, `shadow_collector_unproven`. L'aire inconnue observée à 2925 vaut 0,3604166667, au-dessus de 0,08. Autre diagnostic rectifié : l'image lazy avec `currentSrc` vide avait **déjà un preload détaché pending**, journal global id 70 ; ne pas répéter « aucune requête ». Le loader réel attend decode/idle avant d'affecter src. Correction : corréler une déclaration lazy à un transfert déjà en cours, jamais télécharger ou activer une source artificiellement. Fixtures produit lentes/refus et visite réelle validées. Qualité artistique actuelle non vérifiée.

**Khufu.** URL correcte `khufusbistro.com`, **jamais `khufus.com`**. Le blocage de l'autre domaine ne concerne pas cette référence. Les transformations/perspectives non certifiables justifient le fallback. Carousel/vidéo traités génériquement. Redémarrage du 7/10 : capture persistée mais attempt `8e218fac-a378-481f-a8b8-9d69bf5a8c3d` encore running sans réponse ; envoi Vision indéterminé faute de trace. Lease/attempt réconciliés sans inventer succès ni réponse. Pour `78fdb998-dcdc-45f0-a56f-b69287ec7379`, l'identité de la vidéo refusée reste **non vérifiée**. Pour `a76a3c79-1a33-45b7-82b7-bc96cff45240`, Pyramids-scaled.webp était indécodée après AbortError/ABORT_ERR d'environ 12 s. Ensuite, timeout du document principal avant livraison Chromium : récupération bornée sous critères stricts (§2.5), visite individuelle puis smoke réussis. L'analyse actuelle est appliquée, l'ancienne tentative échouée reste conservée.

**Amici.** Fallback normal pour géométries/peinture non certifiables, pas un échec à transformer en adaptive. **Sources différentes** : le smoke du 8/10 visite `https://restaurant-amici.com/` (hauteur 4429, locales 0/706/1765/2823/3529), tandis que la référence persistée vise `/restaurant/lesquin/` (6128 px, tableau §3.1). Ne pas comparer ces nombres comme une régression du même document. Aucun nouvel audit artistique dans cette passation.

**Salterra.** Le panneau promo fixed était déjà détecté/dédupliqué mais restait dans les sources Phase A/storyboard, alors que certaines recaptures étaient propres. Correctif : visionCleanliness sur **tous** les buffers Vision. Puis un backdrop CMP (`div.onetrust-pc-dark-filter.ot-fade-in`, identité historique seulement) était refusé avant son traitement certifiable : correction générique de la relation consentement/backdrop et de l'ordre de traitement, sans règle propriétaire ni seuil modifié. Les rectangles gris 1100×700/posters non résolus ne valent pas preuve média ; vraies frames requises dans l'état actif.

État chargé historique : **11987 px**, reliable/adaptive, **0/2217/9945/11087**, 28 captures propres/restaurées. État dégradé : **11395 px**, 26 captures propres et footer atteint, mais **160/160**, 16 refus d'images dont les **13 vrais médias** documentés ; couverture mesurée 0,8 à 8775 et 0,7777777778 à 9945, sous 0,85. Dans l'état chargé : témoins 12/12 et 15/15. Admission avant file de priorité démontrée ; fallback cohérent, **représentation moins complète toujours ouverte**. L'analyse persistée actuelle utilise ce fallback. Un lot prêt pour Vision ne rend pas cette non-régression artistique totalement verte.

**Tastavents.** Ancien mapping des noms fixes : rejet `evidence.5.sourceViews.middle` sur [5328,6228] contre moment [7280,28;8551,44], hauteur 11556, génération `c0ffeea4-18bf-4b10-9310-f75818c4d978`. Correction générique shared manifest/sampled v3 ; cet attempt brut reste `validation_failed`, il n'est pas appliqué. Profil initial 111–114 s et `adaptive_budget_exhausted` ; nouveau séquencement validé localement, puis vrai bouton (~94,76 s), puis produit. Actuellement adaptive **0/10530**. Les compositions non retenues restent un axe artistique post-B1 ; aucun forcing du footer ni tuning. Incident ancien de gel `component_envelope_changed / visible_structure_or_source_changed` : traces exactes insuffisantes, cause particulière non démontrée ; diagnostic renforcé, gate préservé.

**Waldhaus.** Premier run analyzed avec buffers blancs : reveal non peint avant gel et preuve pixel insuffisante ; correction générique d'attente de peinture et de contrôle du buffer final, aucun délai par domaine. Puis run `bbee9928-89e0-4ab1-9532-bfbdd6eb2238`, images non chargées à 0 après 6272 ms : URLs historiques non archivées, cause exacte **non reconstructible**. Instrumentation image ajoutée ; robustesse des attentes/transferts renforcée dans les interventions suivantes. Ne pas attribuer cette génération à une ressource inconnue. Smoke ultérieur prêt et analyse actuelle appliquée. Fallback pour géométrie de peinture non certifiable, pas gate assoupli.

**Castello.** MP 4 ~40,3 Mo refusé contre 32 MiB dès Content-Length ; StructuralReference demande une surface représentative, pas la vidéo entière. Traitement générique ranges/frame/poster certifiable avec budgets/SSRF comptés, aucune exception Castello. Clic utilisateur concurrent et redémarrage audités avant poursuite ; ne pas déduire un appel abouti sans checkpoint. Mode actuel continuous : aucune motion structurelle dépendante du scroll détectée ; une vidéo animée n'impose pas sampled. Smoke avec frame réelle et analyse appliquée. Choix continuous et profondeur artistique à examiner post-B1, pas défaut mécanique prouvé par principe.

**Amrit Palace.** Identité/source/statut/coverage et attempt appliqué vérifiés aujourd'hui. Fallback : `unmeasurable_canvas_clip_or_transform`, `shadow_collector_unproven`, `opaque_primitive_geometry_uncertifiable`. Aucun rapport d'incident/correctif spécifique identifié dans les preuves consultées ; **temps de capture et qualité visuelle actuelle non vérifiés**. Ne pas inventer une validation runtime depuis les seules métadonnées.

**Nannina.** Refus `7acc1263-ad72-4798-9b09-b95c3adf0444` : badge d'attribution périphérique, pas navigation latérale. Bread_brackground_Nav_1.jpg et KnifeFork.png appartiennent à cette navigation conservée. Certification générique d'attribution concordante (§2.4), ambigus toujours bloqués. Replay corrigé : continuous,6709 px, capture 46,713 s/service 56,751 s, 18 suppressions/restaurations du seul badge ; quatre inputs propres inspectés. Analyse appliquée aujourd'hui. Pertinence de continuous et des trois locales : axe d'audit.

**Cartapani.** Refus `83377005-6e65-4b42-bb02-670914336288` : bouton 38×38 fixed, haut z-index, tracking preferences et provenance CMP certifiable. Correctif générique multi-signal, pas règle Iubenda/classe/domaine/position. Premier replay incomplet conservé ; second complet autorisé **ready_for_vision** :16122 px, sampled v3/fallback, capture 106,466 s/service 130,506 s. Les 120 s bornent la **capture**, pas le service avec navigation/préparation. 35 captures nettoyées/restaurées, seul contrôle CMP supprimé ; header, `persistent3`/cursor et lien juridique conservés ; storyboard 31 panneaux. Transformations non rectangulaires à 4680/5265 et surfaces inconnues 0,401711/0,243484 justifient le fallback. Analyse appliquée ; segmentation des longues pages/qualité artistique ouvertes.

**La Torre.** Refus `e7ac3019-b69e-43f1-83fd-e682525447c9` : « Gestisci consenso », pas médias. Certification Cartapani incomplète pour la sémantique « gérer » et pour le **callback délégué**, distinct du wrapper. Preuve : dialogue initial accepté, réaffichage réel lors d'une inspection, source CMP commune des callbacks. Correctif passif CDP borné ; handlers larges, métier et provenances mixtes restent refusés. Unique replay complet après correction : reliable/adaptive,10088 px, capture 62,654 s/service 73,138 s, locales 0/7350/9188, 24 nettoyages/restaurations du seul CMP, aucune recapture finale. Hero plein écran réellement présent dans storyboard/locale et observation naturelle. **Succession temporelle complète non observée continûment**, durées/ordre non reconstruits. Analyse appliquée aujourd'hui ; couverture locale et profondeur artistique à auditer.

### 3.4 Smoke de reprise B1 déjà obtenu — ne pas rejouer

Rapport `/private/tmp/structural-product-smoke-2026-10-08/RAPPORT.md` : **7/7 ready_for_vision**, lot frais sans changement entre sites, zéro Vision/écriture distante. Même route → service.run → captureAndPrepare, seules frontières auth fixture/modèles/upload/analyzer en mémoire. Manifeste et octets contrôlés. Une arrivée au mock analyzer n'est pas OpenAI.

| Site du smoke | Capture / service (s) | Décision |
|---|---:|---|
| Waldhaus |65,58 /81,99|sampled/fallback|
| Salterra |72,24 /81,47|sampled/fallback ; médias évincés ouverts|
| Khufu |46,49 /55,28|sampled/fallback|
| Gucci |39,25 /46,39|sampled/fallback|
| Amici **racine** |42,48 /51,02|sampled/fallback|
| Tastavents |98,07 /107,77|sampled/adaptive|
| Castello |64,83 /75,72|continuous|

Ce succès avait permis une poursuite manuelle de B1 ; il n'autorise pas une nouvelle série et n'efface pas les médias Salterra absents. Cantina est désormais analysée après un nouvel appel autorisé ; **Grupo reste la dernière analyse B1 à réaliser**. Le document couvre les **huit externes nommés**, sans inventer les autres noms des dix initiaux ni déclarer B1 artistiquement achevé.

## 4. Cantina et Grupo : résultats définitifs et procédure manuelle

### 4.1 Cantina — ANALYSÉE après nouvel appel autorisé, captures existantes conservées

Incident du 08/10 signalé vers 14 h 09 Paris : attempt `6ac7874195ac4c5a6cc51577`, génération `c61fb7e9-96c3-4964-8d5d-0063e4fc3be5`, créé 12:06:25.648 UTC, failed 12:08:25.690 UTC, **120042 ms**. Timer AbortController de `openaiRequest`, délai transmis par `analyzeStructuralReference` **120000 ms**. Ni Axios 600000, ni capture 120000, ni recovery. Timeout non augmenté.

**Prouvé pour le timeout initial** : checkpoint pré-Vision, six captures 9518 px, POST initié côté code, timeout enregistré, absence rawResponse/parsedResult/receivedAt. **Toujours inconnu pour cet ancien appel** : réception, traitement/facturation fournisseur et stade headers/body historique, faute de requestId/progression. Ne pas conclure « aucun appel traité ». Il n'existait alors aucune analyse antérieure sur cette référence ; lease libre et cohérent. Le succès ultérieur ne résout pas rétroactivement cette incertitude fournisseur.

La validation non payante antérieure est terminée : **aucune capture/navigation Cantina**. Six URLs Cloudinary versionnées persistées lues GET public HTTP 200 via transport sécurisé ; six WebP décodables, dimensions conformes : overview 720×1218 + cinq 1440×900. Inspection visuelle des six : storyboard, typographie, photographies et footer exploitables. `capturesAreClean`, `coverageIsComplete`, `visionInputsAreClean`, `paintEvidence.complete` tous vrais. Manifeste alors **strictement identique** au snapshot de l'attempt initial ; mêmes captures/géométries.

**Réutilisation démontrée par le vrai service**, copie de référence/attempt en mémoire, analyzer bloqué et capture/upload/destruction interdits : `prepared_for_vision`, `captureReused=true`, compteurs capture/captureGate/upload/destroy **0**, une arrivée à la dépendance analyzer simulée, **aucun appel réel**. Sans confirmation, `STRUCTURAL_UNCERTAIN_VISION_CONFIRMATION_REQUIRED` avant analyzer. Référence distante inchangée.

SHA-256 des téléchargements de cette validation archivés ; aucun hash original persisté ne permet d'affirmer une identité binaire avec le premier appel. URLs, dimensions, géométries et certifications concordent. **L'ancienne tentative ne contient toujours aucune réponse à retraiter gratuitement** ; la capacité de checkpoint tardif ne crée pas une réponse manquante.

**Résolution effective par un nouvel appel autorisé depuis l'interface**, et non par récupération de l'ancienne réponse : génération `d1e9963c-2992-433f-aefa-cf254baca837`, attempt `6ac79d5dd643b0e9a0ccafe7`, créé **13:40:45.522 UTC** ; HTTP fournisseur **200**, réponse brute reçue/persistée **13:42:11.623 UTC**, analyse enregistrée **13:42:12.061 UTC** (**15:42:12 Paris**), attempt `applied` **13:42:12.133 UTC**. Réponse brute et résultat parsé conservés ; l'analyse de la référence est strictement identique au résultat parsé. Statut `analyzed`, `lastError` vide et aucun token actif. Sept moments structurels persistés.

La lecture de contrôle confirme que les **six captures complètes, `captureCoverage` et `captureSanitization` sont strictement inchangées** par rapport au snapshot local de la validation antérieure. Le `captureSnapshot.captures` du nouvel attempt correspond exactement au lot actuel : **9518 px, storyboard + cinq locales 0/1724/4309/6894/8618**, sampled v3/fixed_fallback, couverture/peinture/nettoyage/restauration certifiés. Cela confirme la conservation du lot existant ; aucune nouvelle vérification binaire Cloudinary n'a été effectuée pour cette actualisation.

L'ancienne génération `c61fb7e9-96c3-4964-8d5d-0063e4fc3be5` et son attempt restent **`failed`, sans réponse brute ni résultat parsé**. Historique et incertitude du premier appel conservés. **Aucune nouvelle action Vision requise pour Cantina** : poursuivre par la dernière analyse Grupo, puis l'audit artistique post-B1.

### 4.2 Grupo — PRÊT POUR VISION après test réel ; future recapture requise

URL persistée `/es/restaurantes/carmina/`. Création 12:16:33.528 UTC, erreur 12:16:57.090 UTC ; captures=[], couverture/analyse absentes, aucun attempt, token vide. Exécution backend et échec **avant checkpoint pré-Vision** prouvés. HTTP frontend, generationId et phase originale non archivés : historique **non entièrement reconstructible**.

Premier replay pendant l'intervention incidente : **échec reproduit** à `capture_warmup`, ~6,307 s, `STRUCTURAL_CAPTURE_WARMUP_FAILED`, `r.getClientRects is not a function`, jQuery offset via helper site scrollTo. Collision avec le global prouvée pour ce replay ; attribution à l'ancien incident seulement **probable**. Le catch ne loguait que captureTiming/animationIntegrity ou erreurs d'attempt ; warm-up sans ces champs perdait le diagnostic au profit d'un message générique.

Correction `structural-native-scroll.js` : init avant scripts, conservation des primitives Window.scrollTo/Element.prototype.scrollTo ; warm-up/collecteur les utilisent sans remplacer le helper du site. Scroll/events/géométries/gates inchangés, Portfolio ordinaire préservé. Test **synthétique du chemin produit complet** avec helper incompatible prêt ; cela seul ne prouvait pas le site vivant.

**Mission suivante terminée**, un seul replay réel après fix : `4a61bb5c-d866-4eb9-9982-11bf99fe71fd`. Vraie route/service/captureAndPrepare/contrat, frontières neutralisées. **ready_for_vision**, continuous coverage v2,8467 px, complete/reachedEnd/distinctViews vrais. Capture structurelle **49,328 s** ; navigateur avec navigation/warm-up **58,201 s** ; route/service **59,319 s**. 21 viewports vérifiés. Cinq fixes 0/1513/3784/6054/7567. Quatre entrées Vision : overview 720×4234 et locales 1440×900 **0/3784/7567** ; master 1440×8467 non envoyée. Manifeste et byteproof concordants.

Inspection des quatre buffers : hero CARMINA/photo/texte/navigation, sections cuisine/groupes/cadeau/texte et vrai footer, pas overlay bloquant ni buffer blanc. 21 gates images, zéro pending/refus final. Registre unproven pour le petit texte vertical SCROLL transformé 17×~53 px ; continuous valide et indépendant, pas adaptive forcé ni sampled legacy.

**Limite visible** : bande Instagram vide. XHR POST `.../panels/instagram/getInstagramData.php` arrêté avant transport par la politique GET-only existante ; GTM écarté comme technique. Aucune hypothèse sur le contenu absent ni modification réseau pour le charger. Compositions principales exploitables ; pas certification exhaustive du flux social.

Référence persistée **inchangée**, toujours error et zéro capture/attempt distant. `LOCAL_VISION_BOUNDARY` en mémoire est l'arrêt volontaire après contrat, pas un échec de capture. **Vision sans nouvelle capture via UI : non**, les buffers locaux ne sont pas uploadés/persistés. Après autorisation : même interface → Grupo/Carmina → **Analyser / réessayer**, nouvelle capture normale puis Vision. Aucun résultat artistique récupérable actuellement.

### 4.3 Preuves finales

`/private/tmp/structural-prevision-validation-2026-10-08/` : `RAPPORT.md`, `index.html`, résultats/manifestes Grupo et Cantina, `grupo/vision-request.json`, `integrity.json`. **Pendant cette validation non payante antérieure**, références et attempt strictement identiques avant/après ; **zéro OpenAI, écriture Mongo, écriture Cloudinary et écriture HTTP externe**. Six GET publics Cloudinary, aucune gestion d'asset. Ce rapport historique précède le nouvel appel Cantina autorisé et ne décrit donc pas son statut courant.

56 fichiers pertinents contrôlés par hash, git status inchangé, diffcheck réussi lors de cette validation. Aucun second replay automatique Grupo ni replay Cantina par Codex. Le rapport incident `/private/tmp/structural-incidents-2026-10-08/RAPPORT.md` est antérieur : sa limite « pas de validation vivante Grupo après fix » est **levée par cette mission**, sans réécrire son historique. La présente actualisation vérifie uniquement les données MongoDB en lecture native, sans capture, appel Vision ni écriture distante ; le nouvel appel réussi Cantina a été effectué manuellement depuis l'interface avant cette lecture.

## 5. Décisions et 17 fichiers de l'intervention récente

### 5.1 Retenu / écarté

| Sujet | Décision et motif |
|---|---|
| Shared manifest sampled v3 | Alignement prompt/snapshot/validation avec identifiants/géométries réels ; pas mapping par rôle legacy. Lecture/reprocessing historiques compatibles, nouvelle analyse exige lot compatible. |
| Nouveau séquencement | Retenu après shadow, registre, visites réelles, répétitions et deux branches depuis vrais boutons. Gain par suppression des candidats rejetés, pas par retrait de contrôles. |
| Phase A seule pour la qualité | Écartée : macro couverture/diversité/stabilité ne remplacent pas les cinq preuves post-parcours de cadrage/hauteur/médias/pixels. |
| Probes légers remplaçant fixes | Non implémentés : coûts proches et preuves manquantes, notamment Gucci. Cinq fixes conservées entières. |
| Pool réduit sans registre | Insuffisant : retirer 3310 Gucci perdait la preuve négative. Registre distinct conserve celle intrinsèquement détectée ailleurs. |
| Budget facultatif | `adaptive_budget_exhausted` vers un fallback déjà valide plutôt que faire échouer toute capture ; étapes obligatoires toujours bloquantes,120 s inchangé. |
| Scoring | Marginal, générique, reproductible ; aucun tuning pour un site/footer, aucune obligation de cinq locales. Une utilité géométrique n'est pas une évaluation artistique. |
| Gel et peinture | Sources/enveloppes/layout/pixels vérifiés puis restaurés ; pas tolérance générale aux animations ou simulation. |
| Nettoyage | Toute entrée Vision propre, storyboard compris ; preuve positive pour supprimer, navigation/narration protégées, ambigus refusés. |
| Recovery/coûts | Réponses brutes durables avant parsing, ancienne analyse préservée, reprocessing explicite, leases réconciliées sans appel, incertitude confirmée manuellement. |
| Admission Salterra | Prototype non activé : inventaire précoce et plan des ranges futurs non certifiés. Ne pas relever 160, réserver quota arbitraire ou blacklister un fournisseur. Recherche suspendue. |
| Mode plateforme non payant | Infrastructure active supprimée, diagnostics passifs/CLI sûrs conservés ; refus des anciens payloads maintenu pour éviter un appel payant accidentel. |

### 5.2 Les 17 fichiers Cantina/Grupo

Attribution selon le rapport incident 08/10 ; **pas la liste complète du diff HEAD**, qui contient le chantier précédent. Aucun de ces fichiers modifié par la validation ciblée suivante.

| # | Fichier | Modification récente |
|---:|---|---|
|1|`server/services/design-lab/structural-operation-diagnostic.js`|Normalisation, expurgation, causes/phases/transport/checkpoints et conditions de reprise.|
|2|`server/services/design-lab/structural-native-scroll.js`|Conservation des natives avant scripts sans écraser les API du site.|
|3|`server/services/design-lab/structural-reference.service.js`|Phases/log universel, garde d'incertitude, checkpoints et conservation des preuves.|
|4|`server/services/design-lab/openai.service.js`|Progression attendue, timeout codé/causé, réponse complète tardive checkpointable.|
|5|`server/services/design-lab/portfolio-capture.service.js`|Phases passives et warm-up native-scroll structurel ; Portfolio ordinaire intact.|
|6|`server/services/design-lab/structural-page-capture.service.js`|Primitives natives dans le parcours existant, sans changement des gates.|
|7|`server/services/design-lab/structural-operation-recovery.service.js`|Diagnostic et incertitude lors d'interruption, sans appel automatique.|
|8|`server/models/structural-reference.model.js`|operationDiagnostic, analysisCaptureSnapshot, retainedCaptureIds.|
|9|`server/models/structural-analysis-attempt.model.js`|Diagnostic durable et visionTransport.|
|10|`server/routes/admin/design-lab-structural.routes.js`|Erreurs API structurées, confirmation et messages expurgés.|
|11|`client/src/components/dashboard/admin/sites/structural-reference.component.js`|Phases/attempts, reprocessing, confirmation et GET après erreur.|
|12|`client/src/components/dashboard/admin/sites/structural-operation-display.js`|Libellés et conditions de reprise/confirmation.|
|13|`server/tests/design-lab-structural.test.js`|Timeout/refus/absence/réponse tardive/stockage/secrets et protection des analyses.|
|14|`server/tests/design-lab-structural-product-path.test.js`|Vraie route complète avec scrollTo remplacé.|
|15|`server/tests/design-lab-structural-operation-recovery.test.js`|Orphans/leases/réponses préservées/incertitude et confirmation.|
|16|`client/tests/structural-operation-display.test.js`|Messages, recovery et confirmation.|
|17|`server/docs/STRUCTURAL_REFERENCES.md`|Décisions permanentes sur erreurs, coûts, preuves et primitives natives.|

## 6. Audit critique post-B1 : investigations, pas corrections déjà décidées

| # | Axe | Preuve et questions ouvertes |
|---:|---|---|
|1|Saturation Salterra 160|**Défaut démontré** :13 médias évincés selon ordre. Compteur oracle prouvé offline ; inventaire utile assez tôt, libération et futures plages vidéo non certifiés. Recherche suspendue.|
|2|Locales Tastavents/La Torre|**Préoccupation artistique** : deux/trois locales avec macro complète ; comparer détails/échelles/typo/galeries/ruptures et evidence Vision. Pas forcing de section/footer ou quota 5.|
|3|Continuous Castello/Nannina|**Choix observé**, pertinence à évaluer. Vidéo ou animation ≠ motion structurelle détectée ; comparer fidélité spatiale et limites temporelles avant décision.|
|4|Cartapani/longues pages|**Axe d'amélioration** :16122 px,31 panneaux, cinq locales fallback. Unités narratives, contexte et mise à l'échelle, sans inventer positions ni supprimer preuves.|
|5|Taxonomie des moments|**Critique à valider** sur les analyses B1 : layoutMode/structuralMoments existent, JSON valide ne prouve pas richesse. Aucun changement acté.|
|6|Fidélité/profondeur Vision|**Audit artistique requis**. Faux geste de popup Salterra était défaut d'entrée démontré et nettoyé ; comparer descriptions/singularités aux vraies captures et jugement humain.|
|7|Overlays/widgets/badges/CMP|Corrections certifiées réalisées ; **risques restants** de provenance/multilingue/ambiguïté. Preuve + test produit, jamais acceptation globale ni règle fournisseur.|
|8|Médias/lazy/peinture|Défauts/races prouvés et corrigés, diagnostics historiques manquants non reconstruits. Frames réellement peintes exigées ; flux Instagram Grupo limité par POST. Pas source inventée.|
|9|Robustesse/recovery/diagnostics|875 tests et vrais trajets renforcés ; **limites** de l'état fournisseur incertain, ancien journal absent, fixture ≠ site vivant. Conserver preuves/analyses et distinguer HTTP/localmock/Mongo.|

### Cantina : constats artistiques à examiner après B1

La nouvelle analyse persistée contient **sept moments**. Les moments **3 (29–38 %)** et **5 (55–69 %)** ont uniquement `overview` dans `evidence.sourceViews` ; leur texte indique explicitement l'absence d'observation locale couvrant ces plages. Ce sont des descriptions depuis le storyboard, avec une précision locale à évaluer, pas des preuves HD supplémentaires.

Les observations de relecture transmises par l'utilisateur complètent les axes 2, 5 et 6 ci-dessus ; **ce sont des points d'audit, aucun correctif n'est décidé** :

- Taxonomie parfois trop générique : `oversizedTypography` décrit aussi bien le bloc de grandes lignes du moment 2 que le signe monumental avec note latérale du moment 4 ; `layeredPhotography` recouvre l'entrée superposée du moment 1 et la bande photographique avec débordement vertical du moment 6. Vérifier si ces catégories préservent suffisamment les différences de composition.
- Principes transférables pertinents, mais parfois insuffisamment précis sur les **proportions, décalages, tensions spatiales et relations entre masses**. Comparer leur formulation aux captures et aux singularités observées avant toute évolution du contrat ou des prompts.
- Bonne compréhension du **rythme global, des respirations et des changements de densité** ; conserver cette capacité dans l'évaluation de la précision locale.
- Distinguer les **transitions spatiales observées** entre compositions des **animations temporelles non prouvées**. Les formulations de passage ou de remplissage progressif ne prouvent pas une séquence animée ; son observation relèvera de **Motion Observation**, sans reconstruction hypothétique depuis des captures fixes.

### Réservation Salterra : ne pas surinterpréter la simulation

Prototype hors repo `/private/tmp/structural-final-stabilization-2026-10-07/reservation-prototype/` : compteur réserve les clés certifiées non satisfaites, invariant `used + 1 + reserved ≤ 160`. Avec inventaire **rétrospectif/oracle**,13/13 médias et 16/16 ranges (dont 4 hero) protégés ; **admis ≠ chargé**, aucun nouveau pixel/gate. Deux ordres 148/138 obligations ; union 149 partagée consomme 159/149 et laisse des réservations dont la libération précoce n'est pas prouvée.

Les 13 déclarations existent dans HTML archivé, mais pas un certificat de branche active/nécessité au bon instant. Premier refus dégradé~4,417 s, premier gate~12,418 s. CSS/fonts importés, scripts runtime et propriétaires de sous-frames peuvent être connus trop tard. Contre-exemple média : huit ranges 64 KiB acceptées pour 512 KiB ;8 MiB/source ne justifie pas « quatre plages maximum ». Réserver N par vidéo serait arbitraire. Brouillon passif `/private/tmp/structural-render-obligations-2026-10-08-draft.js` non importé par produit ; étude passive finale sur sept sites **non démontrée**. Aucun résultat ne permet l'activation runtime.

## 7. Vision artistique et roadmap

Objectif : **intelligence artistique capable de composer des homepages originales**, de qualité au moins comparable à la homepage **Le Ventadour réalisée manuellement**. Cette exigence utilisateur n'est pas un résultat artistique atteint prouvé ici. Ne pas réduire le projet à des captures ou templates.

- Qualité artistique avant simple conformité technique ; analyzed/ready/JSON valide ne sont pas une approbation humaine.
- StructuralReference apprend une **grammaire spatiale transférable**, pas des copies de photos, branding, wording ou layouts.
- Une capture fixe ne prouve ni mouvement, séquence, transition ni causalité. Une frame/galerie gelée ne constitue pas Motion Observation.
- Les futurs fingerprints doivent préserver les singularités, plutôt que normaliser toutes les références en templates.
- La créativité porte sur la **composition globale**, le rythme, les ruptures, la hiérarchie, la densité et le vide, pas uniquement des sections isolées.
- Corrections génériques et causes prouvées ; pas de hack par domaine, tuning intermédiaire de benchmark ou gate allégé pour obtenir un score positif.

**Chemin critique fourni par l'utilisateur dans la demande de passation** :

```text
B1 et audit StructuralReference → Motion Observation
→ StructuralFingerprint et MotionFingerprint → DesignReference
→ Portfolio Gusto → Asset Intelligence → Global Composition Director
→ package DA → Creative Components → Motion Director
→ génération visuelle → benchmark Ventadour → généralisation
→ Site Factory → QA → freeze V1
```

DesignReference, Portfolio, directions, Style Frames, homepages visuelles et approvals sont déjà implémentés dans leur version actuelle. Les nouvelles couches Motion Observation, fingerprints artistiques, Asset Intelligence, Global Composition Director, Creative Components, Motion Director et leur chaînage ne sont pas démontrés dans les modules consultés : **roadmap future**. Site Factory/génération code Next/QA visuelle/déploiement décrits comme futurs dans DESIGN_LAB.md ; approvedSnapshot est un contrat préparatoire, pas une factory fonctionnelle.

**Aucune roadmap officielle globale complète identifiée dans les documents Design Lab consultés.** Ne pas prétendre l'avoir consultée : l'ordre ci-dessus vient de la demande utilisateur. Avant les phases futures, obtenir le référentiel officiel si nécessaire et ne pas inventer ses critères de sortie.

## 8. Reprise technique : dépôt, configuration, tests et preuves

### 8.1 Git

Branche `site`, HEAD `2bd44a3321ec11f9d3b5263ecb47673eccf3e3ef`, message `checkpoint: upgrade sampled captures to v3 and share Vision view manifest`. Checkpoint antérieur `309dd3d`, `checkpoint: stabilize Design Lab structural references before Vision validation`. Les correctifs depuis HEAD ne sont pas committés. **58 chemins préexistants**, ce document ajoute le 59 e. Ne pas reset vers HEAD/develop, supprimer, commit ou push sans autorisation.

`server/diagnostics/` est ignoré dans .gitignore. Les rapports y restent disponibles localement mais ne voyagent pas avec Git. Ne pas les effacer pendant la passation. Liste précise des 58 chemins en annexe.

### 8.2 Configuration : noms seulement, aucune valeur secrète

- API : `PORT` (défaut 8012), `CONNECTION_STRING_TEST` effectivement utilisée par app.js ; le nom ne prouve pas à lui seul quelle base est connectée. JWT admin et .env serveur privés.
- Capture : `GUSTO_PORTFOLIO_CAPTURE_ENABLED=true` opt-in ; `GUSTO_PORTFOLIO_CHROME_PATH` si besoin. Chrome local installé et playwright-core ; pas navigateur embarqué autorisé en production par défaut.
- Scoring : `GUSTO_STRUCTURAL_SELECTION_THRESHOLD`, `GUSTO_STRUCTURAL_MACRO_CANVAS_WIDTH`, `GUSTO_STRUCTURAL_MACRO_CANVAS_HEIGHT`. Configuration figée pendant B1 ; contrôler les paramètres effectifs avant comparaison, sans modifier.
- OpenAI : `OPENAI_API_KEY` côté serveur ; `OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL` (défaut code gpt-6-luna), `OPENAI_DESIGN_DIRECTION_MODEL` (gpt-6.1-sol), `OPENAI_DESIGN_IMAGE_GENERATION_MODEL` (gpt-image-2.5-flare), `OPENAI_DESIGN_IMAGE_EDIT_MODEL` (gpt-image-2.5-sunburst), `OPENAI_DESIGN_IMAGE_QUALITY`. Défauts code, pas affirmation des overrides du prochain run.
- Cloudinary : `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Ne pas copier credentials/URLs privées dans les docs.
- Dashboard : `NEXT_PUBLIC_API_URL`, usuel `http://localhost:8012/api`, admin-token localStorage ; Next dev 8002. Ne pas build dans le même .next que le dev actif.
- Versions des manifests : Express 4, Mongoose 8/driver Mongo 6, Sharp 0.32.5, playwright-core 1.63, Cloudinary 2.x ; Next 14/React 18/Axios. Node exact **non revalidé** pour cette rédaction. Sources `server/package.json`, `client/package.json`.

### 8.3 Commandes et résultats connus

Points de reprise, **pas une consigne d'exécuter toute la liste**. Aucune commande de capture/IA/migration ne devient autorisée par sa présence ici.

```sh
# Depuis gusto-manager/server : démarrage normal avec DB, crons et recovery
npm run dev
# ou
npm start

# Depuis gusto-manager/client : dashboard
npm run dev

# Backend : runner Node, série pour limiter contention Chrome
node --test --test-concurrency=1 tests/*.test.js
# Client, depuis client
node --test --test-concurrency=1 tests/*.test.js
# Build client ; copie/check-out isolé si dev actif
npm run build

# Exemple syntaxe backend, sans lancer l'application
node --check services/design-lab/structural-reference.service.js
# Depuis le dépôt
git diff --check
```

Démarrage normal vérifié historiquement sur 8012/8002. **Ne pas importer/lancer app.js dans un test exigeant zéro écriture distante** : connexion, crons et recovery y fonctionnent normalement. Le passage complet backend le plus récent a été exécuté en **trois lots sériels couvrant 54 fichiers**, pas une nouvelle exécution déclenchée par cette rédaction.

| Validation finale 08/10 | Résultat et log dans /private/tmp |
|---|---|
| Cœur StructuralReference / recovery / diagnostics |**97/97**, `structural-incidents-core-tests-final.log`|
| Sanitation / CMP / cleanup / product-path Chrome |**70/70**, `structural-incidents-browser-tests.log`|
|47 autres fichiers backend|**708/708**, `structural-incidents-backend-complement.log`|
|Backend total|**875/875**, zéro échec/skip/cancel dans les passages finaux|
|Client|**16/16**, `structural-incidents-client-tests-final.log`|
|Build dashboard final isolé|Réussi, `structural-incidents-client-build-final.log`|
|Syntaxe backend touché / diffcheck|Réussis, rapport incident et dernière validation ciblée|
|Fixture complète nativescroll|Réussie ; ciblage 1 pass/13 horsfiltre dans `structural-incidents-native-scroll.log`, ensuite inclus dans la suite 70|
|Site réel Grupo après fix|**Un run réussi**, §4 ; pas une nouvelle suite complète|

Logs initiaux 90/96 et build ENOENT conservés : **pas les résultats finaux**. Build initial en checkout dev a échoué à collecte des pages alors que dev utilisait le même .next ; builds isolés suivants réussis. Warnings fonts indisponibles/Browserslist/lint préexistants non bloquants. Ancien bilan de bascule 776 backend/14 client historique ;875/16 est le dernier état testé. Aucun test/build supplémentaire nécessaire pour cette modification documentaire seule, selon AGENTS.md.

Tests clés : structural (contrat/service/checkpoints/timeouts/persistance), product-path et son helper (vraie route jusqu'aux octets), page-capture/sequencing/selection/reliability-shadow, cleanup/consent-preferences/sanitization, animation/paint-video/images/image-diagnostics/resource-recovery, operation-recovery/product-diagnostics/capture-profile/app-startup. Fixtures Chrome locales, providers/persistance mockés. Ne pas lancer un vrai site payant pour faire passer un test.

### 8.4 Outils sûrs, diagnostics passifs et preuves temporaires

- `server/scripts/dryRunStructuralReference.script.js` : service.run dryRun explicitement isolé `localCaptureOnly`, même captureAndPrepare, gardes avant imports et arrêt au contrat. Ancien flag expérimental refusé ; options shadow = comparaisons offline.
- `server/scripts/smokeStructuralProductPath.script.js` : vraie route/service/capture, auth fixture et modèles/upload/analyzer en mémoire, gardes OpenAI/Mongo/Cloudinary/HTTP ; n'importe pas app.js. Compare manifestes et bytes, archive **hors repo**. Le mock analyzer n'est pas Vision. Une URL seulement si autorisée ; `--core` visite sept sites et n'est pas autorisé par la passation.
- Exemples **sur autorisation ultérieure seulement** : `node scripts/smokeStructuralProductPath.script.js <URL_exacte> /private/tmp/<nouveau-dossier>` ; `node scripts/dryRunStructuralReference.script.js <URL_exacte> <sortie> 1`.
- `structural-product-diagnostics.js` : archive passive dev par `--structural-product-diagnostics-output=<sous-dossier-server/diagnostics>`, locale/atomique ; aucun choix réseau/gate/analyzer. Ce n'est pas l'ancien mode de validation.
- Renderers shadow/fixed-pool/reliability/local-sequencing et benchmarkSelection : rapports/comparaisons, pas source de captures produit préenregistrées. Certains CLI naviguent : lire et autoriser avant exécution.
- Scripts de cette validation en /private/tmp : `structural-prevision-read.cjs`, `structural-prevision-cantina.cjs`, `design-lab-handoff-read.cjs`. Lectures natives/GET ou copie mémoire, sans app.js. Ni migrations produit ni données à publier.

| Preuve locale temporaire | Usage |
|---|---|
|`server/diagnostics/structural-platform-validation-2026-10-06/RAPPORT.md`|Vrais boutons Tastavents adaptive 0/10530~94,76 s et Gucci fallback~46,71 s ; mode depuis supprimé.|
|`server/diagnostics/structural-shadow-fixed-pool-2026-10-06/`|Perte du verdict Gucci 3310 sans registre.|
|`server/diagnostics/structural-shadow-reliability-2026-10-06-final/`|Registre testé sur cinq, indépendant du pool artistique.|
|`server/diagnostics/structural-experimental-sequencing-2026-10-06/`|Mesures réelles avant bascule ; historique uniquement.|
|`server/diagnostics/structural-vision-cleanup-2026-10-07/RAPPORT.md`|Inputs propres, popup/restauration.|
|`server/diagnostics/structural-khufu-recovery-2026-10-07/RAPPORT.md`|Lease orpheline/attempt vide, envoi ancien inconnu, remise en état.|
|`server/diagnostics/structural-b1-media-reveal-2026-10-07/`|Waldhaus/Castello ; distinguer planches brutes et finales.|
|`/private/tmp/structural-salterra-overlay-2026-10-07/`|Backdrop et états médias/couverture Salterra.|
|`/private/tmp/structural-final-stabilization-2026-10-07/RAPPORT.md`|Khufu timeout transport 12 s, Gucci preload réel corrélé.|
|`/private/tmp/structural-final-stabilization-2026-10-07/reservation-prototype/RAPPORT.md`|Oracle/ranges contre-exemples, décision non activée.|
|`/private/tmp/structural-product-smoke-2026-10-08/RAPPORT.md`|Lot 7/7 et défaut Salterra explicite.|
|`/private/tmp/structural-nannina-2026-10-08/RAPPORT.md`|Badge versus navigation, correctif générique et buffers.|
|`/private/tmp/structural-cartapani-2026-10-08/RAPPORT-FINAL.md`|Second replay complet ; premier incomplet n'est pas verdict final.|
|`/private/tmp/structural-torre-2026-10-08/RAPPORT.md`|CMP délégué, hero réel et limite temporelle.|
|`/private/tmp/structural-incidents-2026-10-08/RAPPORT.md`|17 fichiers, diagnostic Cantina/Grupo et 875/16 ; avant succès vivant Grupo.|
|`/private/tmp/structural-prevision-validation-2026-10-08/RAPPORT.md`|Validation finale Grupo/Cantina, six GET et réutilisation sans capture.|
|`/private/tmp/design-lab-b1-handoff-state-2026-10-08.json`|Lecture 13 références et attempts pour ce document, pas de rawResponse copié.|

**Documents pérennes** : `server/docs/DESIGN_LAB.md`, `STRUCTURAL_REFERENCES.md`, `STYLE_FRAME_PIPELINE.md`, `DIRECTIONS_V2_CONTRACT.md`, `DIRECTIONS_V2_RECOVERY.md`, `DIRECTION_VERSIONING.md`, `HOMEPAGE_V2_RECOVERY.md` et présent handoff. Sources/tests/CLI du dépôt pérennes même quand pas encore committés. Logs/snapshots/captures offline temporaires ; conclusions essentielles reprises ici, pas de dépendance exclusive à /private/tmp. Ne pas publier .env, HTML/base 64 ou snapshots bruts d'incident. Aucun nettoyage effectué.

### 8.5 Annexe : 58 chemins préexistants du worktree

État avant ce document. M = suivi modifié, ?? = pas encore suivi. La liste **ne demande aucun nettoyage** et n'attribue pas tous les changements à la dernière intervention.

```text
 M client/src/components/dashboard/admin/sites/structural-reference.component.js
 M server/app.js
 M server/docs/STRUCTURAL_REFERENCES.md
 M server/models/structural-analysis-attempt.model.js
 M server/models/structural-reference.model.js
 M server/routes/admin/design-lab-structural.routes.js
 M server/services/design-lab/capture-image-visibility.js
 M server/services/design-lab/capture-sanitization.service.js
 M server/services/design-lab/existing-website.service.js
 M server/services/design-lab/openai.service.js
 M server/services/design-lab/portfolio-capture.service.js
 M server/services/design-lab/structural-animated-components.js
 M server/services/design-lab/structural-observation-selection.js
 M server/services/design-lab/structural-page-capture.service.js
 M server/services/design-lab/structural-persistent-elements.js
 M server/services/design-lab/structural-reference.contract.js
 M server/services/design-lab/structural-reference.service.js
 M server/services/design-lab/structural-resource-policy.js
 M server/tests/design-lab-structural-animation.test.js
 M server/tests/design-lab-structural-page-capture.test.js
 M server/tests/design-lab-structural-selection.test.js
 M server/tests/design-lab-structural.test.js
?? client/src/components/dashboard/admin/sites/structural-operation-display.js
?? client/tests/structural-operation-display.test.js
?? server/scripts/dryRunStructuralReference.script.js
?? server/scripts/renderStructuralFixedPoolShadowReport.script.js
?? server/scripts/renderStructuralLocalSequencingReport.script.js
?? server/scripts/renderStructuralReliabilityShadowReport.script.js
?? server/scripts/renderStructuralShadowReport.script.js
?? server/scripts/smokeStructuralProductPath.script.js
?? server/services/design-lab/structural-capture-profile.js
?? server/services/design-lab/structural-consent-backdrop.service.js
?? server/services/design-lab/structural-consent-preferences.service.js
?? server/services/design-lab/structural-native-scroll.js
?? server/services/design-lab/structural-observation-shadow.js
?? server/services/design-lab/structural-operation-diagnostic.js
?? server/services/design-lab/structural-operation-recovery.service.js
?? server/services/design-lab/structural-paint.service.js
?? server/services/design-lab/structural-product-diagnostics.js
?? server/services/design-lab/structural-reliability.service.js
?? server/services/design-lab/structural-resource-diagnostics.js
?? server/services/design-lab/structural-video.service.js
?? server/services/design-lab/structural-vision-cleanup.service.js
?? server/tests/design-lab-app-startup.test.js
?? server/tests/design-lab-structural-capture-profile.test.js
?? server/tests/design-lab-structural-consent-preferences.test.js
?? server/tests/design-lab-structural-image-diagnostics.test.js
?? server/tests/design-lab-structural-operation-recovery.test.js
?? server/tests/design-lab-structural-paint-video.test.js
?? server/tests/design-lab-structural-product-diagnostics.test.js
?? server/tests/design-lab-structural-product-path.test.js
?? server/tests/design-lab-structural-reliability-shadow.test.js
?? server/tests/design-lab-structural-resource-recovery.test.js
?? server/tests/design-lab-structural-sequencing.test.js
?? server/tests/design-lab-structural-shadow.test.js
?? server/tests/design-lab-structural-vision-cleanup.test.js
?? server/tests/helpers/structural-consent-fixture.js
?? server/tests/helpers/structural-product-path.js
```

## 9. OÙ NOUS EN SOMMES / CE QUI EST VALIDÉ / CE QUI RESTE À FAIRE / PROCHAINE ACTION AUTORISABLE

### OÙ NOUS EN SOMMES

Pipeline produit unique, cinq fixes et sécurité intactes, shared manifest, registre distinct du scoring, buffers Vision propres, attempts/recovery/diagnostics. **Douze références analysées sur treize**, avec réponses conservées et attempts appliqués ; **Cantina a réussi**, **Grupo reste la seule analyse B1 à réaliser**, techniquement prête mais sans captures ni analyse persistées. B1 et sa qualité artistique globale **pas déclarés terminés**.

### CE QUI EST VALIDÉ

- Séquencement normal sans tournée inutile, mêmes gates/poids/seuils/SSRF et budgets, aucun mode plateforme alternatif.
- Collision scrollTo corrigée génériquement ; fixture complète puis **unique succès réel Grupo après fix** avec images exploitables.
- Six captures Cantina accessibles/certifiées et contrat compatible ; nouvel appel autorisé **appliqué**, lot et certifications existants conservés, réponse brute/parsée persistée. Ancien timeout et incertitude fournisseur toujours documentés.
- Diagnostics universels, protection des analyses/preuves, checkpoint tardif complet récupérable, incertitude confirmée et recovery sans retry.
- Derniers tests 875 backend/16 client et build isolé ; aucune modification du moteur pendant la validation suivante ou cette passation.

### CE QUI RESTE À FAIRE

- **Opérationnel B1** : après accord, terminer **Grupo uniquement** (recapture normale puis Vision). Vérifier réponse/attempt/analyse réels, pas juste HTTP. Cantina ne nécessite plus de nouvel appel. Pas de reprise automatique des autres sites ni promesse de latence.
- **Audit post-B1** : évaluer inputs et résultats artistiques selon les neuf axes (§6), notamment Salterra, les couvertures locales et les constats Cantina sur ses sept moments, sa taxonomie et la précision des principes. Aucune correction décidée d'avance, aucun tuning entre références.
- **Salterra** : problème documenté non résolu ;160 et 0,85 inchangés. Ne pas reprendre spontanément la réservation passive/runtime.
- **Motion Observation** : étape ultérieure après B1/audit et validation de spécification/roadmap. Galeries gelées et frames ne constituent pas cette observation.

### PROCHAINE ACTION AUTORISABLE

Nouvelle conversation : lire ce document, puis seulement les sources/docs nécessaires à la mission confiée. **Attendre l'autorisation explicite du dernier appel B1 Grupo** : la préparation technique ne vaut pas autorisation. Ensuite Sites → Références structurelles → **Grupo/Carmina → Analyser / réessayer**, avec recapture normale puis Vision, selon l'instruction utilisateur. **Ne pas relancer Cantina**, dont l'analyse est appliquée. Après cette dernière analyse, préparer l'audit artistique post-B1. Aucune mutation/capture pour simplement reprendre le contexte.

Sans nouvelle autorisation : consultation locale/lecture de preuve et préparation de l'audit. Pas B1 automatique, retry Vision, refonte, optimisation artistique ou Site Factory prématurée. Cette rédaction et son actualisation modifient uniquement le présent document, sans suppression ni commit, recapture, appel OpenAI ou écriture MongoDB/Cloudinary par Codex.
