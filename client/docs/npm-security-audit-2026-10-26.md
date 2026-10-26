# Correction ciblée des dépendances frontend — 26 octobre 2026

Périmètre : `gusto-manager/client`, branche `develop`, Node **24.22.1**, npm **11.19.1**. Aucun commit, push ou déploiement. Aucune intervention de cette mission sur le backend ou les sites clients. Les modifications applicatives déjà présentes ont été conservées.

## Résultat mesuré

| Audit | Total avant | Total après | Faibles avant → après | Modérées avant → après | Élevées avant → après | Critiques avant → après |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `npm audit` | 73 | **28** | 1 → 0 | 36 → 27 | 31 → **0** | 5 → **1** |
| `npm audit --omit=dev` | 69 | **28** | 1 → 0 | 36 → 27 | 27 → **0** | 5 → **1** |

Ces nombres sont des **packages signalés**, avec propagation aux parents. Ils ne comptent pas des vulnérabilités indépendantes. La déduplication par URL GHSA donne **159 avis avant et 26 après** ; pour la production, **152 avant et 26 après**. Les 27 alertes modérées restantes proviennent d'**un seul avis Tiptap** ; le package `next` concentre **25 avis**, dont trois critiques. Il reste donc 26 avis distincts, pas seulement deux vulnérabilités.

L'[inventaire détaillé](./npm-security-audit-2026-10-26.inventory.md) contient chaque GHSA, sa sévérité npm, son statut production, son état final, les chaînes reconstruites depuis le lockfile et toutes les versions modifiées. Aucune alerte n'a été masquée par une configuration d'audit. Les audits restent non nuls et retournent normalement un code de sortie 1.

## Correctifs appliqués

| Dépendance / chaîne | Version initiale → finale | Usage et décision |
| --- | --- | --- |
| `next`, `eslint-config-next` | 14.2.15 → **14.2.35** | Dernier correctif 14.x disponible au registre. Correction sans migration de routeur ou de React. `@next/env` suit 14.2.35 ; les binaires SWC 14.2.33 sont ceux déclarés par cette version de Next. |
| `axios` | 1.7.7 → **1.20.0** | Utilisé dans le navigateur pour les API, l'authentification et les uploads, et côté serveur dans plusieurs `getServerSideProps`. Mise à jour 1.x qui retire tous les avis Axios du nouvel audit. |
| `@tiptap/pm → prosemirror-view` | 1.34.3 → **1.42.8** | Le collage HTML dans l'éditeur d'actualités est un chemin réellement accessible. Le correctif XSS est disponible dès 1.42.3 ; mise à jour compatible 1.x, avec `prosemirror-model` 1.23.0 → 1.25.12. [Avis du mainteneur](https://discuss.prosemirror.net/t/xss-vulnerability-found-in-prosemirror-view/9067). |
| `next-i18next → i18next-fs-backend` | 2.3.2 → **2.6.9** | Lecture de traductions côté serveur. Locales `fr/en`, namespaces déclarés dans les pages, `localePath` local : pas d'endpoint public d'écriture de clés manquantes identifié. Correction disponible sans migration de `next-i18next`. |
| `jspdf → dompurify` | 3.4.15 → **3.4.17** | Le code de partage PDF des réservations utilise `text`, `rect`, `splitTextToSize`, et non `jsPDF.html()` ; les modes DOMPurify visés ne sont pas appelés directement. Correction transitive 3.x appliquée malgré cette absence de chemin identifié. `jspdf` reste 4.2.1. |
| `axios → form-data` | 4.0.1 → **4.0.6** | Correctifs des frontières multipart et de l'injection CRLF. La dépendance vise surtout l'adaptateur HTTP Node ; les formulaires navigateur utilisent le `FormData` natif. |
| `sib-api-v3-sdk → superagent → form-data` | 2.5.2 → **2.5.6** | L'API Next de contact est publique, mais adresse et URL Brevo sont fixées et l'appel présent envoie du JSON. Mise à jour compatible de la branche 2.x, sans remplacement du SDK pendant cette mission. |
| `express → proxy-addr`, `body-parser`, `path-to-regexp` | **Suppression de `express` du frontend** | Aucun import, serveur custom, script ou configuration frontend ne l'utilise. Les API Next ne sont pas un serveur Express. Suppression de la chaîne inutilisée, dont l'avis critique `proxy-addr`. L'Express du backend n'est pas concerné. |
| PostCSS | 8.4.47 / copie Next 8.4.31 → **8.5.31** | Fermeture des avis de sourcemaps et de sérialisation CSS. La copie interne Next était épinglée et nécessitait un override ciblé. |
| Outillage PWA et CSS | Voir inventaire | Correctifs Rollup, Babel, AJV, URI, sérialisation, globbing, YAML et sourcemaps ; aucune migration de `next-pwa` ni de Workbox. |
| Autres transitives | Voir inventaire | `lodash` / `lodash-es` 4.18.1, `moment` 2.31.0, `qs` 6.16.1, `immutable` 4.3.9, etc. Résolution dans les plages déclarées par leurs parents. |

Les avis Axios couvrent des conditions différentes : URL absolue, adaptateur HTTP Node, proxy, redirections, multipart et objets de configuration pollués. Les appels SSR observés construisent leur URL à partir d'une base API configurée et d'un chemin fixe ; aucun proxy HTTP configuré dans le code frontend ni URL complète fournie directement à Axios par l'utilisateur n'a été trouvé. Cela réduit certains chemins SSRF mais ne justifie pas de conserver une version vulnérable sur des requêtes authentifiées. La mise à jour supprime cette dépendance aux préconditions.

`next-pwa` est une dépendance de production npm alors que Workbox Build, Rollup, Babel et Terser sont exécutés pendant le build. Leur classement dans `--omit=dev` ne démontre donc pas une exposition HTTP du dashboard. Les sources et options compilées sont celles du dépôt ; aucun service de compilation de code/CSS/sourcemaps utilisateur n'est présent. Les correctifs compatibles ont néanmoins été appliqués.

### Overrides maintenus explicitement

Quatre overrides sont ajoutés au manifeste, avec leur raison :

| Override | Motif et compatibilité validée |
| --- | --- |
| `next → postcss: $postcss` | Remplace le pin 8.4.31 par la même branche 8.5.31 que la dépendance directe. Build complet et traitements CSS validés. |
| `@next/eslint-plugin-next → glob: ^10.5.0` | Le plugin 14.2.35 épingle toujours 10.3.10. Correctif dans la même majeure ; lint et build passent. Le CLI `glob --cmd` n'est pas un chemin applicatif. |
| `rollup-plugin-terser → serialize-javascript: ^7.1.4` | La chaîne `next-pwa → workbox-webpack-plugin → workbox-build → rollup-plugin-terser` impose historiquement la branche 4. L'API CommonJS utilisée est conservée ; Node ≥20 est compatible avec Node 24. Sérialisation RegExp/fonctions, véritable minification Rollup et génération Workbox validées. La branche 7.1.4 inclut aussi la correction des méthodes à fonctions imbriquées. [Notes de version](https://github.com/yahoo/serialize-javascript/releases/tag/v7.1.4). |
| `postcss-selector-parser: ^7.1.7` | Les consommateurs CSS retiennent des branches 6 vulnérables. Changement majeur limité à l'outillage de compilation ; le changement 7.0 concerne les insertions pendant l'itération. Typographie Tailwind, variantes, `postcss-nested`, `postcss-nesting` et build réel validés. [Changement 7.0](https://github.com/postcss/postcss-selector-parser/releases/tag/v7.0.0). |

Ces overrides devront être retirés quand les dépendances parentes déclareront des versions corrigées. Ils évitent une rétrogradation proposée par npm pour `next-pwa` ou une migration globale de Next. Aucun `npm audit fix --force`, `--legacy-peer-deps` ou patch manuel de `node_modules` n'a été utilisé.

## Alertes restantes : Next.js

**Le package reste classé critique dans npm.** Next 14 n'a plus de support régulier ; la conservation de 14.2.35 est une réduction ciblée du risque dans la configuration examinée, pas une remise à zéro de la dette de sécurité. [Politique de support Next.js](https://nextjs.org/support-policy).

Constats locaux : `src/pages` et Pages Router, SSG + SSR, locales `fr/en`, aucune arborescence App Router, aucun middleware/proxy d'autorisation, aucune Server Action, aucun `beforeInteractive` alimenté par des données non fiables, aucun rewrite externe dans `next.config.js`. Les API métier sont appelées directement via `NEXT_PUBLIC_API_URL`. L'authentification navigateur et le SSE ne reposent pas sur un middleware Next. `next/image` est utilisé, mais aucun `remotePatterns`, `domains` ni `dangerouslyAllowSVG` n'est configuré ; `sharp` n'est pas installé dans le lockfile.

### Trois avis critiques dans le package Next

- [GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) : exécution de code sur un serveur **Windows** via le cache. L'hébergement Vercel annoncé n'est pas Windows. Pas de chemin applicable identifié dans cette configuration ; la conclusion ne vaut pas pour un futur hébergement Windows. Correction publiée en 15.5.24 / 16.3.3.
- [GHSA-2xp9-vwfh-vxw4](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) : AVIF via `sharp/libheif`. Vercel documente une mitigation au niveau de son service central d'images, déployée le 13 août 2026. Aucune dépendance `sharp` ni conversion AVIF custom n'est présente dans ce frontend. **Mitigation de plateforme, pas correction du package 14.x.** [Explication officielle de Vercel](https://vercel.com/blog/reproducing-disclosing-and-fixing-the-libheif-vulnerability-with-hacktron-and-the-maintainers). Correction Next publiée en 15.5.24 / 16.3.3.
- [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) : SVG traité par une bibliothèque native sur Linux glibc. Le service d'images Vercel documente les SVG parmi les formats servis tels quels, plutôt que transformés ; le projet ne fournit pas de `sharp` ou d'optimiseur custom. **Pas de chaîne d'exploitation identifiée sous l'hébergement annoncé**, conclusion fondée sur le fonctionnement documenté du service, sans inspection de son runtime interne. L'avis impose `sharp ≥0.35.5` comme contournement et propose Next 15.5.28 / 16.4.1. Réexaminer immédiatement si une transformation SVG custom ou un auto-hébergement est ajouté. [Formats pris en charge par Vercel](https://vercel.com/docs/image-optimization/limits-and-pricing).

L'absence de `sharp` dans le lockfile n'est pas, à elle seule, une preuve sur les binaires du service d'images Vercel. Aucun audit du projet Vercel réel ni nouvelle mise en production n'a été effectué. Les exclusions de plateforme reposent sur l'hébergement indiqué par la mission et la documentation officielle.

### Les 22 autres avis Next

Chaque identifiant ci-dessous reste dans l'audit final. Le tableau précise le prérequis absent ou l'exclusion officielle, sans assimiler Pages Router à une protection générale.

| Avis / famille | Justification dans ce frontend |
| --- | --- |
| `GHSA-h25m-26qc-wcjf`, `GHSA-q4gf-8mx6-v5v3`, `GHSA-8h8q-6873-q5fj` : DoS RSC | Requièrent les endpoints App Router / React Server Components concernés, absents. [Exemple d'avis officiel](https://github.com/vercel/next.js/security/advisories/GHSA-h25m-26qc-wcjf). |
| `GHSA-m99w-x7hq-7vfj`, `GHSA-p3m5-59mp-jv5r` : DoS Server Actions | Aucun App Router ni Server Action. |
| `GHSA-89xv-2m56-2m9x` : SSRF Server Actions custom server ; `GHSA-4c39-4ccg-62r3` : payload Edge ; `GHSA-955p-x3mx-jcvp` : divulgation de Server Functions | Pas de Server Actions, de Server Functions ni de serveur Next custom. |
| `GHSA-ffhc-5mcf-pf4q` : CSP nonces App Router ; `GHSA-vfv6-92ff-j949`, `GHSA-wfc6-r584-vfw7` : caches de réponses RSC | Les mécanismes App Router / RSC requis sont absents. |
| `GHSA-68g3-v927-f742`, `GHSA-4633-3j49-mh5q` : cache fetch / corps de requête | Requièrent le chemin de fetch mis en cache de l'App Router ; pas d'App Router ici. Les lectures SSR métier utilisent Axios. |
| `GHSA-3g8h-86w9-wvmq` : redirections middleware ; `GHSA-36qx-fr4f-26g5` : bypass Pages Router i18n | L'i18n est bien utilisée, mais aucun middleware/proxy d'autorisation n'existe. Il n'y a donc pas de contrôle middleware à contourner. Cela n'est pas un audit des autorisations API. [Avis i18n](https://github.com/vercel/next.js/security/advisories/GHSA-36qx-fr4f-26g5). |
| `GHSA-gx5p-jg67-6x7h` : XSS `beforeInteractive` | Aucun script `beforeInteractive` recevant des données utilisateur trouvé. [Prérequis officiel](https://github.com/vercel/next.js/security/advisories/GHSA-gx5p-jg67-6x7h). |
| `GHSA-ggv3-7p47-pfv8` : request smuggling ; `GHSA-p9j2-gv94-2wf4` : hostname injecté dans rewrite | Pas de rewrite externe. L'avis de smuggling exclut aussi les rewrites gérés au CDN par Vercel. [Avis officiel](https://github.com/vercel/next.js/security/advisories/GHSA-ggv3-7p47-pfv8). |
| `GHSA-c4j6-fc7j-m34r` : upgrade WebSocket SSRF | L'avis exclut Vercel. Le temps réel du dashboard utilise du SSE HTTP authentifié, pas un proxy WebSocket Next. [Avis officiel](https://github.com/vercel/next.js/security/advisories/GHSA-c4j6-fc7j-m34r). |
| `GHSA-9g9p-9gw9-jx7f` : images distantes en mémoire | Auto-hébergement et `remotePatterns` requis. Aucun domaine distant d'optimisation n'est configuré et les images sont gérées par Vercel. [Avis officiel](https://github.com/vercel/next.js/security/advisories/GHSA-9g9p-9gw9-jx7f). |
| `GHSA-3x4c-7xq6-9pq8` : cache disque images ; `GHSA-h64f-5h5j-jqjh` : images locales en mémoire | Les deux avis excluent explicitement le service d'images Vercel. Applicables à réexaminer avant tout auto-hébergement du build. [Cache disque](https://github.com/vercel/next.js/security/advisories/GHSA-3x4c-7xq6-9pq8), [mémoire](https://github.com/vercel/next.js/security/advisories/GHSA-h64f-5h5j-jqjh). |

### Migration à planifier, non imposée

Next **15.5.28** est le premier candidat de la branche 15 couvrant les avis Next actuels de cet audit ; Next **16.4.3** est également disponible. Les métadonnées npm vérifiées de 15.5.28 acceptent React `^18.2.0` : une migration vers Next 15 Pages Router ne nécessite donc pas automatiquement React 19. Il faudrait choisir et verrouiller cette trajectoire dans une mission dédiée, vérifier les changements de cache/routage, le plugin Webpack PWA, l'i18n, l'authentification, les réponses SSR et les vraies intégrations avant déploiement. Les contrôles locaux avec fixtures ne suffisent pas à attester paiements réels, services distants et lifecycle PWA sur appareils installés.

Ne pas reprendre simplement la proposition `npm audit fix --force` vers la dernière majeure. La migration devient prioritaire si l'hébergement change, si un prérequis des avis est introduit, ou si une faille sans mitigation applicable à ce dashboard est publiée. La fin du support 14 reste une raison de planifier cette migration même en l'absence de chemin exploitable identifié aujourd'hui.

## Alerte restante : Tiptap

[GHSA-cp6q-959q-f8rh](https://github.com/ueberdosis/tiptap/security/advisories/GHSA-cp6q-959q-f8rh) concerne `mergeAttributes()` et une clé propre `__proto__`, issue par exemple de JSON non fiable, qui devient un prototype portant des attributs DOM exécutables. L'avis amont est classé **high**, alors que le flux npm utilisé ici le classe **moderate** ; la décision ne repose pas sur cette différence.

Chemin : les dépendances directes `@tiptap/*` → `@tiptap/core` **2.9.1**, avec propagation à 27 packages. `src/components/_shared/editor/tiptatp.editor.component.js` utilise StarterKit, TextStyle, Color, Underline, Placeholder et ListItem. Les extensions et `HTMLAttributes` sont définis dans le code ; aucun objet d'attributs importé d'un plugin/tenant n'est fusionné, aucune extension custom ne conserve un objet arbitraire, et les schémas standards éliminent les attributs inconnus. Le mainteneur précise qu'un document JSON arbitraire n'est pas automatiquement exploitable avec ces schémas fixes.

**Précondition d'exploitation non identifiée dans l'éditeur actuel**, sans considérer l'authentification comme une protection contre le XSS de collage. C'est précisément pourquoi le correctif indépendant de collage `prosemirror-view` a été appliqué et validé.

La dernière branche 2 disponible est **2.27.3**, toujours incluse dans la plage vulnérable. Le correctif est en **3.30.4** ; forcer uniquement `@tiptap/core` 3 dans l'écosystème 2 briserait les contrats de peers. La migration complète nécessite d'adapter les exports TextStyle, les extensions incluses par défaut dans StarterKit et le comportement de `setContent`/`onUpdate`, puis de vérifier le round-trip HTML des actualités déjà enregistrées. Elle n'est pas imposée pour faire disparaître les 27 lignes d'audit. Toute future extension dynamique ou import d'attributs non fiables doit rouvrir ce point.

## Validation effectuée

| Vérification | Résultat |
| --- | --- |
| `npm ci --no-audit` sous Node 24.22.1 / npm 11.19.1 | Réussite sur le lockfile final ; audits exécutés séparément. npm signale les packages dépréciés historiques et les scripts d'installation non approuvés de `core-js`/`fsevents` ; aucun contournement d'approbation ajouté. |
| `npm ls --all --json` | Code 0, aucun problème de dépendance/peer. |
| `npm run build` | Code 0, Next 14.2.35, **159 pages statiques générées**, routes SSR compilées et génération du service worker par Workbox. |
| `node --test tests/*.test.js` | **54 tests réussis**, dont 48 existants et 6 nouveaux tests de compatibilité des dépendances. |
| Lint du nouveau fichier de tests | Réussite. |
| Audits finaux complet et production | Les deux : **28 packages**, 27 modérés et 1 critique ; **26 GHSA** distincts. |

Les six tests ajoutés couvrent un vrai serveur HTTP local pour Axios (authentification, JSON, multipart, erreur de session), le contrat JSON du SDK Brevo contre un serveur simulé et son `form-data` historique, la sérialisation RegExp/fonctions et la minification Rollup utilisée pour la PWA, la typographie/les variantes Tailwind et les deux syntaxes de nesting CSS, les traductions serveur FR/EN et l'export PDF textuel utilisé pour les réservations. Ils se lancent avec la suite existante, sans nouvelle dépendance de test.

Le build conserve des avertissements ESLint du code applicatif préexistant. Le téléchargement des feuilles Google Fonts a été bloqué par le réseau du sandbox : Next a ignoré leur optimisation, sans échec du build. Aucune règle de lint n'a été désactivée pour valider la mission.

### Parcours navigateur sur le build de production

Chrome headless, serveur frontend temporaire sur localhost, **API simulées**, aucun appel au backend réel :

- Redirection d'un utilisateur sans token vers la connexion.
- Connexion owner, sélection du restaurant, conservation du token et requêtes API authentifiées.
- Rendu du dashboard, des réservations, du module emporter, du planning personnel et de l'abonnement.
- Éditeur d'actualités : saisie, gras, collage HTML riche avec rejet des attributs événements, puis sauvegarde multipart authentifiée et retour à la liste.
- Ouverture du flux SSE avec `Authorization: Bearer …` ; les tests existants couvrent aussi les mutations SSE, la pagination et la visibilité des commandes.
- Réponse API `403 / Session revoked` : suppression du token et redirection vers login.
- **Vrai service worker généré** : installation et activation sur `/sw.js`, puis lecture des manifests dashboard, réservations, emporter et pointeuse.
- Rechargement hors ligne de la page de connexion déjà visitée, via le vrai service worker.
- API Next de contact : méthode incorrecte → 405, payload invalide → 400, sans envoi de mail.

Les parcours API simulés utilisent un worker neutre pour que le vrai cache PWA ne contourne pas les fixtures ; le vrai worker a été validé dans un contexte navigateur séparé, sans session métier. Aucun parcours utilisateur n'a produit d'erreur JavaScript dans la validation finale.

Limites : pas de paiement Stripe, mail Brevo, écriture métier ou abonnement push réel ; pas de validation sur appareils iOS/Android installés ni de déploiement Vercel. Les packages Stripe, React 18.3.1, `next-pwa` 5.6.0 et Tiptap 2.9.1 restent inchangés. Les pages et composants qui les consomment compilent, mais cette vérification ne remplace pas un test d'intégration avec les services distants. Les artefacts PWA générés `public/sw.js` et `public/workbox-*.js` ont été supprimés après les contrôles, conformément à la demande utilisateur. Un prochain build les régénérera.

## Reproduction

Dans `client/`, avec le Node indiqué dans `../.nvmrc` :

```sh
npm ci --no-audit
npm ls --all
node --test tests/*.test.js
npm run build
npm audit
npm audit --omit=dev
```

Les tests HTTP demandent un accès à localhost. Les résultats d'audit sont un instantané au 26 octobre 2026 ; ils peuvent évoluer sans changement du lockfile si le registre publie de nouveaux avis.
