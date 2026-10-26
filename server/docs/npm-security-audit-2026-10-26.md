# Audit npm du backend — 26 octobre 2026

Branche vérifiée avant modification : develop. Node.js 24.22.1, npm 11.19.1. Aucun commit, push ou déploiement. Périmètre modifié : server uniquement. Les modifications locales préexistantes, notamment le script test:take-away, ont été conservées. Des modifications concurrentes supplémentaires ont été constatées hors server ; elles n’ont pas été modifiées par cette mission.

## Résultat

| Périmètre | Critiques avant | Élevées avant | Modérées avant | Faibles avant | Total avant | Après |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Production | 4 | 10 | 3 | 2 | 19 | 0 |
| Développement uniquement | 0 | 3 | 0 | 0 | 3 | 0 |
| Ensemble | 4 | 13 | 3 | 2 | 22 | 0 |

Les comptes npm portent sur des packages vulnérables, y compris les effets transitifs ; ils ne représentent pas 22 failles indépendantes. Aucun avis critique ou élevé restant dans les deux audits finaux. L’absence d’alerte npm ne remplace pas un audit du code ni des services externes.

## Versions directes corrigées

| Package | Version verrouillée avant | Version verrouillée après |
| --- | --- | --- |
| @xmldom/xmldom | 0.9.11 | 0.9.12 |
| axios | 1.7.7 | 1.20.0 |
| body-parser | 1.20.3 | 1.20.9 |
| cloudinary | 2.6.1 | 2.11.0 |
| express | 4.21.1 | 4.22.3 |
| express-session | 1.18.1 | 1.19.0 |
| mongoose | 8.7.1 | 8.24.7 |
| sharp | 0.32.5 | 0.35.5 |
| tar | 7.4.3 | 7.5.22 |

Les planchers de package.json ont été relevés ; Sharp reste épinglé exactement. Les résolutions correctives/mineures restent dans les majeures existantes, sauf le passage potentiellement incompatible de Sharp 0.32 à 0.35, analysé ci-dessous.

## Résolutions transitives ciblées

| Package | Avant | Après |
| --- | --- | --- |
| form-data | 4.0.1 | 4.0.6 |
| superagent/node_modules/form-data | 2.5.2 | 2.5.6 |
| jws | 3.2.2 | 3.2.3 |
| lodash | 4.17.21 | 4.18.1 |
| path-to-regexp | 0.1.10 | 0.1.13 |
| proxy-addr | 2.0.7 | 2.0.8 |
| qs | 6.13.0 | 6.16.1 |
| follow-redirects | 1.15.9 | 1.16.2 |
| on-headers | 1.0.2 | 1.1.0 |
| bn.js | 4.12.2 | 4.12.5 |
| minimatch | 3.1.2 | 3.1.5 |
| brace-expansion | 1.1.11 | 1.1.21 |
| picomatch | 2.3.1 | 2.3.2 |
| tar-fs | 3.0.6 | Retiré avec l’ancien installateur Sharp |
| prebuild-install/node_modules/tar-fs | 2.1.1 | Retiré avec l’ancien installateur Sharp |

Les autres changements du lock appartiennent à la fermeture des dépendances des packages ci-dessus : par exemple MongoDB 6.16.0 → 6.20.0 est également requis par Mongoose 8.24.7, qui remplace sa copie imbriquée MongoDB 6.9.0. Les binaires natifs multiplateformes @img expliquent une part importante du diff. Aucun override ni dépendance transitive ajoutée artificiellement à package.json. Le SDK Stripe, jsonwebtoken, PDFKit, Multer et le SDK Brevo gardent leur version directe verrouillée.

## Diagnostic des alertes critiques et élevées

Pour chaque package, les chemins ci-dessous proviennent de npm ls --all avant correction. La version après correction indiquée ci-dessus est une version corrigée disponible, vérifiée par l’audit final ; les plages de chaque avis précisent le seuil vulnérable. Les GHSA liés donnent les CVE associés lorsqu’ils existent.

### @xmldom/xmldom — élevée

- Installation concernée : node_modules/@xmldom/xmldom@0.9.11.
- Chemin : @xmldom/xmldom@0.9.11.

Production : XML des imports XLSX administrateur (services/dish-card-import.service.js), donc entrée téléversée non fiable. DoS du parseur prioritaire ; les branches de sérialisation XML/HTML ne sont pas appelées par ce service.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-6gmq-8vp8-gcm6](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6) | xmldom: XML fragment injection via invalid EntityReference.nodeName during requireWellFormed serialization (moderate) | >=0.9.0 <=0.9.11 |
| [GHSA-6mj3-qw4j-hgrw](https://github.com/advisories/GHSA-6mj3-qw4j-hgrw) | xmldom: HTML raw-text closing-tag case mismatch causes output amplification (high) | >=0.9.0-beta.1 <=0.9.11 |
| [GHSA-c7q8-3ch8-vqpv](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv) | xmldom: Processing Instruction Target Injection Bypasses requireWellFormed (high) | >=0.9.0 <=0.9.11 |
| [GHSA-jxjr-3g7g-3944](https://github.com/advisories/GHSA-jxjr-3g7g-3944) | xmldom: requireWellFormed element/attribute name validation is bypassable via an embedded line terminator (high) | =0.9.11 |
| [GHSA-27p8-2357-5qqv](https://github.com/advisories/GHSA-27p8-2357-5qqv) | xmldom: DocType `name` Injection Bypasses requireWellFormed (high) | >=0.9.0 <=0.9.11 |
| [GHSA-3px3-54cx-rmw9](https://github.com/advisories/GHSA-3px3-54cx-rmw9) | xmldom: Creation-time XML Name/QName validation is bypassable via an embedded line terminator, allowing injection on the default serialization path (high) | >=0.9.0 <=0.9.11 |
| [GHSA-vr34-hp96-76pp](https://github.com/advisories/GHSA-vr34-hp96-76pp) | xmldom: requireWellFormed DocType publicId/systemId validation is bypassable via an embedded line terminator (high) | >=0.9.10 <=0.9.11 |
| [GHSA-6h8r-xr42-gp59](https://github.com/advisories/GHSA-6h8r-xr42-gp59) | xmldom: Parser silently accepts a not-well-formed end tag whose name is followed by a line break and trailing content (moderate) | >=0.9.0 <=0.9.11 |
| [GHSA-8344-3jmq-59r6](https://github.com/advisories/GHSA-8344-3jmq-59r6) | xmldom: Quadratic-time attribute deduplication (high) | >=0.9.0 <=0.9.11 |
| [GHSA-965w-775f-mr7g](https://github.com/advisories/GHSA-965w-775f-mr7g) | xmldom: Quadratic-memory consumption (high) | >=0.9.0 <=0.9.11 |
| [GHSA-93r5-fhx6-vmg9](https://github.com/advisories/GHSA-93r5-fhx6-vmg9) | xmldom: Quadratic-time parsing via the malformed-input recovery path — `parseElementStartPart` re-scan and `normalize()` adjacent-text merge (high) | >=0.9.0 <=0.9.11 |

### axios — élevée

- Installation concernée : node_modules/axios@1.7.7.
- Chemin : axios@1.7.7.

Production : téléchargements de visuels cadeaux, documents et pièces jointes (gift-card-mailer, employees, admin/documents, routes HACCP). SSRF, fuite de credentials, DoS et gadgets de pollution de prototype selon les options et la provenance des URL. Exploitabilité de chaque gadget non démontrée ; aucune nouvelle garantie de validation des URL n’est supposée.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-jr5f-v2jv-69x6](https://github.com/advisories/GHSA-jr5f-v2jv-69x6) | axios Requests Vulnerable To Possible SSRF and Credential Leakage via Absolute URL (high) | >=1.0.0 <1.8.2 |
| [GHSA-4hjh-wcwx-xvwj](https://github.com/advisories/GHSA-4hjh-wcwx-xvwj) | Axios is vulnerable to DoS attack through lack of data size check (high) | >=1.0.0 <1.12.0 |
| [GHSA-3p68-rc4w-qgx5](https://github.com/advisories/GHSA-3p68-rc4w-qgx5) | Axios has a NO_PROXY Hostname Normalization Bypass that Leads to SSRF (moderate) | >=1.0.0 <1.15.0 |
| [GHSA-w9j2-pvgh-6h63](https://github.com/advisories/GHSA-w9j2-pvgh-6h63) | Axios: Authentication Bypass via Prototype Pollution Gadget in `validateStatus` Merge Strategy (moderate) | >=1.0.0 <1.15.1 |
| [GHSA-pmwg-cvhr-8vh7](https://github.com/advisories/GHSA-pmwg-cvhr-8vh7) | Axios: Incomplete Fix for CVE-2025-62718 — NO_PROXY Protection Bypassed via RFC 1122 Loopback Subnet (127.0.0.0/8) in Axios 1.15.0 (high) | >=1.0.0 <1.15.1 |
| [GHSA-3w6x-2g7m-8v23](https://github.com/advisories/GHSA-3w6x-2g7m-8v23) | Axios: Invisible JSON Response Tampering via Prototype Pollution Gadget in `parseReviver` (moderate) | >=1.0.0 <1.15.2 |
| [GHSA-xhjh-pmcv-23jw](https://github.com/advisories/GHSA-xhjh-pmcv-23jw) | Axios: Null Byte Injection via Reverse-Encoding in AxiosURLSearchParams (low) | >=1.0.0 <1.15.1 |
| [GHSA-445q-vr5w-6q77](https://github.com/advisories/GHSA-445q-vr5w-6q77) | Axios: CRLF Injection in multipart/form-data body via unsanitized blob.type in formDataToStream (moderate) | >=1.0.0 <1.15.1 |
| [GHSA-m7pr-hjqh-92cm](https://github.com/advisories/GHSA-m7pr-hjqh-92cm) | Axios: no_proxy bypass via IP alias allows SSRF (moderate) | >=1.0.0 <1.15.1 |
| [GHSA-5c9x-8gcm-mpgx](https://github.com/advisories/GHSA-5c9x-8gcm-mpgx) | Axios' HTTP adapter-streamed uploads bypass maxBodyLength when maxRedirects: 0 (moderate) | >=1.0.0 <1.15.1 |
| [GHSA-vf2m-468p-8v99](https://github.com/advisories/GHSA-vf2m-468p-8v99) | Axios: HTTP adapter streamed responses bypass maxContentLength (moderate) | >=1.0.0 <1.15.1 |
| [GHSA-pf86-5x62-jrwf](https://github.com/advisories/GHSA-pf86-5x62-jrwf) | Axios: Prototype Pollution Gadgets - Response Tampering, Data Exfiltration, and Request Hijacking (high) | >=1.0.0 <1.15.1 |
| [GHSA-6chq-wfr3-2hj9](https://github.com/advisories/GHSA-6chq-wfr3-2hj9) | Axios: Header Injection via Prototype Pollution (high) | >=1.0.0 <1.15.1 |
| [GHSA-xx6v-rp6x-q39c](https://github.com/advisories/GHSA-xx6v-rp6x-q39c) | Axios: XSRF Token Cross-Origin Leakage via Prototype Pollution Gadget in `withXSRFToken` Boolean Coercion (moderate) | >=1.0.0 <1.15.1 |
| [GHSA-43fc-jf86-j433](https://github.com/advisories/GHSA-43fc-jf86-j433) | Axios is Vulnerable to Denial of Service via __proto__ Key in mergeConfig (high) | >=1.0.0 <=1.13.4 |
| [GHSA-q8qp-cvcw-x6jj](https://github.com/advisories/GHSA-q8qp-cvcw-x6jj) | Axios has prototype pollution read-side gadgets in HTTP adapter that allow credential injection and request hijacking (high) | >=1.0.0 <1.15.2 |
| [GHSA-fvcv-3m26-pcqx](https://github.com/advisories/GHSA-fvcv-3m26-pcqx) | Axios has Unrestricted Cloud Metadata Exfiltration via Header Injection Chain (moderate) | >=1.0.0 <1.15.0 |
| [GHSA-62hf-57xw-28j9](https://github.com/advisories/GHSA-62hf-57xw-28j9) | Axios: unbounded recursion in toFormData causes DoS via deeply nested request data (moderate) | >=1.0.0 <1.15.1 |
| [GHSA-hfxv-24rg-xrqf](https://github.com/advisories/GHSA-hfxv-24rg-xrqf) | Axios: Regular Expression Denial of Service (ReDoS) via Cookie Name Injection (high) | >=1.0.0 <1.16.0 |
| [GHSA-777c-7fjr-54vf](https://github.com/advisories/GHSA-777c-7fjr-54vf) | Allocation of Resources Without Limits or Throttling in Axios (high) | >=1.7.0 <1.16.0 |
| [GHSA-p92q-9vqr-4j8v](https://github.com/advisories/GHSA-p92q-9vqr-4j8v) | Axios: Proxy-Authorization Credential Leak to Origin Server Across HTTP-to-HTTPS Redirect in Axios Node.js HTTP Adapter (high) | >=1.0.0 <1.16.0 |
| [GHSA-j5f8-grm9-p9fc](https://github.com/advisories/GHSA-j5f8-grm9-p9fc) | Axios: Proxy-Authorization header leaks to redirect target when proxy is re-evaluated to direct connection (high) | >=1.0.0 <1.16.0 |
| [GHSA-3g43-6gmg-66jw](https://github.com/advisories/GHSA-3g43-6gmg-66jw) | axios Vulnerable to Credential Theft and Response Hijacking via Prototype Pollution Gadget in Config Merge (high) | >=1.0.0 <1.15.2 |
| [GHSA-35jp-ww65-95wh](https://github.com/advisories/GHSA-35jp-ww65-95wh) | axios Vulnerable to Full Man-in-the-Middle via Prototype Pollution Gadget in `config.proxy` (high) | >=1.0.0 <1.16.0 |
| [GHSA-898c-q2cr-xwhg](https://github.com/advisories/GHSA-898c-q2cr-xwhg) | axios has DoS & Header Injection via Prototype Pollution Read-Side Gadgets in axios merge functions (moderate) | >=1.0.0 <1.16.0 |
| [GHSA-mmx7-hfxf-jppx](https://github.com/advisories/GHSA-mmx7-hfxf-jppx) | Axios: Prototype pollution gadgets can alter axios request construction (moderate) | >=1.0.0 <1.18.0 |
| [GHSA-pmv8-rq9r-6j72](https://github.com/advisories/GHSA-pmv8-rq9r-6j72) | Axios: Deep formToJSON Key Recursion Can Cause Denial of Service (moderate) | >=1.0.0 <1.18.0 |
| [GHSA-7q8q-rj6j-mhjq](https://github.com/advisories/GHSA-7q8q-rj6j-mhjq) | Axios: Nested axios option objects can consume polluted prototype values (moderate) | >=1.0.0 <1.18.0 |
| [GHSA-jqh4-m9w3-8hp9](https://github.com/advisories/GHSA-jqh4-m9w3-8hp9) | Axios: Fetch adapter `ReadableStream` uploads bypass `maxBodyLength` (moderate) | >=1.7.0 <1.18.0 |
| [GHSA-42h9-826w-cgv3](https://github.com/advisories/GHSA-42h9-826w-cgv3) | Axios: Excessive recursion in formDataToJSON can cause denial of service (moderate) | >=1.0.0 <1.18.0 |
| [GHSA-vh66-26gq-q6x8](https://github.com/advisories/GHSA-vh66-26gq-q6x8) | Axios: Prototype pollution gadget in fetch adapter can alter outbound requests (moderate) | >=1.7.0 <1.20.0 |
| [GHSA-9fr6-4gfg-395g](https://github.com/advisories/GHSA-9fr6-4gfg-395g) | Axios: Prototype-Pollution Gadget in the Default Instance Allows Inherited Object.prototype.method to Override HTTP Method (moderate) | >=1.0.0 <1.20.0 |
| [GHSA-j8rh-479h-cp32](https://github.com/advisories/GHSA-j8rh-479h-cp32) | Axios: Header Injection via Inherited headers After Minimal Interceptor (moderate) | >=1.0.0 <1.20.0 |

### body-parser — élevée

- Installation concernée : node_modules/body-parser@1.20.3.
- Chemin : body-parser@1.20.3.
- Chemin : express@4.21.1 → body-parser@1.20.3.

Production : express.json() est monté globalement dans app.js et express.raw() reçoit les webhooks Stripe. Les corps HTTP sont non fiables ; les erreurs de décompression sont exposées sur des endpoints publics.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6) | body-parser vulnerable to denial of service when invalid limit value silently disables size enforcement (low) | <1.20.6 |
| [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) | body-parser vulnerable to Denial of Service via trailing bytes after a compressed request body (high) | <1.20.9 |

### brace-expansion — élevée

- Installation concernée : node_modules/brace-expansion@1.1.11.
- Chemin : nodemon@3.1.7 → minimatch@3.1.2 → brace-expansion@1.1.11.

Développement uniquement : analyse de globs Nodemon ; DoS sur motifs spécialement construits. Pas d’exposition par le serveur lancé avec node app.js.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-v6h2-p8h4-qcjw](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw) | brace-expansion Regular Expression Denial of Service vulnerability (low) | >=1.0.0 <=1.1.11 |
| [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v) | brace-expansion: Zero-step sequence causes process hang and memory exhaustion (moderate) | <1.1.13 |
| [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups (high) | <1.1.16 |
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash (high) | <1.1.17 |
| [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation (high) | <1.1.18 |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service (moderate) | <1.1.21 |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion (high) | <1.1.20 |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion (high) | <1.1.19 |

### cloudinary — élevée

- Installation concernée : node_modules/cloudinary@2.6.1.
- Chemin : cloudinary@2.6.1.

Production : téléversements, signatures et suppressions de fichiers/images ; certains paramètres proviennent des documents utilisateurs. Injection d’arguments possible selon les paramètres transmis.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-g4mf-96x5-5m2c](https://github.com/advisories/GHSA-g4mf-96x5-5m2c) | Cloudinary Node SDK is vulnerable to Arbitrary Argument Injection through parameters that include an ampersand (high) | <2.7.0 |

### express — élevée

- Installation concernée : node_modules/express@4.21.1.
- Chemin : express@4.21.1.

Production : toutes les routes HTTP, avec risques hérités du parseur de corps, du routeur et de qs. Express 4 conservé pour préserver les chemins et les middlewares existants.

Avis hérités de : body-parser, path-to-regexp, qs ; voir les rubriques de ces packages.

### form-data — critique

- Installation concernée : node_modules/form-data@4.0.1.
- Installation concernée : node_modules/superagent/node_modules/form-data@2.5.2.
- Chemin : axios@1.7.7 → form-data@4.0.1.
- Chemin : sib-api-v3-sdk@8.5.0 → superagent@3.7.0 → form-data@2.5.2.

Production : dépendance Axios et chaîne Brevo → superagent. Aléa de frontière multipart prévisible et injection CRLF. Les emails transactionnels observés utilisent JSON, donc la branche multipart Brevo n’est pas activée dans ce parcours ; le package vulnérable reste installé et les deux copies sont corrigées.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-fjxv-7rqg-78g4](https://github.com/advisories/GHSA-fjxv-7rqg-78g4) | form-data uses unsafe random function in form-data for choosing boundary (critical) | >=4.0.0 <4.0.4 |
| [GHSA-fjxv-7rqg-78g4](https://github.com/advisories/GHSA-fjxv-7rqg-78g4) | form-data uses unsafe random function in form-data for choosing boundary (critical) | <2.5.4 |
| [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) | form-data: CRLF injection in form-data via unescaped multipart field names and filenames (high) | >=4.0.0 <4.0.6 |
| [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) | form-data: CRLF injection in form-data via unescaped multipart field names and filenames (high) | <2.5.6 |

### jws — élevée

- Installation concernée : node_modules/jws@3.2.2.
- Chemin : jsonwebtoken@9.0.2 → jws@3.2.2.

Production : jsonwebtoken → jws 3.2.2 pour les JWT d’authentification et les tokens de réservation. Défaut de vérification HMAC dépendant de l’API utilisée ; aucun contournement métier démontré. La copie jws 4.0.1 de web-push n’est pas visée par cette alerte.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-869p-cjfg-cm3x](https://github.com/advisories/GHSA-869p-cjfg-cm3x) | auth0/node-jws Improperly Verifies HMAC Signature (high) | <3.2.3 |

### lodash — élevée

- Installation concernée : node_modules/lodash@4.17.21.
- Chemin : cloudinary@2.6.1 → lodash@4.17.21.

Production : Cloudinary → lodash. Injection de code dans _.template et pollution de prototype ; aucune utilisation applicative directe de _.template avec des imports contrôlés par un attaquant identifiée. Correction de la transitive dans sa plage compatible.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) | lodash vulnerable to Code Injection via `_.template` imports key names (high) | >=4.0.0 <=4.17.23 |
| [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh) | lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit` (moderate) | <=4.17.23 |
| [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) | Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions (moderate) | >=4.0.0 <=4.17.22 |

### minimatch — élevée

- Installation concernée : node_modules/minimatch@3.1.2.
- Chemin : nodemon@3.1.7 → minimatch@3.1.2.

Développement uniquement : globs Nodemon, ReDoS sur motifs spécialement construits. Aucun chemin de requête de production.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern (high) | <3.1.3 |
| [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj) | minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments (high) | <3.1.3 |
| [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) | minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions (high) | <3.1.4 |

### mongoose — critique

- Installation concernée : node_modules/mongoose@8.7.1.
- Chemin : mongoose@8.7.1.

Production : modèles et requêtes de tous les modules. Injections $where, contournement de sanitizeFilter via $nor et pollution de prototype au casting. Les populate observés utilisent des chemins fixes ; aucune chaîne d’exploitation directe avec un match entièrement contrôlé par le client démontrée. Données utilisateurs persistées : priorité élevée malgré cette limite.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-m7xq-9374-9rvx](https://github.com/advisories/GHSA-m7xq-9374-9rvx) | Mongoose search injection vulnerability (high) | >=8.0.0-rc0 <8.8.3 |
| [GHSA-vg7j-7cwx-8wgw](https://github.com/advisories/GHSA-vg7j-7cwx-8wgw) | Mongoose search injection vulnerability (critical) | >=8.0.0-rc0 <8.9.5 |
| [GHSA-wpg9-53fq-2r8h](https://github.com/advisories/GHSA-wpg9-53fq-2r8h) | Mongoose's Improper Sanitization of $nor in sanitizeFilter May Allow NoSQL Injection (high) | >=8.0.0 <=8.22.0 |
| [GHSA-664h-wqgq-64gw](https://github.com/advisories/GHSA-664h-wqgq-64gw) | Mongoose: Prototype pollution in mongoose update casting via __proto__-prefixed dotted path (Schema._getSchema/path getter) (moderate) | >=8.0.0 <8.24.1 |

### path-to-regexp — élevée

- Installation concernée : node_modules/path-to-regexp@0.1.10.
- Chemin : express@4.21.1 → path-to-regexp@0.1.10.

Production : routeur Express ; ReDoS selon les motifs et paramètres des routes. Entrées URL publiques non fiables. Correction dans la série 0.1, sans migration Express 5.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-rhx6-c78j-4q9w](https://github.com/advisories/GHSA-rhx6-c78j-4q9w) | path-to-regexp contains a ReDoS (high) | <0.1.12 |
| [GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2) | path-to-regexp vulnerable to Regular Expression Denial of Service via multiple route parameters (high) | <0.1.13 |

### picomatch — élevée

- Installation concernée : node_modules/picomatch@2.3.1.
- Chemin : nodemon@3.1.7 → chokidar@3.6.0 → anymatch@3.1.3 → picomatch@2.3.1.
- Chemin : nodemon@3.1.7 → chokidar@3.6.0 → readdirp@3.6.0 → picomatch@2.3.1.

Développement uniquement : watcher Nodemon via Chokidar, ReDoS et injection de méthode lors du traitement de motifs. Aucun chemin de requête de production.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p) | Picomatch: Method Injection in POSIX Character Classes causes incorrect Glob Matching (moderate) | <2.3.2 |
| [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) | Picomatch has a ReDoS vulnerability via extglob quantifiers (high) | <2.3.2 |

### proxy-addr — critique

- Installation concernée : node_modules/proxy-addr@2.0.7.
- Chemin : express@4.21.1 → proxy-addr@2.0.7.

Production : calcul de req.ip par Express. La vulnérabilité exige certains sous-réseaux IPv6 de confiance mal configurés. app.js configure trust proxy à 1 (nombre de sauts), donc la condition spécifique de l’avis n’est pas présente dans la configuration inspectée ; correctif compatible appliqué.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet (critical) | >=1.1.0 <2.0.8 |

### sharp — élevée

- Installation concernée : node_modules/sharp@0.32.5.
- Chemin : sharp@0.32.5.

Production : conversion en PNG des images des cartes cadeaux avant incorporation PDF. Entrées images potentiellement non fiables ; corruption mémoire/DoS des bibliothèques natives. Tous les avis nécessitent 0.35.5 ; passer seulement à 0.32.6 ne suffit pas.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-54xq-cgqr-rpm3](https://github.com/advisories/GHSA-54xq-cgqr-rpm3) | sharp vulnerability in libwebp dependency CVE-2023-4863 (high) | <0.32.6 |
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 (high) | <0.35.0 |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545 (high) | <0.35.4 |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | sharp : Vulnerability in librsvg dependency CVE-2026-96889 (high) | <0.35.5 |

### tar — critique

- Installation concernée : node_modules/tar@7.4.3.
- Chemin : tar@7.4.3.

Production : services/cron-job/backup.service.js appelle uniquement tar.c sur ses exports locaux JSON. Les attaques d’extraction/lecture/replace d’archives non fiables ne correspondent pas au parcours observé. Package conservé et corrigé dans la même majeure.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) | node-tar Vulnerable to Arbitrary File Creation/Overwrite via Hardlink Path Traversal (high) | <7.5.7 |
| [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) | node-tar is Vulnerable to Arbitrary File Overwrite and Symlink Poisoning via Insufficient Path Sanitization (high) | <=7.5.2 |
| [GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx) | Arbitrary File Read/Write via Hardlink Target Escape Through Symlink Chain in node-tar Extraction (high) | <7.5.8 |
| [GHSA-qffp-2rhf-9h96](https://github.com/advisories/GHSA-qffp-2rhf-9h96) | tar has Hardlink Path Traversal via Drive-Relative Linkpath (high) | <=7.5.9 |
| [GHSA-9ppj-qmqm-q256](https://github.com/advisories/GHSA-9ppj-qmqm-q256) | node-tar Symlink Path Traversal via Drive-Relative Linkpath (high) | <=7.5.10 |
| [GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) | Race Condition in node-tar Path Reservations via Unicode Ligature Collisions on macOS APFS (high) | <=7.5.3 |
| [GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh) | node-tar applies PAX size override to intermediary GNU long-name/long-link headers, causing tar parser interpretation differential (file smuggling) (moderate) | <=7.5.15 |
| [GHSA-w8wr-v893-vjvp](https://github.com/advisories/GHSA-w8wr-v893-vjvp) | node-tar: Process crash via PAX numeric path type confusion (moderate) | <=7.5.17 |
| [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw) | node-tar: Decompression/parse DoS via unlimited input (critical) | <=7.5.18 |
| [GHSA-8x88-c5mf-7j5w](https://github.com/advisories/GHSA-8x88-c5mf-7j5w) | node-tar: Negative tar entry size causes infinite loop in archive replace (high) | <=7.5.17 |
| [GHSA-gvwx-54wh-qm9j](https://github.com/advisories/GHSA-gvwx-54wh-qm9j) | node-tar: Uncaught Exception DoS via NUL byte in PAX path/linkpath records (moderate) | <=7.5.16 |
| [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m) | node-tar: Uncontrolled recursion in mapHas/filesFilter allows uncatchable stack-overflow DoS via crafted long-path tar with member selection (high) | <=7.5.20 |

### tar-fs — élevée

- Installation concernée : node_modules/prebuild-install/node_modules/tar-fs@2.1.1.
- Installation concernée : node_modules/tar-fs@3.0.6.
- Chemin : sharp@0.32.5 → prebuild-install@7.1.2 → tar-fs@2.1.1.
- Chemin : sharp@0.32.5 → tar-fs@3.0.6.

Chaîne Sharp et son installateur prebuild-install : traversée de chemins/liens lors de l’extraction d’archives. Aucune extraction tar-fs applicative observée. Retiré de l’arbre par le remplacement officiel de l’installateur Sharp par les binaires optionnels @img ; aucune dépendance métier supprimée artificiellement.

| Avis | Nature | Versions vulnérables |
| --- | --- | --- |
| [GHSA-vj76-c3g6-qr5v](https://github.com/advisories/GHSA-vj76-c3g6-qr5v) | tar-fs has a symlink validation bypass if destination directory is predictable with a specific tarball (high) | >=2.0.0 <2.1.4 |
| [GHSA-vj76-c3g6-qr5v](https://github.com/advisories/GHSA-vj76-c3g6-qr5v) | tar-fs has a symlink validation bypass if destination directory is predictable with a specific tarball (high) | >=3.0.0 <3.1.1 |
| [GHSA-8cj5-5rvv-wf4v](https://github.com/advisories/GHSA-8cj5-5rvv-wf4v) | tar-fs can extract outside the specified dir with a specific tarball (high) | >=3.0.0 <3.0.9 |
| [GHSA-8cj5-5rvv-wf4v](https://github.com/advisories/GHSA-8cj5-5rvv-wf4v) | tar-fs can extract outside the specified dir with a specific tarball (high) | >=2.0.0 <2.1.3 |
| [GHSA-pq67-2wwv-3xjx](https://github.com/advisories/GHSA-pq67-2wwv-3xjx) | tar-fs Vulnerable to Link Following and Path Traversal via Extracting a Crafted tar File (high) | >=3.0.0 <3.0.7 |
| [GHSA-pq67-2wwv-3xjx](https://github.com/advisories/GHSA-pq67-2wwv-3xjx) | tar-fs Vulnerable to Link Following and Path Traversal via Extracting a Crafted tar File (high) | >=2.0.0 <2.1.2 |

## Alertes modérées et faibles

Corrigées par résolutions compatibles : qs 6.13.0 → 6.16.1 (Express/body-parser, Stripe et Superagent), follow-redirects 1.15.9 → 1.16.2 (Axios), bn.js 4.12.2 → 4.12.5 (web-push → asn1.js), on-headers 1.0.2 → 1.1.0 et express-session 1.18.1 → 1.19.0. Le middleware express-session n’est pas monté dans app.js inspecté ; cela réduit son exposition actuelle sans justifier de supprimer une dépendance déclarée.

## Compatibilité Sharp et code métier

L’unique usage applicatif trouvé est sharp(Buffer).png().toBuffer() dans services/gift-card-mailer.service.js. Il est conservé tel quel. Les ruptures documentées incluent Node >=20.9, les binaires optionnels @img, la compilation explicite, la limite de cinq canaux et le retrait d’options dépréciées ; aucune des options retirées n’est employée ici. Tests avec PNG, JPEG, WebP et SVG et génération de PDF sans fallback : réussis. Le runtime local charge Sharp 0.35.5 avec libvips 8.18.7, libwebp 1.6.0, libheif 1.23.5 et librsvg 2.63.2. Le changement de limite de canaux pourrait refuser des images spécialisées à plus de cinq canaux ; ce type de visuel n’a pas été testé.

Sources : [ruptures Sharp 0.35.0](https://github.com/lovell/sharp/releases/tag/v0.35.0), [Sharp 0.35.5](https://github.com/lovell/sharp/releases/tag/v0.35.5). Aucun changement des routes, modèles, contrats API ou traitements métier.

## Vérifications

- npm ci sous Node 24.22.1/npm 11.19.1 : réussi, 240 packages installés sur la plateforme locale.
- npm audit --json et npm audit --omit=dev --json avant/après : 22/19 → 0/0.
- npm ls --all : réussi, arbre cohérent ; dépendances/devDependencies du manifest identiques à la racine du lock. Scripts préexistants identiques au snapshot initial.
- Syntaxe : 225 fichiers JavaScript backend valides avec node --check.
- Suite complète : 587 tests, 583 réussis, 4 échecs décrits ci-dessous, aucun test ignoré. Durée environ 3,3 secondes.
- Nouveaux tests : 11 vérifications réussies, incluant les quatre formats d’image. Corps gzip valide/corrompu/trop volumineux et requête suivante ; JSON Brevo transmis au double local ; JWT altéré rejeté ; sanitizeFilter dans $nor ; import XLSX ; création et liste d’archive de sauvegarde.
- Démarrage isolé : toutes les routes de app.js chargées, écoute sur un port éphémère localhost, requête inconnue renvoyant 404, 11 expressions cron validées. Les callbacks cron ne sont pas exécutés.
- MongoDB : démarrage du driver jusqu’à l’erreur de connexion attendue sur 127.0.0.1:1 ; aucune base réelle connectée. Les opérations réelles MongoDB, Stripe, Brevo et Cloudinary ne sont pas validées par ce smoke test.
- git diff --check : réussi sur les fichiers de la mission.

Les tests ont été lancés avec un environnement nettoyé, des clés fictives, dotenv.config neutralisé et un garde temporaire interdisant les sockets hors loopback. Une erreur initiale de ce garde bloquait aussi les doubles HTTP ; corrigée puis tests concernés et suite finale relancés. Aucun paiement, remboursement, email client, upload externe ou cron métier réellement exécuté.

### Quatre échecs préexistants

1. tests/contract-signature.test.js:1137 : fixture de lien « actif » expirant le 15 octobre 2026 ; la date du jour est le 26 octobre 2026, donc document public nul.
2. tests/contract-signature.test.js:1161 : même expiration fixe pour l’avenant.
3. tests/sms-subscription-self-service.test.js:52 : assertion textuelle attend req.user?.role !== "owner", absente de la source existante.
4. tests/sms-toggle-reactivity.test.js:342 : assertion textuelle attend deux props sur la même ligne dans une interface existante.

Ces assertions concernent des sources/fixtures inchangées par la mission ; les échecs sont déjà visibles dans le premier passage après mise à jour et ne dépendent pas du comportement des packages corrigés. Ils ne sont ni masqués ni corrigés hors périmètre. La suite n’est donc pas entièrement verte.

## Fichiers de la mission

- package.json : neuf dépendances de production ciblées ; script local existant préservé.
- package-lock.json : verrouillage npm reproductible et résolutions transitives ciblées.
- tests/dependency-security.test.js : nouvelles vérifications de compatibilité et sécurité.
- docs/npm-security-audit-2026-10-26.md : présent rapport.

## Limites et recommandations avant déploiement

Aucune vulnérabilité npm résiduelle détectée à la date de l’audit. Les avertissements de dépréciation Brevo 8.5.0, Superagent 3.7.0, Formidable 1.2.6, querystring et crypto subsistent : ils ne sont pas des alertes npm audit et ne sont pas désactivés. Prévoir une migration séparée du SDK Brevo après validation des emails ; ne pas imposer une majeure de Superagent sous un SDK ancien.

Avant déploiement, valider sur une préproduction Linux Node 24 le chargement du binaire Sharp, un PDF cadeau avec les visuels réellement utilisés, la connexion/opérations MongoDB, un upload Cloudinary et les intégrations Stripe/Brevo en sandbox. Traiter séparément les quatre échecs préexistants. Rien n’a été déployé.

Les audits JSON complets, logs et scripts temporaires de vérification sont disponibles localement dans /private/tmp/gusto-npm-security-20261026/ ; ils ne font pas partie du code déployé.

