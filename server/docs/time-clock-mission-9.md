# Pointeuse Gusto

La Pointeuse du dashboard est accessible depuis Gestion du personnel. Les vues Journée et Employés combinent les services du Planning et les sessions de pointage du restaurant actif. Les pauses prévues et les pauses enregistrées sont présentées séparément. Les shifts planifiés sont comptabilisés sur le jour où ils commencent. Les durées pointées sont réparties sur les jours civils en Europe/Paris, y compris autour de minuit et lors d’un changement d’heure.

Le bouton **Télécharger les heures** se trouve dans la Pointeuse. L’export propose les mêmes formats PDF et Excel, choix de période et sélection de salariés.

L’historique affiche les événements et auteurs réellement enregistrés, les corrections avec les données avant et après, et les validations. Seul un service clôturé peut être validé. Une correction exige un motif depuis la Pointeuse et rouvre une validation précédente. Les événements bruts restent disponibles.

## Heures rémunérées

Les deux vues décomptent les horaires rémunérés par service clôturé avec le découpage en jours civils de Gusto. En calcul automatique, la pause pointée est déduite en priorité. Quand le service n’a aucune pause pointée, Gusto déduit la pause prévue du service associé dans le Planning, dans la limite de sa durée. La pause prévue est déduite une fois par service, répartie à partir du premier jour pour les services de nuit. Un responsable saisit le début, la fin et les minutes de pause directement dans la grille. Les minutes de pause concernent le jour affiché. Le détail du pointage et la note de correction donnent accès au retour au calcul automatique. Les services incomplets attendent la fin du pointage. Une correction prend la révision affichée et un motif. La colonne Note affiche le dernier motif de correction, ou la note du Planning si aucun motif n’a été enregistré. L’historique conserve les corrections avec les valeurs avant et après, l’auteur, la date et le motif.

La colonne Valider permet de valider ou de rouvrir un service clôturé ou une absence constatée. La coche est grise pour un service à valider et bleue quand il est validé. Une correction des données rouvre le service s’il était validé. Valider la journée valide les lignes éligibles du restaurant à la date choisie. Valider la semaine ou la période valide celles du salarié affiché. La colonne Note affiche un plus pour ajouter une note et un œil pour consulter la dernière note ou le dernier motif. Une note saisie depuis cette colonne apparaît dans l’historique et conserve la validation. La colonne Anomalies affiche un aperçu et permet d’ouvrir le texte complet quand l’aperçu est tronqué.

La colonne Absence permet de signaler une absence dès le début d’un service prévu sans pointage, ou sur un service dont le pointage est clôturé. Un service pointé déclaré absent affiche une durée rémunérée de zéro. Retirer l’absence rétablit le décompte applicable. Pour un service sans pointage, le constat est lié au salarié, au restaurant, au service prévu et à sa date dans une collection de la Pointeuse. Les congés du Planning restent consultables dans Absences planifiées. Les horaires prévus, les événements de pointage et les signatures sont conservés.

Le PDF distingue les horaires et les durées pointés et rémunérés. Excel ajoute le total rémunéré à la synthèse et un onglet d’horaires rémunérés par service et par jour. Les calculs d’heures travaillées existants restent la base des colonnes et indicateurs historiques.

## PIN et tablette

- La création ou le rattachement d’un profil salarié génère dans la même transaction un PIN immédiatement utilisable. Le code est propre à l’établissement et peut commencer par zéro. Les profils comptables sont exclus.
- Le salarié peut afficher son PIN dans **Paramètres → Code PIN de la Pointeuse** pour le restaurant sélectionné. Le rattrapage de déploiement attribue les PIN manquants aux comptes antérieurs. La régénération, après confirmation, révoque la version précédente. Une limite transactionnelle d’une minute par salarié et par établissement protège la régénération.
- Le serveur utilise un index unique sur le restaurant et l’empreinte HMAC du code. Le code est chiffré avec AES-GCM et une clé hors de MongoDB. Seules les consultations dédiées au salarié lui-même et au propriétaire direct du restaurant renvoient la valeur, avec une réponse privée sans cache. Les comptes de support, comptables et responsables salariés ne peuvent pas lire le code d’un autre salarié. Le propriétaire consulte et réinitialise le PIN dans **Compte et accès**. Après confirmation, la réinitialisation renvoie le statut et la fiche relit le code.
- Le journal `timeclockpinaudits` conserve le restaurant, le salarié, l’auteur, son rôle, la date et l’action pour les lectures par le propriétaire et les réinitialisations réussies. La valeur, son empreinte et son chiffré sont exclus. L’écriture du journal de réinitialisation participe à la même transaction que le changement du code.
- Le responsable crée un lien d’association à usage unique, valable dix minutes. La tablette n’a besoin que de ce lien lors de l’installation. Elle dispose ensuite de son propre accès, révocable dans **Tablettes**.
- En ligne, les tentatives sont comptées dans MongoDB pour chaque tablette. La fenêtre de cinq minutes accepte au plus 24 requêtes et huit refus. Un refus de code utilise une réponse générique.

### Rattrapage des comptes existants au déploiement

Exécuter depuis le processus d’administration ou comme étape de déploiement autorisée, à partir du dossier `server`. Le dashboard et le démarrage de l’application ne lancent pas le rattrapage. La commande peut être rejouée après un échec partiel.

1. Injecter `GUSTO_PIN_BACKFILL_MONGO_URI` depuis le gestionnaire de secrets du déploiement, avec le nom de la base dans le chemin de l’URI. Définir le même nom dans `GUSTO_PIN_BACKFILL_DB`. Injecter le `TIME_CLOCK_SECRET` déjà utilisé par l’API et ses tablettes, ou le même `JWT_SECRET` si l’API utilise encore son repli historique. La commande ne charge pas de fichier `.env` et ne reprend aucune URI de l’application.
2. Pour une exécution administrative, vérifier que la collection `timeclockpins` possède les deux index uniques complets du modèle. Si nécessaire, les créer dans la base explicitement sélectionnée après examen de la simulation. Le mode de déploiement autorisé prépare les index manquants si la simulation signale uniquement leur absence.

   ```javascript
   db.timeclockpins.createIndexes([
     { restaurant: 1, employee: 1 },
     { restaurant: 1, lookup: 1 },
   ], { unique: true })
   ```

3. Exécuter la simulation et examiner le bilan. Elle fonctionne également sans option. Le script valide la cohérence des PIN existants avec la clé injectée quand il dispose d’un PIN à vérifier.

   ```sh
   npm run time-clock:backfill-pins -- --dry-run
   ```

4. Après validation du bilan et autorisation de l’opération, activer les écritures et confirmer le nom exact de la base. MongoDB doit prendre en charge les transactions. Planifier le passage avant l’ouverture des opérations de rattachement et de retrait du déploiement. Les tablettes existantes peuvent garder leur mode de fonctionnement habituel.

   ```sh
   npm run time-clock:backfill-pins -- --apply --confirm-db "$GUSTO_PIN_BACKFILL_DB"
   ```

5. Contrôler `verification.totals.missing` et les erreurs en sortie. Le script revérifie l’inventaire après l’écriture et renvoie un code de sortie non nul si des erreurs ou des attributions manquantes persistent. Les compteurs portent sur les rattachements salarié–restaurant. Un salarié présent dans deux restaurants éligibles compte deux fois.

Seuls les restaurants avec le module Personnel actif et les salariés figurant à la fois dans leur effectif et parmi les rattachements du compte sont éligibles. Le script ajoute uniquement les identifiants manquants, en transactions indépendantes. Les codes existants, les comptes, les droits, les contrats et les sessions de pointage sont conservés. Le rapport contient des compteurs, des raisons et, en cas d’erreur, les identifiants utiles à la reprise. Un PIN lié à un ancien profil est signalé pour examen. Un échec n’empêche pas la reprise des autres attributions. La tablette peut utiliser le nouveau PIN en ligne après attribution et hors ligne après le prochain renouvellement de son annuaire.

### Exécution automatique au futur déploiement de main

Lors du déploiement autorisé, configurer `npm run time-clock:backfill-pins:deploy` dans le champ **Pre-Deploy Command** du service Render de production, depuis son dossier `server`. Le script vérifie `NODE_ENV=production`, la branche fournie par Render (`RENDER_GIT_BRANCH=main`), la correspondance avec la cible MongoDB du serveur (`CONNECTION_STRING`) et la confirmation du nom exact de la base dans `GUSTO_PIN_BACKFILL_DEPLOYMENT_CONFIRM_DB`. Injecter également les variables dédiées de l’étape 1. Cette configuration s’applique au premier déploiement autorisé du code et ne doit pas déclencher un déploiement lors de sa préparation.

Le script enregistre le reçu `time-clock-pin-backfill-v1` après une vérification complète. Les déploiements suivants détectent ce reçu. Si un passage échoue, l’étape renvoie un statut non nul et le prochain passage reprend les attributions restantes. Des exécutions concurrentes partagent les index uniques et le même reçu.

## Hors ligne et régularisation

Le navigateur génère deux paires de clés. La clé ECDSA non exportable signe les événements. La clé privée RSA non exportable importe, sous forme de clé HMAC non exportable, le vérificateur spécifique à la tablette. IndexedDB conserve l’annuaire de vérification, les états et la file sous chiffrement AES-GCM avec une clé non exportable. Les tentatives hors ligne sont comptées dans une transaction IndexedDB et limitées à huit refus par fenêtre de cinq minutes.

Une synchronisation renouvelle l’autorisation hors ligne pour douze heures. Le lien d’autorisation est limité à la tablette, au salarié, au restaurant et à la version du code. Le serveur vérifie l’adhésion courante au restaurant et refuse un événement associé à un PIN remplacé ou à un salarié retiré. Une tablette déconnectée peut encore utiliser son dernier annuaire jusqu’à son expiration. Une tablette révoquée perd l’accès serveur au retour de la connexion.

Chaque pointage signé est enregistré sur la tablette avant l’accusé de réception, puis synchronisé avec le serveur et dédupliqué par identifiant de mutation. Les erreurs transitoires laissent le pointage en attente. Les refus définitifs restent dans un registre chiffré sur l’appareil. Un responsable connecté au dashboard sur le même navigateur peut exporter les éléments à régulariser depuis **Tablettes**. Ce parcours donne aussi accès aux files issues de l’ancienne webapp. Le serveur accepte les nouveaux envois datés de quatorze jours au maximum.

Le mode hors ligne nécessite une première association, le chargement de la webapp et une synchronisation réussie. Les clés non exportables limitent la copie simple du stockage. Un navigateur compromis peut encore utiliser ses clés et contourner les garde-fous locaux. L’effacement du stockage du site supprime les événements locaux encore en attente. Le navigateur est invité à conserver durablement son stockage lors de l’association.

## API ajoutées

| Méthode | Route | Accès |
| --- | --- | --- |
| GET | `/api/restaurants/:restaurantId/time-clock/register` | Responsable, dates `from` / `to`, filtre salarié et vue historique |
| PUT | `/api/restaurants/:restaurantId/time-clock/sessions/:sessionId/review` | Responsable, validation ou réouverture d’un service |
| PUT | `/api/restaurants/:restaurantId/time-clock/sessions/:sessionId/payroll` | Responsable, correction des dates et pauses à rémunérer ou retour au calcul avec `reset: true`, motif et révision requis |
| PUT | `/api/restaurants/:restaurantId/time-clock/employees/:employeeId/shifts/:shiftId/absence` | Responsable, constat ou retrait d’une absence à la date du service prévu, motif et révision requis |
| PUT | `/api/restaurants/:restaurantId/time-clock/employees/:employeeId/shifts/:shiftId/attendance` | Responsable, présence, repas, note ou validation d’une absence constatée |
| POST | `/api/restaurants/:restaurantId/time-clock/register/review` | Responsable, validation groupée par date ou par salarié et période |
| POST | `/api/restaurants/:restaurantId/time-clock/sessions/:sessionId/notes` | Responsable, ajout d’une note avec la révision du service |
| GET | `/api/restaurants/:restaurantId/time-clock/me/pin` | Salarié, état du PIN et consultation explicite avec `reveal=true` |
| GET | `/api/restaurants/:restaurantId/time-clock/employees/:employeeId/pin` | Responsable, état du PIN uniquement et en lecture seule |
| GET | `/api/restaurants/:restaurantId/time-clock/employees/:employeeId/pin/reveal` | Propriétaire direct, état et PIN existant, lecture tracée et réponse privée sans cache |
| POST | `/api/restaurants/:restaurantId/time-clock/me/pin/regenerate` | Salarié, génération ou régénération automatique dans le restaurant actif |
| POST | `/api/restaurants/:restaurantId/time-clock/employees/:employeeId/pin/regenerate` | Responsable, régénération sans divulgation de la valeur |
| GET, POST | `/api/restaurants/:restaurantId/time-clock/devices` | Responsable, parc et lien d’association |
| DELETE | `/api/restaurants/:restaurantId/time-clock/devices/:deviceId` | Responsable, révocation de la tablette |
| POST | `/api/time-clock/device/pair` | Lien d’association à usage unique |
| POST | `/api/time-clock/device/vault` et `/identify` | Tablette associée |

La route de pointage existante accepte la preuve d’une tablette associée. La route de correction existante préserve désormais l’historique de validation. Les collections `timeclockpins` et `timeclockdevices` sont indépendantes des documents salariés génériques. Les index uniques du modèle doivent être créés avant l’ouverture du trafic.

## Recette

- Utiliser un secret `TIME_CLOCK_SECRET` aléatoire et stable. Une modification de ce secret demande une rotation planifiée des codes, un nouveau jumelage des tablettes et la régularisation des files existantes.
- Associer les tablettes en HTTPS. Vérifier l’installation PWA, la persistance du stockage après redémarrage et un cycle complet de coupure réseau sur le parc Android cible.
- Synchroniser les anciennes files sur leur appareil d’origine avant d’effacer des données de navigation.
- La saisie manuelle rejette une heure locale ambiguë ou inexistante lors d’un changement d’heure. Les corrections qui conservent l’heure existante gardent l’instant original.
