# Relevé des réglages RH d’un établissement Skello

## Collecte dans Chrome

Vérifier l’établissement et noter la date de consultation. Travailler en lecture seule. Pour chaque valeur, noter l’écran, le libellé, la valeur affichée, le statut de son équivalent Gusto et les limites. Identifier les valeurs directement observées, les choix propres à Gusto, les déductions en attente et les paramètres indisponibles. Une colonne du rapport documente son intitulé. Sa présence ne suffit pas à confirmer l’assiette ou le taux applicable.

| Écran à consulter | Informations à relever |
| --- | --- |
| Paramètres → Paramètres Badgeuse | Arrivée en avance et en retard, deux départs, arrondi actif ou désactivé, pause badgée, minimum de pause prévu et traitement des pauses absentes ou nulles si visible. |
| Badgeuse → Journée et Historique | Procédure de correction, motif, validation, retard, badges incomplets et horaires rémunérés. Consigner les règles collectives observées. |
| Paramètres → Règles et compteurs, puis Rapport → Heures majorées | Seuils, taux, plages de nuit, source des heures, dimanche et fériés, 1er mai, cumuls et éventuels accords. |
| Paramètres → Règles et compteurs → Compteurs | Dispositif d’heures ou d’annualisation, début, acquisition CP, unité, cycle, exclusions, jours décomptés et reliquats. |
| Paramètres → Absences | Payeur et assimilation par motif. Confirmer les droits repas maintenus et l’unité applicable. |
| Paramètres → Règles → Repas | Mode, droits par jour ou service, forfait, critères, valorisation et saisie des repas pris. Faire confirmer le montant pour la destination. |

Partir d’un export Gusto ou du [fichier Les Artistes](configurations-rh/les-artistes-limoges.json). Utiliser `confirmed` pour une règle complète et validée, `to_confirm` quand une décision ou une preuve manque et `unavailable` quand la valeur est inaccessible. Ajouter des questions précises et les dates d’effet attendues dans le parcours d’import. Conserver uniquement les réglages collectifs dans le JSON.

## Reprise des salariés à part

Dans **Administration → Restaurants → Importer des salariés Skello**, un administrateur charge le rapport XLSX d’un seul établissement. Choisir **Créer un dossier**, **Rapprocher** ou **Ignorer** pour chaque ligne reconnue, vérifier le rapprochement, puis confirmer l’établissement. La création exige un matricule source. Après rapprochement, ce matricule identifie le profil lors du prochain import. Les dossiers archivés et les matricules en conflit bloquent la création d’un doublon.

L’aperçu expire après 15 minutes. Il lie le fichier, le restaurant, l’administrateur, les choix et l’état du roster. La transaction applique le lot en une fois, sans invitation, PIN ni écriture de pointages. Le dossier créé reste à compléter si le salarié doit accéder à Gusto. Le fichier est traité en mémoire et le journal conserve les références internes et les décisions appliquées.

Le parcours de création et de rapprochement utilise les mêmes API en exploitation et en recette. Le [rejeu de paie historique](personnel-report.md), qui génère des profils fictifs, reste isolé sous `/api/admin/restaurants/:id/skello-imports/recette`.

| Donnée | Couverture et contrôle |
| --- | --- |
| Type, volume horaire hebdomadaire, dates et données contractuelles | Repris pour les nouveaux dossiers. Un rapprochement conserve le contrat Gusto en place. Vérifier les unités hors format, les changements de poste et les contrats particuliers dans chaque fiche. |
| Avenants | Vérifier la date d’effet, le volume, l’échéance et le libellé dans **Emploi et contrat → Avenant horaire**. La reprise automatique des avenants n’est pas implémentée dans le classeur actuel. |
| Congés payés | Le classeur de recette peut reprendre un solde daté. Rapprocher les deux compteurs N et N−1, l’unité et la date de clôture. Vérifier le solde d’ouverture avant de démarrer l’acquisition ou de changer d’unité. |
| Compteur d’heures et annualisation | Vérifier les droits repris, heures déjà compensées et objectifs individuels. Utiliser **Mouvement du compteur → Fixer le solde** et **Annualisation** pour les valeurs attestées. La reprise automatique de ces deux dispositifs reste à traiter séparément. |
| Absences, horaires historiques, repas et retards | Le rejeu fictif lit les lignes reconnues. En exploitation, la reprise de ces éléments est distincte de l’import des dossiers. Valider les corrections et couvrir les éléments manquants avant paie. |
