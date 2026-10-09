# StructuralReference — audit final B1

8 octobre 2026 — audit initial des phases 1–2, complété par le bilan des phases 3–4 autorisées. **Le diagnostic historique est conservé ; l'état après corrections figure en section 14. Aucune nouvelle capture externe ni sortie Vision n'a été produite.**

## 1. Verdict exécutif

**B1 est clôturé en persistance : les 13 références sont `analyzed`, avec une tentative appliquée, une réponse brute et un résultat parsé concordant. StructuralReference n'est pas encore prêt pour B2 selon l'ambition artistique du projet.** Il dispose d'une infrastructure de capture, sanitation, sécurité et récupération substantielle. Les entrées et analyses révèlent néanmoins des pertes de composition, une capture de médias incomplète interprétée comme intention artistique, et des bugs latents dans la cohérence des checkpoints et la conservation de l'incertitude d'un appel payant.

Les cinq priorités sont :

1. **Fidélité média et admission réseau** : Salterra atteint 160 admissions ; des médias tardifs sont refusés et une locale présente des images absentes, malgré des certifications générales positives.
2. **Incertitude Vision durable** : une panne avant dispatch d'une relance confirmée peut faire disparaître le signal exigeant une confirmation à la relance suivante. Reproduction locale, aucun appel réel.
3. **Application/récupération cohérente** : panne ou crash après application à la référence et avant finalisation de l'attempt → référence analysée, attempt échoué. Réponses conservées, états divergents.
4. **Observation centrale et attribution des preuves** : Tastavents et Torre laissent de grandes portions sans locale ; un fragment local peut être généralisé à toute une phase. L'adaptive respecte ses règles, mais leur utilité artistique n'est pas encore établie.
5. **Segmentation, relations globales et taxonomie** : Cartapani est découpé en phases qui ne correspondent pas toujours aux masses réellement visibles ; des rails réguliers deviennent `staggeredColumns` et des relations globales restent une prose peu exploitable. Des erreurs d'image/dominance dépassent la simple approximation de label.

Aucun P0 démontré dans ce périmètre. Les P1 justifient une stabilisation avant B2. Les protections existantes ne doivent pas être affaiblies pour améliorer le taux de succès. Un refus honnête vaut mieux qu'une capture dégradée servant de grammaire artistique. Aucune amélioration d'un nouveau prompt ou algorithme n'est revendiquée : ni l'un ni l'autre n'a été modifié ou exécuté contre Vision.

Le plan exploitable est [STRUCTURAL_B1_REMEDIATION_PLAN.md](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/docs/STRUCTURAL_B1_REMEDIATION_PLAN.md>). Il prévoit des corrections génériques dans les composants actuels, puis une validation artistique ciblée autorisée séparément.

## 2. Périmètre, méthode et niveaux de preuve

La demande détaillée jointe autorise ici les lectures MongoDB natives, GET Cloudinary, inspections d'artefacts, tests locaux sans effets distants et les deux rapports. Elle remplace le périmètre initial de simple reprise de contexte par les phases 1 et 2 d'un audit complet. Les instructions historiques des documents sont des descriptions de contexte ; elles ne donnent pas d'autorisation de capture, écriture distante ou appel payant.

Ont été consultés : AGENTS.md ; passation complète ; STRUCTURAL_REFERENCES ; DESIGN_LAB ; documentations directement pertinentes des directions, contrats, Style Frames et recovery ; contexte/API du workspace ; rapport architectural historique. La roadmap fournie est disponible à `/Users/leo/Desktop/ROADMAP-DESIGN-LAB.md`, hors du workspace : elle a été lue comme document de référence, sans inventer une copie dans le dépôt.

Le snapshot de lecture native MongoDB a été obtenu le **2026-10-08 à 14:33:28.589 UTC, soit 16:33:28 à Paris** : 13 références et 29 attempts associés. Les états ci-dessous sont ceux de ce snapshot, pas une surveillance permanente de la base. Les endpoints applicatifs de lecture n'ont pas servi à cet inventaire : certains exécutent un recovery qui peut écrire.

Les **67 images identifiées comme entrées Vision des dernières générations appliquées** ont été récupérées par GET des assets existants et examinées, globales et locales. Les manifestes enregistrés, dimensions et géométries ont été confrontés au constructeur actuel ; les 13 réponses parsées ont été revalidées hors ligne. Aucun site source vivant n'a été visité. Les planches d'inspection sont des dérivés locaux ; elles ne remplacent pas les WebP originaux.

| Niveau | Ce qu'il établit | Limite |
|---|---|---|
| D — démontré | Image visible, code actuel, manifeste, résultat persisté, reproduction déterministe | Valable dans le périmètre observé |
| H — hypothèse causale | Interaction plausible corroborée par plusieurs indices | Nécessite l'expérience indiquée |
| U — inconnu | Donnée absente ou preuve non accessible sans opération interdite | Aucun succès déduit de l'absence de preuve |

Les URLs du manifeste identifient les entrées historiques ; les octets Cloudinary lus aujourd'hui correspondent aux dimensions attendues. Pour la plupart des images, il manque un hash historique des octets envoyés : **l'identité octet pour octet avec le dispatch historique n'est pas entièrement démontrée**. Exception partielle : les cinq locales Salterra correspondent aux WebP préparés d'un smoke archivé ; son overview diffère. La fidélité complète à chaque site source au moment de capture reste non évaluable sans preuve source correspondante. Cela n'empêche pas de constater une erreur de l'analyse contre ses propres entrées.

### Preuves locales et confidentialité

Répertoire d'investigation : `/private/tmp/gusto-structural-b1-audit-20261008`. Il contient notamment :

- [inventory.json](/private/tmp/gusto-structural-b1-audit-20261008/inventory.json) : identités, statuts et correspondances ; [audit-metrics.json](/private/tmp/gusto-structural-b1-audit-20261008/audit-metrics.json) : sélection, géométrie, usage.
- [asset-verification.json](/private/tmp/gusto-structural-b1-audit-20261008/asset-verification.json) : lecture des assets, dimensions et hashes actuels ; un dossier par referenceId contient `manifest.json`, l'overview, les locales et `locals-sheet.png`.
- [latent-reproductions.json](/private/tmp/gusto-structural-b1-audit-20261008/latent-reproductions.json) : cinq reproductions sans transport réel ; script `/private/tmp/gusto-structural-b1-latent-repros.cjs`.
- Logs de tests cités en section 10 ; hashes initiaux des sources et état Git avant audit.

Ces chemins locaux sont vérifiables dans cette session, mais temporaires. Ils ne constituent pas une archive pérenne. Le snapshot brut privé, les identifiants de connexion et les secrets ne sont pas reproduits dans les rapports ni ajoutés au dépôt. Les références exactes en base et les artefacts publics du corpus permettent de retrouver les preuves si ces fichiers temporaires disparaissent.

## 3. Architecture réellement implémentée

### Place dans Gusto Design Lab

Le dashboard Next.js admin pilote une API Express sous `/api/admin/design-lab/structural-references`, protégée par authentification/ rôle admin. StructuralReference est une bibliothèque d'observations statiques en MongoDB ; les captures sont stockées sur Cloudinary et les analyses multimodales sont associées à des attempts durables.

Elle est aujourd'hui distincte des autres mémoires : faits documentaires du site existant, inspirations DesignReference et références de Portfolio pour les comparaisons. **La bibliothèque StructuralReference n'alimente pas encore automatiquement les directions ni une intelligence de composition globale.** Les hashes de géométrie ou de captures ne sont pas des fingerprints artistiques.

Le pipeline créatif déjà implémenté comprend briefs/assets de SiteProject, directions `design-engine-v2` et expansions structurées, sélection humaine, Style Frame de trois moments et génération de chapitres de homepage assemblés, avec snapshots approuvés et récupération. Motion Observation, fingerprint sémantique, Global Composition Director, Motion Director et Factory restent des étapes futures. Le niveau du Ventadour manuel demeure un objectif qualitatif, pas un résultat validé par B1.

### Flux StructuralReference

1. Valider URL, résolution publique et transport sécurisé ; ouvrir un navigateur contrôlé avec limites réseau.
2. Identifier et utiliser le scroll natif ; parcourir la page, stabiliser images et vidéo, collecter les preuves de peinture, persistent/CMP et registre géométrique.
3. Exécuter les cinq contrôles fixes post-traversée aux déplacements 0/20/50/80/100 %. Ce sont des pourcentages de déplacement, distincts des pourcentages de hauteur réelle utilisés dans les evidence.
4. Choisir `continuous` ou `sampled`. Continuous produit un master archivé, un overview et trois locales. Sampled v3 produit un storyboard des états de traversée et un pool de candidats, puis adaptive ou fallback fixe. Les recaptures sélectionnées doivent rester fraîches et fiables.
5. Nettoyer tous les buffers destinés à Vision sans modifier la géométrie structurelle ; vérifier peinture, propreté et restauration ; préparer WebP et manifeste partagé.
6. Persister captures et snapshot de tentative ; lancer une analyse Vision ; sauvegarder le brut avant parsing, puis le parsé, la validation et l'application.
7. Retraiter manuellement une réponse conservée sans Vision si les snapshots sont compatibles ; réconcilier les opérations expirées sous leases.

Points d'entrée : [structural-reference.service.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-reference.service.js>) (`captureAndPrepare`, `prepareStructuralViews`, `execute`) ; [structural-page-capture.service.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-page-capture.service.js>) (`captureStructuralPage`) ; [structural-reference.contract.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/structural-reference.contract.js>) (`buildStructuralVisionRequest`, `structuralInstructions`, `validateStructuralAnalysis`) ; [openai.service.js](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/services/design-lab/openai.service.js>) (`analyzeStructuralReference`).

### Garanties existantes, avec leur portée réelle

| Garantie | Implémentation observée | Ce qu'elle ne prouve pas |
|---|---|---|
| SSRF / transport | IP publiques validées/épinglées, contrôle des redirects, GET distant, requêtes internes bornées, blocage service workers et WebSocket | Bonne composition ou tous les médias chargés |
| Budgets | 160 admissions, 12 transports concurrents ; image 32 MiB, images 128 ; média 32, médias 64 ; non-images 80 ; total 208 MiB | Priorité suffisante aux futurs médias tardifs |
| Vidéo | Ranges de 2 MiB, budget représentatif par source au plus 8 MiB avec réservation effective ; vraie frame présentée/gel ou poster volontaire | Chorégraphie, durée ou causalité d'animation |
| Capture / fiabilité | Parcours + contrôles fixes obligatoires ; registre partagé ; seuils de mesure et freshness ; fallback si non prouvé | Fidélité artistique de tous les états source |
| Sanitation | Version 3, provenance CMP, politique `exclude_nonstructural_persistent_v1`, suppression prouvée, landmarks/sidebar protégés, tous les buffers propres et restauration | Tous les éléments commerciaux doivent disparaître |
| Paint | Prévention des pages blanches/non hydratées ; primitives réellement peintes, buffers non uniformes ; images visibles contrôlées | Complétude de tous les médias secondaires |
| Manifeste | Identités, sourceRect, plage visible et coordonnées partagées ; validation des evidence par intersection et progression | Les phases correspondent sémantiquement aux compositions |
| Checkpoints | Brut, parsedResult et snapshot conservés ; reprocess sans Vision ; recovery et lease 15 min | Atomicité complète entre référence et dernier statut d'attempt |
| Appels incertains | Pas de retry automatique ; confirmation explicite prévue après timeout sans réponse | Signal durable malgré toute erreur ultérieure — OP-02 |

Le code refuse désormais `requirePlatformValidation: true` par 409 : ce mode historique ne constitue pas une validation active. Un HTTP 200 de la route de travail ne suffit pas non plus : le corps peut contenir une référence en erreur.

## 4. Inventaire exact des 13 références

### Identité et dernière génération appliquée

Toutes : `status = analyzed`, pas de lease actif au snapshot ; attempt `applied`, brut et parsé présents ; analyse actuelle égale au parsedResult ; captures actuelles égales au snapshot de cet attempt. Les cinq certifications synthétiques sanitation/coverage/paint/clean/restoration sont positives. Les limites de leur portée sont analysées plus bas.

| Référence | referenceId | URL exacte |
|---|---|---|
| Gucci Osteria Florence | `6ac3603eb929a05351c55263` | https://www.gucciosteria.com/en/florence/homepage/ |
| Khufu's Bistro | `6ac37c4ca39769ebfb35d4ad` | https://khufusbistro.com/ |
| Amici / Lesquin | `6ac37d61a39769ebfb35d589` | https://restaurant-amici.com/restaurant/lesquin/ |
| Tastavents | `6ac39cff599b9a26b2dc05d2` | https://tastavents.com/ |
| Salterra | `6ac39d3c599b9a26b2dc0603` | https://www.salterra.com/ |
| Waldhaus Sils | `6ac652aed3bfc71ea373557c` | https://www.waldhaus-sils.ch/ |
| Castello del Sole | `6ac65489ac0bc16f77491344` | https://www.castellodelsole.com/en/ |
| Amrit Palace | `6ac74fff5b813a6c08e250b5` | https://amritpalace.com/ |
| Nannina | `6ac752195b813a6c08e2531c` | https://www.nannina.de/ |
| Cartapani | `6ac758d7d7b33e9ce0039cea` | https://cartapani.it/en/ |
| La Torre del Saracino | `6ac76fe00423e958f07a6396` | https://torredelsaracino.it/en/ |
| Cantina del Sol | `6ac786fa95ac4c5a6cc51523` | https://cantinadelsol.it/en |
| Grupo Isabella's / Carmina | `6ac789a195ac4c5a6cc51831` | https://grupoisabellas.com/es/restaurantes/carmina/ |

| Référence | generationId appliqué | attemptId appliqué | analyzedAt, 08/10/2026 UTC |
|---|---|---|---|
| Gucci | `8c04190b-81d6-4cc6-ba66-d57afc769e32` | `6ac74b5d5b813a6c08e24b26` | 07:52:11.532 |
| Khufu | `86951429-38eb-4917-b51b-421044235fb3` | `6ac74c2f5b813a6c08e24c34` | 07:55:33.099 |
| Amici | `a7ee4148-75f8-4c09-8d46-d9798e40c968` | `6ac74acd5b813a6c08e24a7c` | 07:49:28.694 |
| Tastavents | `c5b09056-69a2-4c95-8d62-3c13afa86b39` | `6ac74cd05b813a6c08e24d05` | 07:58:27.669 |
| Salterra | `24a894e6-e000-4f26-a898-25d9b5b7e6bc` | `6ac74ded5b813a6c08e24e45` | 08:03:03.183 |
| Waldhaus | `7ecccd46-93e3-4ea6-9771-59fd8c281274` | `6ac748025b813a6c08e2472d` | 07:37:48.409 |
| Castello | `0e5b4cf0-dc04-418f-95bf-4b0130564b6d` | `6ac748be5b813a6c08e2480e` | 07:41:00.858 |
| Amrit | `3a1ff431-dc9a-4512-8670-f0e100ff3832` | `6ac7504b5b813a6c08e25109` | 08:13:04.459 |
| Nannina | `50fa79fc-a398-47cb-87ce-30c4fadaedca` | `6ac757c4d7b33e9ce0039b97` | 08:45:02.141 |
| Cartapani | `e438b87d-3bbe-4c7a-a383-7df0f6b1f5e7` | `6ac76c260423e958f07a5f46` | 10:12:13.589 |
| Torre | `28238cb4-7ad2-4d32-b26d-4237b1d624c8` | `6ac785e695ac4c5a6cc513d5` | 12:02:09.790 |
| Cantina | `d1e9963c-2992-433f-aefa-cf254baca837` | `6ac79d5dd643b0e9a0ccafe7` | 13:42:12.061 |
| Grupo | `fc8ec3b6-2f1f-493c-9a03-e34fb0da00da` | `6ac7a543d643b0e9a0ccbbce` | 14:15:43.476 |

### Captures, sélection et couverture détaillée

S3F = sampled coverage v3 fixed_fallback ; S3A = sampled v3 adaptive ; C2 = continuous coverage v2. « Stock/Vision » distingue master archivé de l'entrée multimodale : le master continuous n'est pas envoyé. Y indique le haut des locales de 900 px. La couverture détaillée est l'union de ces plages divisée par la hauteur ; **ce n'est ni le pourcentage de page parcourue ni une note artistique**. Un moment « macro seul » ne cite aucune locale dans son evidence.

| Référence | Hauteur px | Stratégie | Stock/Vision | Panels/candidats | Y des locales px | Couverture locale | Moments ; macro seuls |
|---|---:|---|---|---|---|---:|---|
| Gucci | 5 212 | S3F | 6/6 | 12/12 | 0, 862, 2156, 3450, 4312 | 84,9 % | 9 ; aucun |
| Khufu | 7 283 | S3F | 6/6 | 15/15 | 0, 1277, 3192, 5106, 6383 | 61,8 % | 7 ; 3, 5 |
| Amici | 6 128 | S3F | 6/6 | 13/13 | 0, 1046, 2614, 4182, 5228 | 73,4 % | 6 ; aucun |
| Tastavents | 11 556 | S3A | 3/3 | 23/23 | 0, 10530 | 15,6 % | 9 ; 2 à 8 |
| Salterra | 11 395 | S3F | 6/6 | 22/22 | 0, 2099, 5248, 8396, 10495 | 39,5 % | 9 ; 2, 4 |
| Waldhaus | 8 654 | S3F | 6/6 | 18/18 | 0, 1551, 3877, 6203, 7754 | 52,0 % | 8 ; 3, 5, 7 |
| Castello | 9 748 | C2 | 5/4 | — | 0, 4424, 8848 | 27,7 % | 10 ; 2, 3, 4, 6, 7, 8 |
| Amrit | 10 294 | S3F | 6/6 | 21/21 | 0, 1879, 4697, 7515, 9394 | 43,7 % | 7 ; 6 |
| Nannina | 6 709 | C2 | 5/4 | — | 0, 2905, 5809 | 40,2 % | 7 ; 2, 3, 5, 6 |
| Cartapani | 16 122 | S3F | 6/6 | 31/31 | 0, 3044, 7611, 12178, 15222 | 27,9 % | 11 ; 2, 4, 6, 7, 9, 10 |
| Torre | 10 088 | S3A | 4/4 | 20/20 | 0, 7350, 9188 | 26,8 % | 9 ; 2, 3, 4, 5, 6, 8 |
| Cantina | 9 518 | S3F | 6/6 | 19/19 | 0, 1724, 4309, 6894, 8618 | 47,3 % | 7 ; 3, 5 |
| Grupo | 8 467 | C2 | 5/4 | — | 0, 3784, 7567 | 31,9 % | 7 ; 2, 3, 6 |

Total : 67 entrées Vision ; 106 moments, dont 42 ne citent que la source globale. Ce nombre ne prouve pas 42 mauvaises observations : il localise les endroits où l'analyse doit rester proportionnée à la preuve.

Les fallbacks sont liés à une mesure non certifiable (`unmeasurable_canvas_clip_or_transform`, `uncertifiable_paint_geometry`, `opaque_primitive_geometry_uncertifiable`) et/ou un registre non prouvé. Salterra présente spécifiquement `insufficient_measured_coverage` et `shadow_collector_unreliable`. Le fallback n'est pas une dispense de sanitation/paint et ne prouve pas une capture source intégrale.

### Cantina et Grupo : clôture effectivement vérifiée

Cantina : la première génération `c61fb7e9-96c3-4964-8d5d-0063e4fc3be5`, attempt `6ac7874195ac4c5a6cc51577`, a échoué au timeout d'environ 120 042 ms sans brut/parsage récupérable ; son état fournisseur demeure inconnu. L'analyse finale appliquée à **15:42:12 heure de Paris** vient d'une génération distincte indiquée dans l'inventaire. Ce n'est pas la récupération gratuite de la réponse ancienne.

Grupo : l'analyse finale est appliquée à **16:15:43 heure de Paris**, continuous, 8 467 px, quatre images Vision, sept moments. La passation décrivait encore une validation persistée à terminer. Le snapshot actuel la confirme. Un dry-run antérieur de génération `4a61bb5c…`, prêt en 59,319 s, n'est pas la preuve de l'application finale `fc8ec3b6…`.

## 5. Grille commune de notation

Évaluation humaine contre les entrées disponibles, sans moyenne. Une note n'est pas une certification automatique ni une précision statistique.

| Note | Sens commun aux dimensions |
|---|---|
| 1–2 | Inutilisable ou erreurs majeures dominantes |
| 3–4 | Perte importante de la composition ou erreur bloquante |
| 5–6 | Description exploitable avec réserves ; générique, partielle ou géométriquement fragile |
| 7 | Compréhension spécifique et généralement juste ; limites localisées |
| 8 | Lecture riche, cohérente, fiable des mécanismes globaux et singularités |
| 9 | Lecture exceptionnelle, précise et étayée jusque dans les relations complexes |
| 10 | Exhaustivité et qualité exceptionnelles prouvées ; aucune attribuée ici |

Capture/fidélité : intégrité visible, lisibilité, présence des médias observables et utilité des entrées. Structure : masses/axes/segmentation. Texte→image : évolution spatiale dans l'ordre de lecture, pas animation. Densité : domination visuelle et vide, distincts du nombre d'objets. Transitions : mécanismes entre moments, y compris éloignés. Principes : mécanisme/effet/condition abstraits. Prudence : assertions proportionnées aux preuves. Taxonomie : justesse/cohérence du label avec la géométrie. Utilité : valeur réelle pour une future mémoire de composition originale.

**La colonne Capture porte une étoile : note partielle contre les buffers accessibles. La fidélité intégrale au site source historique est `non évaluable` pour les 13 références.** Une note de 8* ne signifie donc pas « source intégralement fidèle ». Les défauts manifestes des buffers peuvent toutefois faire baisser cette note, même sans visiter la source.

| Référence | Capture* | Structure | Texte→image | Densité | Transitions | Principes | Prudence | Taxonomie | Utilité |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Gucci | 8 | 8 | 8 | 8 | 8 | 7 | 8 | 5 | 7 |
| Khufu | 8 | 7 | 7 | 7 | 7 | 7 | 7 | 5 | 7 |
| Amici | 8 | 7 | 7 | 8 | 7 | 7 | 7 | 6 | 7 |
| Tastavents | 7 | 4 | 4 | 4 | 5 | 5 | 6 | 4 | 4 |
| Salterra | 4 | 6 | 6 | 5 | 6 | 5 | 5 | 5 | 5 |
| Waldhaus | 8 | 6 | 6 | 7 | 6 | 7 | 6 | 4 | 6 |
| Castello | 8 | 6 | 6 | 7 | 6 | 6 | 7 | 5 | 6 |
| Amrit | 7 | 6 | 6 | 7 | 6 | 6 | 4 | 5 | 5 |
| Nannina | 7 | 6 | 6 | 7 | 6 | 6 | 7 | 4 | 6 |
| Cartapani | 7 | 5 | 5 | 5 | 5 | 6 | 5 | 5 | 5 |
| Torre | 8 | 6 | 6 | 6 | 6 | 6 | 6 | 5 | 6 |
| Cantina | 8 | 7 | 7 | 8 | 7 | 6 | 7 | 6 | 7 |
| Grupo | 8 | 7 | 6 | 6 | 6 | 6 | 6 | 5 | 6 |

## 6. Confrontation des treize analyses aux images

Les numéros m1, m2… désignent l'ordre des structuralMoments persistés. Preuves par site : dossier portant le referenceId du tableau, `analysis.json`, `manifest.json`, overview et locales. Chaque sous-section justifie les neuf notes du tableau ; les nombres seuls ne constituent pas le verdict.

### 6.1. Gucci Osteria — mécanisme global reconnu, labels fragiles

Entrées propres et lisibles, neuf moments tous rattachés à au moins une locale : capture 8*. La composition centrale arquée, les petits textes latéraux, les diptyques et la grande rupture circulaire sont correctement distingués : structure/texte-image 8. L'analyse relie explicitement une succession image gauche→droite→gauche, sa rupture circulaire et le retour à un axe central : transitions et densité 8, meilleur cas du corpus sur la relation globale.

La prudence 8 est cohérente avec une lecture spatiale sans mécanisme animé inventé. Les principes 7 restent parfois généraux. Taxonomie 5 : plusieurs `splitUnequal` correspondent à des partages proches de l'équilibre, parfois décrits comme tels ; le footer régulier est `staggeredColumns` sans décalage visible. Utilité 7 : réelle grammaire d'axes et de rupture, mais un fingerprint fondé principalement sur ces labels perdrait de la précision. À protéger comme contrôle positif ; ce cas infirme l'idée que le prompt actuel serait incapable de tout raisonnement global.

### 6.2. Khufu's Bistro — progression solide, régularité approximative

Le panorama nocturne, l'image arquée, la bande vidéo, la galerie en perspective et le diptyque terminal sont présents et lisibles : capture 8*. Structure/texte-image/densité/transitions 7 : l'alternance de panorama, texte et masses photographiques est cohérente, mais m6 fusionne une respiration CTA et une composition illustration/texte distincte. M3 et m5 n'ont que la macro.

M5 décrit une composition plus variable/décalée que les quatre cartes verticales relativement régulières visibles : taxonomie 5 ; la singularité de perspective est mieux reconnue ailleurs. Principes 7 : échelle, cadrage et passages entre pleine largeur et contenu restent utilisables. Prudence 7 : source vidéo observée ne devient pas un scénario temporel détaillé. Utilité 7 avec réserve sur les frontières des moments et la régularité des cartes, pas une capture défaillante démontrée.

### 6.3. Amici / Lesquin — vide et collage expressifs

Cette référence est l'URL Lesquin, pas le smoke ancien de la racine du domaine. Photographies, cartes inclinées et grands titres sont lisibles ; les repères fonctionnels persistants ne doivent pas être supprimés arbitrairement : capture 8*. Structure et texte-image 7 : entrée photographique avec carte, collage clair puis surface verte, composition de fête très dissymétrique, réservation et footer.

Densité 8 : le très grand vide à droite de la carte et les ruptures clair/vert sont effectivement compris. Transitions/principes 7 : relations spécifiques mais moins formalisées que Gucci. Prudence 7 : quelques formulations telles qu'une image qui « remonte » décrivent possiblement le parcours ; elles ne constituent pas à elles seules une preuve d'animation. Taxonomie 6 : rangée de photos inclinées et `staggeredColumns` approximatif ; footer assez compartimenté pour que `functionalMinimal` soit réducteur. Utilité 7 : mécanismes d'asymétrie et respiration exploitables, après distinction entre disposition et mouvement.

### 6.4. Tastavents — perte de dominance au centre, défaut artistique bloquant

Les grandes compositions sont visibles dans le storyboard, mais seules l'entrée et la fin ont une locale. Capture 7* pour l'information détaillée limitée, sans média manquant démontré. Sept des neuf moments sont macro seuls ; le vide entre plages détaillées atteint **9 630 px**, de y900 à y10530.

Structure/texte-image/densité 4 : m2 (9–19 %) décrit une composition calme et contenue là où la grande photographie et la typographie dominent ; m3 réduit la grande masse typographique centrale à une distribution sans unité dominante ; m5 mélange portraits/texte et début de galerie ; **m6 (57–71 %) affirme une détente textuelle là où la galerie alimentaire est dense**. Ces inversions sont observables dans l'entrée globale, pas un simple désaccord de goût. Transitions 5 : conséquence d'une segmentation qui distribue mal les changements de masses.

Principes 5 et utilité 4 : la grammaire centrale produite serait trompeuse pour le Design Lab. Prudence 6 : absence de durée animée inventée, mais les assertions de densité restent trop affirmatives. Taxonomie 4 : labels et description perdent le rôle de la typographie géante et des périphéries photographiques. Le footer est beaucoup plus précis que le milieu ; cela est compatible avec un bénéfice des locales, sans prouver que leur seule augmentation résoudrait le problème.

### 6.5. Salterra — capture dégradée transformée en respiration artistique

Capture 4* : les photographies principales sont présentes, mais la locale y8396 montre une zone très vide avec éléments/logos incomplets et traces de médias non rendus. Les cinq locales actuelles sont identiques par SHA-256 aux préparations du smoke archivé ; l'overview ne l'est pas. La preuve réseau est donc liée à une portion solide du corpus, sans prétendre identité de toute la génération.

Structure/texte-image 6 : panoramas et diptyques sont décrits, mais la zone incomplète de m7 (75–87 %) devient une déclaration entourée d'un grand vide volontaire. Densité 5 et principes 5 : ce vide dégradé alimente un principe transférable indésirable. Transitions 6 : alternances globales reconnaissables, sans certitude sur l'état source complet. Prudence 5 : le doute de rendu n'est pas assez distingué d'une intention. Taxonomie 5 : inégalité et offsets parfois surqualifiés. Utilité 5, à réserver comme preuve de limite de capture plutôt que référence artistique pleinement fiable.

Le fallback de mesure est justifié par des visites de coverage à 4/5 = 0,8 et 7/9 ≈ 0,778, sous 0,85. Ses cinq contrôles fixes ont pourtant des scores individuels fiables : il n'y a pas de contradiction à cela. Le fallback ne garantit pas le chargement des médias.

### 6.6. Waldhaus Sils — alternance rails/diptyques partiellement perdue

Capture 8* : paysage, rails et panneaux image/texte visibles, sans pollution évidente. Structure/texte-image/transitions 6 : m3 recouvre une composition de chambres textuelle à gauche/image à droite mais la décrit comme une nouvelle rangée ; m5 réduit une autre composition textuelle/paysage à un rail/intervalle. Cela aplatit la véritable alternance de rails réguliers et de diptyques.

Densité 7 et principes 7 : marge, axes, cards et largeur contenue sont exploitables. Prudence 6 : généralisation des zones non détaillées. Taxonomie 4 : plusieurs rangées régulières deviennent `staggeredColumns`, le label contredisant parfois les gouttières/alignements constants décrits. Utilité 6 : besoin de préserver la bascule de mécanisme plutôt que stocker une succession de rangées. Métadonnée distincte : des locales sélectionnées en fallback gardent la raison théorique de rejet `gain_at_or_below_threshold`. Le choix effectif est correct ; sa raison est ambiguë.

### 6.7. Castello del Sole — continuous utilisable, collage central sous-interprété

Capture 8* : overview continue et trois locales lisibles ; pas de défaut de stitch bloquant constaté. Les dix moments comprennent six macro seuls. Structure/texte-image/transitions 6 : la progression de panorama, diptyques, rangée, collage rose, image intérieure, spa et ferme est partiellement reconnue ; **m7 traite la ferme sombre comme photographie pleine largeur alors qu'elle repose sur plusieurs photos périphériques et un grand texte central**.

Densité 7, principes 6 : alternances larges/contenues utiles mais mécanismes centraux simplifiés. Prudence 7 : pas de temporalité prouvée à partir du stitch ; parfois excès de réserve sur une superposition pourtant visible dans le collage rose. Taxonomie 5 : rangées régulières classifiées décalées et collage central banalisé. Utilité 6. Trois locales ne rendent pas `continuous` automatiquement incorrect : il faut comparer la perte d'information, pas imposer sampled. La stratégie statique ne garantit pas absence d'animation sur le site vivant.

### 6.8. Amrit Palace — une image tardive affirmée sans support

Capture 7* : nourriture, boissons, cartes/photos et footer présents, avec de grandes surfaces dont l'intention complète source reste inconnue. Le widget de notation dans le flux n'est pas une contamination non structurelle démontrée. Structure/texte-image/transitions 6 et densité 7 : les diptyques liste/photo et la fin typographique sont globalement lisibles.

**Prudence 4 : m6 (85–92 %), macro seul, décrit le retour d'une photographie d'intérieur à côté d'une zone claire ; les entrées y montrent plutôt témoignages textuels puis proximité du footer.** La photographie d'intérieur existe plus haut, pas dans la phase affirmée. Cette erreur est contrôlable contre l'overview sans site vivant. Principes 6 et utilité 5 : une réintroduction imaginaire de photo peut devenir une mauvaise règle de composition. Taxonomie 5 : répétition de splits proches malgré distinctions de masses. Cas important pour tester les assertions de présence, pas seulement les IDs de sources.

### 6.9. Nannina — bonne conservation de sidebar, géométrie centrale banalisée

Capture 7* : la sidebar persistante est reconnue comme une seule couche ; sa répétition dans le stitch n'est pas une suite de sections. Le badge logiciel est retiré, la navigation structurelle conservée. Les trois locales laissent quatre des sept moments macro seuls.

Structure/texte-image/transitions 6 : entrée encadrée/superposée et fin correctement reconnues, mais les compositions menu/citation et histoire sont fusionnées ; le grand portrait d'équipe est banalisé, puis une phase de citation est surqualifiée comme riche en images. Densité/prudence 7 : transitions clair/sombre et carte grise traitées sans inventer l'intérieur de l'embed ni une animation. Principes 6 ; taxonomie 4 : galerie régulière trois colonnes sur deux lignes en `offsetGrid`, portrait unique en `staggeredColumns`. Utilité 6 : vraie singularité de sidebar/cadres, mais la catégorie seule la perdrait.

### 6.10. Cartapani — onze moments valides syntaxiquement, plusieurs phases fausses

Capture 7* : titre monumental recadré, objets isolés, collages, photographies périphériques et cards visibles ; CMP nettoyée. La bande périphérique de bas de page n'est pas une raison de supprimer des structures sans preuve. La page de 16 122 px a 31 panels, cinq locales et six moments macro seuls.

Structure/texte-image/densité/transitions 5 : autour de y7000–10000, les états conservent un grand texte central et des images périphériques qui changent de position. M5 le reconnaît ; m6 (52–64 %) transforme sa continuation en petits groupes réguliers fictifs ; m7 prolonge ce récit avant la vraie rangée de formation. La bande panoramique m9 est aussi affectée d'une phase trop large. Des états différents d'une même composition sont découpés comme des modules distincts, sans preuve que ce soit leur structure.

Prudence 5 : inférences de grilles et densité affirmées ; le mouvement causal reste inconnu. Principes 6 : bonne abstraction des échelles/ruptures, mais fondée en partie sur ce mauvais découpage. Taxonomie 5, utilité 5 : singularité de l'ancrage central insufficientement mémorisée. Motion Observation expliquera ultérieurement la dynamique ; StructuralReference peut déjà éviter d'inventer des cartes entre les états.

### 6.11. La Torre del Saracino — début et fin précis, centre peu détaillé

Capture 8* : paysages et compositions photographiques visibles, CMP retirée. Trois locales y0/7350/9188 ; six moments sur neuf macro seuls ; plage sans détail y900–7350, soit 6 450 px.

Structure/texte-image/densité/transitions 6 : m2 réduit la grande photographie portant une typographie blanche superposée à une phase avec peu de texte ; la superposition est pourtant visible. Des phases centrales mêlent mosaïque, architecture/mer et début de panorama ; la typographie reste trop souvent décrite comme secondaire. Le triptyque tardif, avec panneau central plus large, et le footer sont mieux compris.

Principes/prudence 6 : mécanismes utiles mais dominance et frontières fragiles ; pas de scénario temporel validé. Taxonomie 5 ; utilité 6. L'entry obligatoire respecte le contrat et les deux vues tardives dépassent effectivement le gain minimal ; la contre-performance narrative ne démontre pas un bug de comparaison `>` ou de coordonnées. Elle motive une expérience sur l'information que mesurent les scores.

### 6.12. Cantina del Sol — lecture expressive, deux zones génériques

Capture 8* : grande typographie, chili/lime détourés, photographies et ruptures de surface présentes. Les cinq locales couvrent 47,3 % de la hauteur mais m3 et m5 ne citent que le storyboard. Structure/texte-image/transitions 7 : la logique lettres monumentales→manifestes→images/collages→grandes respirations est réellement reconnue. Densité 8 : masse de lettres et vide ne sont pas confondus systématiquement avec le nombre de petits objets.

Principes 6 : certains restent « alterner image et texte » plutôt que préciser le mécanisme. Prudence 7 : limites locales assez présentes, mais m5 transforme une grande masse textuelle unique en plusieurs petits blocs. Taxonomie 6 : footer monumental réduit à `functionalMinimal`. Géométrie : le footer est centré/pleine largeur, tandis que sa description place un grand élément en haut à gauche. Utilité 7 avec correction de ces réserves. Le footer en `detail: low` est compatible avec ses scores individuels fiables ; le fallback global n'impose pas tout en high.

### 6.13. Grupo Isabella's / Carmina — alternance connue mais peu capitalisée

Capture 8* : overview et trois locales propres ; sept moments, trois macro seuls. Structure 7 : hero, diptyques, rail, panneau de groupe, cadeau et terminaison sont reconnaissables. **L'analyse n'ignore pas complètement l'alternance** : le layoutProfile mentionne gauche/droite et des changements d'orientation. L'écart réside dans l'absence d'une relation précise entre intro image gauche → groupes image droite → cadeau image gauche, avec son effet sur les axes et la densité.

Texte-image/densité/transitions 6 : m4 généralise la fin relativement vide visible dans la locale middle à tout le panneau, alors que l'overview montre la photographie et le texte de la composition entière. Le visuel cadeau est dit presque carré malgré un cadrage vertical visible. Principes/prudence 6 : affirmation au-delà du fragment réellement détaillé ; abstractions trop larges. Taxonomie 5 : rail horizontal régulier en `staggeredColumns`, débordement de quatrième carte peu valorisé. Utilité 6 : des observations individuelles correctes, relation globale insuffisamment exploitable. Aucun nouvel appel n'est nécessaire pour constater ce défaut ; un nouvel appel le sera pour prouver une correction du prompt.

## 7. Diagnostic causal des interactions

### 7.1. Salterra : l'admission précède le bénéfice de la priorité

Preuve historique : `/private/tmp/structural-product-smoke-2026-10-08/salterra/result.json`, événement resourceUsage. La trace indique 160 requêtes, 122 212 842 octets au total, 85 522 001 octets images, 36 690 841 non-images, dont 31 507 065 médias, et 16 requêtes de plages vidéo. Les limites d'octets ne sont donc pas l'explication première des refus de nouvelles admissions.

Les treize premiers refus d'images observés autour des demandes 194–214 surviennent environ **4,014 s après la première demande**, avant le premier contrôle d'images vers **8,578 s**. Ils incluent notamment icônes, assets d'images, éléments de design et miniatures. Tous ne sont pas prouvés structurels. Leur présence montre toutefois que le quota peut être consommé avant l'inventaire complet des obligations de rendu. D'autres refus surviennent ensuite. Ne pas remplacer ces temps par ceux d'une autre trace historique.

Dans `createStructuralResourcePolicy.fetch`, `uniqueRequests` est incrémenté avant que la queue prioritaire lance le transport. La simulation NET-ADMISSION admet 160 ressources secondaires, puis refuse une image prioritaire tardive, avec seulement 160 octets transférés. **Cause mécanique démontrée** : la priorité de départ ne corrige pas une admission déjà saturée. **Cause complète de chaque média Salterra absent : partiellement établie**, car le DOM exact de l'état actuel appliqué et toutes les correspondances source/rectangle ne sont pas persistés.

La chaîne plausible et étayée est : admissions précoces → refus tardifs → média absent dans une locale → vide décrit comme voulu → principe transférable trompeur. Augmenter `requests`, baisser un gate ou améliorer uniquement le prompt ne traite pas correctement cette chaîne. Un prototype rétrospectif à moins de 160 admissions peut montrer une faisabilité sous inventaire connu ; il ne prouve pas que cet inventaire soit certifiable à temps dans une visite réelle.

### 7.2. Adaptive : score cohérent, intérêt artistique encore insuffisamment mesuré

Dans `structural-observation-selection.js`, descripteur géométrique : matrice d'occupation 8×8 texte/image/vide, principales primitives et leur géométrie, échelles typographiques, groupes et superpositions. Les scores expriment :

- **L** : gain de lisibilité locale contre projection macro.
- **D** : gain de détail géométrique des rapports spatiaux.
- **V** : nouveauté descriptive multipliée par une combinaison de L/D.
- **R** : redondance, 0,8 similarité descriptive + 0,2 recouvrement spatial.
- **G** : valeur bornée de `0,35 L + 0,35 D + 0,30 V − 0,30 R`, retenue strictement au-dessus de 0,25. Entry obligatoire, au plus cinq locales, sans remplissage.

La fiabilité exige notamment couverture mesurée ≥0,85 et surface inconnue ≤0,08 ; un registre non prouvé impose le pool fixe. L'algorithme ne mesure pas directement l'importance artistique d'une grande masse typographique ni la valeur narrative d'une bascule d'axe. Une grande typo déjà lisible en macro peut avoir peu de L ; un footer avec petits textes peut en avoir beaucoup. Cela explique une **prédisposition possible**, pas le classement exact de tous les candidats de Tastavents.

Tastavents : entry G=0 conservée par obligation ; dernière locale G≈0,288841. Torre : entry G≈0,1523 obligatoire ; les deux tardives G≈0,26479 et 0,31166. Les sélections respectent donc le seuil enregistré. Les descripteurs détaillés des candidats rejetés de ces **générations finales** ne sont pas tous conservés en MongoDB. Des traces anciennes, notamment du shadow du 6 octobre, ne peuvent pas remplacer cette preuve. Le diagnostic de sélection doit précéder une modification des features.

Préparation Vision : sampled utilise une grille de trois colonnes, panels de 240×150 et bande de libellé de 24 px ; overview large de 720 px, `detail: low`. Le code projette également la réduction macro dans les scores. Une longue grille de 23 ou 31 panels comprime fortement les rapports fins accessibles au modèle. Les tailles internes réellement exploitées par le fournisseur ne sont pas mesurées ici. Les locales ont un détail high si scores absents ou L/D≥0,25, sinon low. Les mesures fiables individuelles d'une locale peuvent subsister quand le registre global impose fallback.

**Interaction B+C+D** : descripteur partiel + entrée macro comprimée + segmentation/interprétation du modèle peuvent produire les mêmes erreurs. L'audit ne permet pas de leur attribuer des pourcentages de responsabilité. Exiger cinq locales, un bonus footer ou un seuil plus faible sans expérience serait opportuniste.

### 7.3. Continuous : couverture complète du stitch, détail limité

Castello, Nannina et Grupo ont une source globale continue et trois locales, sans incident technique bloquant visible. Le master est bien hors Vision. Les flags confirment le parcours et la stratégie choisie, pas la connaissance de tous les détails ni l'absence réelle d'animation. La couverture détaillée de 27,7/40,2/31,9 % laisse des compositions centrales uniquement en overview.

Castello perd un collage agricole central ; Nannina banalise des cadres/grilles ; Grupo généralise un fragment local vide. **Ces défauts de sortie sont démontrés ; la stratégie continuous comme cause exclusive ne l'est pas.** Un modèle peut comprendre une relation gauche/droite depuis l'overview actuel. Comparer la perte d'information avant toute conversion ou quota supplémentaire.

### 7.4. Contrat géométrique correct, validation artistique insuffisante

Le constructeur partagé crée les mêmes identités et géométries que les 13 manifestes conservés. Les validations exigent progression, ordres cohérents, bornes de phase et intersections des evidence avec une tolérance d'arrondi de deux points. Aucun mélange systématique pourcentage scroll/pourcentage page n'a été constaté.

Une phase peut pourtant intersecter une locale et être mal décrite. Exemple Grupo m4 : l'intersection est juste, mais le fragment vide est traité comme la phase entière. Exemple Amrit m6 : source globale valide, photographie attribuée à la mauvaise zone. Le code ne vérifie pas sémantiquement la présence de l'image. La conformité du JSON peut donc coexister avec une segmentation/dominance fausse.

Le schéma comporte 14 champs de layoutProfile, sept descriptions par phase rythmique, douze champs descriptifs par moment, des principes, signatureMoves et avoidCopying. Il est déjà expressif en prose et le prompt demande globalité, proportions, anti-copie et prudence. Sa faiblesse est l'absence de **relations spatiales explicitement liées aux moments et au périmètre de leurs preuves**, ainsi qu'une validation essentiellement formelle. Ajouter de la longueur seule augmenterait le coût sans preuve de bénéfice.

### 7.5. Taxonomie et mémoire future

Les 17 layoutMode mélangent contenu dominant (`fullBleedPhotography`), géométrie (`splitUnequal`, `offsetGrid`), expression (`asymmetricEditorial`) et rôle (`functionalMinimal`). Les labels ne sont pas une ontologie homogène. L'audit des 106 moments constate notamment : rails réguliers en `staggeredColumns` sur Khufu/Waldhaus/Castello/Grupo ; grille régulière Nannina en `offsetGrid` ; partages proches de l'équilibre en `splitUnequal` ; photo périphérique avec texte central Castello transformée en fullBleed ; footer monumental Cantina réduit à functionalMinimal.

Les descriptions conservent parfois les informations que le label perd. **Un futur fingerprint fondé sur ces labels ferait donc disparaître des singularités et rapprocherait artificiellement des compositions différentes.** Il n'est pas nécessaire de multiplier les catégories : séparer géométrie observable, mécanisme de composition et classification finale est plus ciblé. Les instructions `avoidCopying` existent et excluent identité, motifs, textes et succession exacte ; aucune reproduction effective d'une référence par une homepage générée n'a été évaluée ici. L'absence de copie dans le produit futur reste inconnue, pas certifiée par ce texte.

### 7.6. Sanitation, médias et mouvement : protections à préserver

Dans les images accessibles : badge logiciel Nannina absent avec sidebar conservée ; CMP Cartapani/Torre retirées ; aucun grand popup contaminant les 67 inputs observés. Amrit conserve un widget d'avis dans le flux : cela n'établit pas un défaut de cleanup. Navigation structurelle, headers, sticky narratifs et éléments sans provenance non structurelle prouvée sont protégés. Les ambiguïtés peuvent bloquer la capture ; le nettoyage ne doit pas devenir une sélection éditoriale arbitraire.

Paint protège notamment contre le fond vide/hydratation incomplète et contrôle les images visibles ; ses seuils d'inspection peuvent manquer de petits médias, conteneurs effondrés, backgrounds ou lazy non encore exposées. Ces chemins aveugles sont **possibles par lecture du code** ; leur rôle exact dans Salterra n'est pas prouvé. Les tests locaux vérifient véritable frame vidéo, poster réel, restauration, attente de source lazy existante et refus sans source activée ; pas de forcing de `src` pour fabriquer un état acceptable.

Aucune hallucination systématique de durée ou chorégraphie n'est démontrée dans les treize textes. Certaines formulations de « passage », « remontée » ou « sortie » peuvent décrire l'ordre de lecture. Il faut éviter de les interpréter abusivement comme preuve d'animation. Cartapani montre des états changeants : l'ordre causal, la durée et la transformation exacts demeurent inconnus. Motion Observation traitera ces questions ; il ne doit pas servir à excuser une image ou une grille inventée dans l'analyse statique.

### 7.7. Orchestration : deux fenêtres de cohérence et une garde fragile

OP-FINALIZE : injection d'une panne dans le dernier `saveAttempt(applied)` ; le service a déjà appliqué la référence et libéré son token. Résultat : `referenceStatus: analyzed`, `attemptStatus: failed`, brut et parsedResult préservés. OP-CRASH : simulation d'un crash entre les deux mutations, puis `reconcile` : l'attempt validated est marqué failed avec `orphaned_attempt_without_active_lease`, bien que l'analyse soit déjà appliquée. **Les deux défauts sont démontrés hors ligne ; aucun des treize états finaux ne présente cette divergence au snapshot.**

OP-UNCERTAINTY : ancien attempt incertain conservé ; relance confirmée échouant à la création avant dispatch ; diagnostic courant devient `manual_retry` ; relance suivante sans confirmation atteint l'analyseur simulé. Aucun appel payant réalisé. Le problème ne concerne pas un retry automatique inexistant, mais la disparition de la garde sur une action manuelle ultérieure.

Les causes communes sont l'état de référence traité comme résumé autoritaire de l'historique et la finalisation en deux écritures sans marqueur durable d'application/reconciliation. Les correctifs doivent préserver la réponse et la génération, plutôt que refaire la capture ou Vision.

## 8. Matrice des problèmes, preuves et remédiations

Les deux tableaux forment une même matrice, reliée par ID. P1 = défaut important avant B2/consommation artistique ; P2 = limite ou diagnostic à traiter selon priorité. Les causes A–G correspondent aux familles demandées : A capture, B observation, C préparation Vision, D intelligence Vision, E contrat, F opérationnel, G limite statique. Aucune efficacité future n'est démontrée par ces propositions.

### 8.1. Gravité, nature, références et cause

| ID | Gravité / nature | Références concernées | Symptôme et preuve | Cause racine / degré |
|---|---|---|---|---|
| CAP-01 | P1 mixte | Salterra ; risque générique | Locale y8396 incomplète, m7 valorise le vide ; flags positifs | A+F démontrés sur le défaut ; correspondance précise obligation/DOM finale incomplète |
| NET-01 | P1 technique | Salterra ; toutes pages à nombreuses ressources | 160 admissions ; trace et reproduction NET-ADMISSION refusent une image tardive | F démontré : admission avant queue, priorité ne réserve pas de slots futurs |
| OP-02 | P1 technique | Tout retry après timeout ; scénario inspiré de Cantina, pas incident final observé | Reproduction OP-UNCERTAINTY atteint l'analyseur sans confirmation après panne pré-dispatch | F démontré : garde basée sur diagnostic courant, historique incertain non durablement résolu |
| OP-01 | P1 technique | Toutes références ; aucune occurrence finale B1 constatée | OP-FINALIZE et OP-CRASH : analyzed/failed divergents | F démontré : application et dernier checkpoint séparés, recovery sans marqueur d'application |
| OBS-01 | P1 mixte | Tastavents, Torre ; comparaison Gucci/Cantina/Cartapani | Deux/trois locales, grands intervalles ; erreurs centrales ; scores final conformes | B+C+D ; défaut de sortie démontré, responsabilité exclusive du scoring H |
| ART-01 | P1 artistique | Cartapani, Tastavents, Waldhaus, Torre | Phases, dominance et densité contredisent les images, détails section 6 | C+D+E ; segmentation fausse D, causalité compression/prompt/modèle H |
| ART-02 | P1 artistique | Grupo, Amrit, Castello, Nannina, Cantina | Fragment→phase ; photo déplacée/inventée ; relations globales sous-exploitées | D+E démontrés sur sorties ; absence de relation structurée D, efficacité nouveau prompt U |
| TAX-01 | P1 artistique | Gucci, Khufu, Waldhaus, Castello, Nannina, Grupo, Cantina ; risques sur tout corpus | Labels décalage/inégalité/rôle discordants ; 106 moments inspectés | D+E démontré : taxonomie hétérogène et mauvais emploi ; plus de labels pas solution prouvée |
| OBS-02 | P2 mixte | Castello, Nannina, Grupo | Trois locales ; mécanismes centraux parfois simplifiés | B+C+D H : choix continuous pas démontré erroné en soi |
| MED-01 | P2 technique | Générique ; Salterra comme cas de capture dégradée | Inspection image/paint partielle ; petites sources/opaque/lazy possibles | A+F : limites de code D ; chemin précis pour chaque média absent U |
| DIAG-01 | P2 technique | Waldhaus ; reproduction générique | selected true avec raison gain rejeté en fixed_fallback | F démontré : `applyReliabilityRegistry` conserve la raison du scoring initial |
| DIAG-02 | P2 technique | Générique ; fixture vidéo et interface admin | Test vidéo échoue en parallèle puis passe seul ; certificats/libellés trop faciles à surinterpréter | F H pour la flakiness ; écart entre portée des flags et fidelity D ; nature dynamique≠scroll seule D |
| LIFE-01 | P2 technique | Toutes suppressions explicites futures ; aucune exécutée | `remove` efface référence puis cleanup allSettled ; attempts conservés | F D sur code ; politique de conservation souhaitée U, pas incident B1 constaté |

### 8.2. Composants, correction exacte, risques et acceptation

Chemins abrégés de cette matrice : `S` = `/Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/`, `C` = `/Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/client/`. Fichiers de service dans `S/services/design-lab/`. Le plan fournit les liens et détails d'exécution.

| ID | Composants / fonctions | Correction envisagée | Risque | Validation attendue | Gain attendu | Dépendances |
|---|---|---|---|---|---|---|
| CAP-01 | structural-page-capture `captureStructuralPage` ; paint ; capture-image-visibility ; structural-reference `captureAndPrepare` | Registre des obligations médias des états capturés ; distinguer rendu manquant de géométrie opaque ; refuser avant Vision si média requis absent | Élevé : faux refus | Fixture média secondaire manquant malgré paint global ; vide volontaire accepté ; source jamais forcée | Fidélité et coût évité | Lot 0 ; MED-01 ; NET-01 pour récupération utile |
| NET-01 | structural-resource-policy `fetch`, cache/queue, `fetchVideoRange` ; resource diagnostics | Trace temporelle puis admission réservée aux obligations connues, utilisée+réservée≤160 ; aucune réserve arbitraire/oracle | Élevé : scripts/vidéos affamés | Scénario 160 secondaires ; arrivées progressives ; budgets/SSRF/ranges inchangés ; visite réelle séparément | Médias sous budget constant | CAP-01 ; preuve d'obligations certifiables tôt |
| OP-02 | structural-operation-diagnostic `uncertainPreviousCall` ; reference `execute` ; recovery ; modèles ; C structural-operation-display | Historique d'incertitude/résolution durable lié à tentative et dispatch confirmé ; garde backend autoritaire | Moyen : relance bloquée à tort | Timeout→confirmation→panne avant dispatch→retry non confirmé bloqué ; confirmed supersession/reprocess/concurrence | Maîtrise appels payants | OP-01 ; champs additionnels compatibles |
| OP-01 | structural-reference `execute/saveAttempt` ; recovery `reconcile` ; modèles | Marqueur atomique analyse+generation/attempt sur référence ; finalisation idempotente ; CAS ; recovery reconnaît application déjà faite | Moyen : concurrence/anciens états | Panne de chaque checkpoint/crash/leases ; analyzed/applied cohérents sans nouveau transport | Recovery et vérité d'état | Lot 0 ; compatibilité v1 |
| OBS-01 | observation-selection `prepareCandidate/marginal/selectStructuralObservations` ; page capture ; diagnostics | D'abord trace de tous candidats ; ensuite features de domination/axes/topologie si perte macro démontrée ; formule/seuil/max inchangés | Élevé : redondance et détails trompeurs | Fixtures distinctives vs redondantes ; rejeu génération compatible ; entrée améliorée puis sortie nouvelle à mesurer | Information artistique utile | Lot 3A ; ART-01/02 pour mesurer effet |
| ART-01 | contract `structuralInstructions/schema/validate` ; openai `analyzeStructuralReference` | Macro-ancres→frontières→comparaison→vérification→labels ; représenter états communs sans grilles inventées | Moyen à élevé | Compatibilité 13/13 ; A/B Cartapani/Tastavents ; disparition des phases fausses | Segmentation/globalité | Entrées fiables ; ART-02 ; autorisation Vision |
| ART-02 | mêmes contrat/service/modèles/UI | Version artistique 2 : géométrie qualitative, relations par moment, direct/inferred/unknown et périmètre fragment/phase ; aucune durée inventée | Moyen à élevé : hallucination structurée | Assertions de photo/axes confrontées aux inputs ; Grupo L→R→L ; Amrit sans photo tardive ; A/B aveugle | Grammaire vérifiable | OP fixes ; baseline ; autorisation Vision |
| TAX-01 | contract LAYOUT_MODES et instructions ; modèles/rendu | Définitions de décalage/inégalité ; classifier après géométrie ; `other` prudent ; lecture v1 conservée | Moyen : labels/historique | Matrices régulières ≠ offsets ; relation label/descriptif ; pas de migration automatique | Différenciation et future mémoire | ART-02 ; qualité nouvelle non mesurée |
| OBS-02 | page capture choix strategy ; prepareStructuralViews ; selection | Expérience de perte macro vs trois locales sur continuous ; modifier seulement si signal générique fiable | Moyen à élevé | Coût/information comparés ; master hors Vision ; aucun passage forcé à cinq | Information/coût, conditionnel | Lot 3A/B ; nouveau résultat si entrée change |
| MED-01 | capture-image-visibility ; paint `waitForMainPaint/assertPaintedBatch` ; video ; reliability | Fixtures négatives des chemins aveugles et preuve bornée des médias effectivement inspectés | Moyen | Petit média/source réduite/background/lazy/frame/poster ; refus justifié, pas forcing | Fidélité inspectable | CAP-01 |
| DIAG-01 | reliability `applyReliabilityRegistry` ; diagnostics et rendu | Séparer scoringReason et deliveryReason ; préserver décision théorique mais expliquer la sélection réelle | Faible | Waldhaus : selected fallback et cause livraison claires ; preuve initiale conservée | Auditabilité | Lot 3A |
| DIAG-02 | C structural-reference.component ; suites paint-video/produit | Libellés séparant propreté/couverture/fidélité et état dynamique ; diagnostiquer flakiness sans affaiblir test | Faible à moyen | Compréhension UI fidèle ; test vidéo reproductible selon environnement, cause établie | Diagnostics/non-régression | Lots 2 et 5 |
| LIFE-01 | structural-reference `remove` ; attempts et cleanup Cloudinary | Clarifier politique archivage/tombstone/cleanup et exposer les échecs ; intervention différée | Moyen : conservation/coûts | Tests doubles de suppression partielle ; aucune destruction B1 ; décision humaine de politique | Exploitabilité future | Différé, pas bloquant pour B2 |

## 9. Preuves, incertitudes et hypothèses infirmées

| Question | Établi | Restant à confirmer / expérience |
|---|---|---|
| B1 terminé ? | 13 applications persistées concordantes, Grupo inclus | Aucune preuve de homepage artistique générée issue de ce corpus |
| Fidélité de toutes les entrées ? | 67 assets accessibles, dimensions conformes ; défaut Salterra visible | Source historique intégrale et hashes d'envoi manquants pour majorité |
| Salterra : quota trop faible ? | Admission 160 saturée avant certains médias ; limite mécanique démontrée | Réservation sous obligations connues assez tôt et sans perdre scripts ; visite ciblée autorisée |
| Sélecteur : bug de seuil ? | Tastavents/Torre scores admis conformes à G>0,25 | Signal artistique adéquat ; descripteurs rejetés finaux manquants |
| Continuous incorrect ? | Entrées utilisables, certaines compositions mal décrites | Comparaison information/coût à stratégie alternative, pas verdict par nombre de vues |
| Coordonnées/manifestes fautifs ? | 13 reconstructibles/revalidables, géométrie concordante | Frontières sémantiques restent interprétation Vision |
| Checkpoints toujours cohérents ? | Brut et parsé conservés ; finals B1 cohérents | Deux fenêtres de divergence reproduites, à corriger |
| Garde payante durable ? | Pas de relance automatique | Contournement de la confirmation après panne pré-dispatch reproduit |
| Sanitation insuffisante ? | Aucun popup non structurel dominant dans inputs examinés ; sidebar conservée | Généralisation hors B1 à tester ; source actuelle pas revisitée |
| Nouveau prompt efficace ? | Aucun prompt changé ni appel | A/B nouvellement autorisé nécessaire |

Hypothèses explicitement infirmées ou non retenues :

- **« Toute locale fixed_fallback doit être high »** : faux dans le contrat actuel ; des scores individuels fiables permettent low. Gucci entry et Cantina footer ne prouvent donc pas un bug de détail.
- **« Grupo ignore totalement gauche/droite »** : faux ; layoutProfile le mentionne. Le défaut est la précision et l'exploitation de la séquence de moments.
- **« PATCH URL permet de réutiliser des captures d'un autre site »** : chemin non présent ; `patch` ne modifie que title/tags/active. Pas de correctif proposé pour ce scénario inexistant.
- **« SourceViews intersectées = composition comprise »** : faux ; validité formelle et vérité visuelle sont distinctes.
- **« L'échec vidéo parallèle démontre un bug moteur »** : non établi ; le test ciblé passe. Cause à diagnostiquer.
- **« Continuous prouve qu'aucune animation n'existe »** : non ; détection bornée et observation statique seulement.

### Divergences avec la passation et la documentation

La passation est une photographie d'avant clôture. Son état Grupo encore à vérifier est dépassé par l'attempt appliqué actuel ; les cases restantes Torre/Cantina/Grupo de la roadmap ne décrivent plus la clôture persistée. Ces documents ne doivent pas devenir une preuve de qualité actuelle.

Les descriptions de checkpoints « appliqués et récupérables » doivent être bornées par les deux fenêtres de panne démontrées. La confirmation d'un nouvel appel incertain existe, mais sa conservation n'est pas garantie contre une erreur suivante. Une couverture `complete` ne signifie pas tous les médias présents : Salterra le montre. Aucune contradiction n'a été trouvée entre les dimensions/identités des manifestes appliqués et le code actuel. Les sections historiques de STRUCTURAL_REFERENCES présentant des anciens formats ou résultats ne sont pas les contrats actifs.

## 10. Expérimentations hors ligne et état Git

### Tests réellement exécutés dans cet audit

Un garde de préchargement a bloqué Mongo/Mongoose réel, mutations Cloudinary, transport HTTP/HTTPS distant et fetch distant. Seuls les fixtures localhost et routes navigateur simulées étaient admis. `app.js` et démarrage/crons/recovery réels étaient interdits. Les analyseurs, captures et stockage des scénarios produit sont des doubles mémoire. Aucun chargement de site externe et aucun OpenAI/Vision réel.

| Exécution | Résultat actuel | Portée et preuve |
|---|---|---|
| Validation analyses/manifestes existants | 13/13 | Constructeur partagé, parse/validation, dimensions et identités des 67 inputs ; asset-verification |
| Reproductions latentes | 5/5 scénarios reproduits | OP-FINALIZE, OP-CRASH, OP-UNCERTAINTY, NET-ADMISSION, OBS-FALLBACK-REASON ; latent-reproductions |
| Sélection backend gardée, neuf fichiers | 183 tests : 182 pass, 1 fail, 0 skip | [offline-tests-host.log](/private/tmp/gusto-structural-b1-audit-20261008/offline-tests-host.log), 65,251 s ; échec MediaRecorder `NotSupportedError` |
| Vidéo ciblée, même garde | 1 pass, 0 fail ; 6 tests non ciblés skip | [video-targeted.log](/private/tmp/gusto-structural-b1-audit-20261008/video-targeted.log), 3,709 s ; ne rend pas rétroactivement verte l'exécution précédente |
| Capture, produit et sequencing, trois fichiers en série | 37/37, 0 fail, 0 skip | [offline-product-tests.log](/private/tmp/gusto-structural-b1-audit-20261008/offline-product-tests.log), 746,801 s ; fixtures locales uniquement |
| Frontend operation-display | 2/2 | Test node local, environ 94 ms |

Les neuf fichiers backend : structural, operation-recovery, selection, reliability-shadow, resource-recovery, vision-cleanup, paint-video, consent-preferences et product-diagnostics. Les trois autres : structural-page-capture, structural-product-path, structural-sequencing. L'essai initial en sandbox avait dix échecs de lancement Chromium ; la relance autorisée sur l'hôte, toujours sous garde, les distingue des défauts produit. Les logs complets sont conservés.

Les 875 tests backend et 16 tests frontend/build mentionnés historiquement dans la passation ne sont **pas** annoncés comme réexécutés. Aucun build manager ni suite globale du workspace n'était nécessaire pour la création de rapports. Les résultats techniques actuels sont satisfaisants sur les scénarios couverts, avec une instabilité vidéo non expliquée ; ils ne valident pas la qualité des analyses Vision.

### Git et préservation du travail

Dépôt effectif : `/Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager`. Branche `site`, HEAD `2bd44a3321ec11f9d3b5263ecb47673eccf3e3ef`. Avant création des rapports : **59 chemins sales, 22 modifiés et 37 non suivis**. Ils comprennent services/modèles/routes StructuralReference, sanitation/media/recovery, tests et scripts, documentation/passation et interface admin. Ils ont été identifiés et préservés ; ils n'ont pas été interprétés comme des modifications de cet audit.

Les hashes de 64 sources inventoriées avant les tests ont été comparés après rédaction : les 64 sont inchangés. La différence entre les états Git avant/après contient exactement les deux Markdown livrables, sans chemin préexistant retiré ou modifié par l'audit : 61 chemins sales au total après livraison. Scripts, dérivés d'images et logs d'investigation restent dans le répertoire temporaire. Aucun commit/reset/revert ; aucune modification de budgets, contrats, seuils, code ou tests produit ; aucune écriture MongoDB/Cloudinary.

## 11. Plan générique, compatibilité et maîtrise du coût

Ordre recommandé : préserver baseline → corriger application/incertitude → certifier honnêtement les médias et expérimenter l'admission → conserver la trace complète des candidats → mesurer le signal géométrique → contrat artistique versionné → non-régressions et A/B ciblé → B2. Les algorithmes, fichiers, tests et critères d'acceptation sont détaillés par lot dans le [plan d'implémentation](</Users/leo/Desktop/Gusto Project/gusto-workspace/gusto-manager/server/docs/STRUCTURAL_B1_REMEDIATION_PLAN.md>).

Indispensable avant B2 : OP-01/02 ; aucune certification de média présent quand il manque ; preuves de sélection exploitables ; remédiation artistique mesurée des défauts centraux ; compatibilité et protections vérifiées. Recommandé sous preuve : features nouvelles de topologie, politique d'admission plus efficace et adaptations continuous. Différé : lifecycle de suppression, optimisations secondaires, fingerprint/consommation créative. Exclusivement Motion Observation : durée, ordre causal, transformations et chorégraphie.

Compatibilité : distinguer version artistique, coverage v2/v3 et manifeste v1 ; maintenir lecture/reprocess des analyses anciennes ; pas de conversion artificielle de v1 en v2, migration ou appel automatique. Les analyses B1 restent une baseline, y compris leurs erreurs. Risques principaux : faux refus média, famine réseau, perte de géométrie sous sélection nouvelle, relations structurées mais imaginaires, longueur/coût de sortie et concurrence des checkpoints.

Les 13 dernières tentatives appliquées utilisent `gpt-6-luna`, totalisent **174 537 input tokens + 104 689 output tokens = 279 226 tokens**. Ce total inclut le détail d'usage renvoyé pour ces calls, pas les tentatives précédentes ni un montant de facture. La première Cantina sans réponse laisse une dépense fournisseur incertaine. Aucune économie financière d'un correctif non réalisé n'est chiffrée comme acquise.

La validation payante proposée est de six appels A/B au maximum sur les mêmes inputs Tastavents/Grupo/Cartapani, modèle et paramètres identiques : trois contrôles actuels, trois variantes. Ordre de grandeur historique doublé : 121 268 tokens ; ce n'est pas un plafond de facture. Un plafond monétaire au tarif courant, limites de sortie, traitement des timeouts et autorisation séparée sont requis avant envoi. Gucci contrôle positif ajouterait deux calls seulement si autorisés. Une nouvelle sélection ou capture doit être évaluée séparément à prompt constant. Aucune campagne de treize nouvelles analyses n'est proposée.

## 12. Protocole B2 et sortie vers Motion Observation

B2 : sept sites inconnus choisis **après** stabilisation, couvrant calme typographique, diptyques/alternances, collage monumental, longue page/ancrages, scroll/persistent atypiques, médias exigeants et CMP/overlays. Pas de site sélectionné, visité ou analysé ici.

Figer avant lancement versions/configuration/modèle/prompt, règles de sélection, budgets, score humain et critères de refus. Conserver toutes les preuves par génération, dont descripteurs rejetés et obligation média. La fidélité doit être comparée à une preuve source de la même visite autorisée, pas uniquement à la sélection du moteur. Distinguer bug, limite statique, refus honnête et succès artistique. Aucun réglage après chaque domaine ; un bug bloquant suspend/versionne la cohorte.

Critère de maturité désormais fixé par l'utilisateur : **chacun des sept sites inconnus B2 dont la capture est certifiable et l'analyse complète raisonnablement réalisable doit atteindre au moins 8/10 en Utilité Design Lab**, sur une nouvelle sortie évaluée indépendamment avec la grille constante et des preuves visuelles. Les notes inférieures restent visibles et constituent des insuffisances du système à investiguer ; aucun filtre de références, score automatique ou retry payant n'est ajouté. Un échec technique est déclaré, sans le convertir en réussite. Cette exigence remplace les critères proposés de six analyses utilisables et de 7/10 ; elle ne rehausse aucune note B1. Subsistent : zéro hallucination critique, invariants de sécurité/budget/sanitation, médias connus manquants refusés, opérations cohérentes et non-régression historique.

Passage à Motion Observation après : correctifs opérationnels spécifiquement prouvés, fidélité et périmètre d'incertitude visibles, amélioration artistique mesurée sur nouvelles sorties comparables, B2 conforme ou réserves explicitement acceptées. Le niveau d'une homepage générée et la généralisation au Ventadour restent à établir à leur étape dédiée.

## 13. Décision au point de contrôle

**État actuel : B1 clôturé, baseline utilisable avec réserves fortes ; non prêt pour B2 au niveau artistique exigé.** Les deux fenêtres de panne et la garde d'incertitude sont démontrées ; l'admission réseau est causalement démontrée ; plusieurs erreurs artistiques le sont contre leurs entrées. La répartition exacte des causes sélection/résolution/prompt/modèle, la fidélité source complète et l'efficacité d'un nouveau contrat restent à mesurer.

Ce point de contrôle était celui de la livraison initiale des phases 1–2. L'utilisateur a ensuite validé le diagnostic et le plan et autorisé les corrections locales des phases 3–4. Leur état est détaillé ci-dessous ; les autorisations distinctes pour visites externes, Vision et données distantes n'ont pas été données.

## 14. Bilan des phases 3–4 — corrections locales autorisées

### 14.1. Périmètre et preuve de préservation

Le diagnostic et les notes B1 des sections précédentes restent ceux de l'audit initial. **Aucune de ces notes n'a été augmentée après modification du code. Aucun des 13 résultats B1 n'a été remplacé.** L'état actuel du moteur est une implémentation locale différente, techniquement testée ; son efficacité artistique reste inconnue.

Au début des corrections : branche `site`, même HEAD, 61 chemins sales (22 modifiés, 39 non suivis). Un inventaire de hashes et des copies des sources préexistantes ont été conservés dans `/private/tmp/gusto-structural-b1-remediation-20261008/before`. Les différences de cette intervention doivent être lues contre cette baseline, pas attribuées intégralement au diff avec HEAD. Aucun commit, reset ou revert.

Archives durables expurgées : `STRUCTURAL_B1_BASELINE_INDEX.json` (13 identités/générations/attempts, manifestes, 67 hashes et géométries), `STRUCTURAL_B1_COMPATIBILITY.json` (résultat de revalidation), `STRUCTURAL_B1_AB_PREPARED.json` (trois paires et hashes des variantes, uniquement entrées publiques) et `STRUCTURAL_B1_LOCAL_MEASUREMENTS.json`. Le snapshot brut privé n'est pas ajouté au dépôt. Les tests ne chargent ni `app.js` ni dotenv et utilisent `tests/helpers/structural-offline-guard.js`, qui bloque transports distants, MongoDB, Cloudinary et réseau Chromium non remplacé par une fixture. Les lancements Chromium nécessitaient l'exécution hôte ; le garde reste actif.

Le script `prepareStructuralB1Validation.script.js` relit uniquement les preuves déjà présentes. Résultat : **13/13 contrats V1 valides, 13/13 manifestes identiques, 13/13 brut/parsed/résultat appliqué concordants, 67/67 hashes d'images archivées identiques à l'index**. Ces hashes restent ceux des octets lus pendant l'audit ; ils n'établissent ni tous les octets des dispatchs historiques ni une fidélité complète aux sites vivants. Aucun nouvel accès distant n'a été utilisé pour cette vérification.

### 14.2. Lot 0 — baseline et critère de maturité

Problème initial : une preuve exclusivement temporaire, et le risque de confondre plusieurs générations ou d'attribuer un succès aux corrections sans nouvelle sortie.

Implémentation : index durable expurgé, validation locale des identités et hashes, protocole A/B auto-suffisant. Le corpus historique reste lisible ; les versions et les erreurs reconnues restent documentées. Aucun problème artistique historique n'est déclaré corrigé par la seule revalidation.

L'utilisateur fixe désormais **8/10 minimum en Utilité Design Lab comme maturité du système**, à atteindre sur chacun des sept sites B2 certifiable et raisonnablement analysable. Toute note inférieure reste visible, sans éviction ni moyenne qui masque un échec. L'évaluation doit être indépendante, sur de nouvelles sorties, avec la grille constante et les preuves visuelles. Ce critère documentaire n'est ni un score produit, ni une garantie codée, ni un motif de retry payant.

### 14.3. Lot 1 — application, finalisation et incertitude

**Avant.** OP-01 et OP-02 sont reproduits dans `latent-reproductions.json` : application déjà enregistrée suivie d'un attempt échoué lors du dernier checkpoint ; confirmation d'un ancien appel incertain consommée par une panne locale avant nouveau dispatch. Les réponses étaient conservées mais les états divergeaient, ou la garde payante disparaissait.

**Fichiers/fonctions.** `structural-reference.service.js` (`execute`, `saveAttempt`, `resolveConfirmedUncertainty`), `structural-operation-recovery.service.js` (`reconcile`, `finalize`), `structural-operation-diagnostic.js`, modèles `structural-reference`/`structural-analysis-attempt`, affichage `structural-operation-display.js`.

**Après.** L'analyse et un marqueur versionné `analysisApplication` sont appliqués atomiquement à la référence. L'attempt reste `validated` si sa finalisation échoue. Le recovery termine uniquement l'attempt correspondant au marqueur, avant acquisition d'une autre génération ; il est idempotent et n'appelle pas Vision. Une perte d'accusé de réception après commit est reconnue par relecture du marqueur. Si cette relecture échoue aussi, le checkpoint reste retraitable ; aucune certitude de commit n'est inventée.

Les writes d'attempt comparent identité/génération/statut et, lorsqu'il existe, `updatedAt`. Une réponse tardive peut être conservée sur un attempt interrompu sans réactiver la génération ni écraser la nouvelle lease. La garde `visionConfirmationRequired` et les anciennes tentatives incertaines restent disponibles même si la lecture d'historique ou la création suivante échoue. Une confirmation n'est consommée qu'après preuve de dispatch/réponse, jamais par le simple événement prospectif `request_started`. Un nouveau timeout conserve sa propre incertitude. Aucun retry payant automatique.

**Preuves.** Sept injections spécifiques de panne/concurrence dans `design-lab-structural-finalization.test.js`, recovery de marqueur frais et rejet de génération discordante, suites de lease et réponses tardives. Les tests de service/contrats/recovery/trace groupés passent 112/112 avant consolidation. La première version du nouveau test de lecture d'historique échouait avant acquisition ; son injection a été déplacée précisément au read post-acquisition, sans modifier le moteur pour satisfaire une panne mal placée.

**Limites.** Tests avec doubles mémoire : ils démontrent l'ordre et les filtres CAS, pas une tolérance universelle aux pannes MongoDB. La lecture du recovery peut toujours échouer ; l'opération refuse alors de commencer. Aucun failover réel Mongo ni dispatch fournisseur n'a été exécuté. Les limites de lease et de transport ne changent pas.

### 14.4. Lot 2 — certification limitée, admission inchangée

**Avant.** Salterra : média secondaire absent dans une locale et plafond de 160 admissions atteint ; une capture visuellement variée peut être techniquement acceptée malgré cette absence. L'inventaire rétrospectif des images ne prouve pas qu'une politique d'admission saurait les reconnaître en ligne.

**Fichiers/fonctions.** `structural-media-evidence.js` (`inspectMediaEvidence`, `summarizeMediaEvidence`, `inspectedMediaAreComplete`), inspection juste avant screenshot dans `structural-page-capture.service.js`, gates dans `structural-reference.service.js`, modèle de coverage ; `structural-resource-policy.js` (`admissionTrace`) et diagnostic dans `portfolio-capture.service.js`.

**Après.** Sur chaque viewport inspecté, un média visible admissible connu comme manquant provoque un refus explicite `structural_media_incomplete` avant préparation/livraison Vision. L'absence de nœud image n'est pas assimilée à une panne. Une image réellement décodée avec géométrie opaque peut rester acceptée ; le contenu inaccessible d'un iframe n'est pas inventé. Ni `src` ni frame ne sont forcés. Les vidéos gardent leurs preuves natives de poster/frame et leurs vérifications d'intégrité existantes.

La preuve versionnée indique portée, positions, compte des éléments inspectés, obligations/source hash et troncatures. **Elle certifie seulement `visible_eligible_media_in_captured_viewports`**, pas la totalité de la source. Sont explicitement hors périmètre : nœuds absents/cachés, petits médias ou médias clippés, pseudo-éléments, contenus de frames tiers, backgrounds CSS non HTTP et occurrences supplémentaires d'un même background réutilisé. Les dimensions décodées ne sont pas une preuve individuelle de tous les pixels peints ; le gate de peinture existant demeure distinct. Les seuils d'éligibilité existants ne changent pas. Détails bornés à 64 obligations par viewport et 256 viewports ; les comptes et troncatures restent visibles.

Une nouvelle analyse sur d'anciennes captures dépourvues de cette preuve exige le parcours de capture actuel ; **un retraitement V1 conserve ses anciennes règles et n'invente pas la certification**. Ce changement de préparation n'a déclenché aucune capture réelle pendant cette intervention.

**Admission.** Instrumentation passive avant la décision : type de requête, hash de source, séquence/heure, correspondance éventuelle à un propriétaire vidéo visible, compte d'admissions et décision. `selectedSourceCertified` reste faux : une déclaration n'est pas une preuve de source sélectionnée ni d'obligation future. Maximum 2 048 événements en mémoire, 256 rattachés à l'attempt avec troncature explicite. La fixture sature exactement à 160 et la requête suivante reste refusée. Tous les plafonds d'octets, réservations, concurrence, ranges et sécurités restent inchangés.

**Preuves/limites.** Cinq tests dédiés, dont Chromium : média secondaire réellement manquant, image opaque décodée, composition textuelle volontaire, image cachée et frame inaccessible ; bornes et confidentialité. Aucun gain réseau en production n'est établi. **Salterra n'est pas annoncé corrigé** : la nouvelle garde devrait refuser un défaut dans son périmètre, mais elle ne récupère pas le média. Nouvelle visite ciblée avec preuves source/admission nécessaire après autorisation ; nouvelle politique seulement après démonstration de sécurité, bénéfice et absence de famine, sans budgets relevés.

### 14.5. Lots 3A et 3B — causalité observable, sélection conservée

**Avant.** Les générations finales B1 ne conservent pas tous les descripteurs rejetés ; la raison théorique de rejet pouvait apparaître sur une vue effectivement livrée par fallback. Le contre-factuel exact de Tastavents n'est pas reconstructible à partir d'une ancienne trace différente.

**Fichiers/fonctions.** `structural-observation-selection.js` ajoute le descripteur aux décisions, sans changer le choix ; `structural-reliability.service.js` (`applyReliabilityRegistry`) sépare raison/scoring théorique et livraison ; `structural-observation-trace.js` (`buildObservationTrace`, `expandObservationTrace`), intégration capture/service/modèle attempt.

**Après 3A.** Trace versionnée numérique, sans DOM ni texte utilisateur : candidats, descripteurs, scores L/D/V/R/G, fiabilité, rounds/échanges, choix/rejets et raisons, mode théorique et final, IDs réellement livrés et raisons de fallback. Elle est jointe à l'attempt avec generationId et hash du manifeste ; une réutilisation indique la génération source, et une trace historique absente reste absente. En continuous, le scoring non exécuté est indiqué au lieu d'inventer une sélection adaptive.

La trace est bornée à 160 candidats et 256 KiB avec troncatures explicites ; les grands pools compressent leurs descripteurs sans perte, décodables par `expandObservationTrace`, plutôt que supprimer un candidat pour atteindre la borne. La décompression est elle-même bornée. Les chiffres arrondis diagnostiques ne modifient jamais les descripteurs ou scores utilisés par le sélecteur. La trace reste hors des inputs Vision.

**Preuves 3A.** Déterminisme, candidats rejetés conservés, fallback final expliqué, confidentialité et pool numérique dense de 160 candidats décodable sans perte. Sur fixtures locales, 20 mesures : 5 candidats → 8 940 octets, moyenne de construction 0,709 ms ; 32 candidats → 54 292 octets, 1,806 ms. Ce n'est pas un benchmark des sites vivants ni du stockage MongoDB.

**Décision 3B.** Les descripteurs actuels distinguent cinq changements synthétiques : dominance, axe, relation image/texte, superposition et vide central/périphérique. Cela ne démontre ni un gain marginal utile ni une meilleure sélection artistique. Aucun poids, seuil, limite de cinq vues ou règle d'entry/fallback n'est modifié. Il manque l'inventaire complet contemporain des candidats et des annotations visuelles indépendantes pour comparer, à inputs constants, le gain de chaque locale. Toute collecte externe nécessaire reste soumise à une autorisation distincte.

### 14.6. Lot 4 — contrat artistique V2, bénéfice à mesurer

**Avant.** Descriptions répétitives, géométrie implicite, relations entre moments insuffisantes, label parfois plus précis que la preuve, principes trop généraux et fragment vide étendu à un panneau entier.

**Fichiers/fonctions.** `structural-reference.contract.js` (`structuralAnalysisSchemaV2`, `buildStructuralVisionRequest`, `structuralInstructions`, `validateStructuralAnalysis`), `openai.service.js` (version explicite), service et modèles structural, composant admin `structural-reference.component.js`.

**Après.** Version artistique 2 distincte de la version 1 du manifeste et des versions de capture. Chaque moment exprime placement des images/texte, masse dominante et rapport, axe, relation, régularité, superposition et topologie du vide. Les séquences de densité/respiration restent exprimées par les champs de rythme existants. Les preuves ajoutent niveau direct/inféré/inconnu et portée moment/fragment/états échantillonnés. Les relations globales relient 2 à 6 moments réels, avec mécanisme, effet et sources ; huit relations maximum. Les principes décrivent mécanisme/effet/conditions, quatre maximum par niveau et texte borné.

Cette géométrie remplace une partie des paragraphes de moment V1 au lieu de les dupliquer. Le prompt demande lecture macro, frontières, relations, preuves puis classification ; il explicite le fragment, la prudence sur médias absents et les limites statiques. La validation refuse notamment une grille déclarée régulière mais labellisée décalée, des liens vers moments absents et des sources inexistantes. **Ces validations vérifient une cohérence déclarée, pas la vérité artistique des pixels** : une hallucination géométrique cohérente peut toujours passer.

Les nouvelles générations demandent V2 et enregistrent version/hash du prompt/schéma. Les anciennes sorties sans version sont V1 ; leur retraitement utilise cette version, sans migration ni nouvel appel. L'interface accepte chaînes V1 et principes structurés V2, affiche géométrie/relations/portée et ne présente plus toute stratégie sampled comme une animation liée au scroll. La certification média historique absente est signalée.

**Preuves.** Six tests V2 (incluant persistance Mongoose locale, contrat produit V2 et reprocess sans second appel), compatibilité historique 13/13, build du dashboard et tests UI. Aucune réponse V2 fournisseur n'a été produite : mécanismes/principes/relations améliorés sont une capacité du contrat, **pas encore un progrès artistique démontré**.

**A/B préparé.** Tastavents (3 images), Cartapani (6), Grupo (4), soit 13 entrées par passage et 26 pour les six appels proposés. A = contrat/prompt V1 réexécuté ; B = V2 ; hashes des contenus identiques dans chaque paire, schémas/prompts distincts. Paramètres proposés inchangés : `gpt-6-luna`, raisonnement medium, timeout 120 s, zéro retry automatique. Les recettes sont publiques, compactes (~53,7 Ko) et ne contiennent ni brut/parsed privé ni clé. **Autorisation actuelle : zéro appel.** À approuver avant dispatch : protocole définitif, plafond monétaire, contrôle des octets images au moment de l'exécution, limites de sortie et évaluation indépendante aveugle. Ordre de grandeur historique 121 268 tokens pour les paires ; ce n'est pas un plafond de facture. Tarifs actuels à vérifier seulement pour l'autorisation future.

### 14.7. Lot 5 — validation technique, échecs conservés et limites

Les suites couvrent contrats/service, application/finalisation/incertitude/leases/générations/réponses tardives/reprocess, sélection/reliability/continuous/adaptive/fallback, saturation/ranges/SSRF, médias et peinture, overlays/CMP/sanitation/restauration, animation et manifestes. Persistence et analyse sont remplacées en mémoire, les pages sont des fixtures locales. Les suites historiques de 875 tests backend et 16 tests frontend ne sont toujours pas annoncées comme réexécutées.

Résultats chiffrés définitifs et hashes de logs : `STRUCTURAL_B1_REMEDIATION_VALIDATION.json`. Les passes intermédiaires incluent 200/200 tests techniques, 112/112 service/contrats, 55/55 complémentaires, 3/3 protocole/trace avant compression, et 2/2 UI ; ces nombres se chevauchent et ne s'additionnent pas. Les trois fichiers de parcours complets passent **37/37 en 754,778 s**, arrêtés à la frontière de la dépendance d'analyse sans appel payant.

**Instabilité conservée.** La consolidation fortement parallèle passe 255/256 : la fixture `reveal attendu` expire son délai de 2 s et échoue avec `structural_main_content_invisible` (test 17,272 s). Elle avait passé les autres runs, dont les trois répétitions vidéo complètes ; l'hypothèse de contention est compatible avec ces résultats, pas une causalité universelle démontrée. La suite rejouée avec deux fichiers concurrents passe **256/256 en 94,688 s**, sans changer timeout moteur ni assertion. Après ajout de la compression sans perte des grands pools, les quatre tests ciblés trace/protocole passent **4/4** ; la branche normale de capture ne change pas. Le run échoué reste archivé et dans le bilan ; un replay vert ne l'efface pas.

**MediaRecorder.** L'ancienne fixture arrêtait l'encodage après un timer de 300 ms, indépendamment des données effectivement produites. Elle attend désormais des chunks encodés et des frames réellement dessinées ; aucune frame/poster n'est simulé, les assertions de présence, pause, intégrité, restauration et pixel rouge sont conservées. Un délai de fixture de 5 s reste un échec explicite si l'encodage n'avance pas. Trois répétitions complètes : 7/7 à chaque passage (7,288 s, 7,276 s, 7,628 s), plus passes dans les consolidations. Aucune récidive du défaut MediaRecorder observée après ce changement ; **la cause exacte de l'ancien `NotSupportedError` n'est pas démontrée**, et la stabilité sous toute contention n'est pas garantie.

Le build manager est réussi. Les avertissements de lint dans d'autres composants restent présents ; aucune modification opportuniste de ces composants. Les deux fichiers de service worker créés par le build, absents avant cette intervention, ont été retirés ; les changements préexistants ont été préservés. Aucun build des vitrines n'est requis pour ces changements internes.

Vérification finale : `git diff --check` sans erreur et 18 vérifications de syntaxe JavaScript réussies. Les objets de configuration du réseau et du sélecteur sont textuellement identiques aux copies de début d'intervention. Sur les 62 fichiers inventoriés, 19 ont été modifiés dans le scope et 43 restent identiques ; aucun fichier préexistant inventorié n'a disparu. Les fichiers nouveaux de tests, preuves et helpers sont identifiés séparément par Git. Les anciens 61 chemins sales restent préservés et le HEAD est inchangé.

**Coût/performance.** Zéro appel Vision, capture externe ou mutation distante. Taille/temps de trace et taille/temps des requêtes préparées sont mesurés localement, avec périmètre synthétique indiqué dans `STRUCTURAL_B1_LOCAL_MEASUREMENTS.json`. Le nombre d'images et leurs détails restent identiques par paire A/B. Le nouveau prompt et le nouveau schéma ont un coût d'entrée différent ; aucun token V2, coût fournisseur ou longueur de réponse n'est encore mesuré. Le surcoût de la certification média, des reads d'historique/recovery et de la persistance de trace sur sites réels reste à mesurer. Tous les budgets de capture/réseau/Vision et seuils de sélection existants sont conservés.

### 14.8. Bilan transversal et conditions avant B2

| Domaine | Établi après intervention | Ce qui reste à prouver |
|---|---|---|
| Bugs opérationnels | Correction générique des fenêtres OP-01/02 sur pannes injectées, CAS et recovery sans appel | Tolérance sous panne réelle fournisseur/DB, sans présumer d'une preuve de production |
| Fidélité média | Un manque connu dans le périmètre inspecté est refusé ; vide/opaque/frame ne sont pas confondus | Salterra fidèle ; médias hors périmètre ; information en ligne suffisante pour admission |
| Information visuelle | Trace explicite et discriminations numériques de cinq familles de fixtures | Gain informationnel de nouvelles captures/locales sur sites inconnus ; aucun annoncé |
| Intelligence artistique | Contrat V2 plus expressif, borné et compatible ; UI et recette A/B | Qualité de nouvelles analyses évaluée indépendamment, ≥8/10 en utilité par cas applicable |
| Héritage | 13 analyses/manifestes V1 et 67 hashes préservés ; reprocess versionné | Fidélité historique complète source/dispatch absente, aucune rétro-certification |
| Généralisation | Aucun correctif de domaine, aucune modification opportuniste des poids/budgets | Sept sites B2 inconnus, chacun conservé dans le bilan y compris échecs/refus |

Restent ouverts : Salterra/admission, insuffisance centrale de Tastavents/Torre et segmentation Cartapani, attribution fragment→phase Grupo, fidélité et hallucinations V2 non évaluées, instabilité de tests sous forte concurrence, coûts/performance réels et lifecycle d'archives différé. Les erreurs artistiques historiques ne sont pas résolues par des JSON V2 de test.

Avant B2 : accepter les preuves opérationnelles et les limites de certification ; obtenir les preuves complémentaires de capture/sélection nécessaires ; autoriser puis évaluer le protocole A/B comparable ; vérifier fidélité/principes/relations et Utilité Design Lab sans abaisser le seuil de 8/10 ; figer versions, règles, budgets et grille ; autoriser ensuite la cohorte de sept sites. Une insuffisance ne déclenche pas d'appel supplémentaire automatique. **Verdict actuel : StructuralReference non prêt pour B2 ; maturité artistique non démontrée. Point d'arrêt après livraison locale.**
