# Directions : trois slots actifs, historique conservé

## Modèle

Chaque `SiteProject.directions[]` contient une version complète de direction, une seule fois dans ce tableau :

| Champ | Contrat |
| --- | --- |
| `slot` | `A`, `B`, `C` ; `null` uniquement pour un historique non assigné |
| `version` | entier ≥ 1 pour une version assignée ; `null` pour legacy non assignée |
| `status` | `active`, `archived`, `legacy_unassigned` |
| `generationId` | UUID du checkpoint/run ; identifiant synthétique explicitement marqué pour la migration connue |
| `replacesDirectionId` | ID de la version antérieure du même slot, ou `null` en v1 |
| `createdAt` | création de cette version ; inchangée lors de l'archivage |

Avant la première génération, aucune version active n'existe. Dès qu'un set est initialisé, il doit compter exactement trois principales actives, une par slot. Unicité `(slot, version)`, lineage vers une version archivée antérieure du même slot et cohérence des pointeurs sont validées avant sauvegarde. Une legacy non assignée ne peut pas occuper A/B/C. Aucune affectation automatique par titre ou ordre n'est ajoutée pour les données inconnues.

## Promotion atomique

`promoteDirectionSet` archive le set actif et crée A/B/C avec une version incrémentée indépendamment par slot. Exemple : A v1 / B v3 / C v1 deviennent A v2 / B v4 / C v2. Leurs `generationId` sont communs au nouveau run. Une nouvelle génération ne crée jamais six cartes actives.

`promoteSingleDirection` archive uniquement la version cible et crée la suivante du même slot avec `replacesDirectionId`. A/C restent identiques lorsque B est régénérée. Une cible déjà historique est refusée avant tout appel OpenAI.

Les modifications de statut, nouvelles versions et consommation du checkpoint sont sauvegardées ensemble dans **un seul document Mongo**, avec le token de verrou. Aucune promotion officielle n'est faite avant validation de toutes les expansions nécessaires. Une sauvegarde échouée conserve le set officiel précédent et le checkpoint payé pour reprise.

## Style Frames, homepages et sélection

- Style Frames et leur `approvedStyleFrameId` restent sur la version d'origine ; aucune image Cloudinary n'est supprimée ou transférée.
- Nouvelle version : `styleFrames=[]`, `approvedStyleFrameId=null`.
- Les homepages gardent leur `directionId` et leur `styleFrameId` ; elles restent historiques lorsqu'une direction est archivée.
- Si la version remplacée était sélectionnée, **`selectedDirection` et `selectedGeneration` sont effacés**. Aucune nouvelle direction ni ancienne validation de Style Frame n'est choisie automatiquement.
- Si B est régénérée alors qu'A et sa homepage sont sélectionnées, cette sélection reste intacte.
- Sélection, nouvelle homepage, variation, génération/validation de Style Frame et approbation refusent les versions historiques.
- Valider un Style Frame d'une autre direction active efface la sélection de homepage précédente ; la homepage reste conservée sur sa direction d'origine.
- Le freeze existant protège les projets approuvés. `approvedSnapshot` et `approvalHistory` restent autonomes et ne sont pas réécrits par le versionnement. Après réouverture, une nouvelle génération conserve le snapshot antérieur dans l'historique déjà prévu.

## Checkpoint et identifiants

Le résultat artistique OpenAI conserve son schéma ; les métadonnées de version sont affectées côté serveur. La génération normale garde les expansions A/B/C ; une régénération de B utilise l'ID de territoire/expansion B, conserve `targetSlot=B` et `replacesDirectionId` dans le checkpoint, et produit B v(n+1). Seul le contrat d'identifiant du prompt unitaire est précisé ; la logique artistique et les modèles restent identiques.

Le hash de contexte inclut les versions de directions et la cible : on ne peut pas appliquer un ancien checkpoint à un slot dont la version a changé. La reprise manuelle d'une expansion utilise la même promotion atomique que le run neuf. Les appels réussis restent réutilisables ; aucun retry automatique n'est ajouté.

Les logs de fin comptent désormais les **directions principales actives**, avec le run et les versions ; une régénération annonce `generatedCount:1`, pas un total fictif d'une direction.

## API et UI

La sérialisation `SiteProject.toJSON` expose uniquement les directions principales actives A/B/C et leurs homepages. Toutes les réponses projet des routes admin utilisent ce contrat. Le tableau stocké reste complet : `toObject`, les services métier et Mongo conservent les versions historiques.

L'écran principal filtre aussi explicitement les slots/status et affiche `Direction A · v2`, etc. Aucune quatrième carte legacy. Pas de grande UI d'historique ajoutée.

Base disponible : `GET /api/admin/design-lab/projects/:id/directions/history` (admin authentifié), qui retourne les versions archivées/non assignées, leurs Style Frames et leurs homepages historiques. `activeDirections`, `directionHistory` et `requireActiveDirection` centralisent la distinction.

## Migration ciblée Le Ventadour TEST

Plan expliqué à l'utilisateur avant exécution, puis validé par dry-run sans écriture :

| ID | Direction | Slot | Version | Statut | Style Frames préservés |
| --- | --- | --- | --- | --- | --- |
| `6ac14d53f13c0eadf81da344` | La tablée vivante | A | 1 | active | 2 |
| `6ac14d53f13c0eadf81da345` | Au rythme du Tarn | B | 1 | active | 1 |
| `6ac14d53f13c0eadf81da346` | La maison, au présent | C | 1 | active | 1 |
| `6ac1513ff13c0eadf81daaa5` | Le goût, franchement | null | null | legacy_unassigned | 1 |

Les trois premières appartiennent au même run connu, dans l'ordre A/B/C. Son UUID original n'est pas disponible : `migration:6abe8c84a4d15d995a7fb731:initial-abc` est un identifiant de groupe **synthétique**, pas un request ID retrouvé. La quatrième garde `generationId=null`, `replacesDirectionId=null` : sa cible historique est inconnue et n'est pas devinée.

Le projet était éditable, sans opération/checkpoint, non approuvé. Sa sélection pointait vers la quatrième direction : les deux pointeurs sont remis à null. Les ID, noms, dates, contenus, Style Frames, validations, systèmes artistiques, assets, homepages et snapshots restent inchangés. Aucune suppression Cloudinary. Écriture ciblée unique, conditionnée par `updatedAt`, état du freeze/verrou et IDs exacts ; sauvegarde EJSON privée avant application puis vérification de conservation. Aucun script ponctuel n'est installé dans le repo/package.

Migration exécutée en TEST le 04/10/2026 : un document modifié, quatre directions conservées, trois actives, cinq Style Frames conservés (2/1/1/1), sélections nulles. Le document relu après écriture a été comparé à la sauvegarde privée pour confirmer que seules les métadonnées de version, les deux pointeurs et `updatedAt` ont changé.

## Wildcard future

Possibilité future : slot séparé `wildcard`, créé uniquement par une action explicite « Explorer une piste radicale », hors des trois principales. **Pas implémenté**, ni accepté par le schéma actuel, ni généré automatiquement. Son pipeline et son coût seront définis après StructuralReference.

## Tests

`node --test tests/design-lab*.test.js tests/design-engine-v2.test.js tests/direction-versioning.test.js` ; les générations utilisent des mocks OpenAI/Mongo. Couverture de première génération, B v2/v3, nouveau set, reprise ciblée, historique/images, API principale, lineage, pointeurs et freeze. Build manager : `npm run build`. Aucun appel OpenAI réel.

Vérification finale le 04/10/2026 : 265/265 tests passants, dont 22 nouveaux tests pour cette mission ; build manager réussi et routes Design Lab chargées sans erreur.
