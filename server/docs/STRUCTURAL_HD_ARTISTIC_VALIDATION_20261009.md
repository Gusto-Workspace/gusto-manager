# StructuralReference HD — expérience réelle arrêtée au premier appel

## Conclusion

La cohorte autorisée s’est arrêtée au timeout du premier appel, **Tastavents couverture complète HD + contrat V3**. Un POST de création et 79 GET de récupération ont été réalisés. Le fournisseur a accepté la requête et le schéma, mais aucune sortie artistique ni aucun usage final n’ont été récupérés avant la limite de suivi de neuf minutes. Les huit autres requêtes n’ont pas été envoyées.

Ce résultat ne démontre aucun gain artistique, aucune régression, aucune hallucination et aucune Utilité Design Lab ≥8/10. Il ne permet pas de départager couverture sélectionnée et exhaustive, V2 et V3, lecture intégrée et régionale. Il démontre que **ce premier essai intégré n’a pas fourni un résultat validable dans la fenêtre opérationnelle figée**. Le dernier état fournisseur était `in_progress`, et non un échec terminal certifié.

## Autorisation et prévol

Autorisation utilisateur du 9 octobre 2026 : maximum neuf nouveaux appels, plafond global 4,00 USD HT incluant l’exposition historique, aucun retry payant, arrêt de cohorte sur incident. La source de l’autorisation est conservée dans `authorization.json` du dossier d’expérience. Elle remplace l’interdiction Vision précédente uniquement pour ce protocole.

Protocole utilisé, inchangé : `diagnostics/structural-exhaustive-hd-20261009/prepared-final/protocol.json`, SHA-256 `00f293ea32af21b9fae66a76a049b047bd2bbf9c6fd3d1a478cab8b18a1cada0`.

Vérifications réussies avant le premier POST :

- Hashes des 86 PNG natifs, de leurs mesures, des trois manifestes, des images globales et des storyboards ; dimensions natives 1440×900 ; provenance et générations exactes.
- Hashes de fichiers et identités internes des neuf requêtes ; reconstruction avec les modules figés strictement identique à chaque body préparé.
- Comparaison couverture sélectionnée V3 / complète V3 : mêmes instructions, même schéma, même carte globale ; seuls les détails effectivement présentés et les obligations correspondantes changent.
- Comparaison complète V2 / complète V3 : contenu et images identiques, même ordre et niveau de détail ; contrat et prompt artistique différents.
- `gpt-6-luna`, raisonnement `medium`, détail natif `high`, carte globale `low`, Responses background, `store:false`, service tier `default`.
- Source freeze vérifié ; coordinateur et transport existants réutilisés sans modification ; journal commun aux neuf requêtes, verrou unique, checkpoints durables et réserve de 0,36 USD avant création.
- Originaux et preuves visuelles revus via les trois cartes et des exemples HD critiques. Cette revue n’équivaut pas à une inspection manuelle individuelle de tous les originaux ni à une certification de tous les états possibles du site.
- Dossier d’évaluation externe prévu, neuf critères B1 conservés, seuil Utilité Design Lab 8/10 ; mapping séparé.

| Site | Originaux | États de pixels distincts | Détails sélectionnés | Images envoyables, carte incluse : sélection / complet |
|---|---:|---:|---:|---:|
| Tastavents | 29 | 24 | 4 | 5 / 25 |
| Cartapani | 35 | 32 | 5 | 6 / 33 |
| Waldhaus | 22 | 18 | 5 | 6 / 19 |

Limite d’entrée maintenue : widget TheFork de Tastavents inaccessible, HTTP 403, rectangle approximatif x7,5 / y9159, 705×500. Son contenu n’est pas une preuve disponible et son apparence ne doit pas être inférée. La certification demeure limitée aux pixels éligibles capturés. L’exact prétraitement des images par Luna n’est pas établi par les preuves de cette expérience.

## Résultat technique exact

| Ordre | Site | Variante prévue | Résultat |
|---:|---|---|---|
| 1 | Tastavents | Complète HD V3 | POST accepté ; suivi interrompu au délai global ; aucune sortie finale récupérée |
| 2 | Tastavents | Sélectionnée V3 | Non envoyée : cohorte arrêtée |
| 3 | Tastavents | Complète HD V2 | Non envoyée : cohorte arrêtée |
| 4 | Cartapani | Complète HD V3 | Non envoyée : cohorte arrêtée |
| 5 | Cartapani | Sélectionnée V3 | Non envoyée : cohorte arrêtée |
| 6 | Cartapani | Complète HD V2 | Non envoyée : cohorte arrêtée |
| 7 | Waldhaus | Complète HD V3 | Non envoyée : cohorte arrêtée |
| 8 | Waldhaus | Sélectionnée V3 | Non envoyée : cohorte arrêtée |
| 9 | Waldhaus | Complète HD V2 | Non envoyée : cohorte arrêtée |

Premier body : 25 images, dont 24 originaux HD ; payload compact 28 099 043 octets. Identité de requête `887ceffd87fe37e3ed6efc49bd85b4648d614bbb7459b1c72d5313e3fb025f28` ; fichier préparé SHA-256 `5832e4bca4cfa9957c6b27028c834e1536ac13449a758af75c11870c1df80573`.

Identifiant fournisseur conservé : `resp_0edcb8a6df6e2818006ac8b7221d8487d1822e601dc404b8ff`. Premier request ID : `req_61ac6b3ae2a24b249b47d51560851863`.

La création a répondu HTTP 200 en **14,239 secondes**, le 9 octobre 2026 à **11:42:59,817 heure de Paris**. Le dernier GET conservé a répondu HTTP 200 à **11:51:41,070**, avec `in_progress`, `usage:null` et `output:[]`. Tous les 80 échanges HTTP ont répondu 200 ; leurs bodies ont été écrits et hashés avant parsing. L’arrêt local est journalisé à **11:51:48,115**. La durée mesurée de la variante est **543,491 secondes**, pour une politique de suivi de 540 secondes ; les quelques secondes supplémentaires viennent de l’exécution locale et de la cadence de reprise, sans nouveau POST après la deadline.

Erreur d’arrêt : `OPENAI_BACKGROUND_DEADLINE`. Aucun rejet du schéma, HTTP 429/5xx, contradiction JSON ou dépassement financier n’a été observé. En revanche, les 24 observations obligatoires, les ancres, les IDs, la synthèse et la conformité artistique **ne sont pas vérifiables**, faute de sortie.

Le POST possède un identifiant background effectivement récupéré ; il n’y a pas eu de double POST, de fallback synchrone ni de retry payant. Le dernier état `in_progress` ne permet pas de conclure que la génération s’est arrêtée chez le fournisseur. Aucune récupération hors de la fenêtre figée n’a été tentée. Le checkpoint est conservé ; toute éventuelle récupération ultérieure doit viser cette réponse existante, sans nouvelle création, et tenir compte de la rétention temporaire de `store:false`.

## Coûts et tokens

| Poste | Montant USD HT | Statut |
|---|---:|---|
| Nouvelle génération Tastavents HD V3 | Inconnu | Aucun usage final reçu ; aucun coût nul inventé |
| Réservation conservatrice de ce nouvel appel | 0,360000000 | Conservée, issue fournisseur incertaine |
| Historique connu | 0,024139325 | Valeur historique conservée, non revalidée par une nouvelle facture |
| Historique incertain réservé | 0,360000000 | Conservé sans le convertir en dépense certaine |
| Total connu + réservations | **0,744139325** | Exposition prudente journalisée |
| Plafond utilisateur | **4,000000000** | Respecté ; huit créations non réalisées |

Input, output, reasoning et cache tokens du nouvel appel : **inconnus**. Les 79 GET suivent le même cycle ; ils ne constituent pas 79 nouvelles analyses. Le coût calculé à partir d’un usage fournisseur, lorsqu’il existe, doit rester distinct d’une facture finale.

Les tarifs du coordinateur ont été confrontés aux [tarifs officiels OpenAI](https://developers.openai.com/api/docs/pricing) le 9 octobre 2026 : Luna standard, USD/million, contexte court input/cache lu/cache écrit/output = 0,10/0,01/0,125/0,50 ; contexte long = 0,20/0,02/0,25/0,75. Limites natives documentées : contexte 1 050 000, sortie 128 000, [fiche Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Le maximum conservateur 1,05M×0,25 + 128k×0,75 = 0,3585 USD justifie la réserve arrondie à 0,36 USD. Ce calcul constitue une borne préventive, pas l’usage réel manquant.

L’estimation préparatoire de 0,135–0,54 USD pour neuf appels n’est pas un coût mesuré ; elle n’est pas validée par cet essai.

## Évaluation artistique : aucune notation possible

Les sorties ont été affectées aux identifiants neutres préexistants S1-A/B/C, S2-A/B/C, S3-A/B/C par un générateur local de dossier. Le mapping des variantes reste dans `prepared-final/private-blind-mapping.json`, exclu du dossier externe. Le site est visible pour comparer aux images ; l’aveuglement serait partiel même avec des sorties, car le schéma et l’ordre de dispatch peuvent révéler une variante.

Le dossier comprend les 86 originaux PNG, leurs positions et hashes, les trois cartes, les neuf statuts anonymisés, les consignes, la grille vierge et un index HTML. **Zéro analyse et zéro lecture détaillée ont été récupérées.** Les huit variantes non envoyées et le timeout restent visibles. Aucune note indépendante ni auto-note n’est fabriquée.

| Critère B1 inchangé | Tastavents, trois variantes | Cartapani, trois variantes | Waldhaus, trois variantes |
|---|---|---|---|
| Capture/fidélité | NE sur sortie artistique | NE | NE |
| Structure | NE | NE | NE |
| Texte/image | NE | NE | NE |
| Densité | NE | NE | NE |
| Transitions | NE | NE | NE |
| Principes transférables | NE | NE | NE |
| Prudence | NE | NE | NE |
| Taxonomie | NE | NE | NE |
| Utilité Design Lab | **NE ; ≥8 non démontré** | **NE ; ≥8 non démontré** | **NE ; ≥8 non démontré** |

Les captures peuvent être inspectées et leur disponibilité technique a été vérifiée. Cela ne suffit pas à noter la compréhension du modèle. Les erreurs corrigées, persistantes ou nouvelles, les hallucinations, les relations éloignées et la précision des principes restent **non évaluables dans cette expérience**. Les défauts historiques demeurent des hypothèses à tester, sans devenir des résultats contemporains.

## Réponses au diagnostic demandé

- **La HD corrige-t-elle les erreurs ?** Inconnu : aucune paire ni sortie analysable.
- **V3 améliore-t-elle V2 à images identiques ?** Inconnu : V2 n’a pas été envoyée.
- **L’intégration de 19–33 images est-elle assez précise ?** Le premier body à 25 images est accepté, mais n’aboutit pas dans les neuf minutes de suivi. Précision artistique inconnue ; 19 et 33 images non testées.
- **Compositions fusionnées ou déformées ?** Inconnu : aucune description du fournisseur récupérée.
- **Plafond de 18 moments ?** La limite contractuelle existe, mais aucun effet effectif n’est observable ici. Vingt-quatre états de pixels ne prouvent pas vingt-quatre compositions distinctes.
- **Lecture régionale préférable ?** Hypothèse non comparée. Elle pourrait distribuer le travail et réduire la sortie demandée par étape, mais implique davantage d’appels et des risques de raccords ; cet essai ne permet pas de la retenir comme architecture supérieure.
- **Qualité suffisante pour poursuivre B1 ?** Aucune preuve nouvelle de qualité. Le seuil 8/10 reste inchangé et non démontré.

Fait établi : la requête reçoit un accusé en 14,239 s puis reste non terminée dans la fenêtre prévue ; le problème observé ne vient donc pas d’un timeout de création ni d’un rejet du schéma. Causes possibles **non établies** : latence/charge fournisseur, durée de raisonnement, volume de lectures et de synthèse demandé, comportement de cette requête intégrée. Aucun token final ni diagnostic fournisseur ne permet de répartir ces causes.

**Recommandation : conserver les contrats et images figés ; ne retenir aucune nouvelle architecture artistique sur la base de ce timeout.** La prochaine action devrait d’abord établir le devenir et, si disponible, l’usage de la réponse existante, puis définir un amendement opérationnel explicite sur les délais/récupération ou une expérience régionale contrôlée. Toute nouvelle création resterait séquentielle, budgétée et soumise à une reprise explicite après cet arrêt. Aucune modification ni nouvelle création n’est faite dans ce livrable.

## Conservation et vérification

Dossier complet : `diagnostics/structural-exhaustive-hd-20261009/vision-validation-20261009-01/`.

- `preflight.json`, `authorization.json`, `execution.log`, `summary.json` : prévol, ordre réel, autorisation et bilan.
- `cohort/ledger.json` : compteur, identifiant, politique et coûts/réservations.
- `cohort/tastavents-complete-v3/detail-1/http/` : 80 bodies bruts et 80 métadonnées SHA-256, tous vérifiés.
- `http-evidence-summary.json` : chronologie et états fournisseur, aucun usage et aucun output observés.
- `preservation-before.json` / `preservation-after.json` : **1 548 fichiers protégés, tous inchangés** ; originaux/manifestes/requests, sources applicatives et preuves historiques disponibles inclus.
- `blind-review/index.html` et `README.md` : dossier externe autonome, 189 références locales vérifiées, aucun lien cassé.
- `blind-review/blind-evaluation-grid.csv` : neuf critères vierges ; `availability.json` et statuts par ID explicitent les absences.

Les tests ciblés existants ont été rejoués hors ligne sans modifier leur code : 12 réussites, un échec initial de lancement Chromium imposé par le sandbox macOS. Ce seul test a été rejoué hors sandbox, avec garde réseau hors ligne : réussite ; 12 autres tests non sélectionnés. Les deux logs sont conservés. Cette vérification ne remplace pas une validation fournisseur ou artistique et n’implique aucune recapture externe.

Ajouts de cette mission : lanceur expérimental et générateur de dossier dans les diagnostics, nouveaux journaux/dossiers et ce rapport. **Aucun fichier applicatif, prompt, schéma ou image gelé modifié. Aucune nouvelle capture externe, mutation MongoDB/Cloudinary ou modification d’analyse historique. Aucun commit.** HEAD conservé : `2bd44a3321ec11f9d3b5263ecb47673eccf3e3ef`. La cohorte est arrêtée ; la production par défaut est inchangée.
