# Style Frame : trois moments et récupération

## Contrat image

Avant : ouverture, transition et amorce intérieure, paysage 1536x1024.

Après : une composition web continue, portrait **1024x1536**, comprenant trois moments représentatifs de la direction. Ce n'est ni une homepage complète/miniature, ni trois cartes ou mini-maquettes collées. Échelle lisible, transitions continues et variation de climat. Les critères de sophistication sont des objectifs de rendu et d'approbation humaine ; aucun contrôle artistique fatal ni retry n'est ajouté.

Le format portrait est documenté pour Flare/Sunburst et leurs éditions dans la [documentation officielle OpenAI](https://developers.openai.com/api/docs/guides/image-generation). Le code `generateImage` acceptait déjà ce format pour les maquettes ; le plan Style Frame l'utilise désormais explicitement. PNG, qualité configurée par `OPENAI_DESIGN_IMAGE_QUALITY` (actuellement `high`), timeout 240 secondes. Aucun changement des modèles configurés.

## Sélection locale et déterministe

1. Reprendre les `homepageMoments`, sans modifier l'architecture. Les valeurs de `rhythmMap` et `sectionClimatePlan` priment pour intensité, climat et surface.
2. Choisir le hero comme entrée ; si sa position interdit deux moments suivants, prendre la première ouverture. Trois IDs distincts au minimum sont nécessaires.
3. Évaluer chaque paire intérieure suivante, en conservant l'ordre de lecture :
   - +4 pour un moment intérieur `homepage_primary` ; +3 pour sa photographie ;
   - fréquence de son layout dans la home ; affinité lexicale avec `layoutGrammar` et `spatialLanguage` (0 à +4) ;
   - contraste : climat différent +4, layout +4, surface +2, intensité +2, présence photographique +2 ;
   - somme : contraste entrée/intérieur + 2 × contraste intérieur/variation + contraste entrée/variation ;
   - +3 par signature distincte autorisée sur les moments retenus (contexte/id/rôle/layout/climat ou `signatureMovesAllowed`).
4. Choisir le meilleur score ; à égalité conserver la première paire. Aucun nom de service, restaurant ou sujet métier n'intervient.

Il s'agit d'une heuristique locale de couverture, pas d'une appréciation esthétique. Si la direction est calme ou peu contrastée, le plan reste valide. `styleFrameCoverage` conserve les IDs, raisons et aspects couverts ; seuls les trois moments et leurs annotations de rythme/climat entrent dans le prompt. Le Brand System et la grammaire visuelle continuent de gouverner les trois échantillons.

Le plan contient `mode`, `endpoint`, `size`, `moments`, `styleFrameCoverage`, `inputs`, `prompt`, `officialPrompt`, `refinementFeedback`. Les assets requis par les moments passent devant les autres, puis priorité de rôle, signature et diversité de rôles ; maximum cinq assets client.

## Modes et routes

Base : `/api/admin/design-lab/projects/:id/directions/:directionId`.

| Action | Route | Modèle/inputs |
| --- | --- | --- |
| Nouvelle proposition | `POST .../style-frames` | Flare : 0–5 CLIENT_ASSET puis 2–3 VISUAL_REFERENCE ; aucun rendu précédent |
| Affiner | `POST .../style-frames/:frameId/refine` | Sunburst : CURRENT_STYLE_FRAME_TO_REFINE, assets, références ; feedback textuel de 0–1500 caractères |
| Récupérer | `POST .../style-frame-attempts/:generationId/recover` | **Aucun OpenAI** : Cloudinary ou copie binaire locale |
| Valider | `PATCH .../style-frames/:frameId/approve` | **Aucun OpenAI** : validation humaine |

Les deux générations utilisent `/v1/images/edits`, un seul appel chacune. `retryGenerationId` désigne une tentative échouée à relancer **manuellement**, avec un nouvel identifiant. Son hash doit correspondre exactement au plan/modèle/qualité et à la direction actuelle ; son plan enregistré est réutilisé. Un contexte modifié impose une nouvelle proposition explicite. Une tentative avec image à récupérer bloque une nouvelle dépense jusqu'à récupération.

Affiner ajoute un résultat, ne remplace ni ne supprime l'ancien. Le feedback reste dans la tentative et son plan interne, jamais dans le brief, le Brand/Visual System, ni dans le prompt archivé du Style Frame officiel. Aucun feedback Le Ventadour n'est intégré au moteur. Ancien site et Portfolio restent exclus des images positives.

## Journal et promotion

Collection séparée `StyleFrameGenerationAttempt` : génération UUID, projet/direction, mode, statut/étape, dates, hashes du plan et de la direction, IDs des moments/assets/références, frame source, feedback, modèle/qualité, request ID OpenAI, catégorie/HTTP/type/code d'erreur, identifiant Cloudinary et URL. Plan et feedback sont exclus des lectures ordinaires et de la réponse admin. Aucun base64 ni HTML dans Mongo.

Flux : verrou projet → validation/plan → journal préparé → téléchargement → journal avant appel → **un appel image** → vérification PNG → copie binaire locale → upload Cloudinary déterministe `.../generations/style-frames/<generationId>` sans overwrite → journal uploadé → promotion et sauvegarde atomique du projet → journal terminé → suppression de la copie locale.

Si OpenAI échoue, aucune promotion ni upload. Si Cloudinary échoue, la copie locale permet une récupération manuelle. Si Mongo échoue après upload, **l'image payée n'est pas supprimée** : la récupération retrouve son identifiant déterministe même si l'URL n'a pas pu être journalisée. La promotion est idempotente par `generationId` ; si le projet était sauvegardé mais la réponse/journal perdu, aucun nouvel exemplaire ou appel n'est nécessaire. Une panne du journal final ne transforme pas une sauvegarde réussie en erreur utilisateur.

La récupération vérifie le projet, la direction et son hash avant promotion ; aucun appel image. Elle essaie d'abord Cloudinary, puis la copie locale. Si aucune copie n'existe, elle l'indique explicitement et n'effectue jamais de nouvelle génération automatiquement.

### Limite de durabilité

`DESIGN_LAB_STYLE_FRAME_RECOVERY_DIR` peut désigner un **disque persistant** (répertoire privé, accessible en écriture au backend). Par défaut : dossier `gusto-style-frame-recovery` dans le répertoire temporaire système. Sur Render sans disque persistant, cette copie ne survit pas nécessairement à un redéploiement/redémarrage ; une image déjà uploadée Cloudinary reste réconciliable. Il reste une fenêtre inévitable entre réception OpenAI et première sauvegarde binaire, ainsi qu'un risque si le disque ET Cloudinary échouent. Aucun mécanisme ne prétend récupérer une réponse OpenAI perdue sans copie. Les fichiers d'échec sont conservés pour récupération ; ceux d'une promotion réussie sont retirés. Aucun nettoyage automatique des images payées non promues.

## Erreurs et historique Direction 2

Catégories : `STYLE_FRAME_INPUT_ERROR`, `STYLE_FRAME_ASSET_DOWNLOAD_ERROR`, `STYLE_FRAME_OPENAI_CLIENT_ERROR`, `STYLE_FRAME_OPENAI_RATE_LIMIT`, `STYLE_FRAME_OPENAI_SERVER_ERROR`, `STYLE_FRAME_OPENAI_TIMEOUT`, `STYLE_FRAME_RESPONSE_INVALID`, `STYLE_FRAME_CLOUDINARY_ERROR`, `STYLE_FRAME_PERSISTENCE_ERROR`, `STYLE_FRAME_UNKNOWN_ERROR`.

Réponse admin : message court et `styleFrameError` avec HTTP réel OpenAI, type/code, request ID, direction/génération et dernière étape. Logs JSON structurés sans clé, prompt, feedback ni base64. Le message standard server_error peut être conservé intégralement s'il correspond au format connu ; les messages arbitraires susceptibles de contenir du contenu utilisateur ne sont pas loggués verbatim.

L'ancien `openaiRequest` remplaçait les erreurs upstream par un message et un statut Gusto 502/429 ; il ne gardait ni header HTTP original, ni type/code. La lecture seule de Mongo TEST pendant cette mission confirme le message standard avec `req_d7f3a86d88f24120accaa5645e94a325`, un Style Frame pour « La tablée vivante », aucun pour « Au rythme du Tarn ». **HTTP/type/code exacts historiques non récupérables dans les données disponibles.** Le chemin ancien s'arrêtait à la réponse d'erreur OpenAI, avant lecture d'image exploitable, Cloudinary et ajout du Style Frame. Le verrou/statut/lastError ont été mis à jour ; aucun Style Frame officiel de Direction 2 n'a été ajouté. Aucune cause interne OpenAI plus précise ne peut être déduite du message.

## Vérification

`node --test tests/design-lab*.test.js tests/design-engine-v2.test.js` : mocks OpenAI/Mongo pour les générations, tests Chromium du Portfolio sur serveur HTTP local. `npm run build` dans le manager. Aucun appel OpenAI réel ni écriture Mongo TEST pour cette mission.
