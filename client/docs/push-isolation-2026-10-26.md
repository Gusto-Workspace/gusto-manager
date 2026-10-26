# Isolation des notifications push — 26 octobre 2026

Périmètre : `gusto-manager`, branche `develop`. Aucun envoi push réel, accès MongoDB de production, commit, push ou déploiement. Les règles de création des notifications métier ne changent pas.

## Réception et clic

Les trois registrations métier conservent leurs scripts et scopes. Elles importent `public/push-worker-runtime.js`, qui valide le module du payload lorsqu'il est présent. Un payload historique sans module reste accepté. Les liens externes, malformés ou hors du module retombent sur l'entrée du module ; les liens valides conservent leur query et fragment. Les icônes et badges restent spécifiques au module.

Au clic, aucune sélection arbitraire ni appel direct à `WindowClient.navigate()` ne subsiste. `includeUncontrolled: true` reste nécessaire pour les entrées canoniques contrôlées par le worker racine, mais le chemin n'est qu'un préfiltre. Le worker demande ensuite via `MessageChannel` l'identité stable de la fenêtre, son restaurant actif et son utilisateur. La page vérifie l'origine, le script émetteur, le module, sa propre identité, l'authentification et la destination avant de naviguer. Le focus suit l'accusé de navigation. Sans fenêtre prouvée compatible, le worker appelle uniquement `openWindow()` ; les retours `null`, erreurs et absences de réponse n'autorisent jamais un fallback inter-module.

L'identité de fenêtre est capturée avant le routage et conservée dans `sessionStorage` pour les rechargements et reconnexions. Elle n'est pas réaffectée lors d'une navigation manuelle entre modules. Les navigations manuelles du dashboard restent possibles, mais ne créent pas automatiquement un abonnement sous une autre identité. `setupPushForModule` revérifie aussi l'identité après ses étapes asynchrones et rejette les modules inconnus.

Cette identité est une identité de fenêtre Web, pas une preuve de l'application installée choisie par l'OS. Elle n'est pas rétroactive pour une fenêtre déjà détournée avant cette version et dépend de la disponibilité du stockage de session.

## Restaurant et validation de chaque destination

Le payload et le lien incluent `restaurantId` ; le payload inclut également l'utilisateur destinataire. Une fenêtre B n'est pas réutilisée pour une notification A. `PushRestaurantGuard`, placé avant les guards d'accès du dashboard, retient les composants de détail jusqu'au chargement du restaurant cible accessible via le contexte existant.

La validation est associée au module, au restaurant demandé, au `notificationId` et au lien profond complet. Une nouvelle destination sur le même pathname repasse par la validation si le restaurant ou la notification change. La continuation après retrait des métadonnées de routage utilise une clé distincte ; un résultat asynchrone périmé ne doit pas autoriser une autre destination. Un changement manuel ultérieur de restaurant retire les anciens identifiants de détail avant d'afficher le nouveau contexte.

Les anciennes notifications portant seulement un `notificationId` peuvent résoudre leur restaurant avec `GET /api/push/notifications/:notificationId/context`, protégé par authentification et contrôle d'accès au restaurant. Une notification expirée, inaccessible ou trop ancienne pour être identifiée affiche un message permettant de revenir à l'application, plutôt qu'un détail dans un restaurant supposé.

## Abonnements existants et concurrence

L'index unique `endpoint` reste inchangé. Le nouveau champ optionnel `restaurantIds` permet plusieurs associations pour un même endpoint/module/utilisateur. En son absence, l'envoi utilise le champ historique `restaurantId`. Au premier renouvellement, ce champ est conservé dans le tableau ; ouvrir B ajoute B sans remplacer A. Le backfill conditionnel ne réactive pas A si une désinscription concurrente a déjà matérialisé le tableau vide.

Un endpoint déjà rattaché à un autre module ou utilisateur reçoit un refus `409` ; aucune réaffectation silencieuse n'est effectuée. La désactivation retire seulement l'association demandée. Le navigateur garde son abonnement local pour ne pas couper les autres restaurants ou une inscription concurrente. Les endpoints morts restent nettoyés ; la perte de droits Vente à emporter pour A retire A sans supprimer B.

La migration historique spécifique `/dashboard/take-away/` intervient après l'enregistrement durable du remplacement et l'accusé explicite `legacyTransferred` du backend. Les associations encore autorisées du même utilisateur sont transférées avant retrait de l'ancien endpoint. Sans confirmation backend, le navigateur garde l'ancien abonnement. Aucun désenregistrement global ou effacement de caches n'est introduit.

## Scopes et production

Les manifestes, leurs `id`, `start_url` et scopes restent inchangés. Le scope Manager `/dashboard/` reste imbriqué avec les webapps métier. Les scopes des workers métier gardent leur slash final : les entrées sans slash restent hors de leur contrôle de navigation, sans empêcher leurs abonnements push explicites. Modifier ces scopes aurait créé de nouvelles registrations et exigé une migration ; ce n'est pas nécessaire à la correction des fallbacks démontrés.

`next-pwa` continue à générer `/sw.js` au scope `/` et Workbox. Le worker racine n'importe pas le runtime push. Les scripts métier et leur runtime restent des ressources publiques séparées et sont inclus dans les ressources générées. Les fichiers générés par les builds de vérification sont des artefacts, pas des sources à éditer manuellement.

## Vérifications

- `client`: `node --test tests/push-isolation.test.js` — 32 tests réussis : fenêtres et workers simulés, réception/affichage, mauvais module, liens externes, fallback sans fenêtre, erreurs `openWindow`, badges, sources de messages, identités conservées, A/B, nouvelles destinations au même chemin, anciennes notifications, mises à jour et reconnexions, activation asynchrone, désactivation partielle et migration historique.
- `server`: `node --test tests/push-isolation.test.js tests/take-away-reliability.test.js` — 24 tests réussis : chargement des routes, handlers avec modèles simulés, routage A/B, champs historiques, conflits d'identité, désactivation/backfill concurrent, migration ciblée, droits et liens profonds. Pas de validation de concurrence contre un vrai serveur MongoDB.
- ESLint ciblé sur les fichiers frontend touchés.
- Build Next.js de production, génération des routes, des manifestes référencés et des scripts PWA. Les avertissements de lint préexistants et les téléchargements de polices Google indisponibles sont distincts de la correction push.
- Contrôle HTTP du build local : six scripts servis avec un contenu identique aux fichiers générés, cinq manifestes et cinq entrées à `200`, cinq URL avec slash redirigées en `308` vers les entrées canoniques. Contrôle syntaxique des scripts générés et confirmation que le worker racine ne contient aucun handler push métier. Serveur de vérification arrêté après contrôle.

Déployer le backend avant le frontend évite de faire dépendre le frontend multi-restaurants d'un ancien backend qui ne connaît que `restaurantId`. Les anciennes pages/workers déjà actifs doivent recevoir la mise à jour ; une page historique sans protocole de confirmation ne sera pas réutilisée par les nouveaux workers.

## Limites sur appareils

Le code mis à jour interdit les réutilisations inter-modules démontrées. Il ne garantit pas l'attribution OS du nom, de l'icône, du badge ni de la fenêtre retournée par `openWindow()`. Android/Chrome partage les ressources d'origine ; les installations iOS disposent de conteneurs distincts. Le scope imbriqué Manager peut encore influencer l'attribution des liens.

À tester sur Android et iOS : cinq installations simultanées, cible ouverte/fermée, autres fenêtres ouvertes, deux restaurants, login/rechargement, anciennes installations et notifications déjà affichées, nom/icône à la réception puis fenêtre activée au clic. Vérifier séparément réception, affichage OS, badge et navigation. Une séparation architecturale plus forte utiliserait des origines distinctes ; elle n'est pas implémentée ici.

## Fichiers de la mission

- Workers : `client/public/sw-reservations.js`, `sw-giftcards.js`, `sw-take-away.js` et nouveau `push-worker-runtime.js`.
- Frontend : `client/src/pages/_app.page.js`, `client/src/_assets/utils/webpush.js`, nouveau `client/src/_assets/utils/push-window.js`, nouveau `client/src/components/_shared/notifications/push-restaurant-guard.js`.
- Backend : `server/models/push-subscription.model.js`, `server/routes/push-subscription.routes.js`, `server/services/webpush.service.js`, `server/services/notifications.service.js`.
- Tests ajoutés : `client/tests/push-isolation.test.js`, `server/tests/push-isolation.test.js`.
- Compte rendu : ce document.
- Artefacts régénérés par le build et laissés sur disque : `client/public/sw.js`, `client/public/workbox-4754cb34.js`.

Manifestes, configuration Next.js, dépendances, sites clients et données métier non modifiés par cette mission.
