# Statistiques et export des transactions

La partie en ligne du graphique et le PDF utilisent
`transaction-financials.service.js`. Les calculs additionnent les mouvements de
solde Stripe en centimes, par devise de règlement :

`net = encaissements - remboursements + ajustements - frais`

Les paiements doivent être capturés et réussis. Un remboursement réussi apparaît
avec le montant signé de son propre mouvement Stripe, à sa date financière,
même si l'achat précède la période. Les remboursements en cours, les retours de
remboursements échoués et les litiges attribuables sont des ajustements distincts.
Les frais négatifs correspondent à une restitution de frais. Les virements ne
sont pas des ventes. Les frais de compte sans lien certain et les opérations
ambiguës ne sont jamais répartis arbitrairement ; le PDF mentionne les exclusions.
Les montants de commande sur place ne prouvent pas un encaissement Stripe.

L'attribution utilise les PaymentIntents des achats historiques embarqués,
des `GiftCardOrder` et des `TakeAwayOrder`, ainsi que les IDs de remboursement
historiques et `adjustments.stripeRefundId`. Les recherches MongoDB sont limitées
au restaurant autorisé. Les métadonnées Stripe de restaurant et module doivent
être cohérentes ; les conflits sont exclus. L'historique local identifie les
mouvements sans ajouter son montant au total. La déduplication porte sur l'ID
unique du mouvement de solde Stripe.

Les dates inclusives sont converties en `[début, jour suivant la fin[` en
`Europe/Paris`, avec gestion des changements d'heure. Le graphique couvre les
six mois calendaires, mois courant compris, et complète les mois vides à zéro.
Les devises restent séparées dans les séries et les synthèses PDF.

## Commandes payables au retrait dans le graphique

`take-away-sales.service.js` complète uniquement le graphique à emporter avec
les `TakeAwayOrder` du restaurant autorisé. Le PDF, les transactions financières
et les virements restent exclusivement alimentés par Stripe.

- `paymentMethod = on_site`, `paymentStatus = not_required|paid`, sans
  `stripePaymentIntentId`. Une commande liée à Stripe reste exclusivement dans
  le calcul Stripe ; la commande locale ne rajoute jamais son montant en ligne.
- Statuts inclus : `pending`, `confirmed`, `preparing`, `ready`,
  `out_for_delivery`, `completed`. Il s'agit de commandes enregistrées, y compris
  celles en attente d'acceptation. `canceled`, `rejected`, ainsi que les paiements
  `pending`, `failed` ou `refunded`, sont exclus de cette partie au retrait.
- Montant : `remainingAmountCents` s'il est disponible (zéro compris), sinon
  `total` historique arrondi en centimes, frais de livraison compris. Le montant
  restant intègre déjà les refus partiels : ne pas soustraire à nouveau les
  ajustements ou remboursements. Les données de montant invalides sont exclues.
- Date : `createdAt`, dans la même période Paris de six mois que le graphique,
  jusqu'à la fin du jour courant. `scheduledFor` et les dates de retrait ou de
  changement de statut ne déplacent pas la commande. Les refus/annulations
  ultérieurs corrigent donc le mois de création. À l'inverse, les mouvements
  Stripe conservent leur propre date financière, même pour un achat plus ancien.
- Déduplication par `_id` de commande au retrait ; déduplication Stripe existante
  par ID de mouvement conservée. Calcul en centimes et devises séparées.

Chaque point à emporter expose `onlineNet`, `onSiteOrders` et
`total = onlineNet + onSiteOrders`, en unités monétaires. Le détail « En ligne » /
« Au retrait » est affiché au survol du « i » à côté de « Total » et dans
l'infobulle du graphique. Le total est un indicateur d'activité
mêlant net Stripe après frais et montant de commandes au retrait ; il ne mesure
pas un encaissement global. Aucun champ ou flux existant ne confirme ici
l'encaissement au retrait, même si la commande est `completed`.

Sans configuration Stripe, les commandes au retrait restent consultables et la
série porte `onlineAvailable: false`, affiché comme données en ligne
indisponibles. Si une source Stripe configurée échoue, la route échoue sans
retourner de total partiel trompeur. Seules les commandes encore conservées sont
comptées : la suppression manuelle ou automatique des commandes terminées rend
leur montant au retrait indisponible. Le cycle de suppression n'est pas modifié.

Routes sous `/api/owner/restaurants/:id/payments` :

- `GET monthly-sales?module=gift_card|take_away|all` : séries par module et devise.
  Le défaut cartes cadeaux conserve `monthlySales` pour une seule devise et
  n'effectue aucune lecture des commandes au retrait.
- `GET export-modules` : modules possédant un historique payé, indépendamment
  de l'abonnement actuel. Si l'historique local manque, recherche indexée par
  métadonnées des PaymentIntents puis des charges Stripe (délai d'indexation Stripe
  possible). La lecture paginée reste le secours si la recherche n'est pas disponible.
- `POST export-pdf` : `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD", modules: [...] }`.

Ces routes exigent l'authentification et l'accès au restaurant. Pour les employés,
le droit `dashboard` est requis, y compris pour les historiques désactivés.
Aucune écriture Stripe n'est réalisée. Le cache de découverte est limité à
100 restaurants, pendant 60 secondes ; le frontend conserve aussi les séries
60 secondes et force leur relecture après un remboursement depuis le dashboard.
Le changement de module utilise les séries déjà chargées.

Un export est limité à trois ans, 100 pages Stripe de 100 mouvements,
2 500 lectures supplémentaires de rapprochement et 60 secondes de traitement.
Si une limite est atteinte ou une lecture Stripe échoue, aucun PDF incomplet
n'est produit. Réduire la période puis réessayer. Les frais/ajustements sans
source attribuable ne sont pas inclus dans ce rapport de ventes par module.

Vérifications ciblées (depuis `server`, sans accès Stripe ou MongoDB réels) :

```sh
TZ=Europe/Paris node --test tests/take-away-sales.test.js tests/take-away-sales-ui.test.js tests/dashboard-financials.test.js tests/dashboard-financial-routes.test.js tests/take-away-adjustments.test.js
```
