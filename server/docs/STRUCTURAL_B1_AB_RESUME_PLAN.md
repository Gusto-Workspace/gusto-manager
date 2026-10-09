# B1 V1/V2 — plan de reprise après timeout, sans exécution

Date : 8 octobre 2026. **Nouveaux appels autorisés : zéro.** Le run historique arrêté, sa lock, ses preuves, le protocole préparé et son prévol restent immuables. Ce document est l'avenant opérationnel de reprise du même A/B, pas un second benchmark. Les détails machine sont dans `STRUCTURAL_B1_AB_RESUME_PLAN.json`.

## État acquis

| Référence | V1 | V2 | Action actuellement autorisée |
| --- | --- | --- | --- |
| Tastavents | S1-B, réponse valide conservée, 81 453 ms ; usage 19 119 tokens ; coût calculé 0,00564705 USD HT | S1-A : timeout local 120 s, ni réponse complète ni identifiant récupérable ; coût inconnu | Conserver V1 et l'incertitude V2. Aucun GET artificiel, aucune relance V2. |
| Cartapani | Non envoyé | Non envoyé | Préparation documentaire uniquement |
| Grupo Isabella's / Carmina | Non envoyé | Non envoyé | Préparation documentaire uniquement |
| Gucci Osteria | Non envoyé | Non envoyé | Préparation documentaire uniquement |
| Cantina del Sol | Non envoyé | Non envoyé | Préparation documentaire uniquement |

Aucune paire n'est complète. La note provisoire de Tastavents V1 dans l'ancien rapport reste une lecture Codex, pas une évaluation indépendante ni une mesure de gain V2. Les huit autres références B1, Salterra et B2 ne font pas partie d'une reprise automatiquement autorisée.

## Disponible financier

Le plafond historique était 1,00 USD HT. Coût connu depuis l'usage : 0,00564705. Réservation non libérée de Tastavents V2 : 0,36. Exposition prudente : **0,36564705** ; disponible arithmétique conservateur : **0,63435295 USD HT**.

Ce solde n'est pas une nouvelle autorisation. Le total facturé réel reste inconnu. On ne suppose ni coût nul ni remboursement du timeout. Un nouvel avenant budgétaire devrait préciser s'il maintient ce plafond cumulatif de 1,00 USD et ce report d'exposition, ou s'il autorise un autre cap cumulatif. Aucun cap supplémentaire n'est proposé comme déjà acquis.

Avec une réservation native de 0,36 par création et les coûts historiques faibles, le solde peut vraisemblablement financer les huit appels restants de manière séquentielle, en libérant chaque réservation seulement après usage valide. Il ne **garantit pas** leur achèvement : un coût élevé ou une nouvelle incertitude peuvent empêcher le prochain dispatch. À deux incertitudes nouvelles, le plafond cumulatif de 1,00 serait déjà insuffisant pour une nouvelle réservation ; la cohorte doit de toute façon s'arrêter au premier incident.

## Adaptation équitable proposée

Sous une **nouvelle autorisation explicite**, poursuivre les quatre paires encore vierges avec le cycle background commun : même `background:true`, `store:false`, tier default, modèle, effort medium, schéma strict, absence de limite de sortie artificielle, délais création 30 s/récupération 15 s/global 540 s et politique d'arrêt. L'unique différence artistique demeure instructions et schéma V1/V2.

Les dix vecteurs artistiques du protocole préparé restent gelés. Pour les quatre paires envisageables, le seul ajout au corps historique est `background:true` ; les délais sont des paramètres de transport extérieurs au corps. Vérifier à nouveau localement, avant dispatch, hashes des images archivées, dimensions, ordre, detail, manifestes, input, et hashes des instructions/schémas. Aucune recapture, sélection ni sanitation n'est permise.

Ne pas mélanger Tastavents V1 synchrone obtenu avec une hypothétique V2 background pour prétendre reconstituer une paire contemporaine aux mêmes paramètres. Tastavents reste incomplet et hors de cette reprise. Une éventuelle future paire entièrement nouvelle demanderait une décision et un budget explicites, en conservant les deux anciens appels ; elle est **interdite à ce stade** et n'est pas préparée comme exécution automatique.

## Déroulement avant et après une éventuelle autorisation

1. Relier l'exécutant isolé au **même** `backgroundResponse` et au transport HTTP commun, avec un adapter durable fichier : requête exacte, checkpoint CAS/lock, journal de réponse, raw HTTP, enveloppe terminale, usage/coût et ledger de cohorte. Ne pas modifier le moteur artistique ni utiliser `StructuralReference.run`, MongoDB ou Cloudinary. L'ancien exécutant et son archive restent témoins historiques ; son timer de 120 s ne doit pas être réutilisé. Cette adaptation et ses tests hors ligne devront précéder la future exécution.
2. Figer l'avenant actif, les hashes de requête adaptés et l'évaluation originale. Créer un nouveau répertoire d'exécution et une nouvelle lock liée à un identifiant d'autorisation distinct. Ne jamais supprimer ou réutiliser l'ancienne lock pour contourner l'arrêt.
3. Faire confirmer ensemble les appels précis, leur maximum et le plafond cumulatif. L'autorisation ancienne des dix appels est suspendue par l'arrêt et les instructions suivantes ; elle ne peut pas être recyclée.
4. Une seule création à la fois ; checkpoint durable du créneau et de la réservation globale avant POST. Ne passer à la variante suivante qu'après réponse terminale valide, usage cohérent, budget enregistré et validation du contrat existant. Chaque création a son propre client request ID ; les GET suivent exclusivement son véritable response ID.
5. À toute erreur, timeout HTTP, durée globale dépassée, refus, résultat invalide, dérive de modèle/tier ou budget prévisible insuffisant : arrêter la cohorte et conserver tout l'acquis. Aucune création répétée. Si un ID existe, une investigation ultérieure peut récupérer cette même réponse sans POST ; elle ne redémarre pas implicitement les jobs suivants. Sans ID réel, maintenir l'incertitude et sa réservation.
6. Conserver brut et métadonnées avant parsing, texte artistique et JSON séparés, validation, coût depuis usage, model snapshot, tous les IDs, deadlines, statuts et causes d'arrêt. Documenter explicitement toute réponse fournisseur expirée ou tout coût inconnu.

Le suivi produit peut reprendre automatiquement des GET transitoirement interrompus. **La cohorte A/B conserve une règle d'arrêt plus stricte** au premier incident, pour respecter le protocole humain ; le branchement futur ne doit pas confondre ces deux politiques.

## Évaluation inchangée

Conserver les neuf critères B1 préenregistrés et le seuil absolu Utilité Design Lab ≥ 8/10 ; aucune renotation opportuniste ni score automatique. Comparaison par moment structurel, erreurs géométriques et hallucinations, relations globales, principes transférables, limites des inputs visuels et hypothèses causales. Produire notes V1/V2, différences, défauts corrigés/persistants/nouveaux et verdict explicite par paire complète. Un JSON mieux rempli ne suffit pas.

Créer des identifiants neutres A/B par site, mapping privé séparé et engagement hash avant évaluation. Les évaluateurs doivent voir les mêmes images archivées et manifestes, sans prompts, version, ordre de dispatch, coût ni noms de fichiers révélant la variante. Les champs propres au schéma peuvent néanmoins révéler partiellement V2 : noter cette limite et proposer aussi une lecture commune des descriptions, sans réécrire leur substance. La revue Codex reste explicitement provisoire ; la validation indépendante finale appartient aux évaluateurs humains.

Les preuves visuelles, critères et références de composition de l'ancien run restent conservés. Aucun appel supplémentaire, aucune modification artistique, aucune capture ni mutation distante n'est effectué par ce plan.
