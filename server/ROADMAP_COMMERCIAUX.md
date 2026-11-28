# Espace Commerciaux de Gusto Manager

Travail local sur `develop`. La Phase 0 est validée. Les changements initiaux sur les comptes administratifs réels et la mise en production sont des opérations manuelles réservées au propriétaire.

## Phases

| Phase | Périmètre | État |
| --- | --- | --- |
| 1 | Rôles, protections historiques, sessions, comptes et espace commercial | Contrôles de sortie exécutés |
| 2 | Prospection, interactions, relances, registre d’établissements et réattribution | Contrôles API exécutés |
| 3 | Documents existants, offres versionnées, PDF privés et signature | Contrôles API et PDF exécutés |
| 4 | Acquisitions, commissions et statistiques | Contrôles API exécutés |
| 5 | Bibliothèque de ressources privées | Contrôles API exécutés |
| UX | Harmonisation des espaces commercial et administratif, fiches individuelles, synthèse et prochaines actions | Contrôles Chrome exécutés |
| 6 | Recette automatisée, builds et Chrome | Recette locale exécutée |
| 7 | Préparation de la bascule et du retour arrière | Procédure documentée |

## Décisions

- `Admin` conserve les identités `super-admin` et `admin`. `CommercialAccount` porte le rôle `seller` avec sa propre clé de session.
- Les nouveaux JWT `super-admin`, `admin` et `seller` sont émis sans durée fixe, avec audience dédiée et vérification du compte, du rôle, du statut et de `sessionVersion` en base. Les JWT déjà émis avec une échéance gardent la date inscrite. L’admin utilise `localStorage` et le seller utilise `sessionStorage`.
- L’espace commercial utilise `/dashboard/seller/*`, avec connexion, activation et récupération sous `/dashboard/seller/login`. Les API conservent `/api/commercial/*`. Le provider restaurant et le provider admin sont exclus de ce périmètre, y compris lors d’une navigation depuis le Dashboard.
- Le back-office « Commerciaux » utilise `/dashboard/admin/seller/*`. Les API d’administration conservent `/api/admin/commerciaux/*`.
- Le pilotage global propose huit rubriques. Les fiches sous `/dashboard/admin/seller/accounts/:id` ont huit onglets avec Factures, et gardent le nom et le statut du commercial visibles. Le CRM, le tableau de bord, le gestionnaire de documents, le compte et les commissions réutilisent les composants et API existants. Les requêtes individuelles font appliquer la sélection en base, y compris pour les actions et les téléchargements.
- La navigation commerciale reprend le composant visuel de la sidebar historique sans charger les contextes administrateur et restaurant. Le tableau de bord combine quatre indicateurs principaux, commissions, activité chronologique, répartition actuelle et prochaines actions. Les périodes rapides contrôlent les résultats datés. Les relances, rendez-vous, signatures expirées et états de livraison utilisent les informations existantes, sans moteur de tâches ni planification.
- Les routes Stripe appliquent uniquement les autorisations nécessaires. La création, l’adoption et la synchronisation d’un client Stripe restent réservées au super-admin. Les tests utilisent des doubles et ne contactent aucun prestataire.
- Les nouveaux parcours réutilisent les documents, PDF, signatures, services et composants existants.
- Les offres et actions qui dépendent de règles métier à valider restent indisponibles jusqu’à validation.

## Historique des recettes précédentes

- Vérification initiale effectuée sur `develop`, avec un dépôt propre.
- Replica set dédié sur IPv4 loopback, environnement nettoyé, dotenv et planification neutralisés pendant la recette, sorties réseau backend limitées à MongoDB et aux listeners locaux du processus.
- Phase 1, `tests/commercial/accounts.test.js` sur MongoDB isolé, **6 réussis, 0 échec** après correction des doubles de prestataires. Bascule fictive des rôles, permissions client/abonnement, invitations, révocation et préservation de la connexion propriétaire/employé/comptable.
- Phase 1, build Next.js isolé **réussi** (182 pages statiques générées). Avertissements lint existants et optimisation des polices distantes ignorée. Artefacts PWA produits uniquement dans la copie temporaire.
- Phase 1, Chrome **vérifié**. Connexions admin et commerciale, liste et fiche administrative, désactivation puis redirection d’Alice vers la connexion. Les seules ressources API observées au chargement commercial étaient `/commercial/auth/login` et `/commercial/me`.
- Non-régression ciblée après Phase 1, **60 réussis** sur sessions, limitation, SSE et signatures existantes.
- Phase 2, `tests/commercial/prospects.test.js` sur MongoDB isolé, **5 réussis**. Isolation des listes, historique, relances, registre initial et futur, collision concurrente, homonymes et opposition après réattribution.
- Phase 3, `tests/commercial/documents.test.js` sur MongoDB isolé, **7 réussis**. Publication et expiration, intégrité des tarifs, conversion, limites de propriété, PDF privés, envois concurrents, ambiguïté de livraison, signature et transfert.
- Phase 3, inspection de **9 pages** rendues depuis un devis standard, un contrat fêtes et un contrat standard signé avec une image fictive.
- Phase 4, `tests/commercial/pilotage.test.js` sur MongoDB isolé, **4 réussis**. Acquisition unique, concurrence des validations et règlements, conservation du bénéficiaire et du montant, justificatif privé, statistiques filtrées.
- Phase 5, `tests/commercial/resources.test.js` sur MongoDB isolé, **3 réussis**. Publication, retrait, expiration, téléchargement privé et révocation pendant une session.
- Phase 6, première exécution intégrale de l’API commerciale sur le replica set dédié, **25 réussis, 0 échec**. Suite client existante, **181 réussis, 0 échec**.
- Chrome sur les URL définitives. Connexion commerciale, redirection vers la connexion admin sur accès direct au back-office, ouverture du menu « Commerciaux », initialisation du registre par un super-admin, création d’un prospect, relance, interaction, offre fictive version 1, devis à 95 €/mois, PDF, conversion et demande de signature simulée. Le relevé du navigateur commercial contenait des requêtes sous `/api/commercial/*` pour ce parcours. Les lectures API passent par le réseau via le service worker existant et par `Cache-Control: private, no-store` côté API.
- Recette finale sur `develop`. **28 tests API commerciaux**, **181 tests client** et **1 013 tests serveur historiques** réussis, sans échec ni test ignoré dans ces suites. Les suites historiques couvrent notamment les sessions, comptes et scopes restaurant, abonnements avec doubles Stripe, réservations, retraits et empreintes bancaires, cartes cadeaux, RH, pointeuse, CallSense, documents, notifications, SSE et sauvegarde/restauration. La sauvegarde a été rejouée sur un second replica set local permettant l’injection d’erreurs MongoDB propre aux tests.
- Les vérifications ciblées couvrent aussi le périmètre des lectures et mutations par fiche, la propriété des documents et téléchargements, l’attribution des prospects, le bénéficiaire des commissions et les agrégations. L’API répond avec `Cache-Control: private, no-store`. Les anciennes URL frontend `/commercial/connexion` et `/dashboard/admin/commerciaux` donnent 404. Le contrôle HTTP a confirmé l’en-tête CORS pour l’origine de recette et son absence pour une autre origine.
- Build du Dashboard réussi dans une copie temporaire **185 pages statiques**. Les avertissements de lint historiques subsistent. L’optimisation des polices distantes a été ignorée dans ce build hors ligne. Le backend Express a été chargé en entier sur le replica set de recette avec planification et sorties prestataires neutralisées.
- Build de la vitrine de référence Les Artistes réussi dans une copie temporaire **10 pages statiques**. Après l’échec du premier build hors ligne, seul le téléchargement des polices publiques Google a été autorisé. Le code de la vitrine et ses configurations d’origine ont été conservés.

### Recette Chrome après la passe UX

- Comparaison avec le Dashboard administrateur historique, la création documentaire, le suivi SMS et le Dashboard d’un propriétaire fictif. Le menu admin garde l’ordre des entrées historiques et affiche « Commerciaux » après « Rappels SMS ». La sidebar seller reprend le logo, les dimensions et les comportements du composant visuel historique. Le menu mobile s’ouvre puis se ferme au changement de page.
- Les mesures `clientWidth` et `scrollWidth` concordent en **1440 × 900**, **1024 × 768**, **768 × 1024** et **390 × 844** sur les tableaux de bord global et seller, l’activation, le compte seller, la fiche prospect et les vues individuelles testées (synthèse, informations et éditeur de devis).
- Les quatre périodes rapides remplissent les dates correspondantes. Le formulaire personnalisé applique les dates choisies. Une relance mène à la fiche exacte. Le pipeline utilise les statuts calculés à partir des prospects et documents de recette.
- Le global a affiché les prospects d’Alice et Benoît. Les six onglets individuels ont gardé l’identité et l’URL du commercial. La fiche de Benoît n’affichait pas le dossier d’Alice. Un prospect créé depuis Benoît est apparu dans son portefeuille et dans le global. Le devis d’Alice s’ouvre dans son onglet sans quitter sa fiche.
- Signature manuscrite enregistrée sur un contrat fictif avec Brevo et Cloudinary simulés. Acquisition associée à l’établissement de recette, puis vérification, validation et enregistrement d’un règlement fictif depuis la fiche Alice. Le côté seller a affiché la commission de 400 € parmi les montants « Reçues ». Aucun transfert d’argent n’a eu lieu.
- Offre publiée récapitulée avec montant initial et mensualité. Ressource PDF ajoutée, publiée, affichée puis demandée au téléchargement par Alice via l’API commerciale privée. Création d’un compte fictif et émission d’une invitation. Le lien d’activation affichait le formulaire et a retiré le fragment de l’URL. La récupération a affiché la confirmation générique. Le choix et la réinitialisation du mot de passe ont été soumis dans les tests API de recette.
- Après désactivation d’Alice, sa session ouverte est revenue sur `/dashboard/seller/login`. Nouvelle connexion après réactivation. Avec des sessions historiques ouvertes dans le même navigateur, les requêtes API du seller observées relevaient toujours de `/api/commercial/*`. Aucun appel de bootstrap administrateur, restaurant, abonnement ou SSE n’a été observé sur le parcours contrôlé.

## Phase 1, éléments livrés

- Modèles `Admin` et `CommercialAccount`. Routes `/api/admin/commerciaux`, `/api/commercial/auth/*`, `/api/commercial/me` et révocation admin.
- Protections des parcours clients, restaurant, abonnement, visites et mutations de contenu. Les vitrines conservent les paramètres publics nécessaires à la réservation et aux achats.
- Menu Commerciaux, fiches de compte, accès et profil commercial. Les sections métier seront branchées aux phases suivantes.

## Phase 2, éléments livrés

- Modèles `CommercialProspect`, `CommercialInteraction` et registre `CommercialEstablishment`. Routes commerciales et administratives dédiées. Initialisation explicite par super-admin, sans migration au démarrage.
- Clés fortes uniques et écritures transactionnelles. File d’arbitrage administrative pour les cas ambigus. La réponse commerciale reste uniforme. La distinction entre acceptation et refus peut encore servir de signal d’inférence, avec tentatives limitées par compte et par source.
- Écrans de portefeuille et CRM administrateur avec recherche, pagination, suivi manuel, relances, rendez-vous et interactions. Les jalons documentaires seront reliés en Phase 3.

## Phase 3, éléments livrés

- `Document` reste la collection unique. Attribution commerciale, prospect, source de conversion, conditions d’offre et première date d’envoi ont été ajoutés.
- Les PDF commerciaux réutilisent les renderers historiques et un stockage Cloudinary privé relayé par le serveur. La numérotation conserve son format historique avec suffixe uniquement en cas de collision.
- Offres standard et fêtes préparées en brouillon. La publication exige la résolution explicite des conditions. Les contrats et devis commerciaux utilisent la grille figée et la clause de livraison versionnée.
- Signature distante avec le parcours existant. Une livraison incertaine requiert une décision administrative avant un renvoi. Durée de consultation de la copie signée configurable sur la version d’offre.

## Facturation, vente et commission

- **Facture de mise en service.** Une facture commerciale est un `Document` de type `INVOICE`. Elle peut partir d’un prospect, d’un devis ou d’un contrat initial. Le serveur utilise le montant de l’offre applicable, 250 € par défaut. Le devis reste disponible et une seule facture active est permise par établissement. La numérotation, le PDF, les mentions, les coordonnées bancaires `EMITTER_IBAN` et `EMITTER_BIC`, l’aperçu, le fichier privé et l’email passent par le système documentaire existant. Le PDF émis reste figé. Le renderer de facture ponctuelle ne présente aucune mensualité.
- **Signature et client acquis.** Une signature initiale valide fait passer le prospect à Client acquis et clôt ses relances de prospection. Dans la même transaction, elle fige la commission (400 € par défaut), le bénéficiaire et l’origine du contrat. La date et l’événement de signature restent visibles dans l’historique. Les contraintes uniques par prospect, contrat et établissement empêchent le cumul de commissions. Un restaurant déjà client peut signer sans nouvelle commission d’acquisition.
- **Règlement du client.** La facture commerciale a quatre états affichés, Brouillon, Envoyée, Payée et Annulée. `admin` et `super-admin` enregistrent en une fois la totalité des frais figés sur la facture. Le formulaire demande la date du règlement et accepte une référence facultative. Une commission passe à À payer dès que la facture est payée et que le contrat est signé, quel que soit l’ordre des deux événements. La correction exige un motif, conserve le règlement annulé et ramène la facture à Envoyée. Elle remet une commission impayée en attente et préserve tout virement déjà enregistré au commercial. Une facture émise sans règlement actif peut être annulée et remplacée.
- **Règlement du commercial.** L’administration enregistre le virement effectué manuellement, avec date, auteur, référence facultative et justificatif privé facultatif. Elle peut contester ou annuler la vente avec un motif. L’annulation garde l’historique et retire le jalon Client acquis.
- **Pilotage.** La vue d’ensemble propose Restaurants à créer, Factures à encaisser et Commissions à payer. L’identification ou la confirmation de création du restaurant reste indépendante. Seul le super-admin accède au formulaire historique de création.
- **Libellés.** En attente du règlement client, À payer, Payée, Contestée et Annulée dans l’administration. Le seller lit À recevoir et Reçue pour ses deux états de paiement.

## Phase 5, éléments livrés

- `CommercialResource` gère les liens HTTPS et les fichiers PDF, images et tableurs autorisés, la catégorie, l’ordre, la publication, l’échéance, le retrait et l’archivage.
- Une ressource fichier conserve sa version courante. Les téléchargements sont authentifiés et le serveur relaie le fichier depuis Cloudinary en stockage `authenticated`. L’espace commercial n’affiche que les ressources publiées encore valides. La recette ne crée aucun contenu réel.

## Matrice de permissions

| Fonction | `super-admin` | `admin` | `seller` |
| --- | --- | --- | --- |
| Comptes commerciaux, CRM, documents et tableaux de bord globaux | Oui | Oui | Dossiers et activité propres |
| Offres et ressources | Gestion | Gestion | Offres disponibles et ressources publiées |
| Encaissement des factures et règlement des commissions | Enregistrement, corrections et justificatifs | Enregistrement, corrections et justificatifs | Lecture de ses états et documents propres |
| Initialisation du registre | Oui | — | — |
| Consultation des restaurants, propriétaires, finances et factures d’abonnement | Oui | Oui | — |
| Création, modification, suppression des restaurants ou des propriétaires clients, révocation des sessions d’un propriétaire | Oui | — | — |
| Abonnements, configuration, échéances, annulation et reprise | Oui | Oui. Création et mandat de l’abonnement pour le client Stripe déjà associé au restaurant | — |
| Création, adoption ou synchronisation du client Stripe, changement de payeur qui modifie le client Stripe | Oui | — | — |
| CallSense et SMS opérationnels | Oui | Oui. Les identifiants techniques (accès SIP, rotation du jeton Twilio, clé Stripe privée) restent protégés | — |
| Comptes et privilèges administratifs | Migration manuelle initiale. Aucune interface de gestion des rôles n’a été ajoutée | — | — |
| Signature commerciale | Envoi et actions administratives autorisées | Envoi et actions administratives autorisées | Envoi de ses documents pour signature distante |

Les jetons propriétaire, employé et comptable conservent leurs périmètres. Les anciennes sessions administratives sont refusées par la nouvelle audience, et les nouvelles sessions vérifient à chaque requête le statut, le rôle et `sessionVersion`. L’accueil commercial dispose de son propre client API et de sa propre session. L’application monte les providers administrateur et restaurant seulement en dehors de `/dashboard/seller/*`.

## Inventaire

| Zone | Fichiers et mécanismes |
| --- | --- |
| Pages et accès | `client/src/pages/dashboard/seller`, `client/src/pages/dashboard/admin/seller`, `_app.page.js`, `contexts/admin.context.js`, `contexts/restaurant.context.js`, navigation et traductions admin. Les URL d’activation et de récupération utilisent `/dashboard/seller/login/activation` et `/dashboard/seller/login/forgot-password`. |
| Composants | `client/src/components/commercial` pour la connexion, la navigation, le CRM, les documents, les commissions, les ressources et le compte. `client/src/components/dashboard/admin/commerciaux` pour les fiches et les versions d’offre. Réutilisation des formulaires de connexion, de `MetricCard`, de la navigation admin et de la page de signature. |
| API commerciale | `commercial-accounts.routes.js` pour `/api/commercial/auth/*`, `/me` et les comptes sous `/api/admin/commerciaux`. `commercial-prospects.routes.js` pour les portefeuilles, interactions, réattributions, oppositions et conflits. `commercial-documents.routes.js` pour les offres et documents, avec routes PDF et envois étendues dans `admin/documents.routes.js`. `commercial-pilotage.routes.js` pour l’acquisition, les commissions, leurs justificatifs et les tableaux de bord. `commercial-resources.routes.js` pour la bibliothèque et ses téléchargements. |
| Modèles existants | `Admin` reçoit `status`, `sessionVersion` et `passwordResetHash`. `Owner` et `Employee` reçoivent `passwordResetHash`. `Document` partage `createdBy`, `firstSentAt`, `salesOwnerId`, `prospectId`, `sourceQuoteId`, `offerConditions` et `commercialDelivery`. La facture de mise en service ajoute `sourceContractId` si elle part d’un contrat, et `setupInvoice` qui porte la clé de l’établissement, le règlement unique, les corrections et l’annulation. Les documents historiques conservent leur modèle de rendu et de stockage. |
| Nouveaux modèles | `CommercialAccount`, `CommercialProspect`, `CommercialInteraction`, `CommercialEstablishment`, `CommercialOffer`, `CommercialAcquisition`, `CommercialResource`. La commission est intégrée à l’acquisition et l’audit est ciblé par dossier. Les offres et la signature partagent la collection `Document` et les renderers PDFKit existants. |
| Contraintes | Email commercial et hash d’accès uniques. Identifiants forts, lien prospect et clé de conflit uniques dans le registre lorsqu’ils existent. Version d’offre unique par type. Acquisition unique par prospect, contrat et établissement du registre. Conversion en contrat et facture active uniques par index partiels. Index de lecture par titulaire, date, statut, catégorie et ordre. |
| Sécurité et recette | `authenticate-admin.js`, `authenticate-commercial.js`, protections d’accès restaurant et sérialisation publique, `tests/commercial` avec doubles des prestataires et MongoDB loopback. Contrôles historiques vérifiés par les suites client et serveur. |

Fichiers historiques adaptés. `server/app.js` pour le montage et l’origine CORS du Dashboard, `routes/auth.routes.js`, `routes/admin/{owners,restaurants,subscriptions,documents,skello-import}.routes.js`, routes propriétaires, restaurants et contenus, ainsi que les contrôles d’autorisation CallSense. Les services de paiement, mécanismes de facturation, produits et tarifs Stripe, abonnements, webhooks et parcours de paiement n’ont pas fait l’objet d’un refactoring. Les tests historiques modifiés utilisent des sessions admin conformes au nouveau format et vérifient toujours les restrictions d’accès et leurs cas négatifs.

## Phase 7, configuration et compatibilité

La seule nouvelle variable de production obligatoire pour ouvrir l’espace commercial est `COMMERCIAL_JWT_SECRET` sur **Render**, de 32 octets minimum, aléatoire et distincte de `JWT_SECRET`. La conserver hors des variables `NEXT_PUBLIC_*` et du dépôt. Son absence laisse les connexions, invitations, activations et sessions commerciales fermées. Sa rotation invalide les sessions commerciales.

- **Vercel et Render**. `APP_URL` fournit l’origine des liens d’invitation, de récupération et de signature. Les origines CORS et SSE restent réglées dans les fichiers de chaque branche. Le build Next.js utilise directement la variable historique `NEXT_PUBLIC_API_URL` sur Vercel. Vérifier qu’elle contient la base HTTPS de l’API de l’environnement visé, terminée par `/api` sans barre finale. Vérifier les en-têtes CORS et la politique de cache sur la cible de recette.
- **MongoDB**. Vérifier la cible lue par `server/app.js` sous `CONNECTION_STRING` en production sur `main` et `CONNECTION_STRING_TEST` sur `develop`. Utiliser une topologie qui prend en charge les transactions multi-documents. Contrôler les index de conversion des contrats, de facture active par établissement, de compte, du registre et de commission. Mongoose peut les créer au chargement si `autoIndex` est actif. Examiner la charge de l’indexation sur `documents` et attendre sa fin avant de rouvrir. Vérifier `EMITTER_IBAN` et `EMITTER_BIC` dans la configuration historique avant d’ouvrir l’émission commerciale.
- **Cloudinary et Brevo**. Réutiliser les configurations existantes. Vérifier la capacité de lecture authentifiée du serveur et la non-accessibilité publique d’un fichier de recette. Vérifier le domaine expéditeur sur le parcours d’invitation et de signature. L’invitation expire après 24 h, la récupération après 1 h. Les deux utilisent le lien d’activation avec le jeton à usage unique dans le fragment. La signature conserve `/signature/:token` et sa copie signée suit la version d’offre. Les essais de prestataires de cette livraison sont simulés.
- **Conservation**. Les accès de migration utilisent l’`ENCRYPTION_SECRET` existante, distincte des clés JWT. Laisser `COMMERCIAL_OPERATIONAL_PURGE_ENABLED` absente jusqu’à validation de la politique de conservation. La valeur `1` autorise la purge manuelle confirmée par un super-admin après l’échéance des données opérationnelles.
- **Stripe et autres intégrations**. Conserver les clés, comptes, produits, tarifs, webhooks, versions et opérations actuels. Le changement de payeur applique le flux historique dans son intégralité sous `super-admin` car il modifie le client Stripe et son abonnement. Le rôle `admin` garde les opérations propres aux abonnements. Aucun test n’a contacté Stripe.

### Vérifications manuelles de `commercialacquisitions`

Pour une collection neuve, laisser Mongoose créer les index ou les créer via la procédure contrôlée du déploiement. Avant d’ouvrir les signatures, confirmer que `prospectId_1`, `contractId_1` et `establishmentId_1` sont uniques et que l’index de lecture `beneficiaryId_1_signedAt_-1` existe.

Pour un développement qui contient déjà des dossiers de l’ancien parcours, identifier la cible et sauvegarder la collection et ses index avant toute écriture. Suspendre les écritures commerciales pendant la conversion. Vérifier les index existants avec `db.commercialacquisitions.getIndexes()`. [MongoDB · Inventaire des index](https://www.mongodb.com/docs/manual/reference/method/db.collection.getindexes/)

| Élément historique | Traitement manuel |
| --- | --- |
| `restaurantId_1` | Examiner ses options dans `getIndexes()`. Un ancien index unique non partiel bloque la création de plusieurs acquisitions avant association. Après sauvegarde et contrôle des doublons, remplacer uniquement cette version par l’index unique partiel du modèle, qui porte sur les `restaurantId` de type `objectId`. Conserver un index qui satisfait déjà cette définition. [MongoDB · Index uniques et valeurs manquantes](https://www.mongodb.com/docs/manual/core/index-unique/) |
| `beneficiaryId_1_acquiredAt_-1` | Retrait facultatif après installation du nouvel index de lecture. Utiliser `db.commercialacquisitions.dropIndex("beneficiaryId_1_acquiredAt_-1")` si le nom correspond à l’inventaire. [MongoDB · Retrait ciblé](https://www.mongodb.com/docs/manual/reference/method/db.collection.dropindex/) |
| Dossiers historiques à conserver | Avant de créer l’index unique `establishmentId_1`, compléter `establishmentId` depuis le registre par `prospectId`, `signedAt` et `contractCreatedBy` depuis le contrat. Renseigner `restaurantCreatedAt` après vérification du restaurant et reprendre `commission.paidBy` depuis l’audit. Garder le bénéficiaire, le montant, les dates de règlement, la référence et le justificatif. Aligner `commercialprospects.milestones.acquiredAt` sur la signature valable si la vente est active. Laisser ce jalon absent pour une vente annulée. Examiner les anciens contrats signés sans commission individuellement. |
| `restaurantId`, `acquiredAt`, `acquiredBy`, `financialVerifiedAt` | Conserver et contrôler `restaurantId` quand il référence le restaurant historique correctement rapproché. `acquiredAt`, `acquiredBy` et `financialVerifiedAt` restent consultables pour l’audit des dossiers anciens. |
| `commission.approvedAt`, `commission.approvedBy` | Nettoyage physique facultatif après sauvegarde et vérification des dossiers migrés. Retirer les deux champs avec `db.commercialacquisitions.updateMany({ _id: { $in: idsVérifiés } }, { $unset: { "commission.approvedAt": "", "commission.approvedBy": "" } })`. Si une décision précédente doit rester consultable, conserver auparavant l’export de son audit. |
| Anciens événements de validation manuelle | Dans la copie fictive, les anciens événements `ACQUIRED`, `VERIFY`, `APPROVE` et `SALE_VALIDATED` de `commercialacquisitions.activity` ont été retirés. Dans le développement habituel, ce nettoyage reste facultatif. Pour les dossiers fictifs vérifiés et après export, appliquer `$pull: { activity: { action: { $in: ["ACQUIRED", "VERIFY", "APPROVE", "SALE_VALIDATED"] } } }` sur leurs identifiants. Les événements de règlement, de contestation et les justificatifs sont à conserver. |
| Ancien statut d’attente et anciennes commissions à payer | Conversion nécessaire si des dossiers existent. Après vérification, convertir `PENDING_VALIDATION` en `WAITING_CUSTOMER_PAYMENT`. Ramener aussi un ancien `TO_PAY` à cet état tant qu’aucun dossier ne justifie l’encaissement client intégral. Les règlements historiques déjà enregistrés gardent leur état et leur historique. Utiliser l’action de recette ou d’exploitation appropriée pour constater les encaissements réellement reçus. |
| `documents.sourceQuoteId_1` | Retrait obligatoire si l’index unique sparse existe. Il empêche un même devis d’alimenter un contrat et une facture. Créer et vérifier d’abord le nouvel index unique partiel `sourceQuoteId_1_type_1`, applicable aux contrats ayant un identifiant source, et l’index unique partiel `setupInvoice.establishmentId_1` des factures actives. En maintenance, après inventaire et sauvegarde, utiliser `db.documents.dropIndex("sourceQuoteId_1")` si son nom correspond. |

### Règlements de l’ancienne version dans la base de développement habituelle

La base habituelle n’a pas été ouverte. Si le précédent parcours commercial y a servi, suspendre les écritures commerciales et exporter les documents concernés avec les acquisitions associées. La requête d’inventaire en lecture est `db.documents.find({ type: "INVOICE", $or: [{ "setupInvoice.receivedCents": { $exists: true } }, { "setupInvoice.receipts": { $exists: true } }] })`. Un résultat vide dispense de cette reprise.

1. Pour chaque facture dont le règlement intégral reste confirmé, conserver `setupInvoice.paidAt` et renseigner `paidBy` depuis `recordedBy`, `paymentReference` depuis `reference` si disponible et `paymentRequestId` depuis `requestId`. Si plusieurs virements anciens ont soldé la facture, conserver le détail dans l’export et valider manuellement la date du solde, l’auteur et l’identifiant de reprise. Dans `setupInvoice.paymentCorrections`, reprendre `requestId`, `paidAt`, `paidBy` depuis `recordedBy`, `reference` si disponible, `correctedAt` depuis `reversedAt`, `correctedBy` depuis `reversedBy` et `reason` depuis `reversalReason`. Conserver aussi le détail des versements partiels dans l’export. Rapprocher tout versement réel qui laisse la facture non soldée avant de supprimer le détail en base.
2. Rapprocher les commissions reliées par `commission.paymentInvoiceId`. Une facture demeurée impayée laisse la commission non versée en `WAITING_CUSTOMER_PAYMENT`, sauf contestation ou annulation. Conserver toute commission déjà versée et son audit. Vérifier que les commissions `TO_PAY` pointent vers une facture active et payée du bon dossier.
3. Une fois la reprise vérifiée, retirer les deux champs obsolètes sur les seuls identifiants contrôlés avec `db.documents.updateMany({ _id: { $in: idsValidés }, type: "INVOICE" }, { $unset: { "setupInvoice.receivedCents": "", "setupInvoice.receipts": "" } })`. Relancer l’inventaire et vérifier les deux index d’unicité de `documents` ainsi que les PDF des factures émises.
| `commercialprospects.stage: "CONTRACT_SIGNED"` | Si cette ancienne valeur a été stockée dans des données d’essai, corriger le statut manuel après revue du dossier. L’acquisition se lit désormais dans le jalon issu de la signature, qui reste dans l’historique. |

En cas de doublon ou d’identité ambiguë, examiner les dossiers et conserver l’audit avant d’installer l’index. Vérifier ensuite, en recette, que deux établissements distincts enregistrent chacun une commission avant la création de leurs restaurants. La copie de recette a été constituée dans une base neuve en conservant les dossiers et les fichiers simulés d’origine. Aucune migration ni synchronisation destructrice d’index n’est lancée au démarrage.

### Mise en service et modification manuelle des deux comptes

1. Le propriétaire relève les identifiants des deux documents `admins`, leurs rôles, statuts, versions et éventuels défis de réinitialisation, puis consigne les versions déployées et sauvegarde la base et ses index. Garder les sauvegardes et les empreintes de mots de passe dans l’environnement d’exploitation. Vérifier qu’il existe exactement un document pour chaque identité attendue. Le scénario de recette couvre le compte historique `seller` et le compte personnel `admin`.
2. Mettre le back-office et les points d’entrée admin en maintenance à la passerelle, avec `COMMERCIAL_JWT_SECRET` absente. Fermer aussi les chemins directs et les anciens hôtes accessibles. L’ancienne version accepte des JWT administratifs historiques portant `seller`. Déployer le backend de la nouvelle version, drainer ou arrêter toutes les anciennes instances et vérifier l’identité des instances restantes avant de laisser entrer du trafic admin. Publier le frontend correspondant sous la même fenêtre. Contrôler que les nouveaux chemins existent et que les anciens chemins frontend renvoient 404.
3. Sur la cible vérifiée, le propriétaire exécute les deux mises à jour suivantes dans une transaction MongoDB. Filtrer par `_id` et rôle courant, contrôler `matchedCount === 1` pour chaque mise à jour et annuler la transaction si le compte, le rôle, le statut ou la version de départ ne correspond pas au relevé. `sessionVersion` doit être un entier non négatif ou un champ absent sur un document historique. Traiter séparément toute valeur atypique avant de poursuivre. Laisser le mot de passe existant.

   | `_id` à renseigner par le propriétaire | Filtre de rôle | Mise à jour MongoDB |
   | --- | --- | --- |
   | Compte personnel | `role: "admin"` | `{ $set: { role: "super-admin", status: "ACTIVE" }, $inc: { sessionVersion: 1 }, $unset: { resetCode: "", resetCodeExpires: "", passwordResetHash: "" } }` |
   | Compte administratif historique | `role: "seller"` | `{ $set: { role: "admin", status: "ACTIVE" }, $inc: { sessionVersion: 1 }, $unset: { resetCode: "", resetCodeExpires: "", passwordResetHash: "" } }` |

4. Confirmer les deux rôles et l’incrément des versions, la présence d’un `super-admin` actif et l’absence de `seller` dans `admins`. Vérifier que les JWT antérieurs sont refusés, reconnecter les deux comptes et contrôler la matrice avec des lectures et des refus de permission. Les anciennes sessions propriétaires et employés continuent d’utiliser le secret existant. Vérifier les parcours documentaires historiques et le fonctionnement de la signature dans l’environnement de validation.
5. Sous le nouveau `super-admin`, ouvrir `/dashboard/admin/seller/prospects` et sélectionner « Initialiser le registre ». Pour la durée de la lecture initiale, suspendre les mutations administratives des identités de restaurant. L’action ne lit que les éléments d’identité utilisés pour le rapprochement. Elle relie les restaurants existants, est idempotente et expose son état. Contrôler le passage à prêt via l’interface ou `/api/admin/commerciaux/crm/registry`, examiner la file de conflits et rétablir les mutations. En cas d’erreur, diagnostiquer avant de relancer et garder les invitations fermées.
6. Après ces contrôles et seulement après évacuation des anciennes instances, configurer `COMMERCIAL_JWT_SECRET` de façon identique sur les nouvelles instances. Vérifier la connexion, la récupération, les sessions isolées et la fermeture des accès avec un compte de validation dans l’environnement approprié. Après approbation des règles métier et publication des versions d’offre correspondantes, ouvrir les invitations depuis l’interface. Les créations, révocations, réattributions, ressources, offres et décisions de commission courantes se font dans Gusto Manager.

### Retour arrière

1. Refermer les accès administratifs à la passerelle et isoler tous les hôtes directs. Arrêter l’ouverture de comptes et retirer ou faire tourner `COMMERCIAL_JWT_SECRET` sur toutes les instances. Attendre la fin du routage vers les instances précédentes. Conserver une sauvegarde des nouveaux dossiers, versions d’offre, commissions, fichiers privés et traces administratives. Ne jamais copier de compte `CommercialAccount` vers `admins`.
2. Préférer le retour vers une version qui conserve le nouveau contrôle des sessions admin. Si une ancienne version est indispensable, garder le back-office fermé tant que le propriétaire n’a pas vérifié la compatibilité des rôles et invalidé les JWT que cette version pourrait honorer. Restaurer la configuration sauvegardée de manière ciblée. Pour un backend historique qui lit le rôle directement dans le JWT et accorde des droits à `seller`, une rotation de `JWT_SECRET` est nécessaire avant toute réouverture et entraîne une reconnexion des utilisateurs qui partagent ce secret. Ne rétablir le rôle historique `seller` que si ce retour est indispensable et si l’accès historique correspondant est expressément voulu.
3. Conserver les collections et index tant que les données postérieures à la bascule doivent rester disponibles. En cas de reprise sur ancienne version, maintenir les nouveaux documents commerciaux hors des circuits d’édition historiques ou garder les routes documents correspondantes en maintenance jusqu’au retour sur une version compatible. Les anciennes versions ne savent pas relayer les nouveaux PDF privés. Avant réouverture, vérifier les comptes autorisés, le refus des JWT pré-bascule et les accès historiques, puis contrôler que les invitations et l’espace commercial restent fermés.

## Décisions métier avant ouverture

- Éligibilité et échéance de l’offre fêtes, traitement du premier choix Cartes cadeaux, signature après échéance et conditions après 24 mois.
- Fiscalité, unité SMS, périmètre des frais bancaires, jours calendaires ou ouvrés et correspondances de facturation.
- Exigibilité des commissions, date de fixation du barème, signature en présence, révocation par le commercial et conservation des données.

La mise en production, la bascule des comptes de production et la validation des conditions commerciales sont réservées au propriétaire. Une transaction autorisée séparément a modifié les deux documents `admins` désignés dans la base de développement habituelle. Le nom de base et le cluster sont distincts de ceux de production. Le compte du propriétaire est `super-admin` et le compte de Thomas est `admin`. Les deux ont `status: "ACTIVE"` et `sessionVersion: 1`. Seuls ces trois champs ont été écrits, sans fichier de migration. Les autres essais ont utilisé des bases isolées et des prestataires simulés.

## Contrôle final

- **Audit du support.** `ae071288` a introduit les traces `[support-audit]` dans `server/routes/auth.routes.js` pour la connexion du support et `server/middleware/authentificate-token.js` pour les requêtes restaurant. La roadmap commerciale avait laissé leur verbosité historique intacte. Le filtre final écarte les lectures courantes réussies, préserve les mutations, les révélations, exports et téléchargements sensibles, ainsi que les refus pour une session de support dont le JWT est vérifiable. Les audits métier ciblés, notamment en RH, conservent leurs propres mécanismes. Le JWT de support garde le rôle `owner` et `authMethod: "super_admin"` issu de `SUPER_ADMIN_PASSWORD_HASH`. Le JWT du rôle administratif `super-admin` utilise une audience distincte.
- **Sessions.** Le JWT commercial expire 72 heures après la connexion et l’interface renvoie alors vers la connexion. Les jetons commerciaux antérieurs sans échéance nécessitent une nouvelle connexion. Le compte et son rôle sont vérifiés à chaque requête, avec contrôle du statut et de la version. La révocation, la migration de rôle, le changement de mot de passe et la désactivation restent effectifs. Les anciens JWT admin dépourvus d’audience et d’émetteur sont refusés. Les échéances des liens d’invitation, de récupération, de signature et de téléchargement sont distinctes. Le stockage seller survit au rechargement du même onglet. Une fermeture normale termine cette session de page. Certains navigateurs peuvent la restaurer avec l’onglet. Le bouton de déconnexion efface le jeton de l’onglet, et la désactivation le rend immédiatement inutilisable côté serveur dans tous les onglets. [MDN — sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
- **Documents et confidentialité.** La réattribution change le titulaire. Les tests vérifient la conservation du créateur historique, des données de signature, des empreintes et des octets du PDF signé. L’ancien titulaire perd l’accès à la fiche et au PDF. Le bénéficiaire de la commission historique reste le même. Les réponses seller de commission contiennent les montants, états et dates utiles. Les références de règlement et justificatifs sont administratifs. Le parcours seller conserve les protections d’accès direct, de périmètre des recherches, de cache et de SSE. Les refus de détection des établissements clients utilisent un message uniforme et des tentatives limitées. Un succès ou un refus reste un signal d’inférence résiduel.
- **Historique.** Les modifications des routes Stripe concernent les autorisations. L’examen du diff couvre les routes historiques, les sérialisations publiques et les nouveaux champs facultatifs. Les services de facturation, webhooks, dépendances et protections de paiement n’ont pas été remaniés. Les données de recette et les doubles de prestataires sont chargés exclusivement par les scripts de `tests/commercial` sur loopback avec `NODE_ENV=test`.

### Mise en production confirmée sur documentation

- **Obligatoire.** Contrôler la branche et le commit réellement servis par Render, la variable lue par cette révision et la cible MongoDB. Le `develop` local lit `CONNECTION_STRING_TEST`. La documentation interne indique `CONNECTION_STRING` pour le code de production. Bloquer le trafic vers les instances historiques avant de changer les rôles, attendre la fin du basculement Render, vérifier les deux nouveaux rôles et connecter Vercel à l’API canonique de production. Configurer la nouvelle clé serveur puis ouvrir l’espace après vérification. Les transactions MongoDB nécessitent un replica set ou un cluster shardé compatible. Les variables Vercel s’appliquent à une nouvelle version, et un rollback réutilise celles de son artefact. [Déploiements Render](https://render.com/docs/deploys) · [Variables Vercel](https://vercel.com/docs/environment-variables) · [Transactions MongoDB](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)
- **Selon l’infrastructure.** Le mode maintenance Render est une option réservée aux services web payants. Il ferme l’accès public et laisse le réseau privé accessible. S’il est utilisé, vérifier également les chemins privés et les hôtes directs avant l’ouverture. Si le contrôle du trafic et l’évacuation des anciennes instances ne sont pas garantis, différer la bascule. Lors d’un rollback, vérifier les variables de la version restaurée. Render peut réutiliser celles du déploiement cible et ne restaure pas automatiquement le contenu des groupes d’environnement. Aucun panneau de production n’a été ouvert pour vérifier la configuration de Gusto Manager. [Maintenance Render](https://render.com/docs/maintenance-mode) · [Rollback Render](https://render.com/docs/rollbacks) · [Rollback Vercel](https://vercel.com/docs/instant-rollback)

### Résultats rejoués après les corrections

- **29 tests API commerciaux**, **181 tests frontend** et **1 013 tests historiques serveur** réussis, sans échec ni test ignoré. Le build Next.js du Dashboard a généré **185 pages statiques**. Les avertissements historiques de lint et d’optimisation des polices distantes sont signalés dans le log du build.
- Chrome sur l’environnement manuel. Alice est restée connectée après rechargement. Un nouvel onglet ouvert directement a demandé une connexion commerciale. Les requêtes d’Alice observées après recharge se limitaient à `/api/commercial/me` et `/api/commercial/dashboard`. La vue administrative a affiché huit prospects, Benoît a retrouvé ses six onglets et ses contrats sans afficher la fiche d’Alice, et le rôle admin a ouvert Abonnements. Le rendu SSR a été vérifié après correction du répertoire de travail du lanceur local. Les largeurs 1440, 1024, 768 et 390 px de la fiche ont été contrôlées sans débordement horizontal.
- Les quatre connexions, les cinq états de commission et le téléchargement d’un PDF privé ont été vérifiés sur l’API de recette manuelle. Après redémarrage de l’API, le PDF et les états étaient toujours disponibles, et la réponse seller excluait la référence du règlement.

## Recette manuelle isolée

- [Connexion administrative](http://localhost:8002/dashboard/admin/login), puis « Commerciaux » dans le menu.
- [Connexion commerciale](http://localhost:8002/dashboard/seller/login). Les sessions seller sont propres à l’onglet.

| Rôle fictif | Email |
| --- | --- |
| Super-admin | `super-admin@gusto-recette.invalid` |
| Admin | `admin@gusto-recette.invalid` |
| Alice | `alice@gusto-recette.invalid` |
| Benoît | `benoit@gusto-recette.invalid` |

Pour ces quatre comptes locaux, utiliser `recette-commerciale-fictive` comme mot de passe. La recette utilise la copie `gusto_commercial_user_review_v4`. Les deux portefeuilles contiennent des relances, rendez-vous, devis, factures et contrats. Les coordonnées bancaires de cette recette sont fictives.

| Dossier | État à inspecter |
| --- | --- |
| La Brasserie fictive | Facture en brouillon |
| La Terrasse fictive | Facture envoyée, aucune somme encaissée |
| L’Ardoise fictive | Contrat signé, facture envoyée de 250 € |
| La Table fictive | Facture réglée, commission à payer |
| Le Jardin de Recette | Facture réglée, commission reçue |
| Le Comptoir fictif | Facture annulée |
| La Verrière de Recette | Contrat signé, commission en attente et facture à créer |

1. Comme admin, ouvrir « Commerciaux », puis « Marquer comme payée » sur une facture à encaisser. Enregistrer le règlement fictif et vérifier que la commission rejoint « Commissions à payer » si le contrat est signé. Pour rejouer le cas, ouvrir la facture, corriger le règlement avec un motif et vérifier son retour dans la file. « Le Jardin de Recette » illustre un règlement commercial historique alors que le restaurant reste à créer.
2. Comme Alice, ouvrir un dossier, puis créer un devis sous l’offre fictive standard. Prévisualiser le PDF et convertir le devis en facture ou en contrat. Signer un contrat fictif depuis la boîte de recette. Sans encaissement intégral, la commission reste en attente du règlement client.
3. Envoyer un contrat pour signature ou demander une invitation de compte. Les liens figurent dans le dernier message simulé du fichier local `/private/tmp/gusto-commercial-user-review-current/outbox.ndjson`. Ouvrir uniquement ce lien local. Les messages restent dans cette boîte de recette.
4. Se connecter comme Benoît dans un autre onglet pour vérifier le portefeuille, puis ouvrir « Ressources » et télécharger « Exemple de devis fictif ». Depuis l’administration, le statut et le titulaire se vérifient dans les onglets individuels. Utiliser un prospect de test pour essayer la réattribution.

Les trois processus de recette écoutent uniquement sur la boucle locale. Le frontend utilise l’origine historique `http://localhost:8002`, l’API 8112 et MongoDB 27089. La copie temporaire est compilée avec `NEXT_PUBLIC_API_URL=http://127.0.0.1:8112/api`. Pour redémarrer après l’arrêt des processus, exécuter les trois blocs dans des terminaux séparés, à la racine de `gusto-manager` sur `develop`. Si seul un service s’est arrêté, relancer uniquement son bloc.

```sh
fixture="$(readlink /private/tmp/gusto-commercial-user-review-current)"
env -i PATH=/usr/bin:/bin \
  /private/tmp/gusto-commercial-mongo.TkAwZZ/mongodb-macos-x86_64--8.0.17/bin/mongod \
  --dbpath "$fixture/db" --bind_ip 127.0.0.1 --port 27089 \
  --replSet gustoCommercialRecette --nounixsocket \
  --setParameter diagnosticDataCollectionEnabled=false --logpath "$fixture/mongo.log"
```

```sh
fixture="$(readlink /private/tmp/gusto-commercial-user-review-current)"
(cd server && env -i PATH=/usr/bin:/bin NODE_ENV=test PORT=8112 \
  APP_URL=http://localhost:8002 NEXT_PUBLIC_API_URL=http://127.0.0.1:8112/api \
  GUSTO_COMMERCIAL_TEST_FILES_DIR="$fixture/assets" \
  GUSTO_COMMERCIAL_TEST_MONGO_URI='mongodb://127.0.0.1:27089/gusto_commercial_user_review_v4?replicaSet=gustoCommercialRecette' \
  /Users/leo/.nvm/versions/node/v24.22.1/bin/node tests/commercial/start-browser-review.cjs)
```

```sh
fixture="$(readlink /private/tmp/gusto-commercial-user-review-current)"
env -i PATH=/usr/bin:/bin NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
  /Users/leo/.nvm/versions/node/v24.22.1/bin/node "$fixture/client/node_modules/next/dist/bin/next" \
  start "$fixture/client" --hostname 127.0.0.1 --port 8002
```

Le répertoire temporaire contient la base, les PDF simulés, la boîte fictive et le lanceur. Pour recompiler la copie du frontend, passer `NEXT_PUBLIC_API_URL` au build. Next fige cette valeur dans l’artefact compilé. Si les polices externes sont indisponibles, Next utilise ses ressources locales de repli.

Le backend génère des secrets fictifs à chaque démarrage, ce qui demande une nouvelle connexion. Le dossier peut être purgé lors d’un redémarrage de macOS. Cet environnement sert à la recette de la machine locale.

## Améliorations après recette utilisateur · 26 novembre 2026

### CRM et statuts

- [x] Tableau partagé entre le CRM global, le CRM individuel et le vendeur. Restaurant, contact, statut, dernier contact et relance disposent d’en-têtes. Le CRM global affiche aussi le responsable. Sur petit écran, les coordonnées utiles sont regroupées et le tableau reste à la largeur de la page.
- [x] Vue Pipeline avec les mêmes filtres que la liste, des compteurs calculés par le serveur et dix cartes par colonne. Une colonne se pagine indépendamment. Les cartes ouvrent la fiche du prospect. Le changement de statut s’effectue dans la fiche.
- [x] Statuts ordinaires modifiables sur les dossiers actifs. À contacter, Contacté, Intéressé, En négociation, Non intéressé et Perdu. Les anciennes étapes `APPOINTMENT` et `DEMO` se lisent respectivement comme Intéressé et En négociation. Les valeurs et interactions historiques restent en base.
- [x] Étapes automatiques issues du moteur documentaire et de l’acquisition. Un envoi confirmé compte même si le lien expire ou est révoqué. Une signature valide prime sur les envois. Les jalons tardifs restent dans l’historique et les dossiers Perdu ou Non intéressé restent clôturés. Une acquisition administrative validée prime sur ces statuts. L’opposition reste un état prioritaire et verrouille la prospection. L’archivage retire le dossier des vues actives et annule ses actions planifiées en conservant leur trace. Un vendeur ne peut enregistrer ni acquisition ni commission.
- [x] Fiche prospect avec coordonnées, besoins, notes, prochaines actions, documents filtrés et chronologie paginée. Les raisons administratives privées restent masquées au vendeur. Les brouillons créés depuis une fiche utilisent la version d’offre publiée et le titulaire du dossier. Les envois et signatures conservent leur moteur existant.

### Calendrier et pilotage

- [x] Calendrier partagé aux URL `/dashboard/seller/calendar`, `/dashboard/admin/seller/calendar` et `/dashboard/admin/seller/accounts/:id/calendar`. Mois, semaine, jour, filtres, navigation, sélection de créneau et légende. Sur mobile, la semaine défile à l’intérieur du calendrier et une liste reprend les événements de la période. La navigation et l’édition sont possibles depuis une fiche prospect ou le tableau de bord.
- [x] Réutilisation de `react-big-calendar`, déjà présent dans le Dashboard, et de `planning-grid.utils.mjs` pour les périodes, la navigation et la conversion des heures de Paris. Le calendrier commercial charge ses propres données. Les relances peuvent être sans horaire. Un événement peut exister sans prospect et garde son état Planifié, Réalisé ou Annulé. Un événement planifié dont la date est passée reste à traiter.
- [x] Les champs facultatifs de planification, de réalisation et de traçabilité sont portés par `CommercialInteraction`. Une ancienne date de relance ou de rendez-vous apparaît comme événement existant. La première action qui la modifie, la réalise ou l’annule enregistre une interaction et retire le champ historique dans la même transaction. La réattribution transfère les actions ouvertes et les compteurs historiques restent attribués au commercial les ayant réalisées. Les dossiers, calendriers et tableaux de bord lisent les mêmes échéances. Les démonstrations et rendez-vous comptent à leur réalisation, y compris les interactions historiques. Une action répétée concurrente ne compte qu’une fois.
- [x] Offres et tarifs. La liste indique les tarifs mensuels, la mise en service, les prestations, l’engagement, la validité et la publication. Les commissions ont les libellés propres à chaque espace et conservent les cinq états techniques et l’enregistrement manuel du règlement.

### Contrats d’API

| Routes | Comportement |
| --- | --- |
| `GET /api/commercial/prospects` et `GET /api/admin/commerciaux/crm/prospects` | Filtres sur le statut effectif. `view=pipeline` retourne les compteurs et la première page par étape. `column=true&stage=…&page=…` pagine l’étape. Le nom du responsable figure dans les réponses admin. |
| `GET …/prospects/:id/interactions?timeline=true` | Chronologie des interactions, réalisations, annulations, changements de statut et faits documentaires du prospect. |
| `GET /api/commercial/calendar` et `GET /api/admin/commerciaux/crm/calendar` | `from` inclus et `to` exclu en jours de Paris, sur 62 jours au plus. Filtres `type` et, pour l’administration, `salesOwnerId`. `prospectId=…&upcoming=true` renvoie les actions ouvertes du dossier. Les réponses signalent une liste plafonnée et invitent à affiner la période ou les filtres. |
| `POST …/calendar` et `PATCH …/calendar/:id` | Création, édition, réalisation et annulation. Le serveur contrôle le propriétaire, l’affectation du prospect et l’état modifiable. Les actions sur les événements passés restent traçables. |
| `GET /api/admin/commerciaux/documents/offers` et `POST /api/admin/commerciaux/documents?salesOwnerId=…` | Offres utilisables et création d’un brouillon lié à la fiche, via le mécanisme documentaire commun. |
| `GET …/dashboard` | Actions issues du calendrier, démonstrations à venir, rendez-vous réalisés et activité récente. Acquisition et commissions conservent leurs mécanismes d’origine. |

La recette utilise le jeu fictif conservé sur MongoDB 27089. Les courriels, fichiers et paiements sont simulés. Aucune migration de données, nouvelle collection, dépendance, notification automatique ou tâche périodique n’est requise pour cette phase.

### Résultat de recette

- **35 tests API commerciaux, 181 tests frontend et 1 013 tests historiques serveur.** Aucun échec ni test ignoré dans les exécutions finales. Un test historique d’isolation des notifications a échoué ponctuellement lors d’un passage en parallèle. La suite frontend complète est passée en série. Le build du Dashboard a généré 187 pages statiques. Il signale encore les avertissements historiques de lint et l’indisponibilité des polices distantes dans le build isolé.
- **Parcours intégré en API.** Un même prospect passe par rendez-vous et démonstration réalisés, devis envoyé, contrat envoyé et signé, acquisition administrative, validation puis enregistrement fictif du règlement. La recette couvre les refus pour les mauvais titulaires, les statuts automatiques interdits en modification directe, les réalisations concurrentes, plusieurs documents, la révocation, l’expiration, le changement d’heure et l’accès à un compte désactivé.
- **Chrome.** Contrôles du tableau global, des filtres et du pipeline, des calendriers global, individuel et vendeur, des vues Mois, Semaine et Jour. Une relance d’Alice créée depuis le prospect a été reprogrammée puis réalisée. Son historique et son tableau de bord l’ont reflétée. Un rendez-vous autonome a été annulé. Un rendez-vous créé dans la fiche de Benoît est apparu dans son propre compte. Sa désactivation l’a renvoyé vers la connexion et son compte fictif a été réactivé ensuite. Le devis lancé depuis la fiche a prérempli le prospect. Les offres et les cinq libellés de commissions ont été contrôlés dans chaque espace concerné.
- **Responsive.** Pipeline et calendrier mesurés dans Chrome à 1440 × 900, 1024 × 768, 768 × 1024 et 390 × 844. Aucun défilement horizontal de la page. Les colonnes du pipeline et la semaine du calendrier défilent dans leur propre panneau sur les écrans étroits.

## Première passe UX vendeur et administration · 27 novembre 2026

- En-tête commercial commun inspiré de l’espace personnel des employés. Dans l’administration, le titre, l’identité du commercial et les actions principales précèdent les onglets. Le retour à l’équipe reste visible depuis chaque onglet individuel, y compris lorsqu’un document est ouvert.
- Le tableau de bord vendeur ouvre sur les relances et rendez-vous à traiter. Les prospects intéressés ou en négociation, les brouillons de devis et les contrats en attente de signature ouvrent les listes filtrées. L’administration conserve les indicateurs d’équipe et ses actions de vérification.
- Le CRM mutualise le tableau, le pipeline et les fiches. Le calendrier reprend les contrôles du planning, les vues de `react-big-calendar` et la lecture en liste sur petit écran. Le bandeau de la fiche prospect réunit les coordonnées, le statut et les actions. L’historique reste accessible dans la même fiche.
- Les listes de devis et contrats partagent le tableau et les badges. Le formulaire de brouillon distingue l’établissement, l’offre et le récapitulatif du tarif de base. Le total avec options est celui calculé par le serveur à l’enregistrement. Les détails et PDF administratifs utilisent le composant documentaire historique dans le périmètre commercial.
- Les commissions affichent une synthèse par état et un historique détaillable. L’administration garde ses actions de validation et de règlement. Les comptes, offres et ressources utilisent les mêmes en-têtes, formulaires et badges. Le vendeur retrouve ses coordonnées et ses réglages de sécurité dans un profil distinct.
- Les changements d’API concernent la lecture. Les commissions acceptent `summary=true` dans leur périmètre autorisé. Les documents acceptent le filtre de signature en attente et exposent le statut utile à l’affichage. Les tableaux de bord exposent les compteurs correspondants. Les schémas, les autorisations et les mécanismes métier d’écriture gardent leurs règles existantes.

Les composants partagés sont dans `client/src/components/commercial`. Les écrans de gestion des comptes et des offres sont dans `client/src/components/dashboard/admin/commerciaux`. Les points d’entrée restent sous `client/src/pages/dashboard/seller` et `client/src/pages/dashboard/admin/seller`. Les styles ajoutés ciblent les classes commerciales.

### Ajustements après retour visuel

- Les en-têtes vendeur et admin utilisent une ligne compacte. Le titre, l’éventuel statut de compte et l’action principale sont alignés. Dans la fiche individuelle, le bouton retour reste à côté du nom. Les onglets textuels suivent le titre et défilent dans leur propre zone sur mobile.
- Les badges n’ont plus de marqueur décoratif. La colonne Statut des devis et contrats centre les libellés et dates sur le même axe. Les montants et les statuts de commission occupent des colonnes stables sur ordinateur.
- Sur mobile, le bouton rond de navigation garde sa position habituelle. La fiche individuelle aligne le nom et le statut à sa droite, avec le lien « Tous les commerciaux » sous le nom. Sur ordinateur, le retour conserve sa place à gauche du nom.
- Dans le formulaire, « Cartes cadeaux (offert) » apparaît coché et désactivé lorsque le module est inclus dans l’offre. La mention des 24 mois reste visible. Les champs Tablettes et Matériels de pointage disposent de plus d’espace sous leur libellé.
- L’acquisition clôt les relances de prospection ouvertes et conserve leur trace dans l’historique. Les dossiers acquis avant la correction sont exclus des listes de relances et des compteurs à la lecture. Les rendez-vous de suivi du client restent planifiables.

### Vérifications

- Chrome à 1440 × 900, 1024 × 768, 768 × 1024 et 390 × 844. Parcours des huit rubriques administratives, des sept onglets individuels et des huit pages vendeur. Vérification de la navigation mobile, du pipeline, des fiches prospects, des vues calendrier, de la modale, du préremplissage d’un devis, de l’aperçu PDF, des offres, du profil et des filtres de commissions. La liste de Benoît et celle d’Alice contiennent leurs propres prospects. L’activation a été ouverte sans soumettre le formulaire.
- Après le retour visuel, Chrome a confirmé le centrage des badges et des dates dans les listes de devis et contrats aux quatre tailles. La fiche de Benoît affiche un en-tête de 48 px sur ordinateur. Le tableau de bord vendeur affiche un en-tête de 48 px à 390 px et l’action Planifier ouvre le formulaire. L’onglet courant reste visible après passage sur mobile.
- Les exécutions finales des suites métier comptent 35 tests API commerciaux et 1 013 tests historiques serveur. Les lectures des commissions et des signatures ont été vérifiées avec des comptes distincts et des données fictives. La suite frontend compte 181 tests. Le build Next.js a généré 187 pages statiques.
- La suite API commerciale couvre la clôture des relances et les dossiers déjà acquis (36 tests réussis). Chrome confirme que les cinq clients acquis de l’administration et les trois du compte vendeur d’Alice affichent une prochaine relance vide. Les prospects actifs gardent leurs dates et leurs indicateurs de retard.
- Chrome a vérifié la fiche individuelle à 320, 390, 768 et 1440 px. À 390 px, le bouton rond, l’identité et l’action « Planifier » tiennent sur une ligne. Le menu s’ouvre et se ferme, et « Tous les commerciaux » ramène à la liste.

## Historique de la recette avant la facturation commerciale · 27 novembre 2026

- Cette passe avait supprimé le rattachement manuel à un restaurant et la vérification financière séparée. Le parcours de validation manuelle a depuis été retiré au profit du cycle de facturation décrit plus haut.
- Le formulaire de rattachement et de vérification du montant disparaît des commissions. Le lien vers le contrat signé dans les files utilise le titulaire actuel du document. La commission conserve le bénéficiaire figé à la signature.
- Les en-têtes commerciaux reprennent les conventions historiques. Le compte seller est accessible dans chaque en-tête. Les rubriques administratives restent sous le titre et l’identité du commercial est visible dans sa fiche. Les tableaux de bord présentent les prochaines actions, l’évolution des devis, signatures et ventes sur les dates choisies, et les résultats d’équipe. Le calendrier reste partagé entre les trois périmètres.
- Le devis affiche le détail du prix et le total mensuel dès la sélection des modules ou équipements. Le serveur calcule le montant final à l’enregistrement. « Création documents » utilise une liste inspirée de la gestion du personnel. Les colonnes s’alignent sur ordinateur et se réorganisent par document sur petit écran. Les filtres et actions documentaires restent disponibles.
- Recette isolée en série. **38 tests API commerciaux, 181 tests frontend et 1 013 tests serveur historiques réussis.** Le build Next.js génère **187 pages statiques**. Les avertissements de lint préexistants et le saut d’optimisation des polices distantes restent signalés. Les cas rejoués couvrent notamment la panne pendant la transaction de signature, les opérations concurrentes, les signatures répétées, les établissements déjà clients, le règlement facultativement référencé, la réattribution, le rapprochement d’un restaurant et le cloisonnement des accès.
- Dans Chrome, les rubriques seller et admin et les sept onglets de la fiche individuelle ont été parcourus aux tailles 1440 × 900, 1024 × 768, 768 × 1024 et 390 × 844. Les inspections incluent les en-têtes, les trois files, le tableau documentaire et ses filtres, le pipeline, une fiche prospect, le calendrier et l’ouverture de ses vues, les commissions et le compte seller. Un devis fictif avec SMS et deux tablettes affichait **128,90 € par mois**, montant ensuite confirmé à l’enregistrement.
- La comparaison Chrome inclut le Dashboard administrateur, le Dashboard de « Le Bistro de Recette », la liste de son personnel et ses plannings équipe et employé. Le portail employé se trouve sous `/dashboard/my-space`. Deux salariés et l’option Personnel ont été ajoutés exclusivement au restaurant fictif de la copie de recette.

## Recette de la facturation commerciale

- Mes factures est accessible sous `/dashboard/seller/invoices`. L’administration consulte les factures dans Documents et dans l’onglet Factures de chaque fiche. Le règlement client est enregistré sous `POST /api/admin/commerciaux/documents/:id/settlement`. Les opérations `record`, `reverse` et `cancel` concernent exclusivement une facture commerciale émise. La file `GET /api/admin/commerciaux/pilotage/actions/invoices` remplace celle des ventes à valider.
- Le service transactionnel de vente protège les arrivées concurrentes de la signature et de l’encaissement. Les reprises du même encaissement utilisent le même identifiant de demande. La commission et son bénéficiaire restent uniques. Une facture annulée est conservée avec son PDF, et un devis source utilisé par un document commercial est conservé.
- Le branchement `validate-sale`, le service correspondant, la file et les libellés de validation, les champs `commission.approvedAt` et `commission.approvedBy` et l’étape de pipeline `CONTRACT_SIGNED` ont été retirés. Le cas `CONTRACT_SIGNED` reste un événement de signature dans l’historique documentaire. L’unicité d’une conversion en contrat utilise désormais un index partiel. L’unicité de la facture active repose sur le registre.
- Vérification du PDF commercial avec les coordonnées fictives de la recette. Une page, une ligne de 250 € pour la mise en service, mentions historiques et coordonnées bancaires. La conversion a été vérifiée au format tablette et les listes seller et individuelles à 390 px. Les factures commerciales apparaissent aussi dans « Création documents ».
- Les suites isolées ont terminé avec **40 tests commerciaux, 181 tests frontend et 1 013 tests serveur historiques réussis**, sans échec ni test ignoré. Les 20 tests ciblés Documents et Pilotage repassent après la dernière correction de l’audit. Le build Next.js a généré **189 pages statiques**. Les avertissements de lint historiques et les téléchargements de polices externes indisponibles en recette restent signalés.
- Les index uniques partiels `sourceQuoteId_1_type_1` et `setupInvoice.establishmentId_1` ont été contrôlés physiquement dans la copie. L’ancien index de conversion, les champs de validation et l’ancienne étape de pipeline sont absents. Chrome a vérifié l’isolation des factures d’Alice et de Benoît.

## Règlement unique et files administratives

- Retrait du statut « Partiellement réglée », du cumul des versements, du calcul du solde, du champ de saisie du montant et des branches d’API associées. `setupInvoice.receivedCents` et `setupInvoice.receipts` sortent du schéma et des réponses. Le montant de référence reste celui de la facture émise. Les corrections enregistrent le règlement initial, l’auteur de sa saisie, la date, l’auteur et le motif de la correction, ainsi que la référence si renseignée. La relance d’une demande corrigée est rejetée.
- Les trois files administratives alignent les montants et actions à droite. Les liens contrat et facture accompagnent les informations du restaurant. Le téléchargement PDF est disponible par une action compacte. Les formulaires ouverts prennent la largeur du dossier.
- La copie isolée `gusto_commercial_user_review_v4` contient sept factures commerciales. Deux règlements intégraux ont été repris. L’Ardoise fictive a retrouvé l’état Envoyée pour 250 €. L’inventaire MongoDB confirme zéro document portant un des deux anciens champs et les deux index d’unicité. La copie v3 sert d’archive de recette.
- Chrome a confirmé les actions à droite aux largeurs 390, 768, 1024, 1440 et 1920 px. La recette de L’Ardoise a confirmé le passage de la facture dans les commissions à payer, puis son retour dans les factures à encaisser après correction. Le motif et la référence figurent dans l’historique et les auteurs figurent dans MongoDB. Le filtre « Mes factures » présente les quatre états attendus.
- Résultats de cette évolution. 40 tests API commerciaux, 181 tests frontend et 65 tests historiques ciblés sur la signature et la facturation réussis. Le build Next.js a généré 189 pages statiques. Les avertissements de lint préexistants et le saut d’optimisation des polices distantes restent visibles en recette.

## Quatre cartes statistiques commerciales

- Les trois vues partagent les mêmes cartes. Elles figurent au-dessus des prochaines actions dans l’espace vendeur. Les prospects en cours et les rendez-vous programmés affichent le portefeuille et l’agenda actuels du périmètre sélectionné. Les prospects acquis, perdus, non intéressés, archivés ou opposés sont exclus de la première carte. Le nombre de rendez-vous inclut tous les rendez-vous futurs encore programmés et les rendez-vous sans heure du jour. L’aperçu des prochaines actions continue de présenter jusqu’à cinq éléments par catégorie.
- La période filtre les devis par date de premier envoi, selon les jours civils de Paris. Un brouillon et un renvoi supplémentaire ne sont pas comptés. Les acquisitions sont filtrées par date de signature initiale et rattachées au bénéficiaire enregistré à la signature. L’index unique sur `commercialacquisitions.establishmentId` garantit une seule acquisition par établissement. La facture influe sur le règlement de la commission. La vente annulée est retirée des acquisitions et son contrat signé reste dans la série documentaire.
- La recette v4 confirme cinq contrats signés et quatre acquisitions pour Alice. L’écart correspond au Comptoir fictif, dont la vente a été annulée. Les totaux globaux sont de sept contrats signés et six acquisitions. La Verrière de Recette est acquise alors que sa commission attend encore le règlement client.
- Suppression des champs de premier niveau `prospects`, `quotes`, `contractsSigned` et `followUps` dans les deux réponses Dashboard. Les comptages des devis créés sur la période et des relances à effectuer ont été retirés. La cohorte de conversion, les contrats signés dans le graphique et les relances des prochaines actions restent disponibles.
- Chrome a vérifié les trois vues à 1440, 768 et 390 px. Les quatre cartes ont la même hauteur à chaque largeur. Le passage de « Ce mois-ci » à « Mois dernier » conserve les chiffres du portefeuille et de l’agenda, et actualise les devis et les acquisitions. La vue individuelle d’Alice correspond à son espace vendeur et au filtre Alice de la vue d’ensemble administrateur.
- Recette sur MongoDB isolé, 41 tests API commerciaux et 181 tests frontend réussis. Le build Next.js a généré 189 pages statiques. Les avertissements habituels de lint et de chargement des polices distantes restent visibles.

## Navigation mobile et calendrier commercial

- Sous le seuil tablette, l’en-tête vendeur place le titre après le bouton menu, avec un espace de 15 px. Les actions disponibles utilisent des icônes à droite avec un libellé accessible. « Mon compte » est accessible depuis la navigation.
- Le calendrier vendeur ouvre sur la liste hebdomadaire. Les cartes reprennent le regroupement par jour et la mise en avant des horaires du planning personnel. Les filtres, les détails et la création s’appliquent également à la vue calendrier. Sur mobile, les vues mois et semaine présentent une grille de dates et les événements du jour sélectionné. La vue Jour et les vues de bureau gardent une grille horaire ou calendaire.
