# CallSense V1 — référence de fonctionnement

## Périmètre et statut des preuves

Document établi le 17 novembre 2026 par lecture du code local de `gusto-manager`, branche `develop`, commit `61b3022f`. Le code CallSense ciblé est identique à `main` pour les services, modèles et routes examinés ; `server/app.js` diffère notamment pour la connexion MongoDB : `develop` utilise `CONNECTION_STRING_TEST`, `main` utilise `CONNECTION_STRING`. La version effectivement déployée et les données des plateformes n'ont pas été interrogées. Ce document ne constitue pas une preuve de déploiement ni un inventaire des ressources réelles.

Légende : **code** = constat statique ; **simulation** = scénario présent dans les tests, sans réexécution pour cet audit ; **Linphone** = succès rapportés par l'utilisateur dans la conversation, non revérifiés ici ; **à valider** = preuve physique, contractuelle ou de production manquante. Aucun appel réel Twilio, Stripe ou MongoDB pendant cet audit. La dernière exécution de suite rapportée dans la session précédente était de 828 tests backend réussis en simulation ; ce chiffre n'est pas une exécution de cet audit et ne prouve pas un appel réel.

## 1. Vue d'ensemble

```text
Appelant → numéro Twilio du restaurant → webhook Voice HTTPS Gusto
                                        → TwiML Dial SIP → terminal enregistré
                                        ↘ VoiceFallbackUrl → Function Twilio → même SIP
             callbacks Twilio → API Gusto → MongoDB appels → SSE / Dashboard / push
             appels vérifiés → registre consommation → compteur Stripe → facture Gusto
```

Le backend Express monte CallSense sous `/api` (`server/app.js`, `server/routes/callsense.routes.js` et `callsense-onboarding.routes.js`). L'administration prépare le sous-compte et les ressources individuelles ; le Dashboard et la webapp consomment les appels via `client/src/components/_shared/callsense/`. Le numéro, le domaine et les identifiants sont propres au restaurant. Pas de partage ou de clonage de Bundle dans le parcours normal ; des champs et noms historiques restent dans le code pour protéger ou identifier d'anciennes installations, pas pour créer un Bundle partagé.

La Function de secours est une **autre route d'appel entrant**, pas une copie du backend : elle produit un `Dial` vers la même URI SIP. Elle ne recrée pas les événements Gusto, l'identification client, les notifications ou la facturation lorsque le backend est indisponible.

## 2. Données et états MongoDB

Les schémas sont dans `server/models/callsense/` :

| Modèle | Rôle et relation |
| --- | --- |
| `CallSenseOnboarding` | Un dossier par `restaurantId` : compte, Bundle, adresse, numéro, SIP, Function, preuves, checklist, progression, tentatives et audit. Les secrets sont sélectionnés explicitement. |
| `CallSenseConfig` | Configuration téléphonique par restaurant : `enabled`, sous-compte, numéro, URI SIP, jeton chiffré, état d'installation, paramètres commerciaux et rapprochement. Index uniques sur restaurant et certaines ressources. |
| `CallSenseCall` | Parent d'appel, restaurant, état et événements de la branche SIP, identité et état de facturation ; identifiant d'appel unique. |
| `CallSenseConsumption` | Registre d'une consommation vérifiée, identifiant stable, période, minutes, état d'envoi et résolution ; index uniques anti-doublon. |
| `CallSenseBillingPeriod`, `CallSenseQuotaAlert` | Instantanés de périodes et alertes de seuil, sans remplacer la vérité Stripe. |
| `CallSenseSubscriptionOperation`, `CallSenseBillingAudit` | Verrou par restaurant, tentative et journal des opérations commerciales. |

Les états d'installation sont `unconfigured`, `preparing`, `compliance_pending`, `hardware_pending`, `ready_for_test`, `active`, `incident`, `suspended`. `ready_for_test` garde `enabled: false` et autorise le routage et les interfaces de test ; `active` positionne `enabled: true` après action explicite et contrôles. Les opérations Twilio et Stripe peuvent être `pending` ou `uncertain` : une réponse incertaine ne prouve ni l'échec ni l'absence de ressource. Le `Restaurant` et les profils employés restent la source des droits ; les lignes commerciales se trouvent dans l'abonnement Stripe du restaurant.

## 3. Onboarding administrateur

Interface : `client/src/components/dashboard/admin/restaurants/callsense-onboarding.admin.component.js`. Orchestration : `callsense-onboarding.service.js`, `callsense-provisioning.service.js` et `callsense-onboarding-progress.service.js`. La progression est dérivée de preuves persistées, pas simplement d'un clic :

1. **Informations du restaurant** : identité, adresse, téléphone et email nécessaires.
2. **Sous-compte Twilio** : création ou association contrôlée ; un compte fermé ou de statut non vérifié ne doit pas être réutilisé.
3. **Conformité réglementaire** : exigences Twilio récupérées dynamiquement, utilisateur final `business`, justificatifs, End-User, documents, Bundle individuel, affectations, évaluation puis soumission. `pending-review` signifie soumis, pas approuvé. L'administrateur vérifie la décision ; le worker ne sonde pas périodiquement les dossiers en attente.
4. **Numéro** : achat après approbation, adresse vérifiée et autorisation/plafond enregistrés. Le parcours automatique cherche un numéro français `+333`, Local, Voice et non bêta ; sans candidat compatible il s'arrête. `buyNumber` transmet le Bundle et, si requis, l'adresse du restaurant. Une opération incertaine bloque un nouvel achat.
5. **SIP et webhooks** : domaine unique, registration, liste d'identifiants, Function et URLs du numéro. Leurs contrôles ne prouvent pas un appel réel. La Function peut être remplacée, selon le parcours existant, par un TwiML Bin vérifié.
6. **Terminal et renvoi** : terminal connecté et scénario `direct` ou `forward` ; le renvoi opérateur n'est requis que pour le second. Le renvoi reste une action de l'opérateur / installateur.
7. **Tests et activation** : checklist adaptée au scénario ; confirmation des essais humains, vérification des prérequis puis action explicite « Activer CallSense ». `callsense-checklist.service.js` dispense le softphone direct des tests physiques de sortie et d'urgence ; le HT813 et le renvoi exigent les champs correspondants. Aucun appel ou secours n'est réputé testé par une simple réponse HTTP.

Le service `cron/callsense-onboarding.service.js` reprend toutes les 15 secondes des opérations déjà explicitement mises en file ; il n'interroge pas automatiquement une approbation en attente. Les autorisations et les états `pending`/`uncertain` restent déterminants. Les documents réglementaires sont sensibles : ne pas les journaliser ni les recopier dans une fiche de test.

**Correction d'un refus.** Dans le formulaire réglementaire existant, l'administrateur consulte les motifs disponibles, corrige les informations de l'utilisateur final et de l'adresse, modifie les métadonnées ou remplace une pièce refusée. Les pièces approuvées sont conservées. Après sauvegarde, une action explicite réévalue et resoumet le Bundle individuel existant ; le statut reste en attente jusqu'à la vérification manuelle de l'approbation. Les routes `regulatory-rejection`, `regulatory-correction`, `regulatory-document-replacement` et `regulatory-resubmission` utilisent les ressources du restaurant et les verrous existants. Les tests ciblés simulent Twilio ; ils ne constituent pas une validation en navigateur ou sur un dossier réel.

Une réponse incertaine bloque toute répétition et propose une vérification. Pour un remplacement dont l'identifiant a été enregistré, cette vérification rapproche les affectations sans nouvel upload. Si la réponse de l'upload est perdue avant l'enregistrement de cet identifiant, l'absence de doublon ne peut pas être établie automatiquement : le verrou reste en place et une vérification des ressources est nécessaire. Une opération restant à l'état `pending` après interruption reste également bloquée tant que son résultat n'est pas établi. Des exigences ou affectations ambiguës empêchent la correction plutôt que de sélectionner arbitrairement un justificatif.

## 4. Appels, identité et notifications

`callsense.routes.js` vérifie la signature Twilio sur l'origine publique configurée et les paramètres signés. `/api/callsense/voice` sélectionne la route du sous-compte et du numéro, puis renvoie `Dial` SIP ; `/api/callsense/sip-status` et `/api/callsense/dial-action` reçoivent les événements. `callsense-core.service.js` réduit les états sans rouvrir un appel terminé ; le résultat de `Dial` fait autorité pour l'issue. Un webhook non authentifié ou une configuration indisponible échoue de manière sécurisée.

`callsense.service.js` normalise les numéros, enregistre les appels et résout les clients par restaurant. `resolveCustomerIdentities` groupe les numéros distincts, utilise `Customer.phoneNorm` et refuse les correspondances ambiguës ; l'identité peut ainsi changer à la lecture de l'historique sans réécrire les appels. Ne pas considérer un nom ancien comme preuve d'identité actuelle.

Les événements `callsense_updated`, `callsense_status_changed` et les événements de lecture/identité passent par le bus SSE et le contexte restaurant. `callsense-context.js` et `callsense-panel.js` pilotent historique, popup et compteur ; la disponibilité provient de `enabled` ou du mode test réellement géré par l'onboarding. La sélection de restaurant et les permissions propriétaire/employé restent appliquées par les routes et l'interface ; le push Réservations vise les abonnements autorisés et, dans `notify`, le propriétaire lorsque le module Réservations est actif. `server/services/shared/webpush.service.js`, `push-subscription.routes.js` et `client/src/_assets/utils/webpush.js` gèrent l'abonnement push. Les lectures CallSense PWA utilisent `NetworkOnly` dans `client/next.config.js` ; la version installée et les permissions du navigateur restent à contrôler.

## 5. Secours et limites

`callsense-fallback.service.js` génère un TwiML `Dial` SIP de 25 secondes ; `callsense-serverless.service.js` déploie une Function protégée propre au sous-compte. Le numéro reçoit une URL Voice principale et une URL de secours Twilio. Une Function HTTP valide ou un domaine SIP créé ne prouvent ni registration terminal, ni sonnerie, ni audio.

`callsense-fallback-drill.service.js` permet, en mode test, trois simulations contrôlées : erreur HTTP, XML invalide et absence de réponse. Les confirmations exigent le déclenchement observé et le retour normal. Ce secours traite l'indisponibilité ou réponse invalide du webhook principal ; il ne garantit pas la disponibilité de Twilio, d'Internet, de l'alimentation, du terminal SIP, ni une voie PSTN alternative. Les appels pendant l'arrêt backend peuvent nécessiter un rapprochement et ne rejouent pas automatiquement les notifications manquées.

## 6. Stripe et consommation

`server/services/billing/stripe-billing.service.js` recherche l'abonnement du restaurant ; `stripe-subscription-catalog.service.js` et `server/routes/admin/subscriptions.routes.js` ajoutent le fixe et le mesuré au même abonnement Gusto. `callsense-usage.service.js` vérifie l'offre configurée : 45 EUR/mois, 1 000 minutes incluses, puis 0,05 EUR/minute. Taxes et paramètres de facture Live restent à vérifier. Le code ne prouve pas qu'une ressource Live existe ou qu'une facture a effectivement été payée.

La synchronisation est directe, sans webhook Stripe CallSense : `callsense-commercial-sync.service.js` écrit l'état confirmé et réconcilie à l'aperçu administratif. La récupération d'une opération incertaine exige une preuve suffisante ; `callsense-subscription-recovery.service.js` conserve le verrou si elle manque. Les modifications directes dans Stripe peuvent rester absentes de MongoDB jusqu'à une vérification ultérieure. `past_due` est actuellement considéré comme souscrit, pas comme un ordre automatique de désactivation.

`callsense-metering.service.js` relit l'offre et l'abonnement, vérifie la preuve Twilio, attribue la conversation à la période de fin et arrondit chaque conversation à la minute supérieure. Il envoie l'événement de compteur avec un identifiant stable et une clé d'idempotence ; seul un retour Stripe concordant passe l'entrée à `sent`. Une période fermée, preuve ambiguë ou délai d'incertitude dépassé est placée en revue, pas renvoyée aveuglément. Le worker tourne chaque minute et le rapprochement d'appels toutes les 15 minutes (`cron/callsense-metering.service.js`). `CALLSENSE_METER_REPORTING_ENABLED=true` et l'autorisation commerciale par restaurant sont nécessaires à l'envoi ; le mode test est exclu. La suppression des lignes est protégée contre les appels et consommations dus ; ne pas modifier les factures ou déverrouiller une tentative incertaine sans preuve.

## 7. Sécurité et configuration

`authenticate-admin`, `authenticate-token` et `authorize-restaurant-access` protègent les routes ; vérifier les droits réels de chaque endpoint avant évolution. `callsense-core.service.js` vérifie la signature sur `CALLSENSE_PUBLIC_ORIGIN` et l'URL originale. `callsense-secrets.service.js` chiffre les secrets avec AES-256-GCM, clé de 32 octets hexadécimaux et contexte restaurant/sous-compte ; perdre ou remplacer la clé rend les secrets existants illisibles. Les identifiants chiffrés ne doivent pas figurer dans les logs ou documents. Les données et jetons sont isolés par restaurant ; MongoDB indisponible ne doit pas faire basculer vers un autre restaurant.

Variables à vérifier **par environnement**, sans recopier leurs valeurs :

| Plateforme / variable | Rôle |
| --- | --- |
| Render : `CONNECTION_STRING` | MongoDB de production dans le code `main` ; `develop` utilise `CONNECTION_STRING_TEST`. Vérifier le commit réellement déployé. |
| Render : `CALLSENSE_TWILIO_MAIN_ACCOUNT_SID`, `CALLSENSE_TWILIO_MAIN_AUTH_TOKEN` | Compte principal permettant le provisioning ; secrets gérés côté serveur. |
| Render : `CALLSENSE_ENCRYPTION_KEY` | Clé de chiffrement stable, distincte par environnement. |
| Render : `CALLSENSE_PUBLIC_ORIGIN` | Origine HTTPS publique du backend, sans chemin ; signature et URLs Twilio. Production stable ; tunnel VS Code admis uniquement en développement et après vérification. |
| Render : `STRIPE_API_SECRET_KEY` | Clé Stripe du bon environnement. |
| Render : `STRIPE_CALLSENSE_FIXED_PRICE_ID`, `STRIPE_CALLSENSE_METERED_PRICE_ID`, `STRIPE_CALLSENSE_METER_ID` | Trois ressources de l'offre du même environnement ; absence ou incompatibilité bloque la facturation concernée. |
| Render : `CALLSENSE_METER_REPORTING_ENABLED` | `true` autorise globalement l'envoi ; conserver désactivé tant qu'il n'est pas expressément autorisé, avec l'interrupteur commercial individuel. |
| Render : `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Push web ; paire cohérente avec le client, privée uniquement côté serveur. |
| Vercel : `NEXT_PUBLIC_API_URL` | Base du backend du même environnement, avec `/api`. |
| Vercel : `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clé publique correspondant au serveur pour l'abonnement push. |
| Render : `NODE_ENV` | Le code contrôle `production`/`development` ; vérifier la valeur effective sans supposer la configuration de la plateforme. |

Ces variables complètent les secrets et configurations Gusto généraux existants, notamment authentification, CORS et notifications. Une origine de production ne doit jamais pointer vers un backend utilisant MongoDB Test, ni inversement. Au passage Render, enregistrer la nouvelle origine autorisée, vérifier le backend et la base, puis synchroniser et relire Voice URL et fallback du numéro avec autorisation ; prévoir retour arrière. Ne jamais supposer que changer une variable modifie les webhooks Twilio déjà enregistrés.

## 8. État de validation et points ouverts

- **Simulation présente dans le dépôt :** `server/tests/callsense/` couvre notamment onboarding, Bundle, achat +333, SIP, fallback, état test, Stripe, verrous, reprise et compteurs. Une simulation ne valide pas la qualité réseau ou le matériel.
- **Linphone, rapporté par l'utilisateur :** appels entrants/répondus/manqués, audio bidirectionnel, popup Dashboard, push webapp, secours pendant arrêt backend et retour à la normale ; recette signalée 14/14 et trois scénarios de panne. Les journaux ou données réelles n'ont pas été consultés pour cet audit.
- **Non validé ici :** HT813 physique, ligne opérateur, DECT, numérotation sortante et urgence sur installation réelle, transfert opérateur, facture Live et déploiement Render/Vercel effectif. L'activation du pilote n'est pas déduite de la recette.
- **Points à surveiller :** reprises réglementaires incertaines sans preuve suffisante et validation du parcours dans un navigateur ; anciens verrous sans preuve, appels récupérés nécessitant revue ; changements Stripe hors Gusto reflétés seulement à la prochaine vérification ; perte d'une clé de chiffrement ; origine et MongoDB d'environnements différents ; numéro ou SIP déjà existant ; absence de statut de disponibilité réel du terminal.

La procédure physique détaillée se trouve dans [Réception HT813](../02-reception-ht813/README.md).
