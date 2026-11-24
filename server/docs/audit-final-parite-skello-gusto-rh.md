# Audit final de parité Skello / Gusto Gestion du personnel

23 novembre 2026 · Branche `develop` · Skello Les Artistes Limoges consulté en lecture seule dans Chrome. Les essais Gusto utilisent exclusivement des restaurants et salariés fictifs. Le worktree contenait déjà des travaux RH locaux. Ils ont été inclus dans la version auditée, dont l’état diffère de la branche distante.

## Décisions

| Décision | Verdict | Motif |
| --- | --- | --- |
| Parité fonctionnelle essentielle | **PARTIELLEMENT ATTEINTE** | Les services, la publication, la Pointeuse, les demandes et le rapport couvrent le cœur des usages. La reprise opérationnelle des salariés et de leurs historiques reste à organiser. Les régimes spécialisés et les accès du comptable diffèrent. |
| Fiabilité métier et calculs RH | **VALIDÉE SOUS CONDITIONS** | Les contrôles natifs et les résultats fictifs couvrent les dates d’effet, les pauses, l’isolation et les chevauchements. La source des heures et les règles doivent être confirmées pour chaque établissement. Les données historiques concomitantes et les 40 min dominicales des Artistes restent à arbitrer. |
| Déploiement Gestion du personnel | **GO SOUS CONDITIONS** | Le feu vert vaut pour les restaurants dont les règles sont confirmées et après validation des conditions de préproduction. Pour une activation de Pointeuse, ajouter la recette Android sur le matériel retenu. |
| Remplacement immédiat de Skello aux Artistes Limoges | **NO-GO** | Reprise individuelle vérifiée, soldes d’ouverture, règle dominicale et anomalies historiques à traiter. Cycle de paie parallèle complet et décision écrite du restaurant et du comptable requis. |

## A. Matrices comparatives

Les observations Skello proviennent des écrans mentionnés ou des relevés datés en [section F](#f-preuves-de-recette). Une commande visible établit l’existence de l’option. Les résultats d’une écriture exigent une preuve distincte.

### Salariés, contrats et droits

| Fonctionnalité | Skello observé | Gusto constaté | Niveau de parité | Impact |
| --- | --- | --- | --- | --- |
| Annuaire, recherche | Employés, recherche nom, e-mail, téléphone, matricule et gestion documentaire groupée | Annuaire avec recherche et filtres, roster propre à l’établissement, matricule dans les données d’emploi/paie | Partiel | Vérifier les recherches habituelles, notamment matricule et téléphone, avec le responsable. |
| Fiche et coordonnées | Profil, informations personnelles, données contractuelles et salariales, matricule | Fiche identité, coordonnées, poste, compte, documents et infos d’emploi. Données du profil par restaurant | Équivalent | Vérifier les champs attendus par le comptable avant import. |
| Contrat et avenants | Tableau avec type, volume, période effective, historique et forfait en jours | Contrat et unité, prise d’effet des avenants horaires vérifiée dans le moteur, volumes datés réutilisés dans le rapport | Partiel | Le besoin de dossier contractuel complet (changement de type, anciens contrats et forfait jours) dépasse le contrôle des avenants horaires. |
| Activation, sortie et archivage | L’état de l’annuaire et les fiches ont été consultés. Effets d’un archivage et d’une réactivation hors observation | Archivage par établissement et réactivation explicite. Accès et PIN révoqués au départ. Historique vérifié dans le rapport et les exports | Partiel | Vérifier les dossiers déjà retirés avant le correctif et traiter séparément une nouvelle embauche. |
| Multi-établissement et permission | Tableau des établissements, niveau de permission, équipe et affichage planning | `restaurantProfiles` et permission par restaurant, changement d’établissement actif | Équivalent | Une correspondance des rôles reste nécessaire avant bascule. |
| Soldes et pièces | Onglets Historique / Compteurs et Documents | Soldes datés, mouvements, documents privés et visibilité employé | Partiel | Gestion groupée, catégorisation fine et reprise des historiques à valider. |

### Planning

| Fonctionnalité | Skello observé | Gusto constaté | Niveau de parité | Impact |
| --- | --- | --- | --- | --- |
| Jour, Semaine, Mois et vues | Vues et filtres visibles, semaine avec Employés et Postes, ligne non assignés, totaux et état partiellement publié | Jour/Semaine/Mois, regroupements Employés/Postes, filtres et totaux. Recette historique Chrome et grille automatisée | Équivalent | Même besoin de pilotage quotidien. Vérifier l’usage des non-assignés et les actions mobiles avec le restaurant. |
| Édition, suppression, déplacement, copie, répétition, modèles | Écriture et résultat de glisser-déposer hors observation directe | Services, modification, suppression, déplacement et modèles, outils de copie et récurrence. Couverture planning et Mission 20 | Non vérifiable | La comparaison des gestes de planification reste à faire en démonstration. |
| Services coupés et pauses | Plusieurs services quotidiens visibles, heures prévues et réelles distinctes | Créneaux distincts et pauses, chevauchements et verrou de planning. Services de nuit couverts | Équivalent | Fonction centrale couverte. |
| Publication et visibilité | État partiellement publié visible | Publication jour/semaine et lecture individuelle, notification et e-mail dissociés, idempotence | Équivalent | Profil employé et publication vérifiés lors de la Mission 20. |
| Absences, fériés, contrat et alertes | Absences et fériés affichés, volume contractuel et écart, menu Alertes | Absences et congés dans le planning, garde-fous de chevauchement et période verrouillée, cible contractuelle | Partiel | L’équivalence des alertes anticipées par type et de leur action sur mobile reste à valider. |

### Pointeuse

| Fonctionnalité | Skello observé | Gusto constaté | Niveau de parité | Impact |
| --- | --- | --- | --- | --- |
| Entrée, sortie et pauses | Badgeuse Journée avec prévu, badgé, rémunéré et pause dans chaque groupe | Pointage et pauses par PIN et signature, distinction des trois valeurs dans registre et rapport | Équivalent | Les minutes brutes restent disponibles après correction. |
| En avance/en retard, arrondi et pause | Quatre bornes paramétrables, arrivée retenue au prévu et départ au badgé. Arrondi désactivé dans le relevé de configuration, minimum de pause prévue documenté | Quatre choix, arrondi et trois modes de pause, règle datée enregistrée par service. Le JSON Artistes propose un repli à la pause prévue sans badge de pause positif | Partiel | Confirmer le repli avec le comptable. Le réglage visible aujourd’hui ne date pas les règles d’octobre. |
| Oubli, hors planning, minuit | Services prévus, état de journée validée, Historique. Relevés antérieurs avec sorties manquantes et services traversant minuit | Anomalies de badge, services hors planning, calcul civil et transitions horaires. Si le prévu manque et la règle l’exige, régularisation | Partiel | Qualifier les exceptions avant paiement. Le geste de correction Skello reste observé en consultation. |
| Correction, justification, historique et permission | Journée validée, Actions et Historique | Registre, corrections motivées, réouverture, validations et contrôles de rôle, exports conditionnés | Équivalent | Conserver les justificatifs avec les corrections. |
| Appareils, tablette, mobile, retards | Écrans pour tablette, mobile, preuve de badge, établissement secondaire, multi-appareil et notification de retard | Borne appairée, PIN et signature, coffre et file chiffrés IndexedDB. Options Skello de photo, géolocalisation, SMS de retard et continuité multi-appareil sans équivalence démontrée | Partiel | Borne fixe adaptée au service si la recette matérielle passe. Isoler les besoins supplémentaires du restaurant. |

### Rapport RH et paie

| Fonctionnalité | Skello observé | Gusto constaté | Niveau de parité | Impact |
| --- | --- | --- | --- | --- |
| Synthèse, détails, filtres, périodes | Heures planning période, semaines, heures majorées, total absences et options d’export | Synthèse par salarié et semaine, détail journalier, périodes et filtres, états à corriger | Équivalent | Lecture utile pour l’exploitation et XLSX comptable. |
| Normal, supplémentaire, complémentaire et structurel | Ventilations relevées en octobre sur rapport et export de référence | Assiettes, bandes et mensualisation pilotées par règles datées et avenants | Partiel | Configurer les bandes du restaurant et vérifier les semaines à la frontière des périodes et les contrats atypiques. |
| Nuit, dimanche, fériés | Volumes de majoration en export de référence | Intervalles payés, règles et options de rattachement, heures d’été/hiver couvertes | Partiel | 40 min d’assiette dominicale ouvertes aux Artistes. |
| Absences, repas, compteurs, annualisation | Totaux absences, indemnisation repas et menu Compteurs | Motifs, payeurs, acquisitions, repas pris/dus, compteur d’heures, mouvements et annualisation | Partiel | Vérifier soldes, régimes spéciaux et traitement des fins de période. |
| Export | « Télécharger (Excel) », envoi par e-mail et option chômage partiel affichés. Aucun export déclenché | Rapport Excel en cinq feuilles, PDF de planning/Pointeuse selon les droits. Le comptable testé a accès au PDF des heures via la surface dédiée | Partiel | Vérifier le format comptable attendu. Aucun PDF équivalent au classeur de paie ni export dédié chômage partiel établi. |

### Congés et absences

| Fonctionnalité | Skello observé | Gusto constaté | Niveau de parité | Impact |
| --- | --- | --- | --- | --- |
| Demande, validation, refus, historique | Affichage des absences dans le planning. Parcours salarié et changement de statut hors accès en lecture seule | Demande dans Mon espace et validation/refus par un rôle habilité, avec conflit et planning verrouillé contrôlés | Non vérifiable | Tester le parcours aller-retour avec utilisateur pilote et notifications internes. |
| Motifs et valorisation | Catalogue Absences, acquisition de CP et déclenchement d’heures sup affichés par motif | Congés, maladie, sans solde et autres motifs, payeurs, assimilations et repas configurables, déduplication avec demande approuvée | Partiel | Point de contrôle par motif avec le comptable. Les catalogues des éditeurs n’établissent aucune règle légale. |
| Acquisition et soldes | Compteur CP, réglages jours ouvrables et acquisition attestés par le relevé antérieur | Cycle, unité, base de jours, soldes N/N−1 et d’ouverture, décompte et demi-journées | Partiel | Rapprocher les ouvertures, le changement d’unité ou de cycle, les reports et les fériés. |

### Documents et espace employé

| Fonctionnalité | Skello observé | Gusto constaté | Niveau de parité | Impact |
| --- | --- | --- | --- | --- |
| Espace personnel, connexion et multi-restaurant | Fiche avec droits et établissements. Application employé hors profil d’observation | Mon espace, planning publié, compte, restaurant actif, demandes et notifications internes | Non vérifiable | Recette avec salarié sur téléphone et réception de la notification à compléter. |
| Documents et téléchargement | Onglet Documents et gestion groupée observés côté responsable | Dépôt et classement, retrait et accès privé du salarié à ses propres documents. Tests serveur avec fournisseur simulé | Partiel | Vérifier dépôt et lecture sur stockage privé dédié, puis retrait et éventuelle file de nettoyage. |
| Informations, soldes et permissions | Historique / Compteurs et tableau des permissions dans la fiche | Données personnelles et droits par établissement. Exposition de tous les compteurs individuels au salarié non établie | Partiel | Valider les informations dont le salarié a besoin au quotidien. |

### Paramètres RH

| Fonctionnalité | Skello observé | Gusto constaté | Niveau de parité | Impact |
| --- | --- | --- | --- | --- |
| Pointeuse | Paramètres Badgeuse, mise au réel, remontée, multi-appareil, retards et preuve | Choix du prévu/badgé, arrondi, pauses et effet journalier. Borne et PIN distincts de la règle de paie | Partiel | Les fonctions de collecte supplémentaires constituent des besoins à confirmer. |
| Heures majorées | Colonnes du rapport puis relevé antérieur. Taux et assiettes historiques non déductibles des colonnes | Seuils et taux explicites, modes planning/validé/mixte, nuit, fériés et dimanche, nouvelle règle un lundi | Partiel | Avant pilote, valider les paramètres et l’effet d’un contrat particulier. |
| Compteur d’heures | Compteurs dont RCR, RTT forfait jours, annualisation et fériés | Compteur, ouvertures/mouvements et annualisation. Pas de dispositif dédié RTT forfait jours ou fériés démontré | Partiel | Régimes spécialisés relevés comme désactivés aux Artistes. |
| Absences | Paramètres par motif et impact sur acquisition ou heures supplémentaires | Payeurs et qualification par motif, maintien repas et assimilation en paie/congés | Partiel | Rapprocher motif par motif. |
| Congés payés | Compteur et acquisition des CP | Dates et cycle, jours ouvrés/ouvrables, taux et ouverture requise si nécessaire | Équivalent | Reprendre et contrôler les droits individuels. |
| Repas | Repas dus/pris et acquisition journalière | Droits par jour, service, critères ou forfait, repas pris, coûts et maintien selon règle. Effet au premier du mois | Partiel | Mode et volumes observables. Prix unitaire et maintien à confirmer. |

### Configuration et migration

| Fonctionnalité | Skello observé | Gusto constaté | Niveau de parité | Impact |
| --- | --- | --- | --- | --- |
| Règles collectives | Relevé manuel des écrans de paramétrage | JSON v1, prévisualisation, effet par famille, confirmation, lot, restauration avant effet ou prospective. Familles inconnues/incomplètes bloquées ou laissées en l’état selon le cas | Différent volontairement | La prévisualisation évite de substituer des hypothèses à des règles existantes. |
| Assistant manuel | Réglages Skello répartis entre plusieurs écrans | Questionnaire Gusto, facultatifs, « Non concerné », brouillon partagé owner/admin, gestion des révisions, application des familles complètes | Différent volontairement | La différence entre brouillon sauvegardé et réglage actif doit être explicite. |
| Salariés, contrats et soldes | Le fichier de référence documenté fournit matricules, données contractuelles et CP datés | Parcours XLSX de production pour les dossiers réels, avec décisions ligne par ligne et matricule stable. Contrat de base repris à la création. Les soldes et historiques suivent une reprise distincte | Partiel | Vérifier les dossiers rapprochés, les dates, les avenants et les droits d’ouverture, puis les faire confirmer. |
| Avenants, compteur et historique de badge | Historique contractuel, compteurs et Badgeuse consultables | Saisie/rapprochement des avenants, soldes de compteur et objectifs. Lignes historiques reconnues dans rapport et planning de recette. Aucun badge brut natif créé par XLSX | Partiel | Récupérer puis conserver séparément l’historique source par matricule, avec contrôle des dates et des soldes. |

## B. Risques métier

- **Personnel et contrats.** Raisonner par profil d’établissement, date d’entrée/sortie et date d’effet de l’avenant. Tester un salarié partagé dont le régime ou le poste évolue. Pour chaque avenant repris, contrôler la semaine avant et après contre le contrat source et le classeur.
- **Planning.** Séparer publication et verrou de période. Une semaine modifiée après publication doit rester identifiable par le responsable. Vérifier les gestes de copie et déplacement sur tablette, les conflits et la visibilité individuelle avant généralisation.
- **Congés.** Après reprise des N/N−1, contrôler les reliquats et unités, le cycle, les fériés et les assimilations. Deux demi-journées doivent être décomptées une fois chacune. Vérifier la demande concurrente avec une période verrouillée et une approbation déjà enregistrée.
- **Documents.** Valider le parcours réel dépôt → salarié autorisé → téléchargement → retrait avec Cloudinary privé en préproduction. Le stockage simulé couvre les autorisations et le nettoyage logique.
- **Comptable.** Faire confirmer la surface nécessaire. L’accès dédié a des droits différents d’un responsable RH. Si le comptable doit télécharger lui-même l’Excel complet, une remise contrôlée par un gestionnaire est une solution opérationnelle à faire acter.

### Cycle de vie d’un salarié

**Défaut initial confirmé.** Dans une base fictive, avec une journée verrouillée, « Retirer du restaurant » renvoyait `200`. La session de Pointeuse conservait 240 min, mais le rapport perdait les 240 min planifiées, le type de contrat et les 35 h contractuelles. L’écriture d’avenant disparaissait de MongoDB. Dans la feuille **Détails**, l’identité et les informations contractuelles étaient vides sur la ligne orpheline. Le verrou du planning n’empêchait pas cette perte.

| Action | Effet vérifié |
| --- | --- |
| Retirer des droits | Les droits du profil limitent l’accès aux modules. Le salarié reste membre de l’établissement. Une date de fin de contrat sert au calcul. |
| Retirer du restaurant / archiver | La commande de retrait archive désormais le profil de l’établissement, retire le membre du roster, révoque le PIN et invalide les sessions de ce compte. Les services, pointages, pauses, historiques, contrats, avenants, congés, soldes, pièces et écritures de paie sont conservés. Le responsable autorisé retrouve l’historique dans le Rapport RH, la Pointeuse et le planning exporté. Les documents et les demandes passées restent consultables côté serveur pour un responsable autorisé. |
| Multi-établissement | Les profils, droits, données et PIN des autres restaurants restent en place. L’invalidation des sessions s’applique au compte. Le salarié se reconnecte pour continuer dans les autres établissements. Sans rattachement actif, la connexion et la récupération du compte employé sont bloquées. |
| Réactiver | Le propriétaire restaure explicitement le même profil depuis « Membres archivés ». Le journal d’archivage est conservé, la Pointeuse provisionne un PIN et les permissions de l’établissement doivent être attribuées à nouveau. Le cycle ne modifie ni l’ancien contrat ni ses avenants. Une réembauche avec un nouveau contrat ou une rupture de droits exige de faire valider les dates, paramètres et soldes du nouveau cycle avant la paie. |
| Effacer définitivement | Le propriétaire connecté peut traiter un dossier archivé depuis l’annuaire. Les coordonnées et l’identité directe du profil sont retirées. La référence comptable devient pseudonyme et le rattachement ne peut plus être réactivé. La décision de conservation par catégorie relève du responsable de traitement. [Référentiel RH de la CNIL](https://www.cnil.fr/fr/referentiel-durees-conservation-donnees-rh) · [RGPD, article 17](https://eur-lex.europa.eu/eli/reg/2016/679/oj/fra) |

La transaction d’archivage refuse un pointage ouvert et exige de traiter les services et congés à venir. La révocation, le retrait et l’archivage réussissent ou échouent ensemble. Une écriture de paie concurrente contrôle le rattachement dans sa transaction. Pour un départ effectif, renseigner la date de fin contractuelle attestée pour les calculs de congés et de compteurs, puis traiter la file hors ligne et les anomalies de Pointeuse. La date d’archivage date l’action administrative. Les données déjà supprimées requièrent une vérification des sauvegardes et, si disponibles, une reprise contrôlée.

**Résultat après correction.** L’essai HTTP sur période verrouillée donne 240 min planifiées, 240 min payées, CDI 35 h, un avenant et une session avant et après archivage. Les cinq feuilles Excel sont identiques hors métadonnées de fichier. Dans les PDF de Pointeuse et du planning, le texte extrait et la pagination sont identiques hors date de génération. Le test multi-établissement compare également les valeurs du rapport, l’historique et les feuilles Excel des trois exports, dont congé approuvé et avenant à 37 h, avant archivage, après archivage, après réactivation, puis après retrait des deux établissements. Dans Chrome, un salarié fictif passe de l’annuaire aux archives, reste visible comme « Ancien salarié » avec son CDI 35 h dans le rapport, puis revient dans l’annuaire après réactivation.

### Effacement d’un dossier archivé

1. Le responsable du traitement examine la demande et les obligations de conservation selon les catégories de données. Vérifier les justificatifs un par un, consigner la décision et les échéances dans le dispositif de suivi de l’établissement. Pour un contrat ou un justificatif encore nécessaire, laisser sa case de retrait décochée. L’action ne calcule aucune échéance de conservation.
2. Le propriétaire ouvre **Gestion du personnel → Membres archivés → Supprimer définitivement**. Après revue des pièces, saisir **SUPPRIMER** et confirmer l’examen des obligations. La route refuse un dossier actif, un établissement tiers et les sessions de délégation super-admin.
3. L’effacement retire les coordonnées du profil et la copie d’identité dans la Pointeuse de l’établissement. L’identifiant salarié et le profil restent en place comme référence pseudonymisée pour conserver le détail des rapports. Le journal contient la date, l’opérateur et les compteurs de pièces, sans copier les coordonnées. Le dossier traité ne peut plus être réactivé. Lorsqu’il existe un autre rattachement actif ou archivé en attente d’effacement, le compte et les données de cet autre établissement sont préservés. Les exports du premier établissement cessent d’afficher les coordonnées globales.
4. Les contrats, avenants, services, pointages et signatures justificatives, absences, congés, repas, ventilations, matricules de paie et pièces non sélectionnées restent dans le périmètre historique. Les textes libres et pièces conservées peuvent rester identifiants. Les pièces conservées sont consultables par le propriétaire depuis **Dossiers historiques pseudonymisés**. À l’échéance, revoir les justificatifs conservés, les sauvegardes et les exports déjà remis dans la procédure du responsable de traitement. Le parcours d’effacement initial est idempotent et ne traite aucune purge ultérieure automatique.
5. Si la dernière affiliation légitime disparaît, les identifiants, coordonnées, codes de réinitialisation et la référence de photo du compte sont retirés. La photo n’est effacée du stockage que si elle reste propre à ce compte. Les fichiers sélectionnés et éligibles passent par la file Cloudinary existante après enregistrement du retrait. Un justificatif encore référencé dans un autre dossier est protégé. Un échec fournisseur est déclaré **en attente**, avec reprise par la file. Le résultat sépare le nombre de documents retirés et conservés.

**Recette.** L’effacement a été appliqué par l’API locale sur un dossier fictif archivé dans Chrome. Avant et après, le rapport retourne 210 min planifiées, 210 min rémunérées, un volume contractuel de 37 h et une absence. Les cellules des cinq feuilles XLSX restent identiques à l’exception du changement d’identité. Après remontée des données, Chrome montre le salarié sous pseudonyme dans le rapport, et la pièce contractuelle dans les justificatifs conservés. Une pièce fictive optionnelle a été retirée. Les suites automatisées couvrent également une journée verrouillée, le dossier sans activité, les droits, les références Cloudinary en échec/reprise, la concurrence avec rejeu, le refus de réactivation et les deux affiliations.

## C. Ergonomie et aide à l’exploitation

| Gravité | Parcours | Contrôle ou amélioration |
| --- | --- | --- |
| P2 | Lecture des heures | Gusto distingue prévu, brut et retenu, comme les trois groupes vus dans Skello. Vérifier qu’un responsable identifie immédiatement la valeur exportée quand le mode passe de planning à mixte et qu’un conflit masque un total. |
| P2 | Paramétrage et sauvegarde | Questionnaires et règles datées impliquent brouillon, confirmation, application et date d’effet. À 390 px, les six familles sont accessibles et le focus arrive sur « Fermer », avec retour au rapport par Échap. Faire relire les états de sauvegarde et d’application par un restaurateur. |
| P2 | Planning mobile | Examiner accès aux commandes, défilement des jours et postes, déplacement tactile et alternative sans glisser-déposer, service coupé et publication. |
| P2 | Validation et export | Les conflits natifs ont un message explicite et empêchent l’export. Vérifier en pilote que le responsable rejoint rapidement le bon salarié et le bon service depuis une période étendue. |
| P2 | Changement d’établissement et compte | Le sélecteur s’ouvre au clic sur le titre de l’établissement. Le code utilise un conteneur cliquable et des éléments de liste sans sémantique de bouton ni gestion clavier dédiée. Un restaurateur utilisant le clavier doit pouvoir ouvrir, choisir et fermer ce menu. |
| P3 | Raccourcis et navigation | Étendre le contrôle du focus et du retour après fermeture aux autres modales à fort usage, et vérifier les libellés des icônes sur mobile. |

## D. Sécurité et intégrité

- Les tests de routes couvrent propriétaire, employé, comptable et administrateur, filtrage par restaurant, refus des documents d’un autre salarié, URLs de téléchargement temporaires et stockage authentifié simulé. L’autorisation serveur et les tests de changement de restaurant complètent le contrôle visuel.
- Le PIN est lié au profil actif et à l’établissement. La borne utilise un secret d’appareil, des signatures de badge et un coffre local. Les opérations concurrentes de Pointeuse, les idempotences et les transactions de lots sont exercées sur replica set. Tester également la révocation effective au retour réseau sur matériel.
- Le correctif de cet audit remplace la liste des routes sensibles par une règle Workbox prioritaire `NetworkOnly` et `cache: "no-store"` pour tout GET sous `/api`. La règle API `NetworkFirst` par défaut de next-pwa est retirée. Aucune exception publique nécessaire n’a été identifiée dans le manager.
- Le fichier utilitaire de motif a été supprimé. `worker/index.js` reste nécessaire à l’activation. Le nettoyage natif Workbox des anciens précaches ne retire pas les réponses d’exécution déjà stockées. Le worker inspecte les entrées avec un chemin `/api` rattachées à l’origine du manager ou à l’origine API configurée, y compris celles classées historiquement comme fichiers statiques. Les caches, les ressources tierces et IndexedDB sont préservés. Si la production a changé l’origine API auparavant, recenser et traiter ses entrées héritées avant rollout.

## E. Calculs et classeur de paie

| Catégorie | Conclusion |
| --- | --- |
| A. Écart de fonctionnalité | L’export Excel couvre le rapport RH. Les essais n’établissent pas une interface paie PDF équivalente ni un export chômage partiel. Le profil comptable testé expose une surface spécifique. |
| B. Écart de paramétrage | Arrondis, repli de pause, source du travail, bandes, taux, seuils, qualifications d’absence et repas exigent validation. Aucun taux supplémentaire retenu à partir du seul affichage Skello. |
| C. Écart historique | Les preuves d’octobre indiquent 454 services, 2 138 h 05 sur S40–S44 et 1 912 h 40 sur octobre. 41 écarts au rejeu avec arrondi à cinq minutes, chevauchement historique du 12 octobre et 40 minutes dominicales non expliquées par la règle visible. Les données source sont conservées. |
| D. Défaut de calcul ou de conservation Gusto | La Mission 20 a reproduit puis bloqué la double rémunération de 30 min entre deux services natifs. Le retrait destructif du profil faussait aussi le rapport régénéré. Les tests de cet audit confirment la conservation des données après archivage. Le rapport de migration peut présenter un chevauchement attesté de la source dans les données historiques. L’utiliser comme donnée de reprise exige un arbitrage, car le blocage natif des exports porte sur les pointages natifs. |

Les cinq feuilles sont la **synthèse de période**, **Fiche employés**, **Détails**, **Absences Employés** et **Solde Congés**. La comparaison historique a contrôlé le détail (454 services et 212 absences), les totaux de semaine, 15 soldes de congés et les types des cellules. Pendant cet audit, les tests couvrent les cinq feuilles, en-têtes, durées typées, absence de formules injectées, période sélectionnée et calculs de chevauchement. Les synthèses hebdomadaires peuvent reprendre des jours limitrophes hors du mois sélectionné, tandis que des colonnes de détail suivent la fenêtre civile. Réconcilier à dates et périmètres identiques. Les options de taux, cumuls et assiettes en euros attendent une validation comptable distincte. [Rapprochement détaillé](personnel-report.md)

## F. Preuves de recette

**Nouvelles observations Skello, Chrome en lecture seule.** Planning Jour/Semaine/Mois et affichage partiellement publié, Annuaire avec recherche et sous-onglets de fiche, colonnes prévues/badgées/rémunérées et historique de Badgeuse, options d’export du rapport, règles et compteurs, repas, catalogue Absences et paramètres Badgeuse. Aucun changement, envoi ni téléchargement Skello. Les notes ne contiennent aucune identité salariée ni valeur contractuelle individuelle.

**Nouvelles suites techniques.** Sous Node 24.22.1, première relance fonctionnelle de 156 tests backend et 37 frontend, puis 140 tests backend et 43 frontend après le correctif du cycle de vie, sans échec ni test ignoré dans les relances finales. Les ensembles se recouvrent. Replica set local confirmé par `hello`, primaire et seul membre sur boucle locale, bases générées par les suites. La première exécution a utilisé par erreur Node 20 dans le sous-shell et une URI avec nom de base, alors que quatre suites exigent une URI sans nom. Le premier test de réactivation attendait un droit absent, que le schéma matérialise à `false`. Ces erreurs ont été corrigées avant relance. ESLint ciblé, `git diff --check` et build Next.js sous Node 24 validés. Le build signale des avertissements de lint existants et n’a pas optimisé les feuilles Google Fonts indisponibles.

**Nouveaux tests Chrome, Gusto local.**

- **Cache.** Quatre entrées API fictives déposées dans `apis`, `cross-origin`, `static-data-assets` et `static-image-assets`. Le premier essai de mise à jour n’a pas observé l’activation dans son délai. Après fermeture des onglets locaux qui utilisaient le worker, Chrome a confirmé `activated` sous `/sw.js`, zéro marqueur API restant et trois témoins conservés, dont une URL API d’un tiers et des ressources hors API. Les requêtes authentifiées du Bistro fictif A (restaurant/cartes cadeaux, réservations, CallSense, vente à emporter et brouillon RH) et une URL API fictive en `.csv` ont répondu `200` avec zéro réponse Gusto dans Cache Storage. Ces essais couvrent la lecture des modules voisins et la politique de cache.
- **Sessions.** Même compte, Bistro A avec son salarié fictif, puis Bistro C au roster vide, puis retour à A. Après déconnexion par le menu Gusto, la page de connexion s’affiche et le contrôle mesure encore zéro réponse Gusto en cache. Connecté avec un second propriétaire, le Bistro B affiche son roster vide. Les tests de routes serveur fournissent la preuve complémentaire pour le refus des documents ou rapports hors établissement.
- **Pointeuse.** Borne appairée, puis coupure simulée des requêtes de la Pointeuse vers l’API locale. Arrivée, début et fin de pause puis départ signés dans Chrome. La borne a retrouvé ses deux premiers badges après rechargement, puis les quatre après fermeture/réouverture pendant la mise à jour du worker. MongoDB indiquait zéro événement avant reprise. Après rétablissement, la file s’est vidée et MongoDB indiquait un service, quatre identifiants de badge distincts et une pause. Le rejeu du dernier badge signé a répondu `200` avec les mêmes compteurs. Ce scénario cible la coupure de l’API et la conservation locale. La coupure totale frontend/API et la correction jusqu’à l’Excel relèvent de la Mission 20.
- **Ergonomie.** Annuaire, planning et rapport ouverts à 390, 820 et 1 440 px. Aucun débordement du document sur ces vues, le rapport utilise son propre conteneur à défilement horizontal. Les changements Jour/Semaine/Mois ont réaffiché la région correcte. Le dialogue RH à 390 px présente les six familles. Le rapport fictif affiche le motif du blocage sur chevauchement. La navigation tactile complète, la saisie mobile, le geste de glisser-déposer et la réception de notifications demandent encore une recette utilisateur.

**Preuves antérieures reprises.** 291 tests backend et 157 frontend distincts dans la Mission 20. Chrome aux trois largeurs, création du planning et publication, aperçu JSON, brouillon et reprise, validation/correction d’un conflit, purge Workbox, reprise de quatre badges et concordance Pointeuse/Rapport/Excel. Ces constats restent des preuves datées de la Mission 20. [Recette Mission 20](mission-20-recette-finale-rh.md) · [Règles futures](mission-16-regles-rh.md) · [Rapprochement](suivi-audit-rh-2026-11-21.md) · [Collecte et reprise](collecte-configuration-rh-skello.md) · [Migration des règles](mission-17-migration-regles-rh.md)

| Parcours | État de preuve |
| --- | --- |
| A · Nouveau restaurant | Preuves composant par composant et recette antérieure Chrome. Rejouer l’activation jusqu’au premier Excel en un cycle continu. |
| B · Restaurant Skello | Intégrations JSON et XLSX sur MongoDB fictive. Le rapprochement des dossiers réels est vérifié avec le serveur en mode production. L’exploitation des historiques et des soldes requiert une validation distincte. |
| C · Salarié | Nouvelle couverture documents, règles de congé et interface personnelle. Mission 20 pour connexion et planning publié. Soumission, approbation, notifications et téléchargement avec stockage dédié à refaire ensemble. |
| D · Responsable | Nouvelles suites ciblées de planning, congés et Pointeuse, droits du gestionnaire. Une répétition continue avec validation et lecture du rapport est à programmer sur le pilote. |
| E · Comptable | Nouveaux tests du périmètre API et du restaurant actif. Recette navigateur du rôle et validation du fichier attendu à compléter. |
| F · Incident | Rejoué dans Chrome de la coupure de l’API à la synchronisation vérifiée sur MongoDB, y compris après activation du worker et avec rejeu du dernier badge. Correction, validation et export après incident repris de la Mission 20. Matériel Android en attente. |

## G. Conditions avant mise en production

1. **Cibles et secrets de déploiement.** Confirmer les variables Vercel/Render, la base `NEXT_PUBLIC_API_URL`, CORS avant chargement du frontend, secrets JWT/Pointeuse et fuseau Europe/Paris. `server/app.js` lit `CONNECTION_STRING_TEST` et la liste CORS affichée dans le code est fixe. Faire confirmer que le domaine de préproduction/production et la cible API correspondent au routage réel. Le backfill de déploiement confronte sa cible à `CONNECTION_STRING`. Aligner API, sauvegarde et backfill. Aucun contrôle de l’infrastructure réelle pendant cet audit.
2. **MongoDB.** Valider replica set, droits de transaction, collection des gardes de Pointeuse, uniques PIN/idempotence/lots et index de période. Réaliser et restaurer un instantané dans un environnement distinct, couvrir données et fichiers privés, simuler le rapprochement après rollback.
3. **Confidentialité et service worker.** Sur un navigateur préproduction ayant l’ancien worker, confirmer activation du nouveau, disparition des réponses Gusto Cache Storage, accès après déconnexion/changement d’établissement, préservation de la file IndexedDB. Vérifier dépôt, téléchargement autorisé, refus croisés et retrait dans Cloudinary privé.
4. **Prérequis par restaurant.** Confirmer les six familles, toutes les décisions de paie applicables et les dates d’effet. Vérifier la couverture PIN en lecture seule, attribuer les PIN manquants selon la procédure, et exécuter l’appairage avec l’appareil cible.
5. **Android si activation de Pointeuse.** Installation en mode autonome, veille, fermeture forcée, redémarrage sans Wi-Fi, récupération des badges de plusieurs salariés et refus d’un PIN révoqué revenu en ligne. Tester le tactile, la taille des contrôles et la signature.
6. **Ordre et reprise.** Préparer sauvegarde, bascule et rollback compatibles avec la file hors ligne. En cas d’incident, suspendre les exports concernés et préserver les événements, la protection du cache et le garde-fou de chevauchement. Après ouverture, la retouche des libellés, certains raccourcis et les fonctions Skello non utilisées peuvent être planifiés hors fenêtre de bascule.
7. **Départs déjà traités.** Avant production, recenser les retraits réalisés avec l’ancienne route. Pour ceux qui ont un historique de paie à régénérer, rapprocher export, sauvegarde et pointages en base, puis valider la reprise si nécessaire. Définir l’accès aux archives intermédiaires et la procédure d’effacement avec le responsable de traitement.

## H. Écarts prioritaires

| Niveau et état | Parcours, impact et reproduction | Attendu et traitement |
| --- | --- | --- |
| P0 · Corrigé localement | Confidentialité. L’ancienne configuration laissait une nouvelle route privée ou une API d’un module voisin passer dans `cross-origin` ou dans une stratégie de fichiers selon l’URL. | Aucun GET API dans Cache Storage. Activer la règle réseau et purger les anciennes entrées Gusto. Vérifier l’activation avant ouverture. |
| P0 · Corrigé en Mission 20, contrôlé | Deux services natifs contigus après correction partagent 30 min si la fin du premier déborde. | Refuser les intervalles rémunérés concomitants, bloquer l’export concerné et conserver les heures brutes. |
| P0 · Corrigé localement | Départ salarié. Sur une journée verrouillée, un retrait supprimait les données contractuelles et 4 h planifiées du rapport, alors que le badge restait en base. | Archiver la relation et révoquer ses accès sans effacer le dossier. Rapports et feuilles historiques comparés. Vérifier les retraits antérieurs en préparation du déploiement. |
| P1 · Procédure de conservation à mettre en place | L’effacement traite l’identité du profil et les pièces sélectionnées. Des justificatifs, textes libres, sauvegardes et copies exportées peuvent rester identifiants. | Confirmer les durées par catégorie et les accès aux archives avec le responsable de traitement. Revoir les échéances de conservation en dehors du cycle d’archivage. |
| P0 · Condition préproduction | Reprise des données ou sortie de document privé. Dépend de la cible MongoDB, des droits de transaction, de la restauration et du fournisseur privé. | Exécuter les contrôles de la section G sur préproduction et restaurer l’instantané dans une cible isolée. |
| P1 · Reprise à valider pour Les Artistes | Le rapprochement des dossiers est disponible en exploitation. Les avenants, soldes et historiques nécessitent une validation et une reprise séparées. | Vérifier les identités par matricule, les dossiers créés ou rapprochés, les volumes et les soldes d’ouverture. |
| P1 · Bloquant pour Les Artistes | Octobre : trois fins après minuit donnent 40 min d’assiette dominicale supplémentaires dans Gusto. Le 12 octobre, deux horaires source se chevauchent. | Statuer sur l’assiette et les corrections historiques avec justificatifs et comptable. Rejouer le traitement en parallèle, sans exception ad hoc dans le calcul. |
| P1 · Condition d’activation de la borne | Test physique tablette Android en attente. Un rechargement Chrome ne reproduit pas la gestion du stockage, la mise en veille et les interruptions Android. | Recetter la tablette du restaurant, avec événements persistés et révoqués observés après retour réseau. |
| P1 · Selon le restaurant | Les règles des temps partiels atypiques, de forfait jours ou de certains compteurs spécialisés n’ont pas toutes un équivalent démontré. | Identifier les cas réellement présents et obtenir l’accord du comptable ou traiter l’écart avant activation pour ces salariés. |
| P2 · Ouvert | Compréhension de la date d’activation, de l’assiette retenue et du suivi de l’anomalie jusqu’au service à corriger. | Mesurer la compréhension lors du pilote à rôle réel et traiter les erreurs qui empêchent une clôture autonome. |
| P3 · Acceptable au lancement | Gestion groupée des documents et options de collecte ou d’alerte Skello non requises par le pilote. | Évaluer selon l’usage, après stabilisation du périmètre essentiel. |

## I. Critère de bascule Les Artistes

Réconcilier les profils, contrats, avenants, soldes et règles actives. Résoudre les données historiques ambiguës en documentant ce qui doit rester consultable. Faire un cycle complet en parallèle avec un cas de service de nuit, une exception de Pointeuse, un congé et un export comptable. Le restaurateur et le comptable valident les écarts résiduels, les montants et la date de prise d’effet avant toute substitution.
