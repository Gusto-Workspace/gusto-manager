# Déploiement des notifications SMS vente à emporter

Les nouvelles notifications utilisent le worker SMS existant, `SmsUsagePeriod`,
les politiques de destination et le Meter Stripe existants. Aucun nouveau prix,
compteur ou changement d'environnement n'est requis. Les notifications et leurs
événements sont désactivés par défaut. Leur activation ne rejoue pas les événements
antérieurs à la date d'activation.

## Index MongoDB

Ne pas utiliser `syncIndexes()`, supprimer une collection ou recréer les index.
L'index historique unique `(reservationId, type, occurrenceKey)` est conservé
strictement. Pour les commandes, `occurrenceKey` contient l'identifiant de commande
et l'identifiant durable d'événement, y compris l'opération de refus. Les documents
existants restent compatibles avec cet index.

Un seul index unique supplémentaire est déclaré sur `SmsJob` :

```javascript
{
  key: { takeAwayOrderId: 1, eventId: 1 },
  name: "take_away_sms_event_unique",
  unique: true,
  partialFilterExpression: { takeAwayOrderId: { $type: "objectId" } }
}
```

Avant de démarrer les workers du nouveau code :

1. Inspecter les index de la collection effective `SmsJob.collection.name`.
2. Si l'index ci-dessus existe, vérifier ses clés et ses options.
3. Si son nom existe avec une autre définition, arrêter et résoudre le conflit
   explicitement ; ne pas supprimer automatiquement cet index.
4. S'il est absent, vérifier l'absence de doublons sur les éventuels documents
   déjà porteurs d'un `takeAwayOrderId`, puis créer uniquement cet index avec
   `createIndex`. Les anciens rappels, sans ce champ, ne sont pas concernés.
5. Conserver tous les index des commandes/refus/remboursements de la conversation 1.

Aucune opération d'index ou connexion MongoDB n'a été exécutée pendant cette tâche.

## Événements durables

`TakeAwayOrder.businessEvents` demeure l'unique outbox des commandes. Les mutations
de statut y ajoutent leur snapshot dans la même écriture MongoDB. Les événements
de refus et de remboursement restent ceux du service d'ajustements existant.

Le worker matérialise chaque événement en `SmsJob`, puis renseigne
`businessEvents[].smsProcessedAt`. Une interruption entre ces deux écritures
répète un upsert idempotent. Les événements ignorés sont également acquittés.
La suppression automatique des commandes terminées attend cet acquittement ;
les jobs gardent ensuite leurs propres snapshots, même si la commande est supprimée.

Les refus partiels et remboursements confirmés sont deux événements différents.
Le message de confirmation de remboursement exige `state === "succeeded"` et
`stripeRefundStatus === "succeeded"`. Les identifiants et calculs Stripe des
opérations d'ajustement n'ont pas été modifiés.

## Paramètres et accès

- `GET /api/restaurants/:restaurantId/take-away/sms-notifications` : paramètres,
  état du Sender, consommation commune et variables/événements disponibles.
- `PUT /api/restaurants/:restaurantId/take-away/settings` : sauvegarde de
  `settings.smsNotifications` avec activation et templates par événement.
- Accès propriétaire ou employé autorisé `take_away`, sans accès commercial
  supplémentaire ni droit Réservations.
- `GET /api/admin/sms/senders` expose aussi les restaurants éligibles sans Sender.
- Le `PUT` admin `sms-sender` existant reste l'unique mutation de Sender ID.
  L'enregistrement ne soumet aucune demande au fournisseur.

Les SMS transactionnels sont pris par le cron commun à la minute suivante, sans
la plage horaire des rappels. Les restrictions fournisseur/pays, le plafond et
les états incertains conservent le comportement existant.
