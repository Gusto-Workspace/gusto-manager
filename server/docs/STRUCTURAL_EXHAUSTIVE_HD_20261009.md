# StructuralReference — couverture exhaustive HD, 9 octobre 2026

## État livré

Conservation réelle des originaux PNG, couverture traçable, planification automatique des lectures et coordinateur background testés hors ligne. Trois recaptures réelles autorisées sont archivées dans une nouvelle génération locale : **86 originaux**, dont **74 états de pixels distincts**. Neuf requêtes expérimentales sont préparées ; **aucun appel OpenAI exécuté**, aucune mutation MongoDB/Cloudinary, aucun commit et aucune modification des résultats B1.

La lecture exhaustive est opérationnelle dans le parcours interne expérimental. Elle n'est pas activée comme nouveau défaut payant du produit avant validation artistique. La conservation des originaux est désormais intégrée au chemin de capture partagé. Aucun bouton ou mode utilisateur n'est ajouté. Sélecteur V2 et contrat artistique V3 restent identifiables ; leurs résultats précédents ne sont pas réinterprétés comme des validations.

## 1. Cycle de vie antérieur et correction

`captureStructuralPage` réalise des captures viewport **PNG natives, 1440×900, deviceScaleFactor 1**. Les buffers alimentent le parcours, les tuiles du stitch, le pool artistique et, éventuellement, un recorder de diagnostic. Des visites différentes à une position presque identique peuvent remplacer une entrée du pool. Après agrégation de fiabilité, le storyboard réduit les originaux à **240×150** dans une carte de 720 px de large. Le sélecteur ne livre ensuite que zéro à cinq locales, avec recapture finale lorsque nécessaire.

Le retour sampled expose le storyboard et les locales choisies ; le service les réencode directement depuis les PNG en WebP (overview largeur 720/qualité 80, locales largeur maximale 2000/qualité 85 sans agrandissement), puis les conserve comme captures produit. Les autres PNG ne sont pas supprimés explicitement sur disque : **ils n'y étaient généralement jamais écrits** et deviennent inaccessibles lorsque le contexte mémoire disparaît. Cela explique 23 panneaux Tastavents pour seulement deux locales archivées en B1. Les diagnostics shadow exceptionnels peuvent conserver un autre pool en WebP ; ce n'est ni une archive native systématique ni le lot B1 appliqué.

La correction enregistre **chaque screenshot viewport validé**, avant remplacement dans le pool, y compris confirmations, visites fixes et recaptures finales. Chaque état reçoit un ID stable dans sa génération, ses coordonnées, son rectangle viewport, son crop utile, son origine, son horodatage, les mesures spatiales et les limites médias/embeds. Le PNG est écrit sans redimensionnement ni réencodage ; hash et dimensions sont vérifiés à la relecture. Un manifeste atomique évolue pendant l'acquisition ; un échec garde les preuves partielles sous statut incomplet. Une génération existante ne peut pas être réutilisée comme nouvelle destination.

`structural-original-evidence.js` assure ce stockage ; `captureStructuralPage` conserve aussi `originalViews` dans son retour. Le service partagé passe le callback via `capturePortfolioSite` et conserve une référence interne au manifeste dans `captureCoverage.originalEvidence`. **Chemins machine et IDs d'archive sont exclus des entrées Vision historiques.** Les archives produit futures nécessitent un disque/volume local persistant : ce travail ne déploie pas une sauvegarde distribuée.

Un candidat du pool, un état capturé, une section et une locale envoyée restent quatre notions différentes. Le nouveau manifeste ne déduit aucune section depuis un ID, un changement d'image ou un déplacement du scroll.

## 2. Recaptures et preuves disponibles

Les archives et buffers locaux ont été inspectés avant visite. Tastavents possédait un pool complet antérieur, réencodé, mais pas les PNG du B1 avec toutes les preuves de propreté actuelles. Cartapani et Waldhaus ne possédaient pas de lot natif complet récupérable. Une session de capture par site a donc été réalisée avec l'infrastructure existante : warm-up, médias visibles, scroller réel, stabilisation, sanitation, contrôles de peinture/vidéo, parcours recouvrant, positions fixes et éventuelles locales finales. Pas d'extension aux autres références.

| Référence | Génération | Originaux PNG | États de pixels distincts | Locales du contrôle sélectionné | Hauteur parcourue |
|---|---|---:|---:|---:|---:|
| Tastavents | `7124c37f-e045-4f40-8ea6-0ab2c2e4492b` | 29 | 24 | 4 | 11 556 px |
| Cartapani | `28bcdbdc-cd23-487e-8a2f-279210799564` | 35 | 32 | 5 | 16 122 px |
| Waldhaus | `dcbfac39-2640-465e-9538-afe382c46110` | 22 | 18 | 5 | 8 654 px |

Tous les originaux sont **1440×900 PNG**, indépendants des vignettes. Positions, dimensions, ordre temporel d'acquisition, mesures et hashes se trouvent dans `captures/<site>-live/manifest.json` et les fichiers `state*.measurements.json`. Les manifestes de couverture préparés reconstituent aussi l'ordre vertical, les recouvrements et la provenance des doublons. Aucun état distinct n'a été écarté pour être sous un seuil du sélecteur.

Le dédoublonnage exige identité **des bytes PNG, dimensions et crop utile**. Des états ressemblants ou proches spatialement restent distincts. Les positions et IDs des originaux équivalents sont conservés ; une future lecture commune est associée explicitement à chaque alias. Les nombres 24/32/18 ne sont pas des nombres de sections ni une certification d'équivalence perceptuelle exhaustive.

Les trois captures passent les gates techniques existants et ne laissent pas de trou dans les plages de pixels enregistrées. La revue des cartes et de PNG natifs ciblés confirme notamment les lettres géantes/portraits et la galerie de Tastavents, la rangée régulière de Cartapani et les compositions éditoriales de Waldhaus. Ce contrôle n'est pas une observation humaine de tous les états possibles du site.

**Limite Tastavents : widget TheFork inaccessible, HTTP 403.** Son rectangle reste observé, son apparence interne inconnue. Les manifestes conservent cette indisponibilité ; le placeholder ne devient jamais un principe artistique. Les gates médias restent limités aux médias visibles éligibles inspectés : pseudo-éléments, médias petits/clippés, contenus internes de frames externes et états non visités ne sont pas intégralement certifiés. Les captures figées n'établissent ni durée, ni trajectoire, ni ordre réel d'une animation.

La première tentative sandbox Tastavents a échoué au DNS, sans capture ; sa trace est conservée. Après confirmation humaine directe, les trois recaptures ont réussi. Aucun échec n'a été masqué.

## 3. Lecture exhaustive et autonomie

`structural-exhaustive-coverage.js` certifie les originaux disponibles, leurs intervalles, hashes, recouvrements et équivalences ; il produit une carte globale de **tous les états distincts**. Les trous, originaux manquants, médias inspectés manquants ou gates non certifiés bloquent la préparation exhaustive.

`structural-exhaustive-reading.js` choisit automatiquement un parcours selon le volume, la taille des payloads, une estimation explicite du contexte et la capacité de sortie. Le sélecteur V2 fournit des priorités et le contrôle expérimental réduit ; **il n'est plus la porte d'accès aux originaux**. Aucun seuil ou poids du sélecteur n'a été changé dans cette mission.

- Si le lot est admissible, une génération **intégrée** reçoit la carte globale et les PNG HD. Son enveloppe exige une lecture distincte de chaque ID présenté, puis la synthèse artistique. Une omission ou un doublon invalide la réponse : ce n'est pas un envoi aveugle d'images sans contrôle de lecture.
- Pour les lots plus volumineux, le plan partitionne les états dans l'ordre vertical. Chaque frontière partage une observation de chaque côté entre les lots voisins. Les lectures validées sont conservées ; une synthèse finale reçoit leur provenance et la carte globale. Des géométries contradictoires à une frontière arrêtent le pipeline, sans moyenner les erreurs. Des formulations différentes sans contradiction ne sont pas artificiellement rejetées ; les lectures de frontière restent archivées et les incertitudes se propagent.

Les trois lots actuels tiennent en une génération intégrée par variante : aucune nécessité technique de trois appels systématiques. **La supériorité artistique de cette stratégie sur plusieurs passes n'est pas démontrée.** Elle sera mesurée ; la taille admissible ne garantit pas l'attention visuelle du modèle. Les limites existantes du navigateur (50 000 px, 120 étapes, deadline) restent actives : une page trop longue est déclarée incomplète, jamais présentée comme intégralement observée.

Le contrat artistique V2 ou V3 est utilisé avec une **liaison d'entrées exhaustive V1** et une **enveloppe de lecture V1**, identifiées et hachées séparément. Les schemas/prompts archivés V1/V2/V3 ne sont pas écrasés. La liaison adapte explicitement les IDs à des sources natives nombreuses, sans limite d'accès de cinq locales. Les anciennes définitions artistiques, contraintes géométriques et validations restent conservées ; le validateur partage ses contrôles avec cette liaison interne. Les ancres V3 pointent vers des sources/panneaux réellement présentés ou lus, avec leurs plages ; une source absente, éloignée ou incertaine ne devient pas une preuve directe. Le contrat artistique garde sa limite actuelle de 18 moments : les lectures détaillées ne constituent pas une preuve que toute page très complexe sera synthétisée fidèlement dans cette limite.

Le coordinateur `structural-reading-checkpoints.js` fournit un ledger commun de cohorte, réservations préventives, génération propriétaire, verrou et checkpoints de chaque passe. Il utilise **le transport background existant** : bytes HTTP bruts avant parsing, véritable `response.id`, reprise GET, aucun double POST ni retry payant. Un verrou de processus local mort peut être repris sous verrou de récupération, avec conservation de la preuve ; un propriétaire vivant bloque un second worker. `runAutonomousReading` assure le polling normal sans action utilisateur. Incidents, délais et contradictions non récupérables arrêtent le traitement et conservent les résultats acquis.

Les flags de qualité rapprochent certaines déclarations des témoins géométriques (galerie mesurée dense déclarée sparse, grande échelle typographique avec dominance de vide). Ce sont **signaux à vérifier visuellement**, avec risques de faux positifs ; ils ne valident pas la vérité des pixels et ne déclenchent aucun nouvel appel. Un résultat conforme reste `not_independently_evaluated`, sans score artificiel ni certification artistique automatique.

## 4. Contraintes OpenAI vérifiées

Modèle conservé : **gpt-6-luna**, Responses, effort medium, tier Standard/default, background, store:false. Sa [fiche officielle](https://developers.openai.com/api/docs/models/gpt-6-luna) indique entrée image, Structured Outputs, contexte 1 050 000 et sortie maximale 128 000 tokens. Le [guide Vision](https://developers.openai.com/api/docs/guides/images-vision) documente PNG/JPEG/WebP/GIF non animé, plafond général de 1 500 images et payload de 512 Mo ; les contraintes de contexte et de prétraitement restent supplémentaires.

Le tableau de sizing consulté **ne spécifie pas gpt-6-luna** : ne pas lui attribuer les chiffres d'Astra ou de GPT-5.6 Luna. La résolution effective et les tokens d'image propres à Luna restent à mesurer au prochain appel autorisé. `high` a déjà fonctionné dans les appels B1 ; il est conservé pour les PNG 1440×900. `original` n'est pas activé sur la seule disponibilité générique du champ API. Aucune miniature n'est agrandie et aucune cible arbitraire de 1 Mo n'est imposée. Les requêtes actuelles pèsent environ 4,1–28,1 Mo ; leur estimation patch×4 est une hypothèse conservatrice de planification, **pas une tarification certifiée**.

Le [mode background](https://developers.openai.com/api/docs/guides/background) conserve temporairement les réponses store:false pour leur récupération ; le délai local existant reste neuf minutes. L'acceptation fournisseur du nouveau schéma/enveloppe et la qualité d'une lecture de 19–33 images n'ont pas été testées en ligne.

## 5. Validation et conservation

Les logs locaux couvrent conservation native après fermeture de Chromium, 18/23/55 observations, répétitions exactes et différences proches, originaux manquants, trous, médias indisponibles, états recouvrants, planification intégrée/multi-lots, invariants expérimentaux, IDs/ancres invalides, incertitude et contradictions, archives avant validation, coûts inconnus réservés, absence de double POST, reprise GET, verrous/générations, autonomie et arrêt au premier incident. Les fixtures de composition antérieures et les guards capture/background/budget restent dans la suite complète.

Les premiers tests ont révélé une erreur de binding de l'overview et des mocks fournisseur incomplets ; ils ont été corrigés. La première suite complète a également révélé l'injection de provenance locale dans le contexte Vision, l'erreur de statut sur capture sans couverture, et l'oracle de paramètres devenu obsolète. La provenance est maintenant exclue de Vision, le gate de couverture retrouve son erreur spécifique et le test vérifie explicitement le callback supplémentaire. Les logs d'échec sont conservés, sans assouplir les contrôles.

**Résultats finaux : 362 tests passent dans la suite complète, sans échec ni test ignoré ; 13 tests ciblés finaux passent également après finalisation des reprises et du polling. Ces 13 cas comprennent des reprises, ils ne s'ajoutent pas comme autant de tests distincts.** Les hashes et résultats sont dans `validation-summary.json` et `preservation-after.json` du nouveau dossier de diagnostic. Le contrôle des **634 fichiers préexistants protégés** ne trouve que les six modifications autorisées de code/tests, aucun changement inattendu et aucun commit. La vérification hors ligne confirme **13 analyses historiques et 67 images** ; les dix requêtes gelées V1/V2 et les cinq préparations V3 précédentes gardent leur identité. Les anciens ledgers, appels incertains, captures et sorties A/B ne sont pas réécrits. Ces tests prouvent des comportements techniques ; aucune note artistique nouvelle n'est attribuée.

## 6. Prochaine expérience prête à autoriser

Protocole actif : `diagnostics/structural-exhaustive-hd-20261009/prepared-final/protocol.json`. `prepared/` conserve uniquement un brouillon de préparation antérieur, sans dispatch ; ne pas l'utiliser. Les neuf bodies finaux, manifestes, dimensions et hashes sont gelés. Un pack de revue locale des originaux, une grille B1 vide et un mapping anonyme privé sont prêts. Aucune autorisation financière n'est contenue dans ces préparations.

| Variante par site | Lecture HD | Contrat | Images par requête, overview comprise |
|---|---|---|---|
| sélection V2 + V3 | locales effectivement sélectionnées, même pool natif | V3 | Tastavents 5 / Cartapani 6 / Waldhaus 6 |
| couverture complète + V3 | tous les états de pixels distincts | V3 | 25 / 33 / 19 |
| couverture complète + V2 | mêmes PNG et même manifeste d'entrée que la précédente | V2 | 25 / 33 / 19 |

**Test A :** sélection+V3 contre complet+V3, instructions et schéma exactement identiques, carte commune, seules les entrées détaillées et obligations d'IDs présents diffèrent. **Test B :** complet+V2 contre complet+V3, content/images/ordre/dimensions/detail exactement identiques. L'enveloppe factuelle commune rend mesurable l'apport supplémentaire du contrat à la synthèse ; il ne s'agit pas d'un replay strict des requêtes historiques. **Test C :** le résultat complet+V3 évalue le pipeline combiné et est réutilisé, sans trois appels redondants. Trois références × trois variantes = **neuf appels maximum**, un par variante, séquentiels.

Grille inchangée : capture/fidélité, structure, texte/image, densité, transitions, principes transférables, prudence, taxonomie, utilité Design Lab. Verrouiller les notes avant dévoilement. Comparer par état et plage, puis par moment structural : erreurs corrigées/persistantes/nouvelles, hallucinations, rapports globaux, spécificité et conditions des mécanismes transférables, limites des pixels et hypothèses causales. Les détails d'enveloppe peuvent révéler une variante ; l'aveuglement est partiel. Mon évaluation d'implémenteur ne sera pas une validation indépendante définitive. Chaque sortie, échec ou impossibilité reste dans le bilan ; aucune faible note n'est filtrée.

Objectif : **≥8/10 en utilité**, avec gain réel de compréhension et sans régression. Une progression sous huit reste insuffisante ; un JSON enrichi ou une couverture technique complète ne suffit pas. Ni freeze B1 ni B2 ne sont déclenchés par cette mission.

### Budget et déclenchement

Les [tarifs Standard](https://developers.openai.com/api/docs/pricing) Luna revérifiés : entrée 0,10, cache lecture 0,01, cache écriture 0,125, sortie 0,50 USD/M ; au-delà de 272k tokens d'entrée, entrée/cache ×2 et sortie ×1,5. Aucune remise ou cache supposé pour autoriser la dépense.

Estimation de travail pour les neuf nouveaux appels : **0,135–0,54 USD HT**. Base : historiques ~0,005–0,007 USD avec peu d'images, désormais plus d'images natives et une lecture par état ; incertitudes importantes sur tokens visuels, raisonnement, volume des observations/ancres et latency. V3 ajoute environ 10–11 ko de prompt/schéma par requête complète ; son surcoût total réel ne se déduit pas de ces bytes. La différence images V2/V3 est exactement nulle.

**Plafond global recommandé : 4,00 USD HT, incluant l'historique.** Connu cumulé conservé : 0,024139325 USD ; ancien appel incertain : réserve 0,36 USD. Le transport réserve 0,36 USD par création, sans réduire artificiellement les sorties : neuf maxima + exposition historique = **3,624139325 USD**. Ce plafond couvre ce pire cas conservateur, pas seulement l'estimation optimiste. Les usages cohérents remplacent les réservations ; une dépense incertaine reste réservée.

Déclencher seulement après nouvelle autorisation explicite des neuf appels et de ce plafond, revue des preuves/limite TheFork, vérification des hashes sources/originaux et gel de la grille indépendante. Une erreur fournisseur, timeout, résultat invalide, omission, contradiction de frontière, remplacement de génération ou budget insuffisant arrête la cohorte. Conserver les réponses déjà acquises et les données de coût ; aucune relance payante automatique. L'ancien plafond de 1 USD n'autorise pas cette nouvelle expérience.

**Reste à démontrer :** que la lecture explicite des grandes lettres, de la galerie et des états centraux corrige effectivement la compréhension ; que V3 ancre mieux la synthèse ; que les principes deviennent utiles et fiables sur les trois références, puis sur les autres B1 et sites inconnus. Les images sont désormais disponibles : elles ne prouvent pas encore que le modèle les comprend correctement.
