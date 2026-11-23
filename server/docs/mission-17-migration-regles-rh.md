# Assistant de migration des règles RH

## Importer dans un restaurant Gusto

1. Dans **Administration → Restaurants**, ouvrez la fiche de destination avec le module **Gestion du personnel** actif.
2. Cliquez sur **Importer une configuration RH**. Sélectionnez le JSON puis une date de départ future en heure de Paris.
3. Cliquez sur **Comparer les règles**. Vérifiez la destination, le relevé Skello, les valeurs Gusto et la proposition. Ajustez la date dans chaque famille. Pour une règle en attente, ouvrez **Renseigner et justifier la règle**, saisissez les paramètres puis expliquez leur validation. Confirmez séparément la valeur financière des repas pour la destination.
4. Cochez la confirmation puis cliquez sur **Appliquer les règles confirmées**. Le bilan indique les familles écrites et le nombre de familles laissées en l’état.
5. **Exporter la configuration actuelle** récupère les réglages en vigueur. Avant la première date du lot, **Restaurer** rétablit les réglages précédents si les versions du lot sont encore intactes. Une fois une date commencée, **Préparer une restauration future** charge la sauvegarde dans l’aperçu. Choisissez de nouvelles dates pour rétablir la configuration à venir.

## Préparer le JSON d’un autre établissement

Dans Chrome, ouvrir le bon établissement Skello puis relever les paramètres collectifs dans **Paramètres Badgeuse**, **Règles et compteurs**, **Absences** et **Rapport → Heures majorées**. Consulter la Badgeuse en lecture seule lorsque la procédure de validation ou de correction doit être corroborée. Les valeurs observées dans des colonnes de rapport documentent ces colonnes et peuvent laisser incertaines les assiettes ou les taux effectivement applicables. Inscrire cette limite dans la note de l’observation.

Reprendre la structure du [fichier Les Artistes Limoges](configurations-rh/les-artistes-limoges.json) ou d’un export Gusto. Renseigner l’origine et la date de chaque observation, son équivalent Gusto et le degré de confirmation. Ajouter les questions au niveau du fichier. Utiliser uniquement des réglages collectifs et des libellés d’établissement. Les données individuelles, identifiants techniques et secrets sont hors format.

- `format` vaut `gusto.hr-configuration` et `version` vaut `1`. `metadata` indique `source`, `establishment` et `collectedOn`.
- Chaque famille présente dans `rules` expose `status`, `origin`, `values` et `note`. L’origine précise `system`, `path` et `consultedOn`. Les observations nomment chaque règle relevée et précisent sa valeur, son équivalent et sa note éventuelle.
- `confirmed` signifie que la famille proposée est complète et vérifiée pour Gusto. `to_confirm` demande une décision et peut présenter une proposition complète à titre informatif. `unavailable` représente une famille dont les valeurs manquent. Utiliser `null` pour une valeur inconnue, et une note pour expliquer les limites.
- Les six familles sont datées. La Pointeuse (`clockRules`) et les absences (`absenceRules`) suivent le jour, les majorations (`overtime`) et compteurs (`hoursRules`) le lundi, les congés (`leaveRules`) et repas (`rules`) le premier du mois. Le format v1 reste compatible avec les fichiers existants. Une confirmation motivée ajoute `review.on` et `review.reason` sans changer la provenance initiale.
- Une famille complète peut employer des valeurs explicites comme `null` pour un taux non configuré ou `false` pour une option inactive, selon son contrat. L’aperçu refuse les champs supplémentaires, versions inconnues, valeurs invalides et structures incomplètes. Les formats pris en charge utilisent les validateurs du moteur RH.

Le serveur lie l’aperçu au fichier, à la destination, au compte administrateur, aux dates d’effet et aux réglages comparés. L’aperçu expire après 20 minutes. L’application et la restauration utilisent une transaction MongoDB, avec sauvegarde et journal par restaurant. Un nouvel aperçu identique ne produit aucune version ni aucun lot. Les enregistrements historiques `-` des trois familles restent la référence avant la première version datée.

Un changement de majoration du compteur conserve le solde cumulé avec le même début de suivi. Pour démarrer ou reprendre un dispositif, saisissez le solde d’ouverture au dimanche précédent. En congés payés, un changement d’unité ou un redémarrage demande un nouveau solde d’ouverture par salarié exprimé dans l’unité choisie. Une absence qui traverse un changement de payeur est ventilée par date dans le détail Excel.

## Les Artistes Limoges

Les valeurs Skello ont été revérifiées dans Chrome en lecture seule le 22 novembre 2026. Le fichier propose une seule famille applicable, **Pointeuse**. Les arrivées sont retenues au prévu, les départs au badgé et l’arrondi est désactivé. La pause réellement pointée est retenue lorsqu’elle a une durée positive. Sinon, Gusto déduit la pause prévue si elle existe. Ce repli a été choisi pour Gusto. La correction motivée reste disponible au responsable dans la Pointeuse.

Restent à confirmer les bandes et seuils supplémentaires et complémentaires, la mensualisation, la source des heures et les contrats particuliers. Le comptable doit aussi valider la plage de nuit, le rattachement autour de minuit, les fériés dont le 1er mai et les cumuls. Les 40 minutes du dimanche restent ouvertes. Pour les congés et absences, confirmer le cycle, les exclusions, les assimilations et les payeurs. Les deux repas dus par jour et le mode mixte sont visibles. Le montant unitaire et le maintien en cas d’absence restent à établir. Les compteurs Skello désactivés sont consignés dans le fichier et les éventuels dispositifs Gusto sont à valider avec le restaurant.

## API et test local

Le périmètre `/api/admin/restaurants/:id/hr-configuration` fournit l’historique, l’export, l’aperçu, la validation motivée, l’application et la restauration. `POST /preview` et `POST /apply` acceptent `configuration` et une date par famille dans `effects`. L’ancien champ partagé `effect` reste accepté. `/apply` demande en plus le `token` de l’aperçu et `confirmed: true`. `POST /review` valide une proposition sans l’écrire. `POST /:batchId/restore` annule un lot planifié après confirmation. `GET /:batchId/backup` prépare une configuration à programmer. Ces routes exigent le rôle administrateur.

Dans `server`, la suite `tests/employees/hr-configuration.test.js` se lance avec `GUSTO_CLOCK_TEST_MONGO_URI` pointant sur un replica set temporaire dédié à `127.0.0.1`. Chaque exécution crée sa propre base de test. Elle couvre le transfert entre deux restaurants fictifs, le contrôle de date, les valeurs exclues, les aperçus périmés, la concurrence, les deux transactions, l’isolement et les heures lues dans la Pointeuse, le Rapport RH et Excel.

La recette 17.1 couvre l’import des six familles entre deux restaurants fictifs, avec des dates distinctes, et les calculs prospectifs de paie, repas, absences, congés et compteur. Un test compare également les feuilles Excel d’une période clôturée avant et après le changement de compteur. Dans Chrome, le fichier Les Artistes propose la seule famille Pointeuse. La validation d’une proposition fictive de repas a été contrôlée dans l’aperçu. Les six onglets et l’assistant ont été contrôlés sur ordinateur et à 390 pixels.

## Collecte et reprise individuelle

Utilisez la [fiche de collecte réutilisable](collecte-configuration-rh-skello.md) pour le prochain restaurant et pour préparer les données individuelles dans le circuit dédié.
