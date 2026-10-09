# Prévol artistique B1 — protocole actif V1/V2, cinq paires

8 octobre 2026. **Dix requêtes préparées, zéro appel autorisé et zéro dispatch.**

Le seul protocole actif reste `STRUCTURAL_B1_AB_PREPARED.json`, passé à la version 2 du **protocole expérimental**. Cette version ne change ni les contrats artistiques V1/V2 ni le moteur. La recette précédente à trois paires est archivée comme `three-pair-protocol.superseded.json` dans les diagnostics locaux, avec son hash dans `supersedes`. Les trois objets de paire antérieurs sont conservés exactement, y compris leurs entrées, manifestes et hashes de prompt/schéma/contenu. Ce document décrit le prévol ; il ne crée pas un second protocole.

## Entrées et isolation vérifiées

| Référence | Images par appel | Utilité B1 historique, conservée | Rôle diagnostique |
|---|---:|---:|---|
| Tastavents | 3 | 4/10 | Dominance, densité et composition centrale |
| Cartapani | 6 | 5/10 | Segmentation, ancrages et états visuels |
| Grupo Isabella's | 4 | 6/10 | Relations globales, géométrie et fragment/panneau |
| Gucci Osteria | 6 | 7/10 | Contrôle positif, singularités et relations entre sections |
| Cantina del Sol | 6 | 7/10 | Typographie, collage et changements de densité |

Les **25 WebP** archivés ont été relus localement, leurs SHA-256 et dimensions vérifiés, puis copiés sans transformation dans `server/diagnostics/structural-b1-ab-20261008/preflight/inputs`. Dix passages correspondent à 50 présentations d'images, pas à 50 nouvelles images. Chaque paire conserve ordre, dimensions, détail, géométrie et manifeste B1. Le transport proposé injecte les mêmes octets par data URI, sans relecture d'une URL Cloudinary mutable par le fournisseur. Les manifests originaux restent conservés pour provenance ; cette substitution identique du transport dans les deux variantes est enregistrée dans le prévol.

Les dix corps de requête ont été reconstruits et hashés. Après retrait de `instructions` et du seul schéma `text.format.schema`, ils sont identiques à l'intérieur de chaque paire. Le modèle effectif lu dans la configuration locale est `gpt-6-luna`. Paramètres communs : Responses API, raisonnement medium, `store:false`, service Standard global explicite (`service_tier:default`), timeout local 120 000 ms, aucune température/seed ajoutée et aucune relance. La limite de sortie du moteur reste inchangée : pas de nouveau petit plafond de tokens ; la documentation indique un maximum modèle de 128 000 tokens.

L'exécutant devra appeler uniquement le constructeur de requête et le transport Vision isolé. **Il ne doit pas appeler `structural-reference.service.run`, un endpoint admin ni le recovery** : ces chemins peuvent écrire et demander une recapture des captures historiques sans nouveau certificat média. Aucune nouvelle capture, sélection, sanitation ou augmentation de détail n'entre dans cet A/B. Il mesure la modification artistique conjointe prompt + schéma, sans isoler leurs contributions respectives.

Les anciennes preuves de capture restent anciennes : cet A/B n'ajoute pas rétrospectivement une certification de fidélité complète aux sites vivants. Les insuffisances de détail central de Tastavents et la segmentation par états de Cartapani font partie des limites à examiner contre les images effectivement fournies. Salterra ne fait pas partie de l'expérience : corriger ou certifier sa capture dégradée précède une évaluation artistique payante. Les huit autres références restent dans l'objectif d'amélioration du système ; aucun appel supplémentaire les concernant n'est préparé.

## Budget proposé

Tarifs Standard globaux vérifiés dans [OpenAI Docs — Pricing](https://developers.openai.com/api/docs/pricing) et [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), le 8 octobre 2026 : par million de tokens, entrée 0,10 USD, lecture cache 0,01 USD, écriture cache 0,125 USD, sortie 0,50 USD. Les tokens de raisonnement sont déjà compris dans les tokens de sortie ; ils ne sont pas ajoutés une deuxième fois. Une écriture cache remplace le tarif d'entrée correspondant dans le calcul, elle n'est pas additionnée à une seconde facturation de ces mêmes tokens.

Projection de deux passages sur les cinq usages historiques : **130 660 tokens d'entrée + 81 954 de sortie = 212 614 tokens**, raisonnement compris. Ce sont des usages revalorisés aux tarifs applicables, pas une facture historique. Cache historique identique : **0,05666452 USD** ; sans économie de lecture cache et avec toutes les entrées tarifées en écriture cache : **0,05730950 USD**.

| Paire | Projection conservatrice, même volume de sortie, USD HT |
|---|---:|
| Tastavents | 0,01106125 |
| Cartapani | 0,01348425 |
| Grupo | 0,00932925 |
| Gucci | 0,01259125 |
| Cantina | 0,01084350 |
| Total | 0,05730950 |

**Estimation réaliste : environ 0,06 USD HT pour les dix appels ; fourchette de travail 0,05–0,10 USD HT. Plafond financier recommandé à approuver : 1,00 USD HT.** La fourchette couvre environ 0,75 à 2 fois le volume de sortie historique, avec une marge d'entrée ; elle n'est pas une garantie. Aucun avantage Batch/Flex, crédit, taxe ou conversion EUR n'est supposé.

Différence V1/V2 : les cinq requêtes V2 ajoutent ensemble **19 730 octets UTF-8** de prompt/schéma/syntaxe de requête, sans changement des images. Une estimation heuristique de 2–5 octets par token et du tarif d'écriture cache donne environ **0,0005–0,0015 USD** de surcoût d'entrée total pour les cinq V2. Ce n'est pas un décompte tokenizer. À volumes de sortie identiques, le groupe V1 est d'environ 0,0287 USD et le groupe V2 d'environ 0,0292–0,0302 USD. La différence finale reste inconnue : chaque tranche supplémentaire de 10 000 tokens de sortie/raisonnement ajoute 0,005 USD. Le JSON V2 peut être plus court ou plus long ; aucun gain financier ou artistique n'en est déduit à l'avance.

Le plafond de 1 USD laisse une marge sans modifier l'effort, le modèle, le timeout ou la longueur de sortie. La protection financière sera **préventive**, avant chaque dispatch, et non un simple arrêt après constat d'un dépassement. Réservation conservatrice proposée : 0,36 USD pour l'appel en cours, couvrant même 1,05 million de tokens d'entrée au tarif maximal long-contexte d'écriture cache (0,25 USD/M) et 128 000 tokens de sortie au tarif long-contexte (0,75 USD/M), soit 0,3585 USD arrondis au-dessus. Cette surestimation volontaire sert à protéger le plafond quand le coût d'une réponse n'est pas encore connu ; elle ne prévoit pas un prompt de cette taille. Les appels sont séquentiels. La réservation est remplacée par le coût calculé sur `usage` après réponse complète. Pas de dispatch si coût connu + réservation suivante dépasse le budget approuvé.

Conditions de ce calcul : endpoint global Standard, modèle inchangé, aucun outil payant, tarifs vérifiés avant lancement. Un service différent, une limite modèle changée ou un tarif changé invalide le prévol. Un timeout ne garantit pas que le fournisseur n'a rien facturé ; sa réservation reste conservée et la cohorte s'arrête. Les frais d'autres travaux du compte et ceux de cette conversation Codex ne sont pas compris dans ce budget API Vision.

## Conservation et déroulement après autorisation

1. Vérifier l'autorisation explicite des **dix** appels et du budget ; créer un nouvel identifiant d'expérience, un dossier distinct et un verrou empêchant deux exécutions. Figer le hash du protocole actif, les sources du contrat, les paramètres et les 25 images. Une modification de hash provoque un arrêt, sans régénérer silencieusement le plan.
2. Vérifier les fichiers d'entrée archivés et reconstruire les deux payloads de chaque paire. Conserver les requêtes exactes envoyées et leurs hashes, ainsi que les manifests originaux. Reprendre les images locales par data URI ; zéro téléchargement source ou Cloudinary.
3. Préenregistrer la grille et le formulaire d'évaluation. Randomiser l'ordre d'exécution à l'intérieur de chaque paire et l'ordre d'affichage des résultats ; conserver séparément la correspondance privée entre IDs neutres et V1/V2. Définir cet ordre avant la première réponse.
4. Avant chaque requête, écrire durablement le slot d'appel consommé, les hashes, l'horodatage et la réservation financière. Maximum dix POST d'inférence, au plus un par site/variante. Aucun retry automatique, même si la panne paraît transitoire. Une interruption avant preuve de non-dispatch est traitée comme incertaine.
5. Envoyer une seule requête, avec timeout local inchangé de 120 s. Sauvegarder le corps brut complet et les métadonnées fournisseur **avant** parsing/validation : request ID, statut HTTP, modèle retourné, service tier, usage détaillé, cache, raisonnement et durée. Ne jamais écrire sur les modèles B1 ; ni Mongoose ni Cloudinary ne sont nécessaires à cette expérience.
6. Parser puis appliquer le validateur artistique correspondant à la variante et au manifeste original. Conserver séparément parsed, erreurs, refus et états incomplets. Le validateur n'attribue aucun score artistique et ne prouve pas les assertions visuelles.
7. Arrêter toute la cohorte sur timeout, erreur fournisseur/réseau, réponse incomplète, refusal, parsing/validation invalide, quota, divergence de modèle/tier/hash, usage absent/incohérent, checkpoint local impossible ou réservation financière insuffisante. Conserver les réponses déjà obtenues. Une paire incomplète est « non évaluable », pas une victoire de sa seule réponse disponible. Aucun dispatch supplémentaire ni rattrapage payé sans nouvelle autorisation.
8. Construire les paquets anonymisés, effectuer l'évaluation, figer notes et preuves, puis seulement dévoiler les variantes. Publier les cinq verdicts et tous les échecs. Vérifier les hashes de l'index B1 et des preuves historiques après l'expérience, sans utiliser d'endpoint applicatif susceptible d'écrire.

Le stockage local séparé contiendra payloads, journal, réponses brutes, outputs parsés, résultats de validation, usages/coûts, pièces d'évaluation et mapping de dévoilement. Aucun insert/update/delete sur `StructuralReference`, `StructuralAnalysisAttempt`, aucune modification de capture historique, aucun upload/destroy Cloudinary. Les réponses ont leur propre experimentId/runId ; les IDs B1 servent uniquement de provenance. Un retraitement local gratuit du brut peut être envisagé après un arrêt, mais ne relance jamais la requête.

## Évaluation indépendante et limites d'aveugle

La grille B1 et son échelle ne changent pas : **capture/fidélité, structure, texte→image, densité, transitions, principes, prudence, taxonomie, utilité Design Lab**. 8 signifie une lecture riche, cohérente et fiable des mécanismes globaux et singularités. Les résultats actuels B1 ne sont ni recalculés ni utilisés comme cible automatique. Chaque sortie contemporaine reçoit neuf notes justifiées ; les deltas sont calculés après fixation des notes.

L'évaluateur doit être indépendant du générateur Vision, sans appel évaluateur payant supplémentaire. Une lecture en contexte neuf ou par un tiers est préférable. Les paquets de lecture omettent version, modèle, identité des variantes et anciennes notes ; présentent les mêmes images et une restitution neutre conservant toutes les assertions ; l'ordre gauche/droite est randomisé. **L'aveugle est partiel** : le style ou la géométrie structurée peut révéler la version, et l'instance qui a implémenté V2 connaît sa conception. Si elle effectue l'évaluation finale, cette dépendance est déclarée ; elle ne se présente pas comme un évaluateur externe parfaitement aveugle. Une lecture tierce ultérieure peut contredire les notes, sans assouplir la grille pour protéger V2.

Avant lecture des réponses, la composition de référence doit être décrite directement contre les images gelées : intervalles de page, masses, axes, relations image/texte, superpositions, vide et transitions. Comparer ensuite les assertions des deux sorties à ces mêmes intervalles. Les numéros de moments V1/V2 peuvent différer : aligner par **portée visuelle**, jamais artificiellement par numéro. Une segmentation plus détaillée n'est pas automatiquement meilleure.

Pour chaque moment ou relation : image/rectangle/plage de preuve ; assertion ; observation directe ou inférence ; présence réelle/absence/inconnu ; justesse de dominance, placement, axe, proportions et superposition ; portée fragment/panneau ; hallucinations ; taxonomie ; spécificité du principe mécanisme/effet/conditions et possibilité de le transférer sans copier l'identité. Les mouvements/durées restent inconnus si les images statiques ne les prouvent pas.

Chaque verdict par site contient :

- Les neuf scores V1 contemporains, les neuf scores V2 et les neuf deltas, sans moyenne qui masque un défaut.
- La note absolue d'Utilité Design Lab et le verdict ≥8 ou insuffisant, indépendamment du gain relatif.
- Les erreurs corrigées, persistantes et nouvelles ; les hallucinations supprimées ou introduites, avec preuves.
- La qualité réelle des relations globales et des principes, plutôt que la quantité de champs JSON.
- Les limitations plausibles des entrées, les hypothèses prompt/contrat/modèle, les preuves manquantes et leur degré de confiance.
- Un verdict explicite : gain, stabilité, régression ou non-évaluable ; succès relatif et maturité absolue restent distincts.

Un gain 4→7 reste une insuffisance. Toutes les notes et tous les refus restent publiés. Une paire par site ne permet pas de séparer l'effet prompt de l'effet schéma, ni d'exclure la variabilité stochastique, ni de prouver la fiabilité sur sept sites B2 inconnus. Les notes doivent distinguer fidélité contre les images de fidélité intégrale au site historique, toujours non évaluable. Même cinq succès ≥8 ne valident pas automatiquement les huit autres B1 ou B2.

## Résultat du prévol et point d'arrêt

Les dix requêtes, les 25 images et la conservation exacte des trois anciennes paires passent **4/4 tests locaux sous garde bloquant les effets distants**. Le modèle configuré correspond, une variable de credential est présente ; aucun appel de disponibilité/quota/crédit n'a été effectué. L'accès effectif du projet fournisseur reste donc non vérifié et sera un motif d'arrêt s'il échoue lors du premier appel autorisé. Ce n'est pas un blocage confirmé.

Le script de prévol est exclusivement hors ligne et ne possède pas de capacité de dispatch. Les protections financières/journal/arrêt ci-dessus sont les exigences de l'exécutant isolé à appliquer après confirmation ; elles ne sont pas attribuées au chemin produit normal. **Blocage immédiat : autorisation explicite du plafond et des dix appels encore absente. Aucun appel n'a été effectué.**
