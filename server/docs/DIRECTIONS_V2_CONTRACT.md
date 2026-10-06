# Contrat Directions V2 : validité et guidance artistique

Le parcours est `directionStage` → `structured` / `JSON.parse` → checkpoint de la réponse parsée → contrôle local du même JSON Schema strict que celui envoyé à OpenAI → `validateCreativeTerritories` ou `validateDirectionsV2` → diversité → `lockedProject` → un `SiteProject.save()`. Les expansions A/B/C sont attendues ensemble : une erreur fatale empêche tout enregistrement officiel partiel, mais conserve les réponses déjà reçues dans un checkpoint interne. Les compteurs de références sont mis à jour ensuite, sans pouvoir annuler la sauvegarde.

Les erreurs portent `validation.category`, `reason` et `fieldPath`. Le mécanisme d'exception existant est conservé (première erreur fatale), sans ajouter un second circuit `fatalErrors[]`. Les conseils sont séparés dans `qualityWarnings: [{code, fieldPath, message}]`, reconstruits localement, journalisés et conservés dans chaque direction. Ils ne bloquent ni sauvegarde ni étapes image. Aucune migration nécessaire.

## Classement exhaustif des validations post-réponse

Chaque ligne appartient à une seule catégorie. Les cardinalités artistiques étaient auparavant fatales. Les types, enums, propriétés obligatoires et nullabilités sont contrôlés par le Structured Output **et localement**, uniquement pour Directions V2. La matrice de tests couvre les rejets métier ; les tests de schéma simulent une réponse HTTP 200 mal formée.

| Validation / motif | Catégorie | Comportement actuel |
| --- | --- | --- |
| JSON absent ou non parsable : `structured_output_parse_failed` | FATAL_STRUCTURE | Rejet |
| Champ absent/supplémentaire, type, enum, nullabilité ou longueur invalide : `structured_output_schema_invalid` | FATAL_STRUCTURE | Rejet |
| Nombre et ordre A/B/C (ou A) : `territory_count_or_ids_invalid` | FATAL_STRUCTURE | Rejet ; reprise manuelle uniquement |
| Champs essentiels de territoire vides : `territory_fields_invalid` | FATAL_STRUCTURE | Rejet ; reprise manuelle uniquement |
| Anchors de territoire invalides, dupliquées ou hors quota 2–3 : `territory_anchors_invalid` | FATAL_REFERENTIAL | Rejet ; reprise manuelle uniquement |
| Moins de trois traits de territoire | ARTISTIC_GUIDANCE | Warning `territory_personality_under_preferred_count` |
| Territoires partageant au moins trois axes proches | ARTISTIC_GUIDANCE | Warning `territories_too_similar`, aucun retry artistique |
| Nombre de directions demandé : `direction_count_invalid` | FATAL_STRUCTURE | Rejet |
| 2–3 anchors d'expansion : `reference_anchor_count_invalid` | FATAL_REFERENTIAL | Rejet ; contrat maintenu avec le Style Frame |
| Anchors distinctes : `reference_anchor_duplicate` | FATAL_REFERENTIAL | Rejet |
| Index/image/sélection/raison/principes valides : `reference_anchor_invalid` | FATAL_REFERENTIAL | Rejet |
| Une homepage, IDs uniques/non vides, rôle explicité : `primary_pages_invalid` | FATAL_STRUCTURE | Rejet |
| Affectations présentes, sujets distincts/non vides : `content_assignments_invalid` | FATAL_STRUCTURE | Rejet |
| Affectation teaser sans cible : `homepage_teaser_requires_destination` | FATAL_BUSINESS_CONTRACT | Rejet |
| Affectation dédiée sans cible : `dedicated_page_requires_destination` | FATAL_BUSINESS_CONTRACT | Rejet |
| Destination d'affectation/moment inconnue ou non dédiée : `destination_not_dedicated_page` | FATAL_REFERENTIAL | Rejet |
| Aucun moment : `homepage_moment_count_invalid` | FATAL_STRUCTURE | Rejet ; ancien intervalle 5–7 retiré |
| Nombre de moments hors cible 5–7 | ARTISTIC_GUIDANCE | Warning `homepage_moment_count_outside_preferred_range` |
| IDs de moments vides/dupliqués : `homepage_moment_duplicate` | FATAL_STRUCTURE | Rejet |
| Premier moment sans hero : `homepage_hero_missing` | FATAL_BUSINESS_CONTRACT | Rejet ; ouverture unique |
| Hero supplémentaire ou rôle hors section : `homepage_hero_or_footer_duplicate` | FATAL_BUSINESS_CONTRACT | Rejet ; enum footer/navigation déjà rejeté par le schéma |
| Sujet inconnu/dédié/footer/navigation/optional dans home : `topic_not_on_homepage` | FATAL_BUSINESS_CONTRACT | Rejet |
| Sujets et placement incohérents/mélangés : `homepage_moment_placement_mismatch` | FATAL_BUSINESS_CONTRACT | Rejet |
| Hero classé teaser : `hero_must_be_homepage_primary` | FATAL_BUSINESS_CONTRACT | Rejet |
| Portée incohérente avec placement : `home_content_scope_mismatch` | FATAL_BUSINESS_CONTRACT | Rejet |
| Slot primaire libre utilisé dans teaser : `teaser_content_intent_must_be_empty` | FATAL_BUSINESS_CONTRACT | Rejet ; expression autorisée dans `editorialIntent` |
| Teaser sans invitation éditoriale structurée utilisable : `teaser_editorial_intent_invalid` | FATAL_BUSINESS_CONTRACT | Rejet |
| Éléments home vides/hors contrat (doublons normalisés) : `home_elements_invalid` | FATAL_STRUCTURE | Rejet |
| Élément fonctionnel/détaillé déclaré dans teaser : `dedicated_page_detail_not_allowed_in_home_teaser` | FATAL_BUSINESS_CONTRACT | Rejet ; enum impossible également bloqué par le schéma |
| Moment teaser sans destination : `homepage_teaser_requires_destination` | FATAL_BUSINESS_CONTRACT | Rejet |
| Destination du moment différente des sujets : `homepage_teaser_destination_mismatch` | FATAL_BUSINESS_CONTRACT | Rejet |
| Sujet détaillé vers page inconnue/non dédiée : `dedicated_topic_page_invalid` | FATAL_REFERENTIAL | Rejet |
| Plans rythme/climat ne couvrant pas exactement les IDs : `visual_plan_section_mismatch` | FATAL_REFERENTIAL | Rejet |
| Voisins de même climat **et** layout | ARTISTIC_GUIDANCE | Warning `adjacent_rhythm_repeated` |
| Plus de trois gestes graphiques | ARTISTIC_GUIDANCE | Warning `graphic_language_outside_preferred_range` |
| Nombre de signatures hors cible 2–4 | ARTISTIC_GUIDANCE | Warning `signature_count_outside_preferred_range` ; zéro possible |
| Personnalité hors cible 3–5 | ARTISTIC_GUIDANCE | Warning `personality_outside_preferred_range` |
| Aucun anti-pattern | ARTISTIC_GUIDANCE | Warning `antipatterns_missing` |
| Occurrences signature non entières/négatives : `signature_occurrences_invalid` | FATAL_STRUCTURE | Rejet ; limite non interprétable |
| Occurrences signature zéro ou supérieures à deux | ARTISTIC_GUIDANCE | Warning `signature_occurrences_outside_preferred_range` |
| Moins de trois climats | ARTISTIC_GUIDANCE | Warning `low_climate_diversity` |
| Moins de trois layouts | ARTISTIC_GUIDANCE | Warning `low_layout_diversity` |
| Six rôles couleur, hex, rôle, usage, provenance : `color_system_invalid` | FATAL_STRUCTURE | Rejet ; `accentSecondary` nullable |
| Couleur imposée malgré `reinvent` : `reinvent_brand_color_constraint` | FATAL_BUSINESS_CONTRACT | Rejet |
| Directions partageant au moins trois axes proches | ARTISTIC_GUIDANCE | Warning `directions_too_similar`, sauvegarde autorisée |

Mongo vérifie ensuite les systèmes requis, les enums et les ObjectIds : **FATAL_STRUCTURE** pour une représentation impossible à enregistrer. Une panne Mongo/HTTP est une erreur d'infrastructure, pas un jugement artistique. Les contrôles ultérieurs d'image (Style Frame approuvé, images disponibles, limite d'inputs, longueur du prompt) restent des garde-fous techniques de leurs propres opérations.

## Liberté de composition

5–7 moments sont conseillés dans le prompt. Quatre moments forts ou huit moments courts restent acceptés si sujets, destinations et plans visuels sont cohérents. Le plan image accepte ces tailles et réserve le footer au **dernier chapitre réel**, même quand il y en a deux. Répéter le climat seul avec un autre layout n'entraîne pas de warning de répétition ; répéter les deux produit un warning et peut créer une continuité volontaire. Aucun zigzag ni quantité minimale d'effets n'est imposé. Deux signatures sont valides ; une ou zéro reste exploitable avec conseil non bloquant.

Les heuristiques de proximité territoires/directions restent identiques. Leur résultat devient un avertissement, sans erreur 502 ni nouvel appel payant automatique. Aucun retry payant automatique ; les étapes invalides peuvent être reprises uniquement lors d'un nouveau déclenchement manuel.

## Primitives primaires et teasers

Un primary, hero compris, accepte toute combinaison non vide de headline, short_copy, photography et cta, sans titre obligatoire. Les doublons sont normalisés. La matrice générative de 256 cas, l'audit des autres champs compositoires, le diagnostic du run payé et l'architecture de reprise sont détaillés dans [DIRECTIONS_V2_RECOVERY.md](./DIRECTIONS_V2_RECOVERY.md).

### Teasers : invitation éditoriale, détails dédiés

`contentAssignments` classe chaque sujet. Un `homepage_primary` utilise `contentScope: primary`, une destination éventuellement null et une intention concise dans `contentIntent`. Un hero/manifeste court reste primaire. Un `homepage_teaser` utilise `contentScope: teaser_only`, `homeElements: [invitation, cta]` avec photographie facultative et une destination dédiée concordant avec ses sujets.

Son expression créative est désormais portée par :

```json
{
  "editorialIntent": {
    "kind": "invitation",
    "headlineIdea": "Le goût du partage",
    "tone": "Chaleureux et généreux",
    "ctaLabel": "Découvrir le traiteur"
  }
}
```

Les limites sont respectivement 120, 80 et 60 caractères. Le CTA est non vide. `editorialIntent` est requis dans le schéma, nullable pour un primary, obligatoire sous forme d'objet pour un teaser. `contentIntent` reste vide pour les teasers : l'expressivité est déplacée dans un slot précis plutôt que supprimée. Mongo conserve cet objet dans l'architecture Mixed et préserve null. Une future génération produit les nouveaux champs ; aucune migration ni écriture sur les projets existants.

Le plan home conserve uniquement les trois champs éditoriaux et leur type d'invitation ; les descriptions libres du sujet sont remplacées par le libellé de sa page cible. Il n'envoie ni `dedicatedPageTopics` ni sujets exclus. Formulaires, calendriers, convives, créneaux, listes de prestations et menus/formules ne sont pas des éléments home autorisés. Les détails doivent être déclarés dans la page dédiée. Aucun mot libre n'est recherché : « Sans calendrier ni formulaire » dans une invitation reste valide.

**Limite sémantique :** la structure contrôle les types de contenu déclarés ; elle ne prouve pas qu'une headline libre ne dissimule aucune liste de prestations. Une liste indûment placée dans `headlineIdea` viole le prompt et nécessite une vérification humaine. La détecter automatiquement demanderait une interprétation sémantique supplémentaire. H/J testent les éléments détaillés déclarés et les champs supplémentaires, pas un détecteur lexical caché.

## Vérifications sans appel réel

| Cas | Résultat vérifié |
| --- | --- |
| A : 4 moments forts, peu de climats | Accepté, warnings, plan image exploitable |
| B : 6 moments variés | Accepté |
| C : 8 moments courts | Accepté, warning de nombre, plan image exploitable |
| D : même climat, layouts différents | Accepté sans warning de répétition |
| E : mêmes climat/layout voisins | Accepté avec warning |
| F : minimalisme, 2 signatures | Accepté |
| G : teaser traiteur « Le goût du partage » | Accepté, intention transmise au plan image |
| H : teaser traiteur, liste de prestations déclarée | Rejet fatal métier ou schéma |
| I : réservation, invitation et CTA | Accepté, même si l'invitation mentionne « sans formulaire » |
| J : réservation, formulaire/créneaux déclarés | Rejet fatal métier ou schéma |

Les fixtures A/B/C complètes passent aussi parsing réel, validation et route avec Mongo intégralement mocké. La fixture A porte un warning conservé dans l'objet Mongoose sauvegardé fictivement. Une violation métier et une réponse incomplète restent bloquées, sans direction partielle.

Les warnings ne logguent que des messages locaux et chemins. Les erreurs journalisent catégorie/motif/champs structurels, sans réponse complète ni texte éditorial. `DESIGN_LAB_DIAGNOSTICS=1` hors production peut ajouter le moment rejeté (ID, rôle, placement, portée, éléments, destination), jamais son texte, le prompt ou la clé API.
