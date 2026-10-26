# Inventaire npm frontend — 26 octobre 2026

Données des audits npm sous Node 24.22.1 / npm 11.19.1. Une ligne par URL GHSA distincte ; les répétitions par plage semver et les métavulnérabilités ne créent pas de nouvel avis. Les chaînes ci-dessous sont des chemins les plus courts par dépendance directe, y compris les peers résolus, reconstruits depuis le lockfile initial.

159 avis distincts avant (152 en production), 26 après (26 en production). « Retiré » signifie absent de l’audit final après mise à jour ou suppression de la dépendance inutilisée. Cela ne signifie pas que le chemin était exploitable avant. Les alertes npm par package sont 73 → 28 et 69 → 28 en production.

## Avis dédupliqués

| Avis | Sévérité npm | Package source | Production avant | État final |
| --- | --- | --- | --- | --- |
| [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | low | `@babel/core` | oui | Retiré |
| [GHSA-fv7c-fp4j-7gwp](https://github.com/advisories/GHSA-fv7c-fp4j-7gwp) | high | `@babel/plugin-transform-modules-systemjs` | oui | Retiré |
| [GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh) | moderate | `@tiptap/core` | oui | Reste, justification dans le rapport |
| [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) | moderate | `ajv` | oui | Retiré |
| [GHSA-35jp-ww65-95wh](https://github.com/advisories/GHSA-35jp-ww65-95wh) | high | `axios` | oui | Retiré |
| [GHSA-3g43-6gmg-66jw](https://github.com/advisories/GHSA-3g43-6gmg-66jw) | high | `axios` | oui | Retiré |
| [GHSA-3p68-rc4w-qgx5](https://github.com/advisories/GHSA-3p68-rc4w-qgx5) | moderate | `axios` | oui | Retiré |
| [GHSA-3w6x-2g7m-8v23](https://github.com/advisories/GHSA-3w6x-2g7m-8v23) | moderate | `axios` | oui | Retiré |
| [GHSA-42h9-826w-cgv3](https://github.com/advisories/GHSA-42h9-826w-cgv3) | moderate | `axios` | oui | Retiré |
| [GHSA-43fc-jf86-j433](https://github.com/advisories/GHSA-43fc-jf86-j433) | high | `axios` | oui | Retiré |
| [GHSA-445q-vr5w-6q77](https://github.com/advisories/GHSA-445q-vr5w-6q77) | moderate | `axios` | oui | Retiré |
| [GHSA-4hjh-wcwx-xvwj](https://github.com/advisories/GHSA-4hjh-wcwx-xvwj) | high | `axios` | oui | Retiré |
| [GHSA-5c9x-8gcm-mpgx](https://github.com/advisories/GHSA-5c9x-8gcm-mpgx) | moderate | `axios` | oui | Retiré |
| [GHSA-62hf-57xw-28j9](https://github.com/advisories/GHSA-62hf-57xw-28j9) | moderate | `axios` | oui | Retiré |
| [GHSA-6chq-wfr3-2hj9](https://github.com/advisories/GHSA-6chq-wfr3-2hj9) | high | `axios` | oui | Retiré |
| [GHSA-777c-7fjr-54vf](https://github.com/advisories/GHSA-777c-7fjr-54vf) | high | `axios` | oui | Retiré |
| [GHSA-7q8q-rj6j-mhjq](https://github.com/advisories/GHSA-7q8q-rj6j-mhjq) | moderate | `axios` | oui | Retiré |
| [GHSA-898c-q2cr-xwhg](https://github.com/advisories/GHSA-898c-q2cr-xwhg) | moderate | `axios` | oui | Retiré |
| [GHSA-9fr6-4gfg-395g](https://github.com/advisories/GHSA-9fr6-4gfg-395g) | moderate | `axios` | oui | Retiré |
| [GHSA-fvcv-3m26-pcqx](https://github.com/advisories/GHSA-fvcv-3m26-pcqx) | moderate | `axios` | oui | Retiré |
| [GHSA-hfxv-24rg-xrqf](https://github.com/advisories/GHSA-hfxv-24rg-xrqf) | high | `axios` | oui | Retiré |
| [GHSA-j5f8-grm9-p9fc](https://github.com/advisories/GHSA-j5f8-grm9-p9fc) | high | `axios` | oui | Retiré |
| [GHSA-j8rh-479h-cp32](https://github.com/advisories/GHSA-j8rh-479h-cp32) | moderate | `axios` | oui | Retiré |
| [GHSA-jqh4-m9w3-8hp9](https://github.com/advisories/GHSA-jqh4-m9w3-8hp9) | moderate | `axios` | oui | Retiré |
| [GHSA-jr5f-v2jv-69x6](https://github.com/advisories/GHSA-jr5f-v2jv-69x6) | high | `axios` | oui | Retiré |
| [GHSA-m7pr-hjqh-92cm](https://github.com/advisories/GHSA-m7pr-hjqh-92cm) | moderate | `axios` | oui | Retiré |
| [GHSA-mmx7-hfxf-jppx](https://github.com/advisories/GHSA-mmx7-hfxf-jppx) | moderate | `axios` | oui | Retiré |
| [GHSA-p92q-9vqr-4j8v](https://github.com/advisories/GHSA-p92q-9vqr-4j8v) | high | `axios` | oui | Retiré |
| [GHSA-pf86-5x62-jrwf](https://github.com/advisories/GHSA-pf86-5x62-jrwf) | high | `axios` | oui | Retiré |
| [GHSA-pmv8-rq9r-6j72](https://github.com/advisories/GHSA-pmv8-rq9r-6j72) | moderate | `axios` | oui | Retiré |
| [GHSA-pmwg-cvhr-8vh7](https://github.com/advisories/GHSA-pmwg-cvhr-8vh7) | high | `axios` | oui | Retiré |
| [GHSA-q8qp-cvcw-x6jj](https://github.com/advisories/GHSA-q8qp-cvcw-x6jj) | high | `axios` | oui | Retiré |
| [GHSA-vf2m-468p-8v99](https://github.com/advisories/GHSA-vf2m-468p-8v99) | moderate | `axios` | oui | Retiré |
| [GHSA-vh66-26gq-q6x8](https://github.com/advisories/GHSA-vh66-26gq-q6x8) | moderate | `axios` | oui | Retiré |
| [GHSA-w9j2-pvgh-6h63](https://github.com/advisories/GHSA-w9j2-pvgh-6h63) | moderate | `axios` | oui | Retiré |
| [GHSA-xhjh-pmcv-23jw](https://github.com/advisories/GHSA-xhjh-pmcv-23jw) | low | `axios` | oui | Retiré |
| [GHSA-xx6v-rp6x-q39c](https://github.com/advisories/GHSA-xx6v-rp6x-q39c) | moderate | `axios` | oui | Retiré |
| [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | moderate | `baseline-browser-mapping` | oui | Retiré |
| [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) | high | `body-parser` | oui | Retiré |
| [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6) | low | `body-parser` | oui | Retiré |
| [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | high | `brace-expansion` | oui | Retiré |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | high | `brace-expansion` | oui | Retiré |
| [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v) | moderate | `brace-expansion` | oui | Retiré |
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | high | `brace-expansion` | oui | Retiré |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | moderate | `brace-expansion` | oui | Retiré |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | high | `brace-expansion` | oui | Retiré |
| [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | high | `brace-expansion` | oui | Retiré |
| [GHSA-v6h2-p8h4-qcjw](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw) | low | `brace-expansion` | oui | Retiré |
| [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | high | `browserslist` | oui | Retiré |
| [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | high | `browserslist` | oui | Retiré |
| [GHSA-3xgq-45jj-v275](https://github.com/advisories/GHSA-3xgq-45jj-v275) | high | `cross-spawn` | oui | Retiré |
| [GHSA-6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2) | low | `dompurify` | oui | Retiré |
| [GHSA-c6gr-qvv4-5v3f](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f) | low | `dompurify` | oui | Retiré |
| [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7) | critical | `dompurify` | oui | Retiré |
| [GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr) | high | `dompurify` | oui | Retiré |
| [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p) | low | `dompurify` | oui | Retiré |
| [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) | low | `fast-uri` | oui | Retiré |
| [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6) | high | `fast-uri` | oui | Retiré |
| [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7) | high | `fast-uri` | oui | Retiré |
| [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) | high | `fast-uri` | oui | Retiré |
| [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | moderate | `fast-uri` | oui | Retiré |
| [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) | high | `fast-uri` | oui | Retiré |
| [GHSA-q3j6-qgpj-74h6](https://github.com/advisories/GHSA-q3j6-qgpj-74h6) | high | `fast-uri` | oui | Retiré |
| [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) | high | `fast-uri` | oui | Retiré |
| [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) | high | `fast-uri` | oui | Retiré |
| [GHSA-v39h-62p7-jpjc](https://github.com/advisories/GHSA-v39h-62p7-jpjc) | high | `fast-uri` | oui | Retiré |
| [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) | moderate | `fast-uri` | oui | Retiré |
| [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) | low | `fast-uri` | oui | Retiré |
| [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f) | high | `flatted` | non | Retiré |
| [GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh) | high | `flatted` | non | Retiré |
| [GHSA-r4q5-vmmm-2653](https://github.com/advisories/GHSA-r4q5-vmmm-2653) | moderate | `follow-redirects` | oui | Retiré |
| [GHSA-fjxv-7rqg-78g4](https://github.com/advisories/GHSA-fjxv-7rqg-78g4) | critical | `form-data` | oui | Retiré |
| [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) | high | `form-data` | oui | Retiré |
| [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) | high | `glob` | oui | Retiré |
| [GHSA-2933-q333-qg83](https://github.com/advisories/GHSA-2933-q333-qg83) | critical | `i18next-fs-backend` | oui | Retiré |
| [GHSA-8847-338w-5hcj](https://github.com/advisories/GHSA-8847-338w-5hcj) | high | `i18next-fs-backend` | oui | Retiré |
| [GHSA-v56q-mh7h-f735](https://github.com/advisories/GHSA-v56q-mh7h-f735) | high | `immutable` | oui | Retiré |
| [GHSA-wf6x-7x77-mvgw](https://github.com/advisories/GHSA-wf6x-7x77-mvgw) | high | `immutable` | oui | Retiré |
| [GHSA-xvcm-6775-5m9r](https://github.com/advisories/GHSA-xvcm-6775-5m9r) | high | `immutable` | oui | Retiré |
| [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | high | `js-yaml` | non | Retiré |
| [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) | high | `js-yaml` | non | Retiré |
| [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | high | `js-yaml` | non | Retiré |
| [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) | moderate | `js-yaml` | non | Retiré |
| [GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m) | moderate | `js-yaml` | non | Retiré |
| [GHSA-22p9-wv53-3rq4](https://github.com/advisories/GHSA-22p9-wv53-3rq4) | high | `linkify-it` | oui | Retiré |
| [GHSA-v245-v573-v5vm](https://github.com/advisories/GHSA-v245-v573-v5vm) | high | `linkify-it` | oui | Retiré |
| [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh) | moderate | `lodash`, `lodash-es` | oui | Retiré |
| [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) | high | `lodash`, `lodash-es` | oui | Retiré |
| [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) | moderate | `lodash`, `lodash-es` | oui | Retiré |
| [GHSA-253c-mchw-3w2r](https://github.com/advisories/GHSA-253c-mchw-3w2r) | moderate | `markdown-it` | oui | Retiré |
| [GHSA-38c4-r59v-3vqw](https://github.com/advisories/GHSA-38c4-r59v-3vqw) | moderate | `markdown-it` | oui | Retiré |
| [GHSA-6v5v-wf23-fmfq](https://github.com/advisories/GHSA-6v5v-wf23-fmfq) | moderate | `markdown-it` | oui | Retiré |
| [GHSA-gfr2-rv44-r23c](https://github.com/advisories/GHSA-gfr2-rv44-r23c) | high | `markdown-it` | oui | Retiré |
| [GHSA-r7fv-28h4-cvq7](https://github.com/advisories/GHSA-r7fv-28h4-cvq7) | high | `markdown-it` | oui | Retiré |
| [GHSA-vfgh-jcmw-g37q](https://github.com/advisories/GHSA-vfgh-jcmw-g37q) | low | `markdown-it` | oui | Retiré |
| [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) | high | `minimatch` | oui | Retiré |
| [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | high | `minimatch` | oui | Retiré |
| [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj) | high | `minimatch` | oui | Retiré |
| [GHSA-4p3w-j4w9-5jqw](https://github.com/advisories/GHSA-4p3w-j4w9-5jqw) | moderate | `moment` | oui | Retiré |
| [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) | high | `nanoid` | oui | Retiré |
| [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | high | `nanoid` | oui | Retiré |
| [GHSA-mwcw-c2x4-8c55](https://github.com/advisories/GHSA-mwcw-c2x4-8c55) | moderate | `nanoid` | oui | Retiré |
| [GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) | high | `nanoid` | oui | Retiré |
| [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) | critical | `next` | oui | Reste, justification dans le rapport |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) | critical | `next` | oui | Reste, justification dans le rapport |
| [GHSA-36qx-fr4f-26g5](https://github.com/advisories/GHSA-36qx-fr4f-26g5) | high | `next` | oui | Reste, justification dans le rapport |
| [GHSA-3g8h-86w9-wvmq](https://github.com/advisories/GHSA-3g8h-86w9-wvmq) | low | `next` | oui | Reste, justification dans le rapport |
| [GHSA-3h52-269p-cp9r](https://github.com/advisories/GHSA-3h52-269p-cp9r) | low | `next` | oui | Retiré |
| [GHSA-3x4c-7xq6-9pq8](https://github.com/advisories/GHSA-3x4c-7xq6-9pq8) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-4342-x723-ch2f](https://github.com/advisories/GHSA-4342-x723-ch2f) | moderate | `next` | oui | Retiré |
| [GHSA-4633-3j49-mh5q](https://github.com/advisories/GHSA-4633-3j49-mh5q) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-4c39-4ccg-62r3](https://github.com/advisories/GHSA-4c39-4ccg-62r3) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-5j59-xgg2-r9c4](https://github.com/advisories/GHSA-5j59-xgg2-r9c4) | high | `next` | oui | Retiré |
| [GHSA-68g3-v927-f742](https://github.com/advisories/GHSA-68g3-v927-f742) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-7m27-7ghc-44w9](https://github.com/advisories/GHSA-7m27-7ghc-44w9) | moderate | `next` | oui | Retiré |
| [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x) | high | `next` | oui | Reste, justification dans le rapport |
| [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj) | high | `next` | oui | Reste, justification dans le rapport |
| [GHSA-955p-x3mx-jcvp](https://github.com/advisories/GHSA-955p-x3mx-jcvp) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-c4j6-fc7j-m34r](https://github.com/advisories/GHSA-c4j6-fc7j-m34r) | high | `next` | oui | Reste, justification dans le rapport |
| [GHSA-f82v-jwr5-mffw](https://github.com/advisories/GHSA-f82v-jwr5-mffw) | critical | `next` | oui | Retiré |
| [GHSA-ffhc-5mcf-pf4q](https://github.com/advisories/GHSA-ffhc-5mcf-pf4q) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-g5qg-72qw-gw5v](https://github.com/advisories/GHSA-g5qg-72qw-gw5v) | moderate | `next` | oui | Retiré |
| [GHSA-ggv3-7p47-pfv8](https://github.com/advisories/GHSA-ggv3-7p47-pfv8) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-gx5p-jg67-6x7h](https://github.com/advisories/GHSA-gx5p-jg67-6x7h) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf) | high | `next` | oui | Reste, justification dans le rapport |
| [GHSA-h64f-5h5j-jqjh](https://github.com/advisories/GHSA-h64f-5h5j-jqjh) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) | high | `next` | oui | Reste, justification dans le rapport |
| [GHSA-mwv6-3258-q52c](https://github.com/advisories/GHSA-mwv6-3258-q52c) | high | `next` | oui | Retiré |
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) | critical | `next` | oui | Reste, justification dans le rapport |
| [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) | high | `next` | oui | Reste, justification dans le rapport |
| [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) | high | `next` | oui | Reste, justification dans le rapport |
| [GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3) | high | `next` | oui | Reste, justification dans le rapport |
| [GHSA-qpjv-v59x-3qc4](https://github.com/advisories/GHSA-qpjv-v59x-3qc4) | low | `next` | oui | Retiré |
| [GHSA-vfv6-92ff-j949](https://github.com/advisories/GHSA-vfv6-92ff-j949) | low | `next` | oui | Reste, justification dans le rapport |
| [GHSA-wfc6-r584-vfw7](https://github.com/advisories/GHSA-wfc6-r584-vfw7) | moderate | `next` | oui | Reste, justification dans le rapport |
| [GHSA-xv57-4mr9-wg8v](https://github.com/advisories/GHSA-xv57-4mr9-wg8v) | moderate | `next` | oui | Retiré |
| [GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2) | high | `path-to-regexp` | oui | Retiré |
| [GHSA-rhx6-c78j-4q9w](https://github.com/advisories/GHSA-rhx6-c78j-4q9w) | high | `path-to-regexp` | oui | Retiré |
| [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p) | moderate | `picomatch` | oui | Retiré |
| [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) | high | `picomatch` | oui | Retiré |
| [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | high | `postcss` | oui | Retiré |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | moderate | `postcss` | oui | Retiré |
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | moderate | `postcss` | oui | Retiré |
| [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | high | `postcss` | oui | Retiré |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | moderate | `postcss-selector-parser` | oui | Retiré |
| [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92) | low | `postcss-selector-parser` | oui | Retiré |
| [GHSA-c8x8-7fp4-3x9w](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w) | high | `prosemirror-view` | oui | Retiré |
| [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | critical | `proxy-addr` | oui | Retiré |
| [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | moderate | `qs` | oui | Retiré |
| [GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p) | moderate | `qs` | oui | Retiré |
| [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26) | moderate | `qs` | oui | Retiré |
| [GHSA-w7fw-mjwx-w883](https://github.com/advisories/GHSA-w7fw-mjwx-w883) | low | `qs` | oui | Retiré |
| [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) | high | `rollup` | oui | Retiré |
| [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) | high | `serialize-javascript` | oui | Retiré |
| [GHSA-m5mm-p8h7-m29v](https://github.com/advisories/GHSA-m5mm-p8h7-m29v) | low | `serialize-javascript` | oui | Retiré |
| [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v) | moderate | `serialize-javascript` | oui | Retiré |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | high | `source-map-js` | oui | Retiré |
| [GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp) | moderate | `yaml` | oui | Retiré |

## Chaînes des packages sources signalés avant correction

Les packages intermédiaires signalés uniquement via un autre package (par exemple les 27 packages Tiptap) ne sont pas des avis indépendants. Les versions exactes après mise à jour figurent dans le lockfile et dans le tableau suivant.

| Package source | Chemins de dépendances initiaux |
| --- | --- |
| `@babel/core` | `next-pwa → babel-loader → @babel/core` |
| `@babel/plugin-transform-modules-systemjs` | `next-pwa → workbox-webpack-plugin → workbox-build → @babel/preset-env → @babel/plugin-transform-modules-systemjs` |
| `@tiptap/core` | `@tiptap/extension-bullet-list → @tiptap/core`<br>`@tiptap/extension-color → @tiptap/core`<br>`@tiptap/extension-heading → @tiptap/core`<br>`@tiptap/extension-list-item → @tiptap/core`<br>`@tiptap/extension-placeholder → @tiptap/core`<br>`@tiptap/extension-text-style → @tiptap/core`<br>`@tiptap/extension-underline → @tiptap/core`<br>`@tiptap/react → @tiptap/core`<br>`@tiptap/starter-kit → @tiptap/core` |
| `ajv` | `next-pwa → babel-loader → schema-utils → ajv`<br>`next-pwa → terser-webpack-plugin → schema-utils → ajv`<br>`next-pwa → workbox-webpack-plugin → workbox-build → ajv`<br>`next-pwa → babel-loader → webpack → schema-utils → ajv`<br>`next-pwa → terser-webpack-plugin → schema-utils → ajv-formats → ajv`<br>`eslint → ajv`<br>`eslint-config-next → eslint → ajv` |
| `axios` | `axios` |
| `baseline-browser-mapping` | `next-pwa → babel-loader → webpack → browserslist → baseline-browser-mapping`<br>`autoprefixer → browserslist → baseline-browser-mapping` |
| `body-parser` | `express → body-parser` |
| `brace-expansion` | `@tailwindcss/typography → tailwindcss → sucrase → glob → minimatch → brace-expansion`<br>`next-pwa → workbox-webpack-plugin → workbox-build → glob → minimatch → brace-expansion`<br>`next-pwa → workbox-webpack-plugin → workbox-build → @surma/rollup-plugin-off-main-thread → ejs → jake → filelist → minimatch → brace-expansion`<br>`@types/minimatch → minimatch → brace-expansion`<br>`eslint → minimatch → brace-expansion`<br>`eslint-config-next → eslint-plugin-import → minimatch → brace-expansion`<br>`eslint-config-next → @next/eslint-plugin-next → glob → minimatch → brace-expansion`<br>`eslint-config-next → @typescript-eslint/parser → @typescript-eslint/typescript-estree → minimatch → brace-expansion`<br>`tailwindcss → sucrase → glob → minimatch → brace-expansion` |
| `browserslist` | `next-pwa → babel-loader → webpack → browserslist`<br>`autoprefixer → browserslist` |
| `cross-spawn` | `@tailwindcss/typography → tailwindcss → sucrase → glob → foreground-child → cross-spawn`<br>`eslint → cross-spawn`<br>`eslint-config-next → eslint → cross-spawn`<br>`tailwindcss → sucrase → glob → foreground-child → cross-spawn` |
| `dompurify` | `jspdf → dompurify` |
| `fast-uri` | `next-pwa → terser-webpack-plugin → schema-utils → ajv → fast-uri` |
| `flatted` | `eslint → file-entry-cache → flat-cache → flatted`<br>`eslint-config-next → eslint → file-entry-cache → flat-cache → flatted` |
| `follow-redirects` | `axios → follow-redirects` |
| `form-data` | `axios → form-data`<br>`sib-api-v3-sdk → superagent → form-data` |
| `glob` | `@tailwindcss/typography → tailwindcss → sucrase → glob`<br>`eslint-config-next → @next/eslint-plugin-next → glob`<br>`tailwindcss → sucrase → glob` |
| `i18next-fs-backend` | `next-i18next → i18next-fs-backend` |
| `immutable` | `@vercel/analytics → next → sass → immutable`<br>`next → sass → immutable`<br>`next-i18next → next → sass → immutable`<br>`next-pwa → next → sass → immutable`<br>`sass → immutable` |
| `js-yaml` | `eslint → js-yaml`<br>`eslint-config-next → eslint → js-yaml` |
| `linkify-it` | `@tiptap/extension-bullet-list → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it → linkify-it`<br>`@tiptap/extension-color → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it → linkify-it`<br>`@tiptap/extension-heading → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it → linkify-it`<br>`@tiptap/extension-list-item → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it → linkify-it`<br>`@tiptap/extension-placeholder → @tiptap/pm → prosemirror-markdown → markdown-it → linkify-it`<br>`@tiptap/extension-text-style → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it → linkify-it`<br>`@tiptap/extension-underline → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it → linkify-it`<br>`@tiptap/react → @tiptap/pm → prosemirror-markdown → markdown-it → linkify-it`<br>`@tiptap/starter-kit → @tiptap/pm → prosemirror-markdown → markdown-it → linkify-it` |
| `lodash` | `next-pwa → workbox-webpack-plugin → workbox-build → lodash`<br>`react-big-calendar → lodash`<br>`recharts → lodash` |
| `lodash-es` | `react-big-calendar → lodash-es` |
| `markdown-it` | `@tiptap/extension-bullet-list → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it`<br>`@tiptap/extension-color → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it`<br>`@tiptap/extension-heading → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it`<br>`@tiptap/extension-list-item → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it`<br>`@tiptap/extension-placeholder → @tiptap/pm → prosemirror-markdown → markdown-it`<br>`@tiptap/extension-text-style → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it`<br>`@tiptap/extension-underline → @tiptap/core → @tiptap/pm → prosemirror-markdown → markdown-it`<br>`@tiptap/react → @tiptap/pm → prosemirror-markdown → markdown-it`<br>`@tiptap/starter-kit → @tiptap/pm → prosemirror-markdown → markdown-it` |
| `minimatch` | `@tailwindcss/typography → tailwindcss → sucrase → glob → minimatch`<br>`next-pwa → workbox-webpack-plugin → workbox-build → glob → minimatch`<br>`next-pwa → workbox-webpack-plugin → workbox-build → @surma/rollup-plugin-off-main-thread → ejs → jake → filelist → minimatch`<br>`@types/minimatch → minimatch`<br>`eslint → minimatch`<br>`eslint-config-next → eslint-plugin-import → minimatch`<br>`eslint-config-next → @next/eslint-plugin-next → glob → minimatch`<br>`eslint-config-next → @typescript-eslint/parser → @typescript-eslint/typescript-estree → minimatch`<br>`tailwindcss → sucrase → glob → minimatch` |
| `moment` | `react-big-calendar → moment` |
| `nanoid` | `@tailwindcss/typography → tailwindcss → postcss → nanoid`<br>`@vercel/analytics → next → postcss → nanoid`<br>`next → postcss → nanoid`<br>`next-i18next → next → postcss → nanoid`<br>`next-pwa → next → postcss → nanoid`<br>`autoprefixer → postcss → nanoid`<br>`postcss → nanoid`<br>`postcss-nesting → postcss → nanoid`<br>`tailwindcss → postcss → nanoid` |
| `next` | `@vercel/analytics → next`<br>`next`<br>`next-i18next → next`<br>`next-pwa → next` |
| `path-to-regexp` | `express → path-to-regexp` |
| `picomatch` | `@tailwindcss/typography → tailwindcss → micromatch → picomatch`<br>`@vercel/analytics → next → sass → @parcel/watcher → micromatch → picomatch`<br>`next → sass → @parcel/watcher → micromatch → picomatch`<br>`next-i18next → next → sass → @parcel/watcher → micromatch → picomatch`<br>`next-pwa → globby → fast-glob → micromatch → picomatch`<br>`eslint-config-next → eslint-import-resolver-typescript → fast-glob → micromatch → picomatch`<br>`sass → @parcel/watcher → micromatch → picomatch`<br>`tailwindcss → micromatch → picomatch` |
| `postcss` | `@tailwindcss/typography → tailwindcss → postcss`<br>`@vercel/analytics → next → postcss`<br>`next → postcss`<br>`next-i18next → next → postcss`<br>`next-pwa → next → postcss`<br>`autoprefixer → postcss`<br>`postcss`<br>`postcss-nesting → postcss`<br>`tailwindcss → postcss` |
| `postcss-selector-parser` | `@tailwindcss/typography → postcss-selector-parser`<br>`@tailwindcss/typography → tailwindcss → postcss-selector-parser`<br>`postcss-nesting → postcss-selector-parser`<br>`tailwindcss → postcss-selector-parser` |
| `prosemirror-view` | `@tiptap/extension-bullet-list → @tiptap/core → @tiptap/pm → prosemirror-view`<br>`@tiptap/extension-color → @tiptap/core → @tiptap/pm → prosemirror-view`<br>`@tiptap/extension-heading → @tiptap/core → @tiptap/pm → prosemirror-view`<br>`@tiptap/extension-list-item → @tiptap/core → @tiptap/pm → prosemirror-view`<br>`@tiptap/extension-placeholder → @tiptap/pm → prosemirror-view`<br>`@tiptap/extension-text-style → @tiptap/core → @tiptap/pm → prosemirror-view`<br>`@tiptap/extension-underline → @tiptap/core → @tiptap/pm → prosemirror-view`<br>`@tiptap/react → @tiptap/pm → prosemirror-view`<br>`@tiptap/starter-kit → @tiptap/pm → prosemirror-view` |
| `proxy-addr` | `express → proxy-addr` |
| `qs` | `express → qs`<br>`sib-api-v3-sdk → superagent → qs` |
| `rollup` | `next-pwa → workbox-webpack-plugin → workbox-build → rollup` |
| `serialize-javascript` | `next-pwa → terser-webpack-plugin → serialize-javascript`<br>`next-pwa → workbox-webpack-plugin → workbox-build → rollup-plugin-terser → serialize-javascript` |
| `source-map-js` | `@tailwindcss/typography → tailwindcss → postcss → source-map-js`<br>`@vercel/analytics → next → postcss → source-map-js`<br>`next → postcss → source-map-js`<br>`next-i18next → next → postcss → source-map-js`<br>`next-pwa → next → postcss → source-map-js`<br>`autoprefixer → postcss → source-map-js`<br>`postcss → source-map-js`<br>`postcss-nesting → postcss → source-map-js`<br>`sass → source-map-js`<br>`tailwindcss → postcss → source-map-js` |
| `yaml` | `@tailwindcss/typography → tailwindcss → postcss-load-config → yaml`<br>`tailwindcss → postcss-load-config → yaml` |

## Versions modifiées dans le lockfile

96 entrées existantes changent de version, 14 entrées sont ajoutées et 53 supprimées. Les ajouts/suppressions incluent les changements de placement des dépendances dédupliquées.

| Chemin | Avant | Après |
| --- | --- | --- |
| `node_modules/@babel/compat-data` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/core` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/generator` | 7.28.6 | 7.29.8 |
| `node_modules/@babel/helper-compilation-targets` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/helper-globals` | 7.28.0 | 7.29.7 |
| `node_modules/@babel/helper-module-imports` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/helper-module-transforms` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/helper-plugin-utils` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/helper-string-parser` | 7.27.1 | 7.29.11 |
| `node_modules/@babel/helper-validator-identifier` | 7.28.5 | 7.29.7 |
| `node_modules/@babel/helper-validator-option` | 7.27.1 | 7.29.7 |
| `node_modules/@babel/helpers` | 7.28.6 | 7.29.10 |
| `node_modules/@babel/parser` | 7.28.6 | 7.29.11 |
| `node_modules/@babel/plugin-transform-modules-systemjs` | 7.28.5 | 7.29.8 |
| `node_modules/@babel/template` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/traverse` | 7.28.6 | 7.29.10 |
| `node_modules/@babel/types` | 7.28.6 | 7.29.11 |
| `node_modules/@isaacs/cliui/node_modules/ansi-regex` | 6.1.0 | 6.4.0 |
| `node_modules/@isaacs/cliui/node_modules/strip-ansi` | 7.1.0 | 7.2.0 |
| `node_modules/@next/env` | 14.2.15 | 14.2.35 |
| `node_modules/@next/eslint-plugin-next` | 14.2.15 | 14.2.35 |
| `node_modules/@next/swc-darwin-arm64` | 14.2.15 | 14.2.33 |
| `node_modules/@next/swc-darwin-x64` | 14.2.15 | 14.2.33 |
| `node_modules/@next/swc-linux-arm64-gnu` | 14.2.15 | 14.2.33 |
| `node_modules/@next/swc-linux-arm64-musl` | 14.2.15 | 14.2.33 |
| `node_modules/@next/swc-linux-x64-gnu` | 14.2.15 | 14.2.33 |
| `node_modules/@next/swc-linux-x64-musl` | 14.2.15 | 14.2.33 |
| `node_modules/@next/swc-win32-arm64-msvc` | 14.2.15 | 14.2.33 |
| `node_modules/@next/swc-win32-ia32-msvc` | 14.2.15 | 14.2.33 |
| `node_modules/@next/swc-win32-x64-msvc` | 14.2.15 | 14.2.33 |
| `node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion` | 2.0.1 | 2.1.7 |
| `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch` | 9.0.5 | 9.0.9 |
| `node_modules/ajv` | 6.12.6 | 6.15.0 |
| `node_modules/ajv-formats/node_modules/ajv` | 8.17.1 | 8.20.0 |
| `node_modules/axios` | 1.7.7 | 1.20.0 |
| `node_modules/axios/node_modules/form-data` | 4.0.1 | 4.0.6 |
| `node_modules/baseline-browser-mapping` | 2.9.19 | 2.11.33 |
| `node_modules/brace-expansion` | 1.1.11 | 1.1.21 |
| `node_modules/browserslist` | 4.28.1 | 4.29.4 |
| `node_modules/caniuse-lite` | 1.0.30001766 | 1.0.30001819 |
| `node_modules/cross-spawn` | 7.0.3 | 7.0.6 |
| `node_modules/dompurify` | 3.4.15 | 3.4.17 |
| `node_modules/electron-to-chromium` | 1.5.279 | 1.5.464 |
| `node_modules/es-define-property` | 1.0.0 | 1.0.1 |
| `node_modules/es-object-atoms` | 1.0.0 | 1.1.2 |
| `node_modules/es-set-tostringtag` | 2.0.3 | 2.1.0 |
| `node_modules/eslint-config-next` | 14.2.15 | 14.2.35 |
| `node_modules/fast-uri` | 3.1.0 | 3.1.9 |
| `node_modules/filelist/node_modules/brace-expansion` | 2.0.2 | 2.1.7 |
| `node_modules/filelist/node_modules/minimatch` | 5.1.6 | 5.1.9 |
| `node_modules/flatted` | 3.3.1 | 3.4.4 |
| `node_modules/follow-redirects` | 1.15.9 | 1.16.2 |
| `node_modules/form-data` | 2.5.2 | 2.5.6 |
| `node_modules/get-intrinsic` | 1.2.4 | 1.3.0 |
| `node_modules/glob` | 10.3.10 | 10.5.0 |
| `node_modules/glob/node_modules/brace-expansion` | 2.0.1 | 2.1.7 |
| `node_modules/glob/node_modules/minimatch` | 9.0.5 | 9.0.9 |
| `node_modules/gopd` | 1.0.1 | 1.2.0 |
| `node_modules/has-symbols` | 1.0.3 | 1.1.0 |
| `node_modules/hasown` | 2.0.2 | 2.0.4 |
| `node_modules/i18next-fs-backend` | 2.3.2 | 2.6.9 |
| `node_modules/immutable` | 4.3.7 | 4.3.9 |
| `node_modules/jackspeak` | 2.3.6 | 3.4.3 |
| `node_modules/js-yaml` | 4.1.0 | 4.3.2 |
| `node_modules/linkify-it` | 5.0.0 | 5.0.2 |
| `node_modules/lodash` | 4.17.21 | 4.18.1 |
| `node_modules/lodash-es` | 4.17.21 | 4.18.1 |
| `node_modules/markdown-it` | 14.1.0 | 14.3.3 |
| `node_modules/minimatch` | 3.1.2 | 3.1.5 |
| `node_modules/moment` | 2.30.1 | 2.31.0 |
| `node_modules/nanoid` | 3.3.7 | 3.3.20 |
| `node_modules/next` | 14.2.15 | 14.2.35 |
| `node_modules/node-releases` | 2.0.27 | 2.0.60 |
| `node_modules/object-inspect` | 1.13.2 | 1.13.4 |
| `node_modules/picomatch` | 2.3.1 | 2.3.2 |
| `node_modules/postcss` | 8.4.47 | 8.5.31 |
| `node_modules/postcss-selector-parser` | 6.1.2 | 7.1.7 |
| `node_modules/prosemirror-model` | 1.23.0 | 1.25.12 |
| `node_modules/prosemirror-view` | 1.34.3 | 1.42.8 |
| `node_modules/proxy-from-env` | 1.1.0 | 2.1.0 |
| `node_modules/qs` | 6.13.0 | 6.16.1 |
| `node_modules/rollup` | 2.79.2 | 2.80.0 |
| `node_modules/serialize-javascript` | 6.0.2 | 7.1.4 |
| `node_modules/side-channel` | 1.0.6 | 1.1.1 |
| `node_modules/source-map-js` | 1.2.1 | 1.2.2 |
| `node_modules/string-width/node_modules/ansi-regex` | 6.1.0 | 6.4.0 |
| `node_modules/string-width/node_modules/strip-ansi` | 7.1.0 | 7.2.0 |
| `node_modules/terser-webpack-plugin` | 5.3.16 | 5.6.1 |
| `node_modules/terser-webpack-plugin/node_modules/ajv` | 8.17.1 | 8.20.0 |
| `node_modules/update-browserslist-db` | 1.2.3 | 1.3.4 |
| `node_modules/webpack/node_modules/ajv` | 8.17.1 | 8.20.0 |
| `node_modules/workbox-build/node_modules/ajv` | 8.17.1 | 8.20.0 |
| `node_modules/wrap-ansi/node_modules/ansi-regex` | 6.1.0 | 6.4.0 |
| `node_modules/wrap-ansi/node_modules/ansi-styles` | 6.2.1 | 6.2.3 |
| `node_modules/wrap-ansi/node_modules/strip-ansi` | 7.1.0 | 7.2.0 |
| `node_modules/yaml` | 2.6.0 | 2.9.1 |

### Entrées ajoutées

- `node_modules/@babel/core/node_modules/@babel/code-frame` : 7.29.7
- `node_modules/@babel/template/node_modules/@babel/code-frame` : 7.29.7
- `node_modules/@babel/traverse/node_modules/@babel/code-frame` : 7.29.7
- `node_modules/agent-base` : 6.0.2
- `node_modules/call-bind-apply-helpers` : 1.0.2
- `node_modules/call-bound` : 1.0.4
- `node_modules/dunder-proto` : 1.0.1
- `node_modules/get-proto` : 1.0.1
- `node_modules/https-proxy-agent` : 5.0.1
- `node_modules/math-intrinsics` : 1.1.0
- `node_modules/package-json-from-dist` : 1.0.1
- `node_modules/side-channel-list` : 1.0.1
- `node_modules/side-channel-map` : 1.0.1
- `node_modules/side-channel-weakmap` : 1.0.2

### Entrées supprimées

- `node_modules/@tailwindcss/typography/node_modules/postcss-selector-parser` : 6.0.10
- `node_modules/accepts` : 1.3.8
- `node_modules/array-flatten` : 1.1.1
- `node_modules/body-parser` : 1.20.3
- `node_modules/body-parser/node_modules/debug` : 2.6.9
- `node_modules/body-parser/node_modules/ms` : 2.0.0
- `node_modules/bytes` : 3.1.2
- `node_modules/content-disposition` : 0.5.4
- `node_modules/content-type` : 1.0.5
- `node_modules/cookie` : 0.7.1
- `node_modules/cookie-signature` : 1.0.6
- `node_modules/depd` : 2.0.0
- `node_modules/destroy` : 1.2.0
- `node_modules/ee-first` : 1.1.1
- `node_modules/encodeurl` : 2.0.0
- `node_modules/escape-html` : 1.0.3
- `node_modules/etag` : 1.8.1
- `node_modules/express` : 4.21.1
- `node_modules/express/node_modules/debug` : 2.6.9
- `node_modules/express/node_modules/ms` : 2.0.0
- `node_modules/finalhandler` : 1.3.1
- `node_modules/finalhandler/node_modules/debug` : 2.6.9
- `node_modules/finalhandler/node_modules/ms` : 2.0.0
- `node_modules/forwarded` : 0.2.0
- `node_modules/fresh` : 0.5.2
- `node_modules/http-errors` : 2.0.0
- `node_modules/iconv-lite` : 0.4.24
- `node_modules/ipaddr.js` : 1.9.1
- `node_modules/media-typer` : 0.3.0
- `node_modules/merge-descriptors` : 1.0.3
- `node_modules/negotiator` : 0.6.3
- `node_modules/next/node_modules/postcss` : 8.4.31
- `node_modules/on-finished` : 2.4.1
- `node_modules/parseurl` : 1.3.3
- `node_modules/path-to-regexp` : 0.1.10
- `node_modules/proxy-addr` : 2.0.7
- `node_modules/randombytes` : 2.1.0
- `node_modules/range-parser` : 1.2.1
- `node_modules/raw-body` : 2.5.2
- `node_modules/rollup-plugin-terser/node_modules/serialize-javascript` : 4.0.0
- `node_modules/safer-buffer` : 2.1.2
- `node_modules/send` : 0.19.0
- `node_modules/send/node_modules/debug` : 2.6.9
- `node_modules/send/node_modules/debug/node_modules/ms` : 2.0.0
- `node_modules/send/node_modules/encodeurl` : 1.0.2
- `node_modules/serve-static` : 1.16.2
- `node_modules/setprototypeof` : 1.2.0
- `node_modules/statuses` : 2.0.1
- `node_modules/toidentifier` : 1.0.1
- `node_modules/type-is` : 1.6.18
- `node_modules/unpipe` : 1.0.0
- `node_modules/utils-merge` : 1.0.1
- `node_modules/vary` : 1.1.2
