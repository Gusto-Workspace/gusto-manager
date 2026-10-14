# Statistiques et export des transactions

Le graphique et le PDF utilisent `transaction-financials.service.js`. Les calculs
additionnent les mouvements de solde Stripe en centimes, par devise de règlement :

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

Routes sous `/api/owner/restaurants/:id/payments` :

- `GET monthly-sales?module=gift_card|take_away|all` : séries par module et devise.
  Le défaut cartes cadeaux conserve `monthlySales` pour une seule devise.
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
