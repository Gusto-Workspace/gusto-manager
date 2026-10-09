# Expérience artistique B1 V1/V2 — arrêt au deuxième appel

8 octobre 2026. Expérience `2026-10-08T18-56-27-309Z-50c62f71`.

**Deux envois sur dix maximum ; une réponse complète ; zéro paire comparable.** Le deuxième appel, Tastavents V2, a dépassé le timeout gelé de 120 secondes. L’exécutant a interrompu l’appel et arrêté toute la cohorte. Aucun retry, aucun autre dispatch, aucune nouvelle capture et aucun changement de moteur/prompt pendant l’expérience. Le seuil d’utilité reste 8/10. La maturité artistique de V2 n’est pas démontrée et n’est pas évaluée par cet arrêt.

Le prévol `STRUCTURAL_B1_AB_PREFLIGHT.md` et le protocole actif `STRUCTURAL_B1_AB_PREPARED.json` conservent leur état antérieur « non autorisé » : ce sont des snapshots de préparation. L’autorisation humaine postérieure des dix appels/plafond 1 USD est consignée séparément dans `approval.json`. Ils n’ont pas été régénérés ni modifiés pendant l’expérience.

## Résultats par référence

| Référence | V1 contemporain | V2 | Utilité V1 / V2 | Gain / régression | Atteinte de 8 par V2 |
|---|---|---|---|---|---|
| Tastavents | Réponse complète, contrat validé | Timeout 120 s ; aucune sortie complète archivée | 5 / NE | Non évaluable | Non démontrée |
| Cartapani | Non envoyé | Non envoyé | NE / NE | Non évaluable | Non démontrée |
| Grupo Isabella’s / Carmina | Non envoyé | Non envoyé | NE / NE | Non évaluable | Non démontrée |
| Gucci Osteria | Non envoyé | Non envoyé | NE / NE | Non évaluable | Non démontrée |
| Cantina del Sol | Non envoyé | Non envoyé | NE / NE | Non évaluable | Non démontrée |

NE signifie **non évaluable**, jamais 0 ni une note historique réutilisée. Les quatre références restantes ne sont pas des échecs artistiques observés : aucun appel les concernant n’a été effectué. L’arrêt est un incident opérationnel de cette expérience. L’absence de sortie V2 ne permet ni de lui attribuer une note, ni de mesurer un surcoût V2/V1, ni de conclure à une régression artistique.

## Évaluation provisoire de la seule sortie disponible

Lecture par l’instance Codex courante, distincte du générateur Vision payant, mais connaissant le projet et le contrat V2. **Ce n’est pas une validation externe indépendante définitive.** Les assertions ont été lues sous ID neutre ; notes et justifications ont été verrouillées avant ouverture du mapping privé. Le schéma/style peut révéler la variante. Le dossier humain est partiellement aveugle ; dans cette série arrêtée, connaître la seule variante reçue permet forcément de déduire son identité. Le dossier ne contient lui-même ni mapping, ni notes antérieures, ni scores Codex.

La grille originale B1 est inchangée. Capture/fidélité concerne les pixels archivés disponibles ; la fidélité intégrale au site historique demeure non certifiée. Aucun score automatique, aucune moyenne masquant un défaut et aucun relèvement de note pour une réponse techniquement valide.

| Critère B1 | Tastavents V1 | Tastavents V2 | Delta |
|---|---:|---:|---:|
| Capture/fidélité | 7 | NE | NE |
| Structure | 5 | NE | NE |
| Texte→image | 5 | NE | NE |
| Densité | 4 | NE | NE |
| Transitions | 4 | NE | NE |
| Principes | 5 | NE | NE |
| Prudence | 5 | NE | NE |
| Taxonomie | 4 | NE | NE |
| Utilité Design Lab | **5** | **NE** | **NE** |

Pour Cartapani, Grupo, Gucci et Cantina, chacun des neuf critères V1 et V2 ainsi que tous les deltas est NE. Le fichier `results.json` contient explicitement ces valeurs manquantes pour les dix variantes. Les neuf justifications et contrôles par intervalle de la sortie disponible sont conservés dans `provisional-blind-assessment.json`.

### Comparaison des assertions aux compositions visibles de Tastavents

Les compositions de référence ont été consignées avant dispatch dans `composition-reference.json`, contre les cinq overviews et leurs vues locales archivées. Les numéros de moment ci-dessous renvoient à la sortie reçue ; les plages viennent de la hauteur totale de page, jamais de la hauteur du storyboard.

| Plage / moments | Assertion reçue | Lecture directe des preuves | Verdict |
|---|---|---|---|
| 0–8 %, m1 | Photo plein cadre, grand titre centré superposé | `observation1`, premier panneau de l’overview : bonne dominante et hiérarchie | Majoritairement juste |
| 15–35 %, m3–4 | Collage irrégulier sans unité dominante, puis panneaux denses | Panneaux 4, 6, 7 : lettres monumentales derrière les portraits, puis grand titre central avec petits fragments photographiques périphériques | Dominance typographique et relation centre/périphérie manquées ; généralisation en panneaux |
| 35–56 %, m5–6 | Colonnes décalées et grille offset | Panneaux 9–13 : photos/paysage, portrait face à un panneau de nom, puis titre centré | Alternance partiellement reconnue ; décalages et axes restent génériques, transition centrale peu précise |
| 56–80 %, m7–8 | Galerie puis nouvelles mosaïques séparées par des panneaux | Panneaux 14–17 : photos verticales voisines et champ sombre texte/CTA à droite dans des fenêtres échantillonnées recouvrantes | Recomposition en mosaïques insuffisamment prouvée ; segmentation trop affirmative |
| 80–91 %, m9 | Phase sombre et compartimentée dominante | Panneaux 19–21 : composition de réservation claire avec titre centré, puis déclaration centrale sombre bordée de petits visuels | Erreur de surface/densité et de portée du moment |
| 91–100 %, m10 | Image centrale franchissant la frontière claire/sombre, textes latéraux, lettres géantes | `observation2`, panneaux 22–23 : chevauchement et équilibrage latéral visibles | Lecture locale utile ; colonnes dites inégales peu justifiées, intention du clipping non prouvée |

Les crops de preuve dans `visual-evidence/` sont de simples extraits des images déjà gelées, sans rééchantillonnage. Leur manifeste enregistre le rectangle exact, la plage de page et le hash de l’original. Ils n’ajoutent aucune nouvelle observation. Les originaux restent inchangés et sont disponibles dans le dossier de lecture.

**Relations globales et principes.** L’overview produit un récit de vagues de densité et d’alignements récurrents, mais n’établit pas précisément les correspondances éloignées entre grandes masses typographiques intérieures et terminaison. Le chevauchement central de clôture est un mécanisme local utile. La plupart des principes globaux restent génériques : varier la densité, conserver quelques axes, insérer des panneaux calmes. Ils n’expliquent pas suffisamment conditions et effets des mécanismes propres à cette composition pour atteindre 8/10.

**Hallucinations et erreurs.** Aucun objet de marque inventé ni durée/causalité animée non observée identifié. Les risques les plus visibles sont spatiaux : mosaïques supposées distinctes, géométries inégales/offset/staggered insuffisamment démontrées, dominante sombre attribuée à toute une plage principalement claire. L’expression « volontairement coupée » confond également clipping visible et intention de design. Distinguer une omission, une généralisation abusive et un objet inventé : les trois ne sont pas identiques, mais les deux premières diminuent déjà la fiabilité artistique.

**Corrigé/persistant/nouveau entre V1 et V2 : non évaluable pour les cinq sites.** Les défauts ci-dessus sont observés dans V1 contemporain ; sans V2, ils ne peuvent être qualifiés de défauts persistants ou corrigés par V2. Ils ne remplacent pas les évaluations historiques ni leurs preuves.

### Hypothèses causales, sans correction pendant l’expérience

- **Limite d’entrée certaine :** Tastavents ne dispose que de deux vues locales, entrée et terminaison. Ses compositions centrales reposent sur des panneaux de storyboard de 240×150 pixels fournis en low detail. Cela réduit les détails lisibles, mais les dominantes manquées demeurent visibles ; l’entrée ne suffit donc pas à excuser toutes les erreurs. Contribution causale précise : confiance moyenne.
- **Comportement de sortie constaté :** des plages sont assimilées à des catégories génériques panneau/grille/galerie au lieu de vérifier leurs masses dominantes et leurs relations. Constat de confiance élevée ; part respective du prompt, du schéma et du modèle inconnue.
- **Segmentation d’états :** des fenêtres recouvrantes sont décrites comme des recompositions distinctes. Hypothèse de confiance moyenne ; les images statiques ne démontrent pas le mécanisme temporel réel.
- **Timeout V2 :** 120 s contre 81,453 s pour l’appel V1 reçu. Une seule observation ne démontre ni une latence V2 systématique, ni une sortie plus longue, ni un problème de qualité artistique. Départ fournisseur, traitement, volume de raisonnement et éventuelle facturation V2 restent inconnus faute de réponse complète.

## Coût et budget

Tarifs Standard de [la page OpenAI Pricing](https://developers.openai.com/api/docs/pricing), recontrôlés avant lancement : 0,10 USD/M entrée normale ; 0,01 USD/M lecture cache ; 0,125 USD/M écriture cache ; 0,50 USD/M sortie. [La documentation GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) confirme les limites et tarifs long contexte utilisés pour la réservation conservatrice.

Appel reçu : **10 433 tokens d’entrée**, dont **10 430 écritures cache** et 0 lectures cache ; **8 686 tokens de sortie**, incluant **1 034 tokens de raisonnement**. Total 19 119 tokens. Le raisonnement n’est pas ajouté une deuxième fois.

`(3 × 0,10 + 10 430 × 0,125 + 8 686 × 0,50) / 1 000 000 = 0,00564705 USD HT`.

- **Coût connu calculé sur l’usage fournisseur : 0,00564705 USD HT.** Ce n’est pas une vérification de facture du compte.
- **Coût du deuxième appel : inconnu.** Un abort local ne prouve pas l’absence de facturation fournisseur ; aucune valeur 0 n’est imputée.
- **Réservation incertaine conservée : 0,36 USD.** Exposition maximale retenue pour cette expérience arrêtée : **0,36564705 USD HT**, sous le plafond autorisé de **1,00 USD**.
- Aucun troisième appel ; aucune possibilité de reprise automatique. Différence financière effective V1/V2 : non mesurable.

## Conservation et vérifications

Archive locale durable, séparée des données produit :

`server/diagnostics/structural-b1-ab-20261008/runs/2026-10-08T18-56-27-309Z-50c62f71/`

Elle conserve autorisation, protocole gelé, copie de l’exécutant, grille et compositions de référence, ordre de dispatch, engagement du mapping, ledger, les deux payloads exactement envoyés, un corps brut complet, ses métadonnées, sortie texte/JSON/validation, trace de timeout, évaluation provisoire verrouillée, résultats lisibles/machine, preuves visuelles et packet humain A/B. Le mapping est à l’extérieur de `blind/`. Le deuxième appel n’a aucun corps brut complet disponible ; cet élément manquant est déclaré, jamais remplacé par une réponse reconstituée.

Les **25 images et dix hashes de requête** ont été contrôlés avant le premier appel. Le brut de la seule réponse complète a été écrit durablement avant parsing et validation. Le slot et la réservation ont précédé chacun des deux dispatchs. Un verrou d’exécution persistant empêche un relancement accidentel.

**1 015 fichiers/proofs préexistants** identifiés à l’exécution sont restés inchangés, dont **94 preuves historiques** : 13 analyses JSON, 13 manifests, 67 images et le snapshot privé des références/tentatives. Les sources préexistantes ont conservé leurs hashes et le HEAD Git reste `2bd44a3321ec11f9d3b5263ecb47673eccf3e3ef`. Ce contrôle porte sur le snapshot et les archives locales ; aucune lecture de la base vivante n’est présentée comme une surveillance de ses changements concurrents.

Les seuls ajouts sont les outils isolés d’expérience, leurs tests et les livrables/archives de cette expérience. Aucun changement du moteur, aucune mutation MongoDB/Cloudinary, aucun appel aux services de capture/récupération, aucune génération B1 remplacée et aucun commit.

Validation hors ligne de l’exécutant et du protocole : **10 tests passés, zéro échec, zéro skip**, avec garde bloquant les effets distants. Les tests utilisent un transport simulé et ne consomment aucun appel payant.

## Prochaine décision recommandée

**Diagnostiquer d’abord l’arrêt opérationnel, sans modifier le contrat artistique sur la base de cet A/B incomplet.** Examiner les traces et la latence observée, puis décider explicitement d’une éventuelle nouvelle expérience et de ses paramètres opérationnels/budget. Les huit slots non utilisés ne constituent pas une reprise automatique après arrêt. L’appel V2 interrompu reste consommé et potentiellement facturé ; aucun rattrapage n’a été tenté.

La seule lecture V1 disponible indique que dominance centrale, segmentation de fenêtres recouvrantes, géométrie vérifiable et relations globales devront rester au cœur du diagnostic artistique. Elle n’établit pas quelles corrections manquent encore à V2. Avant toute correction artistique supplémentaire, obtenir une paire complète et une lecture humaine constante des preuves demeure nécessaire. Ni les quatre références non envoyées, ni les huit autres B1, ni B2 ne sont validées par cette expérience.
