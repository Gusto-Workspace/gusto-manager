# Webhook Stripe Take-away — diagnostic et rattrapage

État au 25 octobre 2026. Correctif local uniquement. Aucun déploiement,
paiement, remboursement ou rejeu réel exécuté par cette intervention.

**Verdict de prévol : PRÊT SOUS CONDITIONS.** Voir les audits de mise en production
et du parcours de paiement en fin de rapport : tests complémentaires ciblés,
contrôles MongoDB en lecture seule, opérations manuelles et garde-fous du merge
réalisé par le propriétaire.

## Diagnostic établi et limites

La réponse exacte `500 {"error":"Transmission webhook impossible"}` provient
du catch de relais dans le site restaurant. Avec le code présent dans le dépôt,
elle signifie que la méthode POST, la configuration du webhook, la vérification
Stripe sur le corps brut et le contrôle du restaurant ont été franchis. L'appel
suivant vers Gusto a échoué : configuration du relais, réseau ou réponse backend.
Elle ne permet pas de choisir entre ces causes, ni de conclure à un paiement échoué.
La correspondance entre ce code et les SHA réellement déployés reste à vérifier.

**La cause racine des réponses de production n'est pas démontrable avec les
seules réponses Stripe fournies.** Il manque les logs Vercel du catch de relais
et les logs Render associés. Aucune variable n'est déclarée responsable sans preuve.

Constats :

- Le 13 octobre : l'événement réussi fourni porte sur un paiement de 1 EUR,
  `evt_3UQ2AKI1ka9I9Nvf0yfzU1wq`, commande `TA-20261013-VNXE`.
  Le paiement est déclaré encaissé par Stripe, même si le webhook renvoie 500.
- Le 21 octobre : `evt_3UT33PI1ka9I9Nvf1gH7HxNu` décrit une carte refusée,
  puis `evt_3UT33PI1ka9I9Nvf1G8Z0ww6` décrit l'annulation du même PaymentIntent.
  Les deux concernent `TA-20261021-YEBA`, montant 16 EUR, commande MongoDB
  `6ad8f25a2dfb120938c29167`, restaurant `69f0bb675a8008341d6706c2`.
- La clé d'idempotence `takeaway-order-…-terminal-payment` est cohérente avec
  le parcours de terminaison des paiements dans le service d'ajustements.
- La commande montrée dans la capture, `TA-20261021-9II4`, est différente et
  porte un règlement sur place. Le backend et le site empêchent la création
  d'un PaymentIntent pour une commande sur place.
- Le dashboard exclut les commandes publiques en ligne non payées/non
  remboursées dès sa requête MongoDB (`routes/take-away.routes.js`, liste et
  détail). Cela explique qu'une tentative refusée/annulée puisse être invisible,
  sans prouver sa suppression ni son état réel en production.
- La connexion MongoDB configurée localement a été consultée en lecture seule :
  lors de la première phase, `CONNECTION_STRING_TEST` ne contenait aucune des
  deux commandes. Le prévol a ensuite consulté `CONNECTION_STRING`, variable
  utilisée par `main`, et retrouvé les deux commandes (voir l'audit ci-dessous).
- Les variables locales nécessaires sont présentes et le secret partagé local
  concorde avec celui du backend local. Cela ne vérifie pas Vercel/Render.
- Seul `clients/les-capuccins/client` contient actuellement le webhook Take-away.
  Les autres sites utilisant des webhooks de cartes cadeaux conservent leur
  parcours. Le traitement backend ajouté est commun à tous les restaurants.
- Aucun commit sur les branches courantes depuis le 21 octobre. Derniers
  changements pertinents : client `594c518` le 13 octobre ; backend `94d2c1c`
  le 14 octobre et `3b4a90d` le 16. Une autre branche contient `3f328c6` du
  25 octobre, relatif au Design Lab, sans changement du service Take-away.
  Ces dates ne prouvent pas les versions déployées.

## Défauts reproduits et corrections

Parcours : Stripe → Next.js (signature obligatoire) → POST Gusto signé HMAC →
journal MongoDB → relecture Stripe → commande → CRM, notification Mongo/SSE/push,
email ; reprise des effets via le cron Take-away existant.

- Un HTTP 200 backend avec du HTML, un JSON vide ou `handled:false` pouvait être
  acquitté. Il est maintenant refusé. Timeout de relais de 10 secondes,
  redirections refusées ; nouvelle tentative Stripe possible en cas de panne.
- Un ancien échec/une annulation de PaymentIntent remplacé provoquait une erreur
  de correspondance : il est ignoré pour le paiement courant. Les commandes
  payées/remboursées et les statuts terminaux ne sont pas dégradés par ces événements.
- Aucun reçu d'événement n'était enregistré : collection `takeawaystripeevents`,
  clé unique MongoDB `_id = restaurantId:eventId`, statut terminé persistant,
  verrou de 120 secondes récupérable après crash, compteur de tentatives.
  Pas de TTL, pas de copie de payload Stripe ni de secrets. Un événement en
  cours renvoie 503 ; une erreur libère son verrou sans marquer le reçu terminé.
- L'état actuel du PaymentIntent/Refund est relu avec le compte Stripe du
  restaurant. Un ancien échec devenu succès finalise le succès ; devenu annulation,
  il applique l'annulation ; un nouveau paiement en cours n'est pas marqué échoué.
  Une indisponibilité Stripe empêche l'acquittement.
- Les marqueurs métier existants restent nécessaires même avec le journal :
  transition atomique vers `paid`, idempotence des remboursements, CRM par ID de
  commande, notification unique par `dedupeKey`, email revendiqué atomiquement.
  Un nouvel ID d'événement pour le même paiement ne répète pas ces opérations.
- Les effets d'activation sont signalés durablement sur la commande payée,
  y compris historique, pour leur reprise par le cron après une interruption.
- Un module désactivé ne bloque plus le rapprochement d'un paiement existant.
- Un timeout/5xx de l'API email peut cacher un email déjà accepté : le marqueur
  d'envoi reste bloquant et `customerEmailEventsUncertain` signale le cas. Un crash
  pendant l'envoi laisse `customerEmailEventsInFlight`. Aucun renvoi automatique
  dans ces cas. Une erreur explicitement refusée par le fournisseur reste reprenable.
- Les erreurs Stripe de vérification peuvent contenir le payload : leurs messages
  bruts ne sont plus loggés. Les erreurs de relais ne loggent plus les messages
  externes arbitraires. Les diagnostics utilisent IDs, statut HTTP et codes d'erreur.

Un reçu terminé donne 200. Un paiement enregistré avec des effets à reprendre
peut aussi donner 200, car la reprise est durable dans la commande et le cron.
Les événements étrangers au module sont ignorés après vérification de signature.
Une erreur de base, de relecture Stripe ou de traitement ne donne jamais 2xx.

## Fichiers concernés

Backend `gusto-manager/server/` :

- `models/take-away-stripe-event.model.js` (nouveau journal).
- `services/take-away-stripe-events.service.js` (réception idempotente et relecture).
- `routes/take-away.routes.js` (raccordement et diagnostics).
- `models/take-away-order.model.js`, `services/take-away.service.js`
  (protection des états et reprise des effets).
- `services/take-away-mailer.service.js` (envois incertains).
- `tests/take-away-stripe-events.test.js`, `tests/take-away-security.test.js`,
  `tests/take-away-reliability.test.js`, `package.json` (tests et commande de test).

Site `clients/les-capuccins/client/` :

- `src/_assets/server/gusto-service-api.js`.
- `src/_assets/server/take-away-webhook.js`.
- `tests/take-away-webhook.test.cjs`.

Le fichier `.gitignore` déjà modifié par l'utilisateur est conservé intact.
Branches conservées : backend `develop`, site `main`.

## Vérification locale exécutée

- Backend : `npm run test:take-away`, 98 tests réussis, aucun échec ni test ignoré.
  Comprend les tests de sécurité, fiabilité, ajustements/remboursements, webapp
  et journal Stripe. La route Express réelle est appelée en HTTP local avec HMAC ;
  Stripe et les dépôts de données sont simulés, aucune opération réelle.
- Site : `npm run test:take-away-webhook`, 11 tests réussis : signatures Stripe
  réelles avec secret synthétique, corps brut, altération du corps, panne/retry,
  contrôles d'acquittement backend, événements supportés et absence de fuite dans les logs.
- Site : `npm run build` réussi ; avertissement Browserslist préexistant sur
  l'ancienneté des données de compatibilité navigateur.
- `git diff --check` exécuté dans les deux dépôts, sans erreur.

Limites de cette première vérification : aucun accès aux logs ou variables
Vercel/Render, ni test réel de livraison Brevo/push. Les lectures MongoDB
supplémentaires du prévol sont détaillées ci-dessous ; la correspondance avec
la connexion effectivement déployée sur Render reste à confirmer.
Le correctif local ne prouve pas que la panne de production est résolue.

## Contrôles avant mise en production — après autorisation

1. Dans Vercel, retrouver les logs à partir des IDs d'événements ci-dessus et des
   deux créneaux UTC du 21 octobre, 17:12:19 et 17:15:01. Relever le code et le
   statut de l'erreur de relais. Dans Render, retrouver la requête correspondante.
   Confirmer les SHA déployés dans les deux services et leur URL cible.
2. Vérifier les **valeurs en privé**, sans les copier dans un ticket/log :
   `NEXT_PUBLIC_API_URL` doit viser la base Gusto `/api`, restaurant ID correct,
   `STRIPE_TAKE_AWAY_WEBHOOK_SECRET` du bon endpoint live, `GUSTO_SHARED_SECRET`
   identique côté serveur Vercel et Render, clé Stripe chiffrée du restaurant
   déchiffrable et rattachée au compte `acct_1UDjd1I1ka9I9Nvf`.
3. Vérifier que l'identité MongoDB du backend peut créer/lire/mettre à jour la
   collection `takeawaystripeevents`. Son index `_id` est unique par construction,
   même avec `autoIndex:false`. Vérifier aussi l'index unique existant de
   `notifications.dedupeKey`, dont dépend l'idempotence des notifications.
4. Vérifier le cron Take-away toutes les minutes et l'absence d'erreurs de reprise.
   Contrôler Brevo pour les événements `InFlight`/`Uncertain` avant tout renvoi ;
   ne jamais vider les marqueurs à l'aveugle. Les notifications SSE sont une
   synchronisation volatile ; la notification MongoDB est la référence durable.
5. Valider en environnement de test avec des données synthétiques, y compris
   double livraison simultanée et coupure après écriture du paiement. Le test local
   du journal utilise un dépôt simulant les opérations atomiques ; il ne remplace
   pas une vérification sur un MongoDB de staging et ses permissions/index.
6. Déployer le backend puis le site seulement après autorisation. Garder le webhook
   activé et sa vérification de signature obligatoire. Ne pas changer de secret
   ou de version API Stripe pour essayer de masquer les erreurs.

## Procédure sûre de rapprochement puis rattrapage

**Aucun rejeu réel avant validation du correctif, de l'idempotence et autorisation.**

1. Inventaire en lecture seule sur le compte `acct_1UDjd1I1ka9I9Nvf` :
   événements depuis `2026-10-13T00:00:00Z` (inclut l'incident du 21), jusqu'à une
   borne UTC fixée au début de l'audit. Paginer `GET /v1/events` avec `created[gte]`,
   `created[lte]`, `limit=100` et les cinq types pris en charge. Ne pas limiter
   l'inventaire à `delivery_success=false` : un webhook peut avoir échoué après
   une écriture métier ou avoir été livré à un autre endpoint.
2. Dans Workbench, identifier les livraisons à **cet endpoint précis**, les IDs
   d'événements, leurs dates originales et le nombre de tentatives. Les tentatives
   répétées ne sont pas autant de paiements. Stripe documente une disponibilité
   des événements de 30 jours : conserver un inventaire minimal rapidement.
3. Pour chaque événement, relire le PaymentIntent/Refund actuel et la commande
   en base de production **directement**, sans le filtre du dashboard. Comparer
   restaurant ID, order ID, PaymentIntent lié, devise, montant initial/encaissé,
   statut financier, remboursements et marqueurs de notification/email.
   Ne conserver dans le tableau de rapprochement que ces IDs/états/montants ;
   exclure payloads complets, `client_secret`, signatures, données de carte et clients.
4. Classer avant toute action :
   - reçu déjà terminé : aucun effet à répéter ; une livraison autorisée obtiendra 200 ;
   - commande déjà payée/remboursée : vérifier la concordance, sans reconfirmation ;
   - carte refusée/annulation : ne pas marquer payé et ne pas toucher à une autre
     commande sur place du même montant ;
   - argent encaissé mais commande non payée, supprimée ou incohérente : examen
     manuel prioritaire, sans inventer une commande ni considérer l'argent perdu ;
   - ancienne commande annulée/rejetée avec argent encaissé : décision humaine
     obligatoire, car le parcours métier existant peut émettre un remboursement ;
   - envoi email incertain : consulter Brevo avant toute levée de marqueur.
5. Après validation et autorisation, renvoyer **un événement vérifié à la fois**
   depuis Stripe vers l'endpoint original. Ne pas envoyer un JSON copié avec une
   signature périmée et ne pas contourner la vérification Stripe/HMAC. Pour chaque
   événement, vérifier le reçu terminé, le statut/montant de commande, une seule
   notification et les effets email/CRM. Livrer une seconde fois le même événement
   autorisé doit seulement retrouver son reçu terminé. Arrêter en cas d'écart.
6. Refaire l'inventaire jusqu'à la borne de fin puis couvrir les événements arrivés
   pendant l'audit. Le 30 octobre annoncé par Stripe ne prouve ni leur récupération
   automatique ni leur traitement ; contrôler les livraisons dans Workbench.

Références officielles : [signature, doublons et événements désordonnés](https://docs.stripe.com/webhooks),
[rapprochement des événements non livrés et fenêtre de 30 jours](https://docs.stripe.com/events/manage-webhook-endpoints#process-undelivered-events).

## Audit de prévol complémentaire — 25 octobre 2026

### Verdict et périmètre

**PRÊT SOUS CONDITIONS**, pour préparer la livraison du correctif ; pas une
validation du résultat d'un futur merge ou de la résolution en production.
Les défauts supplémentaires démontrés localement sont corrigés. Les conditions
restantes sont la confirmation de la cible Render, la préparation de l'index,
la conservation des réglages de production et la validation du parcours avec
MongoDB en staging. Aucun merge, push, déploiement ou rejeu n'a été exécuté.

Les branches sont toujours `develop` pour Gusto et `main` pour le site. La
branche de production Render est `main`, conformément à l'information du
propriétaire. Les différences entre les références Git locales ont été lues,
sans fetch ni changement de branche. `app.js`, `sse-bus.service.js`, les secrets
et les modifications utilisateur de `.gitignore` n'ont pas été modifiés.

### Nouvelles preuves MongoDB, sans écriture

La lecture via le `CONNECTION_STRING` local, **distinct de la connexion de test**,
retrouve le restaurant et les deux commandes. La correspondance avec la valeur
Render n'est pas prouvée par cette lecture et doit être confirmée en privé.

| Contrôle | Résultat sur cette connexion |
| --- | --- |
| Serveur | MongoDB 8.0.34, replica set, connexion non `mongos` |
| Commandes et notifications | Collections ordinaires, non capped, sans validateur de collection |
| Journal `takeawaystripeevents` | Pas encore créé, attendu avant cette livraison |
| Notifications `dedupeKey_1` | Unique, filtre partiel `{dedupeKey: {$type: "string"}}`, présent |
| Commandes `{restaurant_id:1,idempotencyKey:1}` | Index unique absent |
| Doublons de clés non vides, tous restaurants | 0 groupe au moment de l'audit ; résultat à recontrôler juste avant création |
| Privilèges déclarés de l'identité connectée | `find`, `insert`, `update`, `createCollection`, `createIndex`, `listIndexes` disponibles pour les trois collections |
| Write concern du cluster | Commande administrative `getDefaultRWConcern` non disponible (code 59) ; configuration effective à confirmer |

Les privilèges sont lus, pas exercés : aucun test d'insertion/création d'index
n'a été fait sur cette base. Les opérations du journal restent des écritures
atomiques sur un document par `_id`, sans besoin de transaction multi-document.
Le paiement, les marqueurs d'effets et le reçu sont plusieurs documents :
l'idempotence métier et la reprise restent nécessaires entre leurs écritures.
Les lectures de production doivent utiliser le primaire et les écritures être
acquittées et durables ; confirmer le write concern (majority) dans la
configuration Atlas/Render plutôt que supposer celui de l'environnement local.

### VNXE : traitement réussi, aucune régularisation à déclencher

`TA-20261013-VNXE` est retrouvée en base avec `status=completed`,
`paymentStatus=paid`, `paymentMethod=online`, montant 1 EUR, le PaymentIntent
fourni et `restaurantNotifiedAt=2026-10-13T09:39:59.199Z`.
Les captures du propriétaire confirment l'encaissement Stripe sans remboursement.
**Ne pas la classer comme commande manquante et ne pas la rejouer ou la
retraiter automatiquement.** L'absence de reçu dans le nouveau journal est
normale pour une commande antérieure à son déploiement et n'est pas une preuve
qu'il manque un effet métier. Un marqueur de notification prouve un état
enregistré, pas la livraison physique de chaque push/email.

Trois scénarios expliquent un état métier abouti malgré un 500, sans permettre
de choisir la cause historique en l'absence de logs :

| Scénario | Chemin vérifié dans le code / preuve |
| --- | --- |
| Traitement réussi, réponse perdue entre Render et Vercel | Le reçu terminé permet de reconnaître la nouvelle livraison, sans rappeler le métier ; preuve du test existant de doublon après redémarrage |
| Écriture de paiement réussie, erreur avant sauvegarde du reçu | L'événement reste reprenable et la transition conditionnelle empêche un second paiement ; preuve du test existant `a crash after business commit does not acknowledge an unsaved receipt` |
| Confirmation par le navigateur ou un autre parcours serveur | `/confirm-payment` relit le PaymentIntent et appelle `finalizePaidOrder`, tout comme le webhook ; la récupération d'un PaymentIntent existant et le cron d'expiration peuvent également finaliser un succès |

Un nouveau test synthétique couvre une commande terminée/payée : deux passages
webhook et deux confirmations navigateur n'ajoutent aucune écriture métier,
aucun email ni notification, et conservent les dates et statuts. Il ne touche
pas à VNXE réelle. Le scénario réellement survenu nécessite les logs des deux
routes (`stripe-events` et `confirm-payment`) et la chronologie des invocations.

`TA-20261021-YEBA` est également retrouvée en base : `canceled`, `failed`,
`online`, montant 16 EUR, avec le PaymentIntent des événements du 21 octobre.
Son invisibilité dans le dashboard correspond au filtre des commandes en ligne
non payées. Son marqueur `restaurantNotifiedAt` existe déjà ; aucune suppression
ou nouvelle notification n'a été exécutée.

Confirmation supplémentaire du propriétaire depuis Stripe Workbench :
`payment_intent.payment_failed` porte `card_declined/generic_decline`,
`requires_payment_method` et `amount_received=0` ; l'événement suivant porte
`canceled` et toujours `amount_received=0`. Les deux livraisons affichent
exactement `500 {"error":"Transmission webhook impossible"}`. **Aucun encaissement
à régulariser sur cette tentative et aucun remboursement à déclencher.** Le
refus bancaire et l'échec de relais sont deux problèmes distincts. Ces preuves
ne révèlent toujours pas le code HTTP ou l'exception réellement renvoyé par Gusto.

### Défauts supplémentaires corrigés et tests utiles seulement

1. **Index MongoDB invalide** : le filtre partiel utilisait `$ne`, opérateur
   non accepté par MongoDB pour ce type d'index. Remplacement par
   `{idempotencyKey: {$type:"string", $gt:""}}`, qui exclut toujours les clés
   vides et ne bloque pas les commandes historiques/sur place sans clé.
   L'index manquant observé est cohérent avec ce défaut, mais n'est pas une
   preuve de la cause des 500 du webhook.
2. **Reprise bloquée après crash** : lorsque CRM et notification avaient abouti,
   un marqueur `activationEffectsPending` restant actif pouvait être sélectionné
   indéfiniment sans être nettoyé. Il déclenche maintenant la reprise et son
   nettoyage même lorsque les autres marqueurs sont déjà présents.
3. **Concurrence sur les commandes historiques** : la finalisation du paiement
   ne comparait le statut lu que pour `financialVersion=1`. Le statut fait
   désormais partie du filtre atomique pour toutes les versions, avec relecture
   et reprise bornée en cas de concurrence. Un statut plus avancé ne repasse
   pas en `confirmed`.
4. **Notification indue d'une annulation impayée** : la reprise d'un email
   d'annulation pouvait activer une commande en ligne impayée. Elle reprend
   maintenant l'email sans créer de nouvelle notification restaurant/activation
   CRM. Les paiements sur place et les commandes payées/remboursées conservent
   leur parcours.

Les 109 tests et le build précédemment validés sont réutilisés. Seuls 12 tests
ciblés ont été exécutés pour ce prévol : **5 nouveaux tests + 7 tests de
non-régression existants**, tous réussis. Les autres tests de ces fichiers ont
été exclus par filtre de nom, pas réexécutés. Le site était inchangé lors de ce
premier prévol ; l'extension de mission décrite plus bas ajoute des corrections
ciblées au parcours de paiement et un nouveau build.

Commandes exécutées dans `server/` :

```sh
TZ=Europe/Paris node --test --test-name-pattern='preflight:|signed success event|failed and canceled|late failures|canceling a paid order' tests/take-away-security.test.js
TZ=Europe/Paris node --test --test-name-pattern='repeated/out-of-order|automatic acceptance still|email failures do not undo' tests/take-away-adjustments.test.js
```

Fichiers supplémentaires de ce prévol : modèle et service Take-away, tests de
sécurité, présent rapport ; `docs/API_CONTRACT.md` du workspace est actualisé
pour décrire le journal et l'acquittement strict. Pas de nouvelle dépendance,
pas de modification du contrat des autres modules, pas de migration des
documents existants. Le journal ne stocke ni payload Stripe ni secret.

### Conditions et opérations manuelles AVANT déploiement

1. **Préparer le merge, sans le réaliser ici.** Inclure les nouveaux fichiers
   non suivis du correctif (modèle, service, tests, rapport) dans les commits
   validés. Le merge `develop → main` reste réalisé par le propriétaire.
   Le résultat doit conserver les réglages actuels de `main` :
   - `server/app.js` : connexion `CONNECTION_STRING`, pas `CONNECTION_STRING_TEST` ;
   - `server/app.js` : origines CORS de production de tous les restaurants ;
   - `server/services/sse-bus.service.js` : origine `APP_URL`, pas `localhost:8002`.
   Ce ne sont pas des modifications du correctif. Une copie globale des fichiers
   de développement ferait courir un risque réel aux autres restaurants.
   Pour examiner la différence sans changer de branche :
   `git diff main -- server/app.js server/services/sse-bus.service.js`.
   Vérifier les SHA réellement déployés et les déclencheurs automatiques Render/
   Vercel avant de publier les commits, pour maîtriser l'ordre de livraison.
2. **Confirmer les cibles et l'environnement en privé.** Render : branche `main`,
   racine `server`, démarrage `npm start`, `CONNECTION_STRING` de la bonne base,
   même secret HMAC que Vercel, `APP_URL` correct, clés de chiffrement/Stripe
   existantes conservées. Vercel : branche/racine `main`/`client`, variables de
   l'environnement **Production**, base API HTTPS terminée par `/api` sans
   redirection, ID restaurant correct et secret du webhook live correspondant.
   Garder les versions Node déjà validées par les services ; côté Next, `fetch`
   et `AbortSignal.timeout` doivent être disponibles (Next 14 demande au moins
   Node 18.17). Vérifier une durée de fonction Vercel supérieure aux 10 secondes
   du relais, avec marge (30 secondes convient), et les éventuels démarrages à
   froid Render. Réglage de durée : Vercel → Settings → Functions → Function Max
   Duration. Aucune rotation de secret ou montée de version Stripe requise.
3. **Préparer MongoDB sur la cible confirmée.** Dans Atlas/Compass ou une console
   `mongosh` authentifiée, sélectionner explicitement la base de production ;
   ne pas copier l'URI avec credentials dans un ticket ou une ligne partagée.
   Les lectures suivantes sont sans effet métier :

   ```javascript
   db.takeawayorders.getIndexes()
   db.notifications.getIndexes()
   db.getCollectionInfos({name: "takeawaystripeevents"})
   db.takeawayorders.aggregate([
     {$match: {idempotencyKey: {$type: "string", $gt: ""}}},
     {$group: {_id: {restaurant: "$restaurant_id", key: "$idempotencyKey"}, n: {$sum: 1}}},
     {$match: {n: {$gt: 1}}},
     {$count: "duplicateGroups"}
   ], {maxTimeMS: 5000})
   ```

   Résultat attendu du dernier contrôle : aucun groupe (`[]`). Si des doublons
   apparaissent, arrêter et les examiner ; ne rien supprimer automatiquement.
   Vérifier l'index unique partiel `notifications.dedupeKey_1` décrit plus haut.

   **Bloc d'écriture préparé, NON exécuté par l'agent** : après confirmation de
   la base et des contrôles, le propriétaire peut préparer la collection et
   l'index manquant avant le redémarrage. Ne pas exécuter si un index du même nom
   existe avec une autre définition ; dans ce cas, préparer une migration séparée.

   ```javascript
   if (db.getCollectionInfos({name: "takeawaystripeevents"}).length === 0) {
     db.createCollection("takeawaystripeevents");
   }
   db.takeawaystripeevents.getIndexes(); // _id_ obligatoire ; aucun TTL
   db.takeawayorders.createIndex(
     {restaurant_id: 1, idempotencyKey: 1},
     {name: "restaurant_id_1_idempotencyKey_1", unique: true,
      partialFilterExpression: {idempotencyKey: {$type: "string", $gt: ""}}}
   );
   ```

   L'index peut échouer si un doublon apparaît entre contrôle et construction :
   arrêter, examiner et relancer la vérification. Ne pas lancer `syncIndexes`,
   ne pas supprimer/recréer des index globaux et ne pas effacer de reçus.
4. **Validation staging avec MongoDB réel.** Utiliser des commandes synthétiques,
   une base de staging séparée et des dépendances Stripe/email/push simulées.
   Vérifier création du reçu, conflit `_id` sur doublon, revendication simultanée
   du même événement, verrou expiré, perte de réponse après commit et absence
   de second effet métier. Les tests locaux de dépôt simulé ne prouvent pas
   les droits d'écriture réels, la topologie ou les index du serveur déployé.
5. **Récupérer les logs utiles** selon la section suivante. Si l'explication des
   anciens 500 reste indisponible, le dire explicitement : l'index corrigé et
   les tests ne constituent pas une identification rétrospective de leur cause.

### Informations non sensibles à récupérer dans Vercel et Render

**Vercel → projet Capucins → Logs / Runtime Logs**, environnement Production,
chemin `/api/take-away-webhook`. Rechercher chaque tentative à l'heure UTC
visible dans Stripe (pas seulement la date d'origine), notamment le 21 octobre
à 17:12:19 et 17:15:01 ; pour VNXE, partir du 13 octobre à 09:39:56 et des
tentatives ultérieures listées dans Stripe. Relever :

- SHA/déploiement, heure UTC, ID d'invocation/requête et durée, statut HTTP ;
- pour `[take-away-webhook-forward-error]` : `eventId`, `eventType`,
  `paymentObjectId`, `restaurantId`, `code`, `upstreamStatus`, `errorType` s'ils
  existent dans la version déployée ;
- catégorie de l'erreur historique si les anciens logs n'ont que `message` :
  configuration, HTTP backend ou réseau. Ne pas exporter le message/payload
  brut s'il contient des secrets ou données clients.

**Render → service API de production → Logs**, mêmes créneaux UTC, routes
`POST /api/take-away/stripe-events` et `POST /api/restaurants/:restaurantId/`
`take-away/public/orders/:orderId/confirm-payment`. Relever le SHA, statut,
durée, ID de requête s'il existe, nom/code d'erreur MongoDB/Stripe et étape
concernée. Chercher aussi les erreurs d'indexation au démarrage et celles du
cron Take-away. L'ancien code n'enregistre pas forcément toutes les requêtes :
l'absence d'une ligne ne prouve pas que le backend n'a rien reçu ou écrit.
Si la rétention est expirée, consulter les exports/log drains existants ; ne pas
provoquer de rejeu réel pour reconstruire la panne sans autorisation.

| Indice | Causes à confirmer |
| --- | --- |
| Configuration du relais absente | URL API ou secret HMAC côté Vercel ; distinct du secret Stripe, vérifié avant ce catch |
| Backend 401 / `INVALID_SIGNATURE` | Secrets HMAC différents, timestamp/horloges ou sérialisation modifiée |
| Backend 500 / `SERVICE_SIGNATURE_NOT_CONFIGURED` | Secret HMAC absent côté Render |
| Backend 404 / `TAKE_AWAY_ORDER_NOT_FOUND` | Mauvaise base/restaurant/ID, version ou chemin cible incorrect ; ne pas recréer la commande |
| Backend 400/409 avec code de correspondance | Incohérence PaymentIntent, montant, devise, mode de paiement ou metadata |
| `ECONNRESET`, `ENOTFOUND`, timeout | Réseau, DNS/TLS, indisponibilité/démarrage Render, attente MongoDB/Stripe ; une écriture peut avoir abouti avant la coupure |
| JSON invalide / mauvais acquittement | Mauvaise cible, page HTML, ancienne API ou proxy |
| Erreur MongoDB de démarrage/index | Droits, doublons ou définition d'index ; corréler avec la requête, ne pas lui attribuer automatiquement les 500 |

Ne fournir ni headers de signature, ni clés, ni URI MongoDB, ni `client_secret`,
ni corps Stripe complet, ni informations de carte/client. Les IDs d'événements,
de commandes, de requêtes et les codes d'erreur suffisent au rapprochement.

### Séquence et vérification APRÈS déploiement — à exécuter ultérieurement

1. Une fois les conditions levées et la livraison autorisée, publier le backend
   sur Render depuis `main`, puis vérifier le SHA démarré, la connexion à la
   bonne base, les index et l'absence d'erreur d'initialisation. Attendre ce succès
   avant de publier le site Vercel. L'ancien site et le nouveau backend restent
   compatibles : endpoint, HMAC et réponse `{received, handled}` inchangés.
2. Contrôler le SHA du site, les variables Production et la route originale.
   Un simple GET sur `/api/take-away-webhook` doit donner 405 avec `Allow: POST`
   (contrôle de présence uniquement). Un POST synthétique sans signature doit
   donner 400 sans appel métier ; cela ne teste pas la clé live Stripe.
3. Vérifier les lectures publiques d'un autre restaurant et l'accès dashboard,
   les réponses CORS depuis les domaines de production et la connexion SSE
   depuis Gusto. Aucun test ne doit créer une commande ou un paiement réel.
4. Observer le cron pendant plusieurs minutes : aucune activation de commande
   impayée, aucun marqueur de reprise bloqué, pas d'erreur Brevo/MongoDB. Surveiller
   les tableaux `customerEmailEventsInFlight` et `customerEmailEventsUncertain` ;
   une incertitude nécessite vérification fournisseur avant tout renvoi.
5. Avant le moindre rejeu, établir l'inventaire et le rapprochement depuis le
   13 octobre selon la procédure précédente. **Exclure VNXE de toute régularisation
   automatique** : déjà terminée/payée, encaissement confirmé, aucun remboursement.
   Ne jamais déduire un effet manquant de son 500 ou de l'absence d'un nouveau reçu.
6. Après autorisation spécifique du rattrapage seulement, choisir un événement
   rapproché sans ambiguïté, le renvoyer depuis Stripe vers son endpoint original,
   vérifier 200, reçu terminé et aucune duplication de statut/notification/CRM/email.
   Arrêter au premier écart ; traiter manuellement les cas encaissés mais
   annulés/manquants/incohérents avant toute action susceptible de rembourser.
7. En cas de problème, suspendre les rejeux et conserver les données du journal
   et les marqueurs métier. Ne pas revenir à l'ancien backend tout en laissant
   tourner ses anciens envois email sur des effets incertains : le rollback
   doit préserver les garde-fous contre les doubles envois. Examiner la stratégie
   de retour arrière avant toute bascule, sans nettoyer la base.

Références de ce prévol : [atomicité MongoDB](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/),
[opérateurs des filtres d'index partiels](https://www.mongodb.com/docs/manual/core/index-partial/),
[version Node sur Render](https://render.com/docs/node-version),
[durée des fonctions Vercel](https://vercel.com/docs/functions/configuring-functions/duration).

## Extension — audit ciblé du paiement en ligne

### Résultat et limites

Le parcours métier est vérifié par simulation locale, avec les services réels
et des doublures de MongoDB, Stripe et des fournisseurs d'envoi. Aucune API
de paiement ou remboursement Stripe, même en test, n'a été appelée pendant
cet audit. Les lectures MongoDB précédentes n'ont créé aucune commande.
Le verdict reste **PRÊT SOUS CONDITIONS** : la compatibilité des environnements,
le test avec MongoDB de staging et l'observation des livraisons après déploiement
ne peuvent pas être remplacés par ces simulations.

| Étape / cas | Preuve réutilisée ou complément ciblé | Résultat attendu et vérifié |
| --- | --- | --- |
| Création de commande | Tests existants de validation serveur, créneau, capacité, token et idempotence ; nouvelle simulation enchaînée | Montant calculé serveur, commande en `pending/pending`, aucune activation CRM/email/notification avant encaissement ; même tentative = même commande |
| PaymentIntent | Tests existants de clé Stripe stable par commande et réutilisation ; simulation enchaînée | Un seul PaymentIntent pour la tentative, montant/devise/metadata cohérents et rattachement au restaurant |
| Carte acceptée | Nouvelle simulation création → PaymentIntent → succès simulé → confirmation navigateur → deux webhooks | Une transition vers `paid`, statut `confirmed` si acceptation automatique ; un CRM, un email et une notification ; clé/token réutilisés |
| Validation manuelle restaurant | Tests existants de confirmation et échéance | Une commande payée peut légitimement rester `pending` lorsque l'acceptation manuelle est requise ; pas de fausse confirmation |
| Refus, 3DS/action requise, paiement encore en traitement, annulation | Nouveau test de confirmation sur quatre états non réussis | Réponse métier 409 `PAYMENT_NOT_SUCCEEDED`, aucune écriture `paid`, aucune confirmation ; le 409 n'est pas un 500 interne |
| Refus puis nouvelle tentative | Deux nouveaux tests, dont concurrence avec succès/annulation | Réutilisation du même PaymentIntent avant expiration ; une lecture obsolète ne peut plus remettre un paiement payé en attente ni écraser une annulation |
| Abandon/expiration | Tests existants d'expiration, capacité et cycle serveur | Paiement annulé/commande échouée, capacité libérée ; la relecture Stripe récupère un succès avant d'expirer ; aucune preuve de remboursement fictif |
| Webhook répété/retardé/désordonné | Journal et tests de concurrence/reprise déjà validés ; simulation enchaînée | Reçu unique, verrou atomique, état Stripe courant et marqueurs métier ; une erreur ne transforme pas un succès en échec |
| Écriture réussie puis réponse perdue | Tests du reçu perdu et de la commande terminée/payée déjà détaillés | Nouvelle livraison sans nouveau débit ni nouvelle confirmation/notification ; un 500 ne prouve pas un échec de paiement |
| Réponse HTTP PaymentIntent après une course | Nouveau test de la vraie fonction de route, avec services simulés | La réponse contient l'état relu en base, pas la commande chargée avant Stripe |
| Dashboard et SSE | Lecture de la requête et tests existants de liens, droits et notification unique | Commandes publiques en ligne affichées si `paid/refunded`, tentatives non encaissées masquées ; mise à jour SSE fusionnée par ID, notification dédupliquée |
| SMS | Quatre tests ciblés exécutés | Événement initial lié au paiement, reprise après crash, remboursement distinct, mutation de statut durable sans duplication |
| Remboursements | Tests existants d'ajustements, concurrence, refus partiels, réponse perdue et événements désordonnés | Une opération persistante, clé Stripe idempotente, pas de double remboursement, respect du solde, états pending/failed/uncertain distincts de `refunded` |

La simulation enchaînée utilise de vraies fonctions de service, mais ne constitue
pas un test de navigateur avec Stripe.js, une carte/3DS réelle, ni un test
d'écriture MongoDB réel. Le parcours HTTP signé du webhook reste couvert par
les preuves précédentes. Le dashboard a été vérifié par son contrat, sa requête
et ses tests de notification ; pas par une nouvelle session UI authentifiée
en production. Ces distinctions évitent d'affirmer un succès de bout en bout
réel à partir de seules doublures de services.

### Corrections supplémentaires nécessaires à ce parcours

- `createOrderPaymentIntent` réarmait un paiement refusé avec un `save()` de
  document ancien après lecture Stripe. Une réussite ou annulation concurrente
  pouvait être écrasée. Le réarmement compare désormais PaymentIntent, restaurant,
  statut, état `failed` et expiration dans une écriture atomique. Une course
  renvoie 409 `ORDER_PAYMENT_STATE_CHANGED`, sans créer un second PaymentIntent.
- La route publique PaymentIntent relit la commande après le service, y compris
  lorsque la réutilisation a constaté un succès. Si cette relecture échoue, elle
  demande une vérification (503) au lieu d'afficher une ancienne version de la
  commande. Le site utilise cet état pour éviter de rouvrir le paiement d'une
  commande déjà payée ou annulée.
- La reprise du site reconnaît une annulation/refus terminal et affiche cet
  état avec une action « Nouvelle commande », plutôt que de réessayer sans fin
  un PaymentIntent annulé. Une reprise en erreur reste visible ; le bouton
  « Vérifier le statut du paiement » appelle la confirmation/relecture existante,
  sans demander un nouveau paiement. Les conflits 409 de reprise provoquent une
  vérification de l'état stocké avant toute nouvelle tentative.
- Les textes « Aucun nouveau débit » et « Paiement reçu » ne sont plus utilisés
  quand le résultat est inconnu. Une commande terminée reste affichée terminée ;
  une commande annulée/refusée ne ressemble plus à une acceptation en attente.
  `refunded`, remboursement en cours et remboursement non confirmé ont des
  libellés distincts. Les commandes sur place conservent leur parcours séparé.
  Le statut de remboursement, non sensible, est inclus dans la réponse publique
  protégée par token ; les montants après ajustements et effectivement remboursés
  sont affichés séparément du total initial, sans supposer qu'un remboursement
  en cours est déjà effectué.

Fichiers ajoutés/modifiés par cette extension, en plus de ceux du prévol :

- Backend : route publique PaymentIntent et service Take-away ; tests de
  sécurité, d'ajustements et du service d'événements Stripe.
- Site : `src/components/take-away/take-away.component.js`,
  `src/components/take-away/payment-form.take-away.component.js`,
  `src/_assets/utils/take-away-payment-state.js` (nouveau),
  `tests/take-away-payment-state.test.cjs` (nouveau), `package.json` (commande de test).

### Tests complémentaires exécutés pour l'extension

Les preuves initiales de 109 tests restent conservées. Les tests ajoutés lors
du prévol et de cette extension ont été lancés par filtres de nom, sans refaire
la suite complète. Pour les scénarios ajoutés au paiement : **7 tests backend
réussis** (incluant deux sous-cas de concurrence), **5 tests d'état côté site
réussis**, et **4 tests SMS existants réussis**. Les cinq nouveaux tests du
prévol et ses non-régressions sont détaillés dans la section précédente.

```sh
# Dans gusto-manager/server : services et route réelle, dépendances simulées
TZ=Europe/Paris node --test --test-name-pattern='payment audit:' tests/take-away-security.test.js tests/take-away-adjustments.test.js tests/take-away-stripe-events.test.js
TZ=Europe/Paris node --test --test-name-pattern='événement initial|crash avant job|remboursement confirmé séparé|mutation de statut' tests/take-away-sms.test.js
# Dans clients/les-capuccins/client : états affichés et compilation Next
npm run test:take-away-payment
npm run build
```

### Contrôles restants après déploiement, sans paiement réel

En complément des étapes précédentes :

1. En staging, avec base et compte Stripe **test** séparés de la production,
   tester PaymentElement, refus puis reprise, 3DS/retour de redirection, fermeture
   d'onglet, réponse perdue, paiement en traitement, expiration et doubles
   livraisons. Les éventuels remboursements de validation doivent être uniquement
   simulés ou dans cet environnement test isolé, jamais sur le compte live.
2. Vérifier en lecture seule VNXE : toujours terminée/payée, 1 EUR encaissé et
   aucun remboursement ajouté. Ne pas la réactiver et ne pas renvoyer son webhook
   pour « vérifier » le correctif. Aucun effet ne doit être ajouté sans preuve
   qu'il manque ; l'absence d'un reçu historique ne constitue pas cette preuve.
3. Vérifier YEBA directement en base : annulée/échec/en ligne ; son absence dans
   la liste opérationnelle reste normale. Ne pas la confondre avec la commande
   sur place `TA-20261021-9II4` et ne pas la marquer payée.
4. Observer les paiements clients naturels qui surviendront après livraison,
   sans en provoquer : concordance PaymentIntent/commande/montants, acceptation
   automatique ou manuelle selon les réglages, reçu traité, notification unique,
   email/CRM/SMS attendus et état visible dans le dashboard. Un retour 500 doit
   être rapproché du reçu et de la commande avant toute action.
5. Pour les opérations de remboursement déjà demandées dans le fonctionnement
   normal, comparer leur ID/montant/état Stripe et l'opération persistante Gusto.
   Un état `pending`, `failed` ou `uncertain` n'autorise pas à afficher `refunded`
   ni à émettre un second remboursement sans rapprochement. Aucun remboursement
   ne doit être déclenché pour tester la production.

Un test supplémentaire du relais Next.js vérifie spécifiquement les deux types
`payment_failed` et `canceled`, avec statut Stripe non réussi et montant encaissé
nul : les réponses backend 400/401/403/404/409/500/503 donnent toutes le 500 public
historique, avec code et statut amont conservés dans le diagnostic sécurisé ;
seul l'acquittement backend 200 `{received:true,handled:true}` donne 200 à Stripe.
Cela reproduit le mécanisme du message observé, sans attribuer à la production
l'une de ces causes. Test exécuté isolément :

```sh
node --test --test-name-pattern='failed and canceled events' tests/take-away-webhook.test.cjs
```

Sans ces contrôles d'environnement et d'observation, il est possible de valider
la logique locale, mais pas de garantir l'authentification Stripe live, la
livraison bancaire, les droits effectifs d'écriture du déploiement ou la
livraison physique des notifications de production.
