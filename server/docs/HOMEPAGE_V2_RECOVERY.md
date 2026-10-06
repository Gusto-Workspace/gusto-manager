# Homepage V2 : tentatives, checkpoints et récupération

## Contrat artistique conservé

Le plan `homepageV2Plan` et les prompts artistiques ne changent pas. Ventadour possède trois chapitres séquentiels 1024×1536, qualité `high`, modèle initial configuré `gpt-image-2.5-flare`. Chaque chapitre reçoit visuellement le Style Frame validé ; les chapitres suivants reçoivent aussi le PNG précédent et sa bande basse de 128 px. Aucun ajout d'image DesignReference, Portfolio ou ancien site. Aucun appel Sol/Luna, aucun retry automatique.

## Journal séparé

`HomepageGenerationAttempt` n'est pas une homepage officielle. Il conserve :

- `generationId` UUID, projet, direction/slot/version et Style Frame ;
- `status`, `stage`, `revision` pour les écritures conditionnelles ;
- `contractVersion`, `contextHash`, `planHash` ;
- le plan complet privé (`select:false`), les prompts et l'ordre exact des inputs ;
- par chapitre : index, statut, moments/assets sélectionnés, request ID OpenAI, identifiant Cloudinary, URL originale, SHA-256, erreur minimale et indicateur d'appel incertain ;
- les métadonnées de l'assemblage final.

Aucun binaire, base64 ou HTML dans Mongo. Un index unique partiel autorise une seule tentative bloquante par projet. Les étapes et checkpoints sont affichés via un DTO sans prompts ni données privées. Les homepages officielles portent le même `generationId` pour éviter une seconde promotion.

## Ordre de durabilité

1. Vérification du projet éditable, de la direction active et du Style Frame validé.
2. Préparation du répertoire de secours et création du journal **avant tout appel payant**.
3. Avant chaque appel, checkpoint `generating` (résultat potentiellement incertain en cas d'arrêt du processus).
4. Après réponse PNG valide : sauvegarde immédiate des octets sur disque (fichier temporaire, flush, rename), puis upload PNG original avec ID déterministe `…/homepages/<generationId>/chapter-<index>`.
5. Checkpoint Mongo `persisted` avec URL/hash/request ID ; heartbeat du verrou projet. **Le chapitre suivant ne démarre qu'après réussite de ces étapes.**
6. Trois chapitres disponibles : assemblage Sharp inchangé, sauvegarde locale puis upload déterministe `…/homepages/<generationId>/assembled`, checkpoint `ready`.
7. Promotion dans `SiteProject` sous le token de verrou. Journal `completed` uniquement après sauvegarde officielle. Les copies locales sont alors nettoyées ; les PNG Cloudinary restent conservés.

Le disque est un secours si Cloudinary échoue. `DESIGN_LAB_HOMEPAGE_RECOVERY_DIR` permet de choisir son emplacement ; défaut : `os.tmpdir()/gusto-homepage-recovery`. Pour préserver ce secours lors du remplacement d'une instance/disque, ce répertoire doit résider sur un volume persistant. Le dossier temporaire seul ne garantit pas la récupération après sa disparition. Dès qu'un chapitre est `persisted`, Cloudinary constitue son stockage durable.

Si disque et Cloudinary échouent simultanément, aucun mécanisme ne peut garantir la conservation du résultat reçu. L'appel reste signalé comme incertain et ne déclenche jamais un nouvel appel silencieux.

## Reprise et intégrité

La reprise manuelle recherche d'abord chaque image sous son ID Cloudinary déterministe, puis dans le secours local si elle n'y est pas encore. Un upload dont l'accusé de réception s'est perdu est ainsi récupérable, même si le checkpoint Mongo n'avait pas été écrit. Les PNG sont téléchargés via leur URL originale, sans transformation ; dimensions/format/hash sont contrôlés. Les octets sont réutilisés directement et la bande de continuité est reconstruite localement. Un checkpoint payé dont les octets sont manquants/altérés n'est pas régénéré silencieusement.

Compatibilité stricte : version du contrat, modèle/qualité, direction active et version/identité, Brand/Visual System, IA, Style Frame validé et image, brief/contexte/réglages, pool des assets et ordre, plan/moments/affectations/prompts. Tout changement incompatible renvoie **409 avant OpenAI**, avec abandon explicite requis. Le plan persisté est utilisé après comparaison au plan courant.

Un timeout/arrêt en vol peut laisser un appel traité sans résultat récupérable. La récupération essaie les deux stockages sans OpenAI. Si aucun résultat n'est retrouvé, une reprise payante de cet appel incertain exige `confirmUncertainRetry:true`, envoyé uniquement après confirmation utilisateur. Aucun retry automatique.

## Routes admin

Sous `/api/admin/design-lab` (auth admin existante) :

| Action | Route | OpenAI |
| --- | --- | --- |
| Nouvelle tentative | `POST /projects/:id/directions/:directionId/generations` | chapitres manquants du nouveau plan ; refus si tentative bloquante |
| Lecture/progression | `GET /projects/:id/homepage-attempts` | aucun |
| Reprise manuelle | `POST /projects/:id/directions/:directionId/homepage-attempts/:generationId/resume` | uniquement les chapitres manquants |
| Récupération/finalisation | même chemin avec `/recover` | **jamais**, même s'il manque un chapitre |
| Abandon explicite | `DELETE /projects/:id/homepage-attempts/:generationId` | aucun ; aucune suppression d'image |

Le frontend bloque le double clic ; le verrou projet et les checkpoints conditionnels protègent aussi le backend. Une tentative partielle interdit le bouton de nouvelle génération. L'UI affiche Chapitre 1/3, 2/3, 3/3, Assemblage, puis finalisation. Elle indique les chapitres conservés et propose Reprendre, Récupérer/finaliser sans OpenAI ou Abandonner.

Après une interruption du processus, le verrou Mongo peut survivre au redémarrage. La lecture projet expose `homepageOperationStale` après 10 minutes sans heartbeat, avec le même seuil strict que l'acquisition backend. L'UI autorise alors uniquement les actions explicites Reprendre/Récupérer/Abandonner sur la tentative courante ; aucun refresh ni polling ne relance une génération. Avant expiration, elle explique le verrou au lieu d'inviter à cliquer un bouton indisponible. Un chapitre `generating`/`uncertain` reste soumis à vérification des stockages puis confirmation explicite avant toute nouvelle dépense.

## Pannes et coût maximal

| Situation | Résultats conservés | Appels image maximum à la reprise |
| --- | --- | --- |
| Run neuf Ventadour | chaque chapitre checkpointé avant le suivant | 3 Flare |
| Échec chapitre 1 | ceux récupérables par ID/disque | 3 |
| Échec chapitre 2 | chapitre 1 | 2 |
| Échec chapitre 3 | chapitres 1/2 | 1 |
| Assemblage ou upload final échoué | trois chapitres | 0 |
| Sauvegarde officielle Mongo échouée | trois chapitres et assemblage uploadé | 0 |
| Sauvegarde réussie mais accusé perdu | génération officielle reconnue par `generationId` | 0 ; aucune duplication |

Les limites sont des maxima : une image déjà reçue et retrouvée réduit encore les appels. Une récupération `/recover` produit toujours zéro appel. L'abandon libère la tentative mais conserve les fichiers payés ; il ne supprime ni homepage officielle ni autres assets. Une homepage déjà officielle n'est pas abandonnable par cette action.

## Variations : audit uniquement

Le chemin existant des variations reste inchangé : trois appels `gpt-image-2.5-sunburst`, même si l'instruction concerne un seul moment, avec chapitre parent et continuité. Il n'utilise pas encore ce journal et conserve les risques de perte précédents.

La base de journal contient un mode et un parent, un plan ordonné et des checkpoints par index/moments/assets. Une future évolution pourra étendre le contrat à une variation avec un sous-ensemble explicite de chapitres, en conservant les autres. Elle devra définir quels chapitres suivants dépendent d'une modification de continuité et les inclure explicitement dans le plan/hash. Aucun ciblage ni variation nouvelle implémenté ici.

## Vérifications

Tests synthétiques et API/Mongo/Cloudinary mockés : première promotion, échecs 1/2/3, continuité binaire, réseau/heartbeat, upload/journal par chapitre, assemblage/upload/journal final, échec officiel et accusé perdu, reprise zéro dépense, contexte incompatible, abandon, protection des résultats officiels et double clic.

`node --test tests/design-lab*.test.js tests/design-engine-v2.test.js tests/direction-versioning.test.js`

Aucun appel OpenAI réel ni écriture Mongo TEST pendant cette mission. Les directions, Style Frames et données Ventadour existants ne sont pas modifiés.

Validation finale : 31 nouveaux tests Homepage, 296/296 tests Design Lab/Portfolio passants, build dashboard réussi, routes backend chargées sans erreur.
