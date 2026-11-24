# Rapport RH

Le répertoire ouvre `/dashboard/employees/reports`. Le rapport et l’export utilisent la même projection par salarié. Les filtres sont la période Europe/Paris, le salarié, le poste et la recherche par nom, poste ou matricule.

## Correspondance des colonnes

| Groupe du rapport | Source et convention Gusto |
| --- | --- |
| Salarié | Identité du profil de l’établissement. Pour un ancien salarié dont le profil a été retiré, identité historique enregistrée sur le pointage et uniquement les données encore disponibles. |
| Données Contractuelles | Matricule, type de contrat et poste du profil. La date de début reprend la date de prise de poste. La date de fin et la note d’archivage sont renseignées dans **Emploi et contrat → Données de paie**. Le volume hebdomadaire s’affiche sous le nom si l’unité contractualisée est la semaine. |
| Données Salariales | Le volume mensuel reprend le volume contractuel exprimé en heures par mois ou le volume mensuel saisi dans les données de paie. Le taux horaire et le salaire mensuel brut sont renseignés dans la fiche. Les données contractuelles affichent la fiche actuelle. |
| Planning et heures retenues | Les colonnes Sxx additionnent les heures planifiées nettes, les relevés historiques admissibles et les absences prises en compte du lundi au dimanche. Le détail distingue chaque composante. Les jours configurés priment. À défaut, lorsque le planning renseigne toute la semaine, le volume est réparti sur les jours hors repos. Le dépassement contractuel s’affiche lorsqu’il est positif. La synthèse Excel identifie les heures supplémentaires ou complémentaires exceptionnelles, ou la variation du compteur, et la fiche individuelle présente le même total hebdomadaire que l’écran. |
| Pointage et paie | Part brute, pause pointée et net selon le registre de la Pointeuse. Temps rémunéré et pause déduite selon les corrections de paie du même registre. La Pointeuse répartit ces mesures entre les jours où elles ont lieu. L’écart rémunéré/prévu reste vide lorsqu’une des mesures manque ou qu’un pointage est en cours. |
| Heures majorées | Calcul hebdomadaire selon les paramètres du restaurant et le volume applicable à chaque date. Les heures structurelles suivent la part du contrat au-dessus du seuil, répartie sur les jours contractuels configurés. Les heures exceptionnelles et complémentaires suivent les heures de la semaine et leurs tranches. Les heures de nuit, du dimanche et des jours fériés ont leurs propres colonnes. |
| Total Absences Période | Absences du planning, demandes approuvées sans doublon et absences de pointage validées. Les types comptent les événements et les motifs de la période s’affichent dans le tableau. École - CFA est un motif distinct. Le retard additionne les écarts établis par un pointage validé et les durées historiques importées. En cas de pointage validé sur le même service, sa valeur prévaut, y compris à zéro. |
| Éléments de Rémunération | Le crayon dans les colonnes de primes et d’avances ouvre une saisie par mois de paie. Le rapport additionne les montants des mois couverts par la sélection. Le transport correspond au montant mensuel de la fiche. Les repas sont calculés séparément selon les règles ci-dessous. |
| Solde Congés | Si le compteur est activé, le rapport et l’export calculent les jours acquis, pris, planifiés et disponibles. Un salarié déjà présent au démarrage peut reprendre son historique dans **Fiche salarié → Emploi et contrat → Solde d’ouverture des congés**. La saisie datée à la fin du rapport reste lisible quand le compteur est désactivé. |

## Paramètres du rapport

Le bouton **Paramètres** ouvre **Repas**, **Heures majorées**, **Compteur d’heures**, **Absences** et **Congés payés**. Le propriétaire choisit l’activation, les seuils, les taux, les absences créditées, la source des heures et les jours contractuels. Le mode mixte utilise le planning et remplace un service par le pointage rémunéré validé lorsqu’il existe. Le calcul parcourt la semaine complète en heure de Paris et affecte les minutes de chaque tranche à leur date. Une semaine où le temps partiel atteint le seuil temps plein est signalée pour revue avant chiffrage des heures complémentaires.

Le compteur d’heures démarre le lundi choisi. Un mouvement au dimanche précédent fixe le solde d’ouverture. Les mouvements datés ajoutent ou déduisent des heures, fixent un solde, enregistrent des heures déjà payées ou créditent et débitent le repos compensateur. Les mouvements d’une même date sont conservés dans l’ordre de saisie et s’ajoutent avec une révision de concurrence. Les repos compensateurs planifiés débitent le compteur dédié.

Les avenants et cycles annuels se saisissent dans **Fiche salarié → Emploi et contrat**. Un avenant est applicable à sa date d’effet et peut se terminer à une date choisie. Le cycle annuel dure douze mois, avec un objectif renseigné par salarié, un jour d’initialisation et la reprise des heures déjà réalisées. Le seuil hebdomadaire sépare les heures déjà décomptées de l’excédent de clôture.

Les congés utilisent le mois d’activation, le mois de début du cycle et l’unité choisie, avec 30 jours ouvrables ou 25 jours ouvrés pour douze mois complets. L’acquisition avance avec la période couverte du contrat, à partir du planning, des pointages rémunérés validés et des absences qui ouvrent droit à acquisition. La maladie non professionnelle est créditée au taux réduit. Le compteur débite les congés payés approuvés une seule fois et débite le solde antérieur en premier. Au renouvellement, les droits du cycle clôturé passent en N−1. Les reliquats plus anciens suivent le réglage de report choisi. La projection isole les congés approuvés futurs jusqu’à la fin du rapport. Pour un salarié présent avant l’activation, le dernier solde d’ouverture antérieur ou égal à la date calculée sert de point de départ.

Dans le **Planning**, la colonne de total en vue **Semaine → Employés** compare les heures planifiées nettes de pause à l’objectif applicable, avenants compris. Un écart négatif s’affiche en bleu et un surplus en rouge. Le bouton **Compteurs** affiche le cumul et le reste annuel pour les salariés concernés.

## Repas

Le propriétaire choisit les règles depuis le rapport. Elles prennent effet au mois sélectionné. Gusto prend en charge les avantages en nature avec indemnités, les indemnités seules, les titres-restaurant et la prime panier. Le calcul des repas dus peut se baser sur les jours travaillés, un forfait mensuel, les plages de repas déjà utilisées dans Gusto ou jusqu’à cinq critères de présence et de durée. Un service validé reprend ses horaires rémunérés et remplace le service planifié associé. Les droits liés à un service sont rattachés à son jour de début. Les forfaits et la prime panier sont calculés pour les mois complets couverts par le contrat.

En mode avantages et indemnités, le crayon d’**Avantages Nature** sert à renseigner les repas pris sur place par jour. Zéro confirme qu’aucun repas n’a été pris. Les indemnités correspondent aux repas dus moins les repas pris lorsque ces deux valeurs sont connues et cohérentes. L’export valorise les repas pris si le prix unitaire est renseigné. Les données d’un ancien compteur de repas de la Pointeuse conservent leur sens dans le registre historique.

L’onglet **Absences** renseigne par motif le maintien de l’indemnité repas et le payeur pour Excel. Une absence non classée conserve ses colonnes d’indemnisation vides. L’onglet **Détails** ventile le calcul par payeur et exporte les avenants datés.

## Export et accès

`GET /api/restaurants/:restaurantId/employees/reports` et `POST /api/restaurants/:restaurantId/employees/reports/export/excel` acceptent `from`, `to`, `employeeId`, `post` et `search`. Une période est limitée à 92 jours. Le restaurant doit correspondre à la sélection du JWT. Les propriétaires et responsables habilités au module du personnel peuvent y accéder. Les comptables gardent leur export horaire existant.

Le fichier Excel reprend les cinq feuilles de la référence : période, Fiche employés, Détails, Absences Employés et Solde Congés. La feuille de période contient des groupes fusionnés et reprend la ligne de chaque salarié du tableau, sans total général. Les dates et heures sont des valeurs Excel typées. Les matricules sont du texte pour conserver les zéros en tête. Les champs utilisateurs sont des cellules de texte même lorsqu’ils commencent par un signe de formule.

Les réponses sont privées et sans cache. Le fichier est généré à la demande sans écriture et la feuille de détails est limitée à 40 000 lignes. Le format proposé est Excel. Le PDF historique de la Pointeuse reste disponible depuis la Pointeuse.

Les saisies utilisent `GET` et `PUT` sous `/employees/reports/inputs`. Les données salarié sont limitées au profil du restaurant sélectionné. Les règles restaurant `rules/:mois`, `overtime/:lundi`, `leaveRules/-`, `hoursRules/-` et `absenceRules/-` sont réservées au propriétaire. Une révision concurrente renvoie 409. Le planning charge les objectifs hebdomadaires via `GET /employees/reports/planning-targets`.

## Recette Skello d’octobre 2026

Dans les réglages de majoration, la base de valorisation des congés payés peut être fixée à cinq ou six jours indépendamment des jours contractuels et du compteur d’acquisition. Un congé posé sur un jour couvert prend sa fraction du contrat hebdomadaire, à l’exclusion des repos hebdomadaires explicites. Le calcul répartit les arrondis sur la semaine. L’Atelier des saveurs utilise une base de six jours dans le rapport et cinq jours de travail de référence. [Congés payés dans Skello](https://help.skello.io/fr/articles/3782691-comment-gerer-les-conges-payes-de-vos-salaries-sur-skello).

Lorsque le rapport rattache les services à leur jour de début, les durées des arrêts maladie avec horaires sont incluses dans le total de la semaine. Le dépassement est calculé selon les absences assimilées. La synthèse Excel affiche les heures supplémentaires et complémentaires des semaines closes. Les heures structurelles d’un mois complet peuvent être mensualisées à partir du contrat stable et des tranches configurées. Les heures de nuit, du dimanche et des jours fériés sont mesurées sur leurs plages calendaires. [Colonnes du rapport Skello](https://help.skello.io/fr/articles/7156703-que-trouve-t-on-dans-chaque-colonne-du-rapport-skello).

Pour la recette, les 12 horaires retenus du 1er novembre et les deux du 12 octobre ont été rapprochés avec le planning journalier de Skello en lecture seule. Ils sont enregistrés comme entrées historiques privées, rattachées au lot et aux profils fictifs. Ils alimentent les services retenus et les repas du rapport. Les deux services concomitants du 12 octobre sont signalés dans le détail. Le calcul refuse les doublons, écarte un relevé historique en conflit avec une donnée native et exige une confirmation enregistrée pour tout chevauchement historique. Les 440 services planifiés et les 212 absences du lot d’origine restent les données de Planning. Les pointages bruts et rémunérés restent issus du registre de la Pointeuse.

Les repas dus suivent deux repas par jour travaillé sur cette recette, complétés par les règles de maintien applicables aux congés payés et aux arrêts maladie. Les repas pris proviennent des relevés historiques et des saisies du rapport. Le coût de 44 € par repas correspond au classeur de référence, avec un paramétrage limité à la recette. [Indemnisation des repas dans Skello](https://help.skello.io/fr/articles/7156886-quels-sont-les-differents-types-dindemnites-repas-disponibles).

| Contrôle d’octobre sur les 15 profils fictifs | Skello | Gusto |
| --- | ---: | ---: |
| Rapport à dates alignées, S40 à S43 | 56 valeurs et 4 cellules sans activité | 60 concordances |
| Rapport à dates alignées, S44 | 14 valeurs et 1 cellule sans activité | 15 concordances |
| Services retenus sur octobre | 1 912 h 40 | 1 912 h 40 |
| Pauses sur octobre | 183 h | 183 h |
| Jours travaillés sur octobre | 248 | 248 |
| Heures supplémentaires ou complémentaires exceptionnelles | 185,49 h | 185,49 h |
| Heures supplémentaires structurelles | 56,33 h | 56,33 h |
| Heures de nuit | 300,25 h | 300,25 h |
| Heures fériées | 1,75 h | 1,75 h |
| Heures du dimanche | 222,75 h | 223,42 h |
| Repas dus / pris / indemnités | 586 / 404 / 182 | 586 / 404 / 182 |

Le rapprochement en lecture seule couvre les dates incluses du 28 septembre au 1er novembre 2026 dans les deux rapports. Il associe les lignes au lot d’import, puis compare les cellules au centième d’heure. Les heures de la synthèse Excel sont rapprochées séparément sur le mois d’octobre.

| Profil fictif | S40 | S41 | S42 | S43 | S44 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 01 | 36,75 | 36,08 | 36,67 | 37,08 | 35,83 |
| 02 | 40,42 | 40,17 | 38,58 | 35 | 42 |
| 03 | — | — | — | — | — |
| 04 | 35 | 35 | 35 | 35 | 35 |
| 05 | 27,25 | 24,50 | 25,08 | 27,25 | 30,58 |
| 06 | 38,50 | 37,67 | 45,83 | 38,08 | 41 |
| 07 | 35 | 36,50 | 35 | 36,58 | 35,50 |
| 08 | 44,83 | 42,83 | 43,75 | 43,33 | 43,50 |
| 09 | 22,75 | 21,08 | 22,67 | 21,50 | 23,33 |
| 10 | 43,58 | 41,83 | 38,33 | 39,75 | 38,58 |
| 11 | 43,17 | 39,33 | 38,92 | 38,75 | 40,58 |
| 12 | 22,50 | 23,50 | 22,92 | 30,33 | 25,25 |
| 13 | 41,17 | 37 | 20,50 | 45,50 | 3,50 |
| 14 | 37,92 | 37,83 | 38,25 | 40,08 | 39 |
| 15 | 44,17 | 35 | 43,33 | 42,75 | 41,58 |

Le rapport Skello affiche une fenêtre dimanche de 00 h à 24 h. Le détail d’octobre crédite des heures après minuit pour plusieurs shifts du samedi au dimanche. Il exclut également le tronçon du lundi sur les shifts du dimanche 18 octobre. Les 40 minutes d’écart concernent trois shifts du samedi 3 octobre, tous prévus de 18 h à minuit. Le planning Skello affiche ensuite deux fins retenues à 00 h 10 et une à 00 h 20. Ces observations établissent la coupure calendaire et le résultat de ces trois cas. La règle qui décide quelle plage utiliser après correction du shift reste à confirmer. Gusto conserve son calcul sur la fenêtre calendaire du dimanche avec les données disponibles. [Colonnes du rapport Skello](https://help.skello.io/fr/articles/7156703-que-trouve-t-on-dans-chaque-colonne-du-rapport-skello) · [Paramétrage du rapport Skello](https://help.skello.io/fr/articles/5074177-comment-modifier-les-regles-du-rapport-dans-le-cadre-d-une-convention-collective-flexible).

Les six retards d’octobre sont lisibles dans **Détails**, **Fiche employés** et **Absences Employés**. Ils représentent 275 minutes. L’import prend les durées explicites de **Détails** pour les services raccordés du mois exporté et les stocke dans le rapport RH avec le lot, le profil, le service et ses horaires. Les autres onglets fournissent un contrôle de cohérence. Les retards sont identifiés comme historiques dans l’Excel. Le classeur mensuel ne fournit pas les heures brutes et les pauses réellement badgées séparément des horaires retenus. La reprise ne crée aucun pointage et n’entre pas dans le calcul des heures rémunérées. [Export Badgeuse Skello](https://help.skello.io/fr/articles/7252651-comment-suivre-les-heures-d-arrivee-et-de-depart-badgees-sur-skello).

### Contrôle avant la bascule

La Badgeuse de Les Artistes Limoges confirme les trois services du samedi 3 octobre. Début prévu 18 h, fin prévue à minuit, pause prévue de 30 min, sorties badgées à 00 h 08, 00 h 08 et 00 h 18, pauses badgées de 0 min. La journée validée affiche 00 h 10, 00 h 10 et 00 h 20 en sorties rémunérées, avec 30 min déduites par service. Ces trois fins figurent déjà dans les créneaux importés dans la recette Gusto. Le rapport de recette utilise donc ces horaires comme source Planning, avec rattachement hebdomadaire au début du service et majoration sur la fenêtre civile du dimanche. Les 15 profils de recette sur S40–S44 n’ont ni valeur brute ni valeur rémunérée dans le rapport archivé.

Le rapport Skello affiche « Heures du Dimanche 50% ». Les règles Badgeuse actuelles retiennent l’arrivée prévue et le départ badgé. L’arrondi et le minimum de pause prévue sont désactivés. Ces réglages sont ceux vus lors du contrôle et ne datent pas les calculs d’octobre. L’Historique affiche les validations qui s’écartent des règles de l’établissement. Pour expliquer l’assiette de 40 min, il faut la règle qui choisit les horaires de référence pour la majoration, les paramètres effectifs le 3 octobre, et l’historique ou le détail de calcul des trois services concernés. Le calcul Gusto reste en vigueur. Un service traversant minuit avec une sortie corrigée peut reproduire un écart tant que le restaurant et le comptable n’ont pas confirmé l’assiette applicable. [Règles du rapport Skello](https://help.skello.io/fr/articles/5074177-comment-modifier-les-regles-du-rapport-dans-le-cadre-d-une-convention-collective-flexible) · [Paramètres Badgeuse](https://help.skello.io/fr/articles/7182933-comment-parametrer-les-regles-de-la-badgeuse).

Pour le rapprochement complet, ouvrir **Les Artistes Limoges → Badgeuse → Journée ou Employés → Télécharger les badges**. Sélectionner les 15 salariés du lot et la période du 28 septembre au 1er novembre 2026 inclus. Choisir l’export natif détaillé des horaires prévus, badgés et rémunérés. Skello envoie un lien valable sept jours à l’adresse du profil. La documentation ne précise ni l’extension ni les options du formulaire. Un fichier suffit si les pauses, absences, validations et corrections y sont identifiables. Si ces deux derniers champs manquent, compléter par les lignes utiles de **Badgeuse → Historique** et par les états de validation de **Journée**. [Procédure officielle de Skello](https://help.skello.io/fr/articles/7252651-comment-suivre-les-heures-d-arrivee-et-de-depart-badgees-sur-skello).

Le script `server/scripts/compare-time-clock-registers.js` compare deux fichiers JSON normalisés et anonymisés sur une plage inclusive. Préparer un fichier par source, pour un seul établissement, avec une ligne par service et le même triplet `employee`, `date`, `service`. Utiliser des pseudonymes communs, la date de début du service à Paris et un code attribué après vérification du service. Si plusieurs services tombent le même jour, les rapprocher à l’aide de leurs identifiants ou des horaires et du poste. Laisser une ligne d’un seul côté quand le rattachement est incertain. L’historique des correspondances avec les identités réelles reste dans l’environnement de recette.

| Champs JSON | Valeurs attendues |
| --- | --- |
| `plannedIn`, `plannedOut`, `clockedIn`, `clockedOut`, `paidIn`, `paidOut` | Horodatages ISO avec date et décalage explicite, y compris après minuit et lors de l’heure répétée. |
| `plannedBreak`, `clockedBreak`, `paidBreak`, `paidMinutes`, `lateMinutes` | Durées en minutes entières. Employer les événements de badge d’origine ou l’historique pour le brut si le registre affiche des horaires corrigés. |
| `validated`, `absent` | Booléens issus du registre. |
| `corrections`, `anomalies` | Listes de codes convenus, sans texte libre ni identifiant réel. Utiliser `[]` quand l’absence d’événement est vérifiée. |

Utiliser `null` ou omettre un champ quand la source ne le fournit pas. Une absence de badge reste une donnée manquante et une pause de zéro minute reste une valeur mesurée. La Pointeuse Gusto fournit le registre par périodes de 31 jours maximum. Pour ces cinq semaines, préparer deux plages Gusto (28 septembre–28 octobre et 29 octobre–1er novembre), puis grouper les segments d’un même service avant la comparaison. Consulter aussi l’Historique si une correction ou validation est intervenue après la période de travail. Une reprise Planning historique ne constitue pas un badge brut Gusto.

Depuis `gusto-manager/server`, exécuter localement avec les chemins des deux fichiers anonymisés :

```sh
node scripts/compare-time-clock-registers.js 2026-09-28 2026-11-01 badgeuse-anonyme.json pointeuse-anonyme.json
```

La sortie détaille les écarts et les champs indisponibles par service, ainsi que les services présents dans une seule source. Le total rémunéré compare uniquement les services dont les deux durées rémunérées sont connues. Contrôler le nombre de services comparés et les lignes incomplètes avant de conclure.

### Rapprochement de l’export Badgeuse du 21 novembre 2026

Depuis `gusto-manager/server`, `python3 scripts/normalize-skello-badgings.py CHEMIN_CSV` lit le CSV natif et produit un JSON sur la sortie standard. Le JSON contient les services, les absences, des codes de salarié propres à l’export et les numéros de ligne. Pour le comparateur, utiliser son tableau `services` et attribuer les codes communs des deux sources. Conserver les fichiers de travail anonymisés hors dépôt. Les noms et identifiants source ne sont pas exportés par le script.

Le normaliseur mesure des minutes écoulées en Europe/Paris. Pour une durée rémunérée supérieure à 24 h, il ne ramène la date de fin à celle du début que si la ligne a un prévu traversant minuit, une entrée et une sortie badgées le jour du début et une heure de fin compatible avec la sortie badgée ou son arrondi à cinq minutes. Les durées incohérentes restantes ou les heures civiles ambiguës sont signalées. Le fichier initial conserve ses valeurs. Les 56 corrections de cet export, dont 47 en octobre, sont corroborées par les 454 triplets début, fin et pause rémunérés du classeur Skello et du lot historique Gusto.

Sur S40–S44, les 14 identifiants source correspondent chacun à un profil par leur ensemble d’horaires rémunérés et leurs totaux d’absences par motif. Le profil fictif 03 n’a ni service ni absence dans ce lot. Le profil 04 a 35 lignes d’absence et aucun service. Les 212 absences du CSV sont dépourvues de date et concordent au niveau des motifs par profil. Le rapprochement des services donne 2 138 h 05 rémunérées, dont 1 912 h 40 sur octobre. Les 405 badges complets totalisent 2 071 h 19 badgées. Les 44 services sans badge et les cinq sorties manquantes conservent leurs horaires rémunérés source et leurs champs de badge manquants. Les pauses rémunérées totalisent 206 h 30. La durée de pause badgée est zéro sur les lignes qui comportent un badge.

Dans la base de développement, la projection concordante correspond à 440 créneaux importés et 14 services historiques du rapport. Parmi les 440 créneaux, 285 diffèrent d’au moins un des champs du prévu Skello. La Pointeuse reste sans session sur la période. Une simulation avec arrivée prévue, sortie au badge arrondi à cinq minutes et pause prévue en l’absence de pause réelle concorde sur 364 des 405 badges complets. Les 41 autres nécessitent les règles effectives ou l’historique des corrections. Le 12 octobre, deux horaires rémunérés d’un même profil se chevauchent sur 250 minutes brutes. Ce chevauchement est présent dans les deux exports et doit être interprété avant usage comptable.

L’analyse de toutes les lignes d’octobre ramène l’écart d’assiette du dimanche aux trois services du 3 octobre. Les numéros de ligne du CSV sont 566, 568 et 570. Pour chacun la date rémunérée après minuit était déjà correcte dans le fichier. Les services comparables de ce même samedi qui devaient finir à 01 h et ont été rémunérés jusqu’à 01 h 25 sont intégralement majorés pour leur tranche du dimanche. Cela écarte un rattachement systématique au samedi et un plafonnement systématique à la fin prévue. L’éligibilité liée à une part prévue le dimanche ou à une particularité de la borne exacte de minuit reste à confirmer. La normalisation du CSV n’entraîne aucune modification de la règle de majoration.

### Rejeu de la Pointeuse sur S40–S44

Les 454 créneaux prévus et les 817 événements de badge anonymisés par scénario ont été traités par les routes et services Gusto sur un replica set local temporaire. L’entrée remise au moteur comprenait les horaires prévus, les événements bruts et les paramètres du scénario. Les horaires rémunérés Skello ont été lus après le calcul pour la comparaison. Les cinq entrées sans sortie ont été rejouées sur des profils de test distincts afin de conserver leurs sessions ouvertes sans ajouter de sortie. Les calculs ont été relus dans le registre Gusto, puis des vérifications ciblées ont utilisé les routes de validation et du rapport RH.

| Scénario sur les 405 services complets | Début, fin et pause concordants | Écart net Gusto − Skello |
| --- | ---: | ---: |
| Sans règle datée, avec le repli de pause standard | 9 | +1 h 29 |
| Arrivée prévue, sortie badgée sans arrondi, pause prévue à défaut | 95 | −17 h 56 |
| Même règle avec sortie badgée arrondie à 5 min | 364 | −18 h 30 |

Le scénario à cinq minutes retrouvait 363 concordances avant la correction Gusto. La ligne CSV 81 comportait deux événements de pause à la même minute, rejoués au même instant. En mode de repli, cette pause de durée nulle empêchait la déduction prévue. La correction conserve les événements et leur durée brute de zéro minute, et applique la pause prévue quand aucune pause de durée positive n’est enregistrée. Le service passe de 210 à 180 minutes rémunérées avec arrondi à cinq minutes. Le scénario sans arrondi et le scénario sans règle datée restent des essais séparés.

Sur les 41 écarts initiaux, 13 sont expliqués sur les champs divergents, un l’est partiellement et 27 nécessitent encore une décision. L’Historique Skello fournit un motif sur 12 lignes, parfois sur un champ différent de l’écart Gusto. Le classeur Skello corrobore six changements d’arrivée par un retard chiffré. Six sorties du 17 octobre ont été rémunérées jusqu’à la fin prévue et sont signalées en conflit avec l’heure de fin par défaut. Les réglages consultés le 21 novembre montrent l’arrondi désactivé. Ils ne datent pas le paramétrage qui a produit la période d’octobre. Les pauses supplémentaires constatées dans le rémunéré ne suffisent pas à établir une règle d’ajout systématique.

Les 44 services sans badge restent au planning sans session rémunérée. Les cinq sessions sans sortie n’ont aucune durée rémunérée, et les routes de validation et de modification du rémunéré renvoient 409. Le 12 octobre, le rapport Gusto après validation ne produit que les 700 minutes du service badgé. Le second service, sans badge, contribue 270 minutes chez Skello et chevauche le premier sur 250 minutes d’intervalle brut.

Dans un rejeu isolé des trois services du 3 octobre, le rapport Gusto attribue 10, 10 et 20 minutes à l’assiette civile du dimanche. Cette mesure chiffre l’écart, mais l’Historique consulté et les paramètres visibles ne démontrent pas la règle d’éligibilité Skello. Aucun changement de majoration n’a été introduit.

La reprise d’un lot déjà importé exige le classeur original vérifié par empreinte, un lot complet et les services présents avec leurs horaires d’origine. Elle s’exécute uniquement sur la base de développement vérifiée. Une relance avec les mêmes données laisse un seul enregistrement de retard par service.

Les cinq feuilles gardent les noms et l’ordre de la référence. Les types de contrat, volumes et dates contractuelles rapprochés concordent. Deux libellés de poste sont anonymisés dans la recette. **Fiche employés** réunit les groupes et blocs hebdomadaires. **Détails** contient 454 services et 212 absences. Pour les semaines débordant du mois, les services restent visibles et seules les heures de nuit des dates sélectionnées sont inscrites dans la colonne de nuit. **Absences Employés** regroupe les congés et arrêts maladie contigus. Dans **Solde Congés**, les sept champs de solde concordent pour les quinze salariés à partir de la reprise datée d’octobre. Le test du calcul dynamique des droits est distinct de ce rapprochement historique. Gusto ajoute les projections et la source du solde. Les dates et durées sont des valeurs Excel typées et l’export reprend les résultats de l’application sans formules.
