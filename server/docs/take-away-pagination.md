# Chargement exhaustif des commandes opérationnelles

## Cause et contrat compatible

Le contexte demandait 300 commandes par mois en une seule requête, mais l'API
plafonnait la réponse à 200. Les deux interfaces calculaient calendriers,
listes, recherches et compteurs à partir de cette collection tronquée.

`GET /api/restaurants/:restaurantId/take-away/orders` accepte désormais
`pagination=cursor`, puis `cursor=<nextCursor>` pour les pages suivantes :

```json
{
  "orders": [],
  "pagination": { "hasMore": false, "nextCursor": null }
}
```

Le plafond reste à **200 par page**, sans plafond sur le nombre de pages.
L'API lit au plus `limit + 1` documents pour détecter la page suivante, sans
compter toute la collection. Un curseur ou une limite invalide renvoie 400.
Sans pagination, le contrat historique `{ orders }`, la limite par défaut de
100 et le plafond de 200 sont conservés. L'ordre historique reste décroissant
sur `scheduledFor`, `createdAt`, avec `_id` comme départage unique.

En mode curseur, l'ordre de transport est `_id` décroissant et la continuation
utilise `_id < cursor`. Cet identifiant unique et immuable évite les décalages
de pagination par offset, même si la commande frontière est supprimée ou si
une date de retrait est modifiée. Aucun besoin de relire la commande frontière.
L'index additionnel `{ restaurant_id: 1, deletedAt: 1, _id: -1 }` soutient ce
parcours ; l'index existant restaurant/période reste disponible. Aucun index
existant n'est supprimé et aucune donnée n'est migrée.

Chaque page réapplique les droits et les filtres restaurant, date/période Paris,
statut, mode, visibilité des paiements et `deletedAt`. Il faut conserver les
mêmes filtres pendant un parcours. Il s'agit d'une lecture vivante, pas d'un
instantané transactionnel : les créations et changements d'appartenance à une
période sont réconciliés avec les événements SSE dans le dashboard.

## Dashboard et temps réel

`loadTakeAwayOrderPeriod` suit tous les curseurs de la période demandée,
déduplique par `_id`, puis restaure l'ordre chronologique stable avant de
publier le cache complet. Une page échouée ou une réponse de pagination invalide
ne publie jamais un résultat partiel. Le chargement reste actif jusqu'à la fin.
Le nouveau client exige les métadonnées de pagination : mettre le backend à
jour avant le client ; un ancien backend provoque une erreur de chargement
explicite au lieu de présenter silencieusement 200 commandes comme complètes.

Le cache mensuel partagé alimente les interfaces dashboard et webapp, y compris
leurs filtres locaux de recherche et de statut. La lecture reste limitée à la
période demandée ; le préchargement existant des mois adjacents est conservé.
Aucun chargement global de l'historique n'est ajouté.

Un journal temporaire conserve toutes les mutations HTTP/SSE reçues pendant
chaque lecture, indépendamment du cache durable limité à 500 mutations. Il
réconcilie les créations, changements de statut/période, masquages et suppressions
avec les pages reçues, puis est libéré. Les protections existantes contre un
ancien restaurant, une requête remplacée et une génération de cache périmée
sont conservées et vérifiées entre les pages. Le retour au premier plan relit
aussi toutes les pages pour rattraper les événements manqués pendant suspension.

Les paiements, remboursements et agrégations financières sont inchangés.

## Validation ciblée

Avec Node 24, depuis `server` :

```sh
npm run test:take-away
```

Depuis `client` :

```sh
TZ=Europe/Paris node --test tests/take-away-pagination.test.js tests/take-away-visibility.test.js tests/take-away-order-details.test.js
npm run build
```

Les tests de pagination couvrent 0, 199, 200, 201, 300, 301 et 701 commandes,
les dates identiques, les bornes Paris et le changement d'heure, les filtres,
la compatibilité historique, la suppression du curseur, les mutations entre
pages, plus de 500 événements, les requêtes concurrentes, les changements de
période/restaurant, l'échec d'une page et sa reprise, et la resynchronisation.
Les composants réels des deux interfaces sont exercés pour les calendriers,
recherches accentuées, filtres de statut, listes journalières et compteurs.
Les routes et modèles sont chargés réellement ; MongoDB et les fournisseurs
sont simulés en mémoire. Aucun accès à une base ni à Stripe n'est nécessaire.

Résultats avec Node 24.22.1 : **221 tests serveur et 34 tests client réussis**.
Build Next.js réussi, **159 pages générées**. ESLint ciblé sans erreur (trois
avertissements préexistants dans le contexte) et `git diff --check` réussi.
Le build signale aussi l'indisponibilité des téléchargements de certaines
polices Google. La suite serveur a nécessité l'autorisation d'ouvrir un port
HTTP local temporaire pour ses tests Express.

## Fichiers de cette correction

- `server/routes/take-away.routes.js` : contrat de pagination compatible.
- `server/models/take-away-order.model.js` : index additionnel.
- `client/src/contexts/restaurant.context.js` : toutes les pages et réconciliation SSE.
- `server/tests/take-away-pagination.test.js` : nouveaux tests de route.
- `client/tests/take-away-pagination.test.js` : nouveaux tests du contexte et des deux interfaces.
- `client/tests/take-away-visibility.test.js` : métadonnées ajoutées à la réponse simulée existante.
- `server/package.json` : ajout du test à la suite Take-away.
- `server/docs/take-away-pagination.md` : ce contrat et compte rendu.

Travail limité à `develop`, modifications locales préexistantes conservées.
Aucun commit, push, déploiement ni migration destructive.
