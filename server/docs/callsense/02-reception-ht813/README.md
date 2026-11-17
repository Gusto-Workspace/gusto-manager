# Réception et installation HT813 — procédure de recette

## Avant de commencer

Cette procédure est préparée à partir du code Gusto et de la documentation officielle ; **aucun HT813 n'a été testé physiquement dans cet audit**. Chaque case représente une observation à effectuer, pas un résultat acquis. Lire d'abord la [référence CallSense](../01-fonctionnement/README.md).

- **Pilote de test** : conserver le restaurant, son sous-compte, son Bundle, son numéro et ses ressources existantes. Travailler avec le backend relié à MongoDB Test et aux ressources du pilote. Aucun nouvel achat ni activation commerciale automatique.
- **Nouveau restaurant** : créer un dossier et des ressources propres ; n'activer un renvoi ou un service payant qu'avec l'accord explicite du restaurant et les autorisations requises.
- Ne jamais diriger le numéro du pilote MongoDB Test vers un backend connecté à MongoDB Production. Avant toute modification autorisée, faire vérifier conjointement origine publique, instance backend, environnement MongoDB et sous-compte. Ne noter ni SID réel ni secret dans un ticket ou journal partagé.
- Prévoir un téléphone mobile indépendant, un contact opérateur, un créneau convenu, le retour arrière et une méthode d'appel d'urgence indépendante. Ne pas tester un numéro d'urgence réel par un appel non autorisé.

Sources officielles : [guide d'installation HT813](https://documentation.grandstream.com/knowledge-base/ht813-quick-installation-guide/), [guide d'administration HT813](https://documentation.grandstream.com/knowledge-base/ht813-administration-guide/), [FAQ HT813](https://documentation.grandstream.com/knowledge-base/ht813-faq/), [SIP Twilio](https://www.twilio.com/docs/voice/sip). Les noms exacts des champs et les options disponibles dépendent du firmware. Confirmer leur signification avant application ; ne pas recopier des valeurs d'un autre restaurant.

## 1. Réception et inventaire

- [ ] Vérifier l'étiquette **HT813**, l'alimentation adaptée fournie, le câble réseau, les cordons téléphoniques compatibles et un téléphone analogique ou une base DECT. **Résultat** : matériel complet, sans dommage ; comparer l'alimentation au marquage et au guide constructeur.
- [ ] Noter la version du firmware et son état de support sans publier adresse MAC ni identifiants. **Vérification** : interface locale et documentation constructeur. **Si firmware ancien ou champs différents** : suspendre la configuration et valider une mise à jour et son retour arrière ; ne pas supposer que les menus ci-dessous sont identiques.
- [ ] Identifier le port **FXS** vers le téléphone analogique / la base DECT, le port **FXO** vers une sortie téléphonique analogique opérateur compatible et les ports réseau selon les marquages du boîtier. **Si la box ne propose pas de sortie analogique compatible** : confirmer une solution avec l'opérateur avant raccordement ; ne jamais brancher une sortie non identifiée sur FXO.

## 2. Réseau, environnement et sauvegarde

- [ ] Relever avant changement le schéma existant, les branchements et la configuration de renvoi opérateur, sans secrets. Désigner un responsable et une fenêtre de retour arrière. **Résultat** : service initial reproductible.
- [ ] Sur un réseau de confiance, relier le port réseau approprié au LAN conformément au guide, alimenter le boîtier, obtenir son adresse locale et ouvrir son interface depuis un poste autorisé. **Vérifier** : adresse accessible, heure et réseau corrects. **Échec** : contrôler alimentation, câble, DHCP, VLAN et pare-feu ; ne pas exposer l'administration au public.
- [ ] Changer les identifiants administrateur initiaux, les conserver dans le coffre prévu et appliquer une politique réseau adaptée. **Vérifier** : accès avec le nouveau compte ; aucune capture ou journal ne contient de mot de passe.
- [ ] Confirmer l'origine HTTPS Gusto et la base associée avant tout réglage Twilio. **Échec / doute** : arrêter ; ne pas reconfigurer les webhooks pour « essayer » une autre base.

## 3. Raccordement et configuration du terminal

- [ ] Raccorder le téléphone ou la base DECT au **FXS**, et seulement si la ligne analogique et son usage ont été confirmés, la sortie téléphonique de la box au **FXO**. **Résultat** : téléphone alimenté, tonalité cohérente ; contrôler la compatibilité électrique dans le guide et auprès de l'opérateur.
- [ ] Dans l'assistant Gusto du bon restaurant, consulter les paramètres SIP du dossier ; révéler le secret uniquement à une personne autorisée et le saisir directement dans le profil FXS du HT813. Configurer le serveur primaire, l'identifiant et l'authentification selon la documentation et les valeurs propres au dossier. **Vérifier** : registration côté boîtier et statut correspondant dans Twilio, sans exposer les identifiants. **Échec** : vérifier domaine, identifiant, mot de passe, DNS, horloge, connectivité et pare-feu ; ne pas recréer le domaine ou les credentials.
- [ ] Décider avec l'opérateur comment les appels sortants ordinaires et d'urgence emprunteront la ligne habituelle. Le guide constructeur décrit une route PSTN par code d'accès ou règles du dial plan FXS ; le réglage exact, les codes nationaux, la compatibilité de la box et les règles locales restent **à confirmer sur le firmware et avec l'opérateur**. Le code Gusto ne configure ni ne prouve ce dial plan.
- [ ] Vérifier le mode **Life Line** et son comportement sur le matériel réel. La documentation Grandstream décrit un relais local entre FXS et FXO en cas de perte d'alimentation ou de registration dans le mode adéquat ; cela suppose une ligne FXO fonctionnelle et ne remplace pas une preuve d'appel d'urgence. **Si doute ou absence de ligne analogique** : conserver un moyen indépendant.

## 4. Ressources Gusto et Twilio

- [ ] **Pilote** : ouvrir le dossier existant, vérifier le mode `ready_for_test`, `enabled: false`, le numéro, le Bundle approuvé, le domaine SIP, la Function et les webhooks associés. **Résultat** : ressources réutilisées, aucune recréation. Une réponse Function HTTP ne valide pas l'audio.
- [ ] **Nouveau restaurant** : suivre les étapes 1–5, transmettre les informations et pièces de l'utilisateur final, attendre l'approbation puis la vérifier manuellement. Avant tout achat, confirmer l'autorisation et le plafond. Vérifier numéro, SIP et webhooks ; ne pas considérer `pending-review` comme une approbation.
- [ ] En cas de verrou `uncertain`, lire le diagnostic et réconcilier la ressource correspondante avant reprise. **Ne pas** répéter un achat, créer un second Bundle, réinitialiser un verrou sans preuve ou supprimer une ressource existante.

## 5. Appels entrants et retours d'information

- [ ] Depuis un téléphone indépendant, appeler le numéro Twilio du dossier. **Résultat** : sonnerie du téléphone FXS ; répondre et vérifier l'audio dans les deux sens pendant une durée connue. **Échec** : contrôler registration, réseau, domaine et routage ; distinguer erreur HTTP, absence de sonnerie et audio unidirectionnel.
- [ ] Laisser un appel sans réponse, puis vérifier sa présence dans l'historique et son statut manqué. **Résultat** : un appel sans doublon, avec date et durée cohérentes ; comparer les horaires avec les observations, sans diffuser le numéro appelant.
- [ ] Utiliser un numéro de test associé à une fiche client du **même restaurant**. **Résultat** : identité et lien vers la fiche ; un numéro absent ou ambigu ne doit pas pointer vers un autre client. Vérifier Dashboard et webapp Réservations.
- [ ] Depuis les comptes autorisés, vérifier popup Dashboard, SSE, notification webapp et push après permission navigateur ; répéter avec un compte sans droit et s'assurer qu'il ne voit pas les données. **Échec** : vérifier restaurant sélectionné, droits, connexion SSE, abonnement push et VAPID ; une notification manquée pendant l'arrêt du backend n'est pas automatiquement rejouée.

## 6. Appels sortants et urgence

- [ ] Appeler un numéro de test autorisé depuis le téléphone FXS en utilisant la **ligne habituelle**, selon le routage convenu. **Résultat** : appel établi, audio dans les deux sens et origine attendue. **Si l'appel part par une autre voie ou échoue** : arrêter, vérifier le dial plan FXS, FXO, la tonalité et la configuration opérateur. Ne pas déduire le support des appels sortants du seul fonctionnement des appels entrants Twilio.
- [ ] Faire valider la procédure d'appel d'urgence par l'opérateur et les règles locales ; documenter la voie indépendante et les limites en coupure de courant / réseau. **Vérification** : route physique, tonalité et procédure d'urgence examinées sans appel d'essai non autorisé ; compléter la validation réellement exigée avec les organismes concernés. Ne pas supposer que le domaine SIP Twilio fournit les appels d'urgence en France.

## 7. Secours, pannes et retour normal

- [ ] Dans un créneau autorisé, vérifier d'abord un appel nominal. Exécuter ensuite le test prévu de backend indisponible et observer sonnerie et audio via le secours Twilio. **Résultat** : appel entrant acheminé vers le même terminal SIP si Twilio, le réseau et le terminal sont disponibles. **Limite** : historique et notifications Gusto peuvent être incomplets.
- [ ] Dans les diagnostics de l'étape 7, exécuter séparément les scénarios **erreur HTTP**, **réponse invalide** et **absence de réponse**, puis arrêter chaque scénario, vérifier le retour à la normale et confirmer seulement les résultats réellement observés. En cas d'échec, laisser la case non validée et consulter le diagnostic ; ne pas déclarer le secours réussi sur une simple sonde HTTP.
- [ ] Tester séparément, avec accord et moyen de secours indépendant, la perte réseau du boîtier et la coupure d'alimentation ; observer la ligne opérateur et le comportement Life Line. **Résultat attendu à confirmer matériellement** : selon la configuration et la ligne FXO, la voie analogique locale peut rester utilisable ; la Function Twilio ne compense pas la perte du terminal ou de son réseau. Si non concluant, ne pas activer commercialement.

## 8. Renvoi opérateur

- [ ] **Pilote en appel direct** : pas de renvoi opérateur à imposer. Vérifier que ce scénario est sélectionné dans l'assistant.
- [ ] **Restaurant avec renvoi** : convenir avec l'opérateur du type de renvoi, des frais et des conditions de désactivation ; enregistrer l'état initial. Activer uniquement avec l'accord du restaurant, puis appeler le numéro habituel depuis un mobile. **Résultat** : appel acheminé comme prévu, sans boucle, avec comportement de non-réponse compris. En cas d'échec, désactiver le renvoi et rétablir l'état initial.
- [ ] Confirmer l'absence de boucle entre le renvoi opérateur, la destination Twilio et la ligne FXO. **Si la topologie n'est pas claire** : arrêter avant activation et la faire valider par l'opérateur.

## 9. Durée et consommation sans facturation non autorisée

- [ ] Vérifier `ready_for_test`, `enabled: false` et l'interdiction d'envoi de minutes avant les essais. **Résultat** : les appels de test sont exclus du reporting commercial ; ne pas changer le drapeau global ou individuel pour ce test.
- [ ] Comparer une durée observée avec l'historique Gusto et les preuves disponibles, puis contrôler les entrées en attente ou en revue. La durée affichée et l'arrondi ne prouvent pas une facture. **Si écart** : conserver les preuves sans données sensibles et examiner le rapprochement ; ne pas marquer une minute comme transmise sans confirmation Stripe.
- [ ] Pour un futur test de compteur, employer uniquement Stripe Test et un environnement isolé, après autorisation explicite. Toute émission Live ou activation des envois commerciaux nécessite une décision séparée et la vérification du client, des prix et de la période.

## 10. Retour arrière et décision

- [ ] Si la téléphonie se dégrade : suspendre l'essai, désactiver le renvoi opérateur selon la procédure convenue, rebrancher le téléphone sur sa ligne d'origine et appeler le numéro habituel depuis un mobile indépendant. Vérifier entrant, sortant et moyen d'urgence de secours. **Ne pas supprimer** numéro, Bundle, sous-compte, SIP ou Function pour tenter de réparer.
- [ ] Si un webhook doit être restauré, utiliser uniquement les valeurs préalablement vérifiées pour le **même environnement** et uniquement avec autorisation ; relire la configuration après modification. Ne jamais pointer un numéro de test vers la base de production. En cas d'état incertain, conserver les preuves et demander une vérification avant reprise.
- [ ] Vérifier les observations, la checklist adaptée au matériel, la facture et les autorisations. L'administrateur seul décide explicitement « Activer CallSense » après la recette complète ; `enabled: true` ne doit pas être positionné pour faciliter les essais.

### Checklist avant commercialisation

- [ ] Bonne entreprise, bon restaurant, bon environnement et Bundle individuel approuvé.
- [ ] Numéro, SIP, webhook principal et Function de secours vérifiés et sans doublon.
- [ ] Entrants, manqués, audio bidirectionnel, identification, Dashboard et push réellement observés.
- [ ] HT813, FXO/FXS, sortie habituelle et procédure d'urgence validés pour la topologie réelle.
- [ ] Renvoi opérateur vérifié si applicable ; aucune boucle et retour arrière testé.
- [ ] Pannes HTTP, réponse invalide, timeout, arrêt backend et retour normal réellement validés ; limites réseau/alimentation comprises.
- [ ] Durées et consommation vérifiées, aucune minute de test envoyée à Stripe ; paramètres Live, fiscalité et autorisations commerciales contrôlés séparément.
- [ ] Échecs, verrous incertains et écarts levés ; approbation humaine puis activation explicite seulement.
