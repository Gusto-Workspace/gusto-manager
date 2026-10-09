# StructuralReference — correction du transport Vision long

Date : 8 octobre 2026. Validation locale, entièrement hors ligne. Aucun nouveau POST ou GET OpenAI réel, aucune capture externe, aucune mutation MongoDB/Cloudinary, aucun commit.

## Cause établie et limites du diagnostic

Le produit utilisait `openaiRequest`, un `fetch` HTTP natif avec `AbortController` et `setTimeout`. `analyzeStructuralReference` fixait son délai à 120 000 ms. Le délai couvrait attente du fournisseur, réception et callbacks de checkpoint. Aucun SDK OpenAI n'est installé ou utilisé sur ce chemin : il n'existe donc pas de réglage SDK de retry implicite à corriger. Il n'y avait aucune boucle de retry Vision. Le délai frontend de 600 000 ms n'explique pas l'interruption à 120 s.

L'exécutant A/B isolé utilisait son propre `fetch`, un `Promise.race` et un timer de 120 000 ms, sans passer par le service produit. Il réservait le budget et le créneau avant le POST, puis archivait corps HTTP et métadonnées avant parsing. Il ne persistait aucun `response.id` pendant l'attente synchrone. Le produit persistait la tentative et le snapshot captures/contrat avant dispatch, puis des étapes de transport et la réponse complète si elle arrivait. Aucun des deux chemins n'avait de récupération par GET d'un identifiant background.

| Incident | Preuve disponible | Conclusion permise |
| --- | --- | --- |
| Cantina del Sol, tentative `6ac7874195ac4c5a6cc51577`, génération `c61fb7e9-96c3-4964-8d5d-0063e4fc3be5` | Snapshot B1 : 12:06:25.648 → 12:08:25.690 UTC, message « Délai OpenAI dépassé », aucun brut ni identifiant récupérable | Interruption locale cohérente avec le timer de 120 s ; traitement/facturation fournisseur inconnus. Le snapshot ne démontre pas la cause de la lenteur. |
| Cantina, tentative ultérieure `6ac79d5dd643b0e9a0ccafe7` | Réponse brute et résultat appliqué conservés | Réussite historique distincte ; elle ne résout pas la facturation de la tentative précédente. |
| Salterra | Les trois tentatives du snapshot sont appliquées avec réponse brute. La dernière s'étend approximativement sur 74 s | Aucun timeout Vision Salterra démontré dans les traces disponibles. Les problèmes documentés de capture/admission média ne constituent pas une preuve de timeout OpenAI. |
| Tastavents V2, A/B `2026-10-08T18-56-27-309Z-50c62f71`, S1-A | Ledger : début 18:57:50.725 UTC, `REQUEST_TIMEOUT`, timer 120 s ; ni réponse complète, ni usage, ni `response.id` | Timeout client établi. Coût et résultat fournisseur inconnus. Aucun identifiant ne sera inventé ni nouvelle création envoyée. |

La cause démontrée est la dépendance à une attente HTTP synchrone bornée à 120 s. Une génération plus longue, la file fournisseur ou la durée du raisonnement sont des hypothèses ; aucune de ces explications n'est prouvée pour Tastavents V2.

## Mode officiel et compatibilité

La [documentation background](https://developers.openai.com/api/docs/guides/background) permet actuellement `background:true` avec `store:false`. Les données sont néanmoins temporairement conservées environ dix minutes pour le suivi. `store:false` ne signifie donc pas absence de toute rétention temporaire. Aucun `store:true` n'est introduit. Une panne plus longue peut rendre la réponse irrécupérable.

Le [modèle gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna) documente images en entrée, Responses API, raisonnement medium et sorties structurées. Cette compatibilité documentaire, combinée au contrat de background, justifie l'implémentation. **La combinaison effective sur ce compte et ce modèle n'a pas été essayée en réel** : aucun probe ou appel payant n'est autorisé dans cette correction. Un refus fournisseur sera archivé et arrêté, sans fallback ni retry.

Le [X-Client-Request-Id officiel](https://developers.openai.com/api/reference/overview) sert au diagnostic, notamment si l'identifiant serveur n'est pas reçu. Il ne garantit aucune idempotence. Ici chaque création et chaque récupération ont un UUID ; l'identifiant de création est durable avant HTTP.

## Quatre étapes séparées

1. **Création.** Snapshot artistique et captures existants, puis CAS atomique de la requête exacte, de son hash, de l'autorisation locale, du créneau unique, du budget et du client request ID. Un seul POST `responses`, `background:true`, `store:false`, tier default. Délai HTTP de création : 30 s.
2. **Traitement fournisseur.** Dès l'accusé HTTP reçu, son texte exact est conservé avant parsing de l'enveloppe, puis son vrai `response.id` est persisté. `queued` et `in_progress` rendent la main à Express, sans connexion navigateur maintenue pendant toute la génération.
3. **Récupération.** Suivi par GET du même identifiant : délai HTTP 15 s, intervalle 5 s, lease de worker 45 s, durée globale 540 s depuis le checkpoint initial. Reprise au démarrage, périodiquement et à la lecture de la référence. Le recovery historique conserve son intervalle de 60 s ; le suivi rapide ne charge que les nouvelles tentatives background actives. La durée globale n'est jamais remise à zéro lors d'une reprise. Un GET manuel peut vérifier la même réponse après cette limite, tant qu'elle existe encore ; il ne crée rien.
4. **Validation et application.** Brut terminal conservé avant coût, parsing JSON artistique ou validation. Usage/coût sont checkpointés avant parsing artistique. Le parser et le validateur V1/V2 existants restent les autorités. Application sous la génération d'origine, avec marqueur durable et clôture idempotente de la tentative.

`failed`, `incomplete`, `cancelled`, refus, JSON invalide, statut inconnu, usage incohérent ou modèle/tier inattendu échouent sans nouvelle création. Une interruption transitoire de GET peut reprendre le suivi du même ID ; ce n'est pas un retry de génération. Un échec permanent ou la limite globale arrêtent le suivi automatique. Une réponse terminale déjà conservée peut être finalisée localement après expiration fournisseur, sans GET.

## Non-duplication, interruption et générations

- CAS du checkpoint avant création : deux workers ne peuvent obtenir deux POST pour la même tentative. Aucun SDK, retry automatique ou fallback synchrone.
- Crash après création sans ID : reprise uniquement si le **véritable accusé brut** contient un identifiant valide. Sans cet accusé, état incertain, réservation conservée, aucun POST sur l'ancienne autorisation. Un client request ID ne devient jamais un response ID.
- Preuve d'absence de dispatch : coût nul et réservation libérée ; le créneau ancien reste inutilisable. Rejet HTTP documenté : création refusée, aucun retry, incertitude financière conservée de façon prudente faute d'usage.
- Lease de suivi et CAS protègent les workers concurrents. Une lease expirée peut être reprise ; une lease vivante n'est pas volée.
- Avant chaque requête, contrôle et renouvellement de propriété de la référence. Une réponse tardive d'une génération supplantée est conservée comme preuve mais ne peut écraser la référence courante.
- Snapshot captures/manifestes/contrat et requête exacte de la tentative sont réutilisés à la reprise : aucune capture, sélection ou sanitation supplémentaire. Une évolution ultérieure de configuration ne doit pas réassembler une autre requête à la place du checkpoint.
- Les IDs de réponse sont strictement validés avant construction du GET. Destination OpenAI fixe, redirections refusées. Routes protégées par l'authentification et le rôle admin existants.

La nouvelle action admin `POST /api/admin/design-lab/structural-references/:id/analysis-attempts/:attemptId/resume` déclenche uniquement récupération d'un identifiant existant. Les IDs référence/tentative sont validés ; elle n'accorde aucune autorisation de création. Le dashboard distingue ce bouton du retraitement local d'un brut et de la réanalyse payante. Son rafraîchissement de détail toutes les 5 s existait déjà et demeure en lecture.

## Budget et facturation

Réservation préventive par nouvelle réponse : **0,36 USD HT**, identique à la borne native du prévol A/B. Elle couvre conservativement 1,05 M tokens d'entrée à 0,25 USD/M, plus 128 k de sortie à 0,75 USD/M : 0,3585 USD. Aucun plafond de sortie, effort de raisonnement ou paramètre artistique n'est ajouté pour réduire artificiellement le résultat.

Tarifs gpt-6-luna documentés le 8 octobre 2026 : standard entrée 0,10, lecture cache 0,01, écriture cache 0,125, sortie 0,50 USD/M ; au-delà de 272 k tokens d'entrée : 0,20 / 0,02 / 0,25 / 0,75. Le calcul valide les comptes de tokens, partitionne correctement le cache et compte le raisonnement une seule fois dans la sortie. Le coût calculé depuis l'usage n'est pas une facture comptable.

Le checkpoint conserve autorisation, cap, réservation initiale maximale, exposition inconnue et coût calculé. Une rupture de connexion ne remet jamais le coût à zéro et ne libère pas la réservation. Une récupération terminale répétée ne débite pas le coût une seconde fois. Modèle non certifié : blocage avant POST. Cette réservation **par tentative produit ne constitue pas un budget global multi-tentatives** : une future cohorte A/B doit aussi conserver son ledger global et vérifier son disponible avant chaque nouvelle création.

## Fichiers concernés par cette correction

| Groupe | Fichiers |
| --- | --- |
| Cycle background partagé, sans contrat artistique supplémentaire | `services/design-lab/structural-vision-background.js` (nouveau), `services/design-lab/openai.service.js` |
| Persistance, reprise, génération, diagnostic | `models/structural-analysis-attempt.model.js`, `services/design-lab/structural-reference.service.js`, `structural-operation-recovery.service.js`, `structural-operation-diagnostic.js` |
| Démarrage et action admin | `app.js`, `routes/admin/design-lab-structural.routes.js` |
| Présentation de la récupération | `client/src/components/dashboard/admin/sites/structural-operation-display.js`, `structural-reference.component.js` |
| Tests | `tests/design-lab-structural-background.test.js` (nouveau), `tests/design-lab-structural.test.js`, `tests/design-lab-structural-operation-recovery.test.js`, `tests/helpers/structural-product-path.js`, `tests/design-lab-app-startup.test.js`, `client/tests/structural-operation-display.test.js` |
| Documentation et preuves | `docs/STRUCTURAL_REFERENCES.md`, présent document, `STRUCTURAL_B1_AB_RESUME_PLAN.md` et `.json`, `diagnostics/structural-vision-background-20261008/` |

Le worktree était déjà très modifié avant intervention. Cette liste désigne les changements de cette correction, pas l'ensemble du diff par rapport à HEAD. Aucun changement des fichiers artistiques, captures, manifeste A/B préparé, prévol, ancienne exécution, rapports B1 ni données privées archivées n'est prévu. Les fichiers générés par le build, absents avant intervention, sont conservés dans les diagnostics plutôt qu'ajoutés au produit.

## Vérification et limites

Les tests simulent le fournisseur et les collections ; aucun MongoDB réel n'a été ouvert. Ils couvrent fin après 150 s simulées, perte de polling, redémarrage, création sans ID, six statuts, workers concurrents, réponse supplantée, coût inconnu, budget insuffisant, brut avant parsing, erreurs HTTP, modèle/tier invalides, expiration fournisseur et reprise locale terminale. Les suites de parcours complet utilisent exclusivement des fixtures locales avec garde interdisant les effets distants. Le démarrage est exécuté avec toutes ses dépendances remplacées, sans écoute ni base réelles.

La vérification historique relit les **13 analyses V1 et 67 images** du snapshot existant ; elle confirme leur compatibilité actuelle et l'identité des hashes, pas la fidélité d'une capture réelle qui serait refaite aujourd'hui. Les tests du contrat V2 et les dix requêtes A/B archivées restent inchangés. Le build du dashboard passe ; ses avertissements préexistants restent visibles dans le log.

Les résultats détaillés et la vérification de conservation sont dans `diagnostics/structural-vision-background-20261008/validation.json`. Les premiers essais ont identifié une réservation terminale déjà libérée à ne pas comparer à nouveau au coût ; la borne maximale initiale est désormais conservée séparément. Ils ont également corrigé la distinction entre rejet connu et création réellement incertaine. Les logs intermédiaires sont conservés, sans être présentés comme validation finale.

Résultat final : **199/199 tests passent**, zéro échec, zéro ignoré : 145 tests transport/contrats/recovery/protocole, 50 tests de parcours et sécurité réseau sur fixtures locales, un démarrage entièrement mocké, trois tests d'affichage. Build manager réussi et contrôle de diff sans erreur. La comparaison des **1 147 fichiers préexistants** constate quinze fichiers modifiés dans la liste autorisée, aucun fichier historique/artistique/capture/protocole altéré ou manquant, HEAD inchangé. Les nouveaux modules, tests et documents sont distincts de ces fichiers préexistants.

Limites restantes : compatibilité réelle compte/modèle non testée ; rétention fournisseur approximative ; perte d'accusé sans ID irrécupérable automatiquement ; panne du stockage durable empêchant ses checkpoints ; validation concurrente testée avec CAS simulés et non une base réelle ; pricing daté à revérifier avant un futur budget. Aucune de ces protections techniques ne valide la qualité artistique ni l'objectif de 8/10. L'exécutant A/B historique reste volontairement intact : sa réutilisation synchrone est interdite pour la reprise. Le plan de reprise décrit le branchement du même coordinateur avec un stockage fichier et un nouveau ledger, avant toute future autorisation/exécution.
