# Commandes à emporter : visibilité et suppression logique

Intervention sur `develop`, limitée à `gusto-manager`. Modifications locales préexistantes conservées ; aucun commit, push ou déploiement.

## Cause démontrée

La création publique d'un paiement en ligne enregistre une commande `pending` / paiement `pending`, sans l'activer pour le restaurant. Les routes de liste et de détail la masquaient déjà tant que le paiement n'était pas `paid` ou `refunded`.

Le cron `take-away-lifecycle` s'exécute chaque minute. Son traitement des échéances de confirmation sélectionne les commandes `pending` dont `confirmationDeadlineAt` est dépassé, y compris celles encore impayées. `terminateOrder` annule alors la commande et marque ses articles comme non livrables. Ses effets appellent `runOrderStatusEffects`, qui diffusait sans filtre un événement SSE `takeaway_order_updated` contenant le document complet. `RestaurantContext` insérait ce document dans ses listes et caches sans vérifier son paiement. Cela explique l'apparition différée, le statut annulé et l'absence d'articles actifs malgré le filtre HTTP.

Le nettoyage des tentatives de paiement (`paymentExpiresAt`, 15 minutes par défaut) est un autre traitement : il ne diffusait pas lui-même cette mise à jour. Le test d'expiration suivi d'une confirmation tardive reproduit le chemin de confirmation décrit ci-dessus. Aucun accès à des données ou journaux de production n'a été utilisé pour attribuer une échéance précise à la commande observée.

## Règle appliquée

- Une commande au retrait devient opérationnelle à sa création définitive.
- Une commande en ligne doit avoir un paiement serveur `paid` / `refunded`, ou une date `paidAt` attestant un encaissement antérieur. Son statut métier seul et sa provenance dashboard ne suffisent jamais.
- `deletedAt` exclut la commande de toutes les lectures opérationnelles concernées, même après remboursement ou traitement automatique.
- Le même filtre protège les listes HTTP, détails, accès aux mutations et émissions SSE. Les émissions et notifications relisent l'état stocké pour éviter de diffuser un ancien document après suppression.
- Le contexte React filtre aussi les réponses HTTP et mises à jour, déduplique par identifiant et conserve des marqueurs de suppression contre les réponses anciennes, y compris lors du retour au premier plan. Les listes, recherches, filtres et compteurs sont calculés depuis ces collections.
- L'historique de la fiche client masque aussi les documents retenus invisibles ; ses compteurs CRM historiques restent conservés.

Le parcours existant utilise des PaymentIntents, sans nouvelle Checkout Session. La confirmation publique relit le PaymentIntent côté serveur et vérifie état, montant, devise, identifiant et métadonnées. Le traitement webhook conserve ses reçus persistants, verrous et règles d'idempotence. Un retour navigateur ne valide jamais à lui seul un paiement.

La confirmation tardive conserve la décision d'annulation et reprend le remboursement de la même opération existante, sans doubler les remboursements. Ces mécanismes financiers ne sont pas modifiés par la suppression logique.

## Suppression

`DELETE /api/restaurants/:restaurantId/take-away/orders/:orderId` réutilise l'authentification et les droits owner/employee du module. Une écriture atomique vérifie le restaurant, la visibilité et le statut réel `completed` ou `canceled`, puis renseigne `deletedAt`. Les autres statuts sont refusés. Répéter une suppression déjà enregistrée réussit sans nouvelle mutation financière.

Dans les deux drawers, le bouton discret « Supprimer » ouvre la confirmation « Conserver » / « Supprimer la commande ». Après succès, le drawer se ferme et la liste, ses caches et compteurs retirent immédiatement la commande. Un événement SSE contenant uniquement l'identifiant propage le retrait aux autres sessions.

Les articles, prix, ajustements, événements métier et références Stripe restent stockés. La suppression ne contacte pas Stripe et ne lance aucun remboursement. Un remboursement déjà nécessaire continue à être réconcilié par les traitements existants, sans réaffichage de la commande.

Le nettoyage automatique des commandes terminées devient également logique, avec les mêmes délais et protections concernant les traitements financiers/SMS en attente. Il traite jusqu'à 200 documents par passage et propage leurs identifiants supprimés. Les lectures financières continuent à inclure les commandes au retrait masquées ; les mouvements en ligne restent issus de Stripe.

## Fichiers concernés par cette intervention

Backend :

- `server/models/take-away-order.model.js`
- `server/services/take-away-visibility.service.js` (nouveau)
- `server/services/take-away.service.js`
- `server/services/take-away-sales.service.js` (uniquement la note explicative de conservation ; fichier déjà présent localement)
- `server/routes/take-away.routes.js`
- `server/routes/customers.routes.js`
- `server/package.json` (ajout du test de visibilité à la commande existante)

Dashboard :

- `client/src/_assets/utils/take-away-visibility.js` (nouveau)
- `client/src/contexts/restaurant.context.js`
- `client/src/components/dashboard/take-away/list.take-away.component.js`
- `client/src/components/dashboard/take-away/order-drawer.take-away.component.js`
- `client/src/components/dashboard/webapp/take-away/list.take-away.webapp.js`
- `client/src/components/dashboard/webapp/take-away/order-drawer.take-away.webapp.js`
- `client/src/components/dashboard/webapp/take-away/confirm-modal.take-away.webapp.js`

Tests et documentation :

- `server/tests/take-away-visibility.test.js` (nouveau)
- `server/tests/take-away-adjustments.test.js` (complément du scénario tardif existant)
- `server/tests/take-away-reliability.test.js` (nettoyage logique)
- `client/tests/take-away-visibility.test.js` (nouveau)
- `server/docs/take-away-order-visibility.md` (ce compte rendu)

## Vérification

Avec Node 24.22.1 :

- `npm run test:take-away` dans `server` : **210 tests réussis**. Inclut la route HTTP webhook, les permissions et l'isolation des restaurants, les impayés, les paiements confirmés, l'expiration, la confirmation tardive, les doublons et la conservation après suppression.
- Tests financiers complémentaires `take-away-sales`, `take-away-sales-ui`, `dashboard-financial-routes` : **23 tests réussis**.
- `node --test tests/take-away-visibility.test.js tests/take-away-order-details.test.js` dans `client` : **20 tests réussis**. Rendu des deux drawers et de la modale, confirmation, appel DELETE depuis les deux listes, échec API, cache réel du contexte et réponse HTTP concurrente.
- Build Next.js : réussi, 159 pages générées. Avertissements existants du projet et téléchargement de certaines polices Google indisponible dans l'environnement de vérification.
- ESLint ciblé : aucune erreur ; trois avertissements préexistants dans le contexte général.
- `git diff --check` : réussi.

Les tests utilisent des données en mémoire et des fournisseurs simulés. Aucun paiement, remboursement, email ou traitement de production n'a été exécuté. Aucune règle de disponibilité ni fonctionnalité Réservations/Cartes cadeaux n'a été modifiée.

Avant déploiement : vérifier le parcours complet en préproduction avec MongoDB et Stripe en mode test, notamment l'échéance de confirmation et le SSE après suspension d'une webapp. Aucune migration destructive n'est nécessaire : les anciens documents sans `deletedAt` restent compatibles. Les documents physiquement effacés avant cette correction ne peuvent pas être reconstitués par celle-ci.
