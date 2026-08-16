# Production dependency license inventory

Generated with `pnpm licenses list --prod --json` against the committed
lockfile. This is the input to the SBOM the Software Licensing notice lists
as a release gate. Regenerate before each release.

Generated: 2026-08-16  
Production packages: 749  
Needs review: 6

## License totals

- MIT: 576
- Apache-2.0: 75
- ISC: 44
- BSD-3-Clause: 25
- BSD-2-Clause: 11
- BlueOak-1.0.0: 6
- Unlicense: 2
- LGPL-3.0-or-later: 1
- Unknown: 1
- Python-2.0: 1
- CC-BY-4.0: 1
- BSD: 1
- (BSD-3-Clause OR GPL-2.0): 1
- (MIT AND Zlib): 1
- MIT-0: 1
- 0BSD: 1
- (MIT OR CC0-1.0): 1

## Needs review before release

Copyleft, weak-copyleft, content, and unidentified terms. Each row is a
deliberate decision to record, not an oversight to ignore. Note that a
copyleft library used as an unmodified server-side dependency generally does
not affect AgentStack's proprietary licensing — but the determination must be
made and recorded, not assumed.

| Package | Version | License |
| --- | --- | --- |
| @img/sharp-libvips-linux-x64 | 1.2.4 | LGPL-3.0-or-later |
| @mapbox/jsonlint-lines-primitives | 2.0.2 | Unknown |
| argparse | 2.0.1 | Python-2.0 |
| caniuse-lite | 1.0.30001779 | CC-BY-4.0 |
| mapbox-gl | 3.23.1 | BSD |
| node-forge | 1.3.3 | (BSD-3-Clause OR GPL-2.0) |

## Website Studio note

`@puckeditor/core` is pinned at 0.23.0 and reported as MIT below, matching
the claim made in the public Software Licensing notice.

## All production packages

| Package | Version | License |
| --- | --- | --- |
| @babel/code-frame | 7.29.0 | MIT |
| @babel/compat-data | 7.29.0 | MIT |
| @babel/core | 7.29.0 | MIT |
| @babel/generator | 7.29.1 | MIT |
| @babel/helper-annotate-as-pure | 7.27.3 | MIT |
| @babel/helper-compilation-targets | 7.28.6 | MIT |
| @babel/helper-create-class-features-plugin | 7.28.6 | MIT |
| @babel/helper-globals | 7.28.0 | MIT |
| @babel/helper-member-expression-to-functions | 7.28.5 | MIT |
| @babel/helper-module-imports | 7.28.6 | MIT |
| @babel/helper-module-transforms | 7.28.6 | MIT |
| @babel/helper-optimise-call-expression | 7.27.1 | MIT |
| @babel/helper-plugin-utils | 7.28.6 | MIT |
| @babel/helper-replace-supers | 7.28.6 | MIT |
| @babel/helper-skip-transparent-expression-wrappers | 7.27.1 | MIT |
| @babel/helper-string-parser | 7.27.1 | MIT |
| @babel/helper-validator-identifier | 7.28.5 | MIT |
| @babel/helper-validator-option | 7.27.1 | MIT |
| @babel/helpers | 7.28.6 | MIT |
| @babel/parser | 7.29.0 | MIT |
| @babel/plugin-syntax-jsx | 7.28.6 | MIT |
| @babel/plugin-syntax-typescript | 7.28.6 | MIT |
| @babel/plugin-transform-modules-commonjs | 7.28.6 | MIT |
| @babel/plugin-transform-typescript | 7.28.6 | MIT |
| @babel/preset-typescript | 7.28.5 | MIT |
| @babel/runtime | 7.28.6 | MIT |
| @babel/template | 7.28.6 | MIT |
| @babel/traverse | 7.29.0 | MIT |
| @babel/types | 7.29.0 | MIT |
| @base-ui/react | 1.3.0 | MIT |
| @base-ui/utils | 0.2.6 | MIT |
| @dnd-kit/abstract | 0.4.0 | MIT |
| @dnd-kit/accessibility | 3.1.1 | MIT |
| @dnd-kit/collision | 0.4.0 | MIT |
| @dnd-kit/core | 6.3.1 | MIT |
| @dnd-kit/dom | 0.4.0 | MIT |
| @dnd-kit/geometry | 0.4.0 | MIT |
| @dnd-kit/helpers | 0.4.0 | MIT |
| @dnd-kit/react | 0.4.0 | MIT |
| @dnd-kit/sortable | 10.0.0 | MIT |
| @dnd-kit/state | 0.4.0 | MIT |
| @dnd-kit/utilities | 3.2.2 | MIT |
| @dotenvx/dotenvx | 1.55.1 | BSD-3-Clause |
| @ecies/ciphers | 0.2.5 | MIT |
| @fastify/busboy | 3.2.0 | MIT |
| @firebase/ai | 2.9.0 | Apache-2.0 |
| @firebase/analytics | 0.10.20 | Apache-2.0 |
| @firebase/analytics-compat | 0.2.26 | Apache-2.0 |
| @firebase/analytics-types | 0.8.3 | Apache-2.0 |
| @firebase/app | 0.14.9 | Apache-2.0 |
| @firebase/app-check | 0.11.1 | Apache-2.0 |
| @firebase/app-check-compat | 0.4.1 | Apache-2.0 |
| @firebase/app-check-interop-types | 0.3.3 | Apache-2.0 |
| @firebase/app-check-types | 0.5.3 | Apache-2.0 |
| @firebase/app-compat | 0.5.9 | Apache-2.0 |
| @firebase/app-types | 0.9.3 | Apache-2.0 |
| @firebase/auth | 1.12.1 | Apache-2.0 |
| @firebase/auth-compat | 0.6.3 | Apache-2.0 |
| @firebase/auth-interop-types | 0.2.4 | Apache-2.0 |
| @firebase/auth-types | 0.13.0 | Apache-2.0 |
| @firebase/component | 0.7.1 | Apache-2.0 |
| @firebase/data-connect | 0.4.0 | Apache-2.0 |
| @firebase/database | 1.1.1 | Apache-2.0 |
| @firebase/database-compat | 2.1.1 | Apache-2.0 |
| @firebase/database-types | 1.0.17 | Apache-2.0 |
| @firebase/firestore | 4.12.0 | Apache-2.0 |
| @firebase/firestore-compat | 0.4.6 | Apache-2.0 |
| @firebase/firestore-types | 3.0.3 | Apache-2.0 |
| @firebase/functions | 0.13.2 | Apache-2.0 |
| @firebase/functions-compat | 0.4.2 | Apache-2.0 |
| @firebase/functions-types | 0.6.3 | Apache-2.0 |
| @firebase/installations | 0.6.20 | Apache-2.0 |
| @firebase/installations-compat | 0.2.20 | Apache-2.0 |
| @firebase/installations-types | 0.5.3 | Apache-2.0 |
| @firebase/logger | 0.5.0 | Apache-2.0 |
| @firebase/messaging | 0.12.24 | Apache-2.0 |
| @firebase/messaging-compat | 0.2.24 | Apache-2.0 |
| @firebase/messaging-interop-types | 0.2.3 | Apache-2.0 |
| @firebase/performance | 0.7.10 | Apache-2.0 |
| @firebase/performance-compat | 0.2.23 | Apache-2.0 |
| @firebase/performance-types | 0.2.3 | Apache-2.0 |
| @firebase/remote-config | 0.8.1 | Apache-2.0 |
| @firebase/remote-config-compat | 0.2.22 | Apache-2.0 |
| @firebase/remote-config-types | 0.5.0 | Apache-2.0 |
| @firebase/storage | 0.14.1 | Apache-2.0 |
| @firebase/storage-compat | 0.4.1 | Apache-2.0 |
| @firebase/storage-types | 0.8.3 | Apache-2.0 |
| @firebase/util | 1.14.0 | Apache-2.0 |
| @firebase/webchannel-wrapper | 1.0.5 | Apache-2.0 |
| @floating-ui/core | 1.7.5 | MIT |
| @floating-ui/dom | 1.7.6 | MIT |
| @floating-ui/react-dom | 2.1.8 | MIT |
| @floating-ui/utils | 0.2.11 | MIT |
| @google-cloud/firestore | 7.11.6 | Apache-2.0 |
| @google-cloud/paginator | 5.0.2 | Apache-2.0 |
| @google-cloud/projectify | 4.0.0 | Apache-2.0 |
| @google-cloud/promisify | 4.0.0 | Apache-2.0 |
| @google-cloud/storage | 7.19.0 | Apache-2.0 |
| @grpc/grpc-js | 1.9.15, 1.14.3 | Apache-2.0 |
| @grpc/proto-loader | 0.7.15, 0.8.0 | Apache-2.0 |
| @hono/node-server | 1.19.11 | MIT |
| @img/colour | 1.1.0 | MIT |
| @img/sharp-libvips-linux-x64 | 1.2.4 | LGPL-3.0-or-later |
| @img/sharp-linux-x64 | 0.34.5 | Apache-2.0 |
| @inquirer/ansi | 1.0.2 | MIT |
| @inquirer/confirm | 5.1.21 | MIT |
| @inquirer/core | 10.3.2 | MIT |
| @inquirer/figures | 1.0.15 | MIT |
| @inquirer/type | 3.0.10 | MIT |
| @isaacs/cliui | 8.0.2 | ISC |
| @jridgewell/gen-mapping | 0.3.13 | MIT |
| @jridgewell/remapping | 2.3.5 | MIT |
| @jridgewell/resolve-uri | 3.1.2 | MIT |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT |
| @jridgewell/trace-mapping | 0.3.31 | MIT |
| @js-sdsl/ordered-map | 4.4.2 | MIT |
| @mapbox/jsonlint-lines-primitives | 2.0.2 | Unknown |
| @mapbox/mapbox-gl-supported | 3.0.0 | BSD-3-Clause |
| @mapbox/point-geometry | 1.1.0 | ISC |
| @mapbox/tiny-sdf | 2.2.0 | BSD-2-Clause |
| @mapbox/unitbezier | 0.0.1 | BSD-2-Clause |
| @mapbox/vector-tile | 2.0.4 | BSD-3-Clause |
| @maplibre/maplibre-gl-style-spec | 19.3.3 | ISC |
| @modelcontextprotocol/sdk | 1.27.1 | MIT |
| @mswjs/interceptors | 0.41.3 | MIT |
| @next/env | 15.5.12 | MIT |
| @next/swc-linux-x64-gnu | 15.5.12 | MIT |
| @noble/ciphers | 1.3.0 | MIT |
| @noble/curves | 1.9.7 | MIT |
| @noble/hashes | 1.8.0 | MIT |
| @nodelib/fs.scandir | 2.1.5 | MIT |
| @nodelib/fs.stat | 2.0.5 | MIT |
| @nodelib/fs.walk | 1.2.8 | MIT |
| @open-draft/deferred-promise | 2.2.0 | MIT |
| @open-draft/logger | 0.3.0 | MIT |
| @open-draft/until | 2.1.0 | MIT |
| @opentelemetry/api | 1.9.0 | Apache-2.0 |
| @pkgjs/parseargs | 0.11.0 | MIT |
| @preact/signals-core | 1.14.4 | MIT |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause |
| @protobufjs/codegen | 2.0.4 | BSD-3-Clause |
| @protobufjs/eventemitter | 1.1.0 | BSD-3-Clause |
| @protobufjs/fetch | 1.1.0 | BSD-3-Clause |
| @protobufjs/float | 1.0.2 | BSD-3-Clause |
| @protobufjs/inquire | 1.1.0 | BSD-3-Clause |
| @protobufjs/path | 1.1.2 | BSD-3-Clause |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause |
| @protobufjs/utf8 | 1.1.0 | BSD-3-Clause |
| @puckeditor/core | 0.23.0 | MIT |
| @radix-ui/primitive | 1.1.7 | MIT |
| @radix-ui/react-arrow | 1.1.15 | MIT |
| @radix-ui/react-compose-refs | 1.1.5 | MIT |
| @radix-ui/react-context | 1.2.2 | MIT |
| @radix-ui/react-dismissable-layer | 1.1.19 | MIT |
| @radix-ui/react-focus-guards | 1.1.6 | MIT |
| @radix-ui/react-focus-scope | 1.1.16 | MIT |
| @radix-ui/react-id | 1.1.4 | MIT |
| @radix-ui/react-popover | 1.1.23 | MIT |
| @radix-ui/react-popper | 1.3.7 | MIT |
| @radix-ui/react-portal | 1.1.17 | MIT |
| @radix-ui/react-presence | 1.1.10 | MIT |
| @radix-ui/react-primitive | 2.1.10 | MIT |
| @radix-ui/react-slot | 1.3.3 | MIT |
| @radix-ui/react-use-callback-ref | 1.1.4 | MIT |
| @radix-ui/react-use-controllable-state | 1.2.6 | MIT |
| @radix-ui/react-use-effect-event | 0.0.5 | MIT |
| @radix-ui/react-use-layout-effect | 1.1.4 | MIT |
| @radix-ui/react-use-rect | 1.1.4 | MIT |
| @radix-ui/react-use-size | 1.1.4 | MIT |
| @radix-ui/rect | 1.1.3 | MIT |
| @react-pdf/fns | 3.1.3 | MIT |
| @react-pdf/font | 4.0.8 | MIT |
| @react-pdf/image | 3.1.0 | MIT |
| @react-pdf/layout | 4.6.1 | MIT |
| @react-pdf/pdfkit | 5.1.1 | MIT |
| @react-pdf/primitives | 4.3.0 | MIT |
| @react-pdf/reconciler | 2.0.0 | MIT |
| @react-pdf/render | 4.5.1 | MIT |
| @react-pdf/renderer | 4.5.1 | MIT |
| @react-pdf/stylesheet | 6.2.1 | MIT |
| @react-pdf/svg | 1.1.0 | MIT |
| @react-pdf/textkit | 6.3.0 | MIT |
| @react-pdf/types | 2.11.1 | MIT |
| @sec-ant/readable-stream | 0.4.1 | MIT |
| @sindresorhus/merge-streams | 4.0.0 | MIT |
| @stablelib/base64 | 1.0.1 | MIT |
| @stripe/stripe-js | 8.9.0 | MIT |
| @swc/helpers | 0.5.15 | Apache-2.0 |
| @tanstack/react-table | 8.21.3 | MIT |
| @tanstack/react-virtual | 3.14.9 | MIT |
| @tanstack/table-core | 8.21.3 | MIT |
| @tanstack/virtual-core | 3.17.7 | MIT |
| @tiptap/core | 3.27.1 | MIT |
| @tiptap/extension-blockquote | 3.27.1 | MIT |
| @tiptap/extension-bold | 3.27.1 | MIT |
| @tiptap/extension-bubble-menu | 3.27.1 | MIT |
| @tiptap/extension-bullet-list | 3.27.1 | MIT |
| @tiptap/extension-code | 3.27.1 | MIT |
| @tiptap/extension-code-block | 3.27.1 | MIT |
| @tiptap/extension-document | 3.27.1 | MIT |
| @tiptap/extension-dropcursor | 3.27.1 | MIT |
| @tiptap/extension-floating-menu | 3.27.1 | MIT |
| @tiptap/extension-gapcursor | 3.27.1 | MIT |
| @tiptap/extension-hard-break | 3.27.1 | MIT |
| @tiptap/extension-heading | 3.27.1 | MIT |
| @tiptap/extension-horizontal-rule | 3.27.1 | MIT |
| @tiptap/extension-image | 3.27.1 | MIT |
| @tiptap/extension-italic | 3.27.1 | MIT |
| @tiptap/extension-link | 3.27.1 | MIT |
| @tiptap/extension-list | 3.27.1 | MIT |
| @tiptap/extension-list-item | 3.27.1 | MIT |
| @tiptap/extension-list-keymap | 3.27.1 | MIT |
| @tiptap/extension-ordered-list | 3.27.1 | MIT |
| @tiptap/extension-paragraph | 3.27.1 | MIT |
| @tiptap/extension-strike | 3.27.1 | MIT |
| @tiptap/extension-text | 3.27.1 | MIT |
| @tiptap/extension-text-align | 3.30.1 | MIT |
| @tiptap/extension-underline | 3.27.1 | MIT |
| @tiptap/extensions | 3.27.1 | MIT |
| @tiptap/html | 3.30.1 | MIT |
| @tiptap/pm | 3.27.1 | MIT |
| @tiptap/react | 3.27.1 | MIT |
| @tiptap/starter-kit | 3.27.1 | MIT |
| @tootallnate/once | 2.0.0 | MIT |
| @ts-morph/common | 0.27.0 | MIT |
| @types/caseless | 0.12.5 | MIT |
| @types/geojson | 7946.0.16 | MIT |
| @types/geojson-vt | 3.2.5 | MIT |
| @types/jsonwebtoken | 9.0.10 | MIT |
| @types/long | 4.0.2 | MIT |
| @types/ms | 2.1.0 | MIT |
| @types/node | 20.19.37 | MIT |
| @types/pbf | 3.0.5 | MIT |
| @types/react | 19.2.14 | MIT |
| @types/react-dom | 19.2.3 | MIT |
| @types/request | 2.48.13 | MIT |
| @types/statuses | 2.0.6 | MIT |
| @types/supercluster | 7.1.3 | MIT |
| @types/tough-cookie | 4.0.5 | MIT |
| @types/use-sync-external-store | 0.0.6 | MIT |
| @types/validate-npm-package-name | 4.0.2 | MIT |
| @types/whatwg-mimetype | 3.0.2 | MIT |
| @types/ws | 8.18.1 | MIT |
| @upstash/qstash | 2.10.1 | MIT |
| @vis.gl/react-mapbox | 8.1.1 | MIT |
| @vis.gl/react-maplibre | 8.1.1 | MIT |
| abort-controller | 3.0.0 | MIT |
| abs-svg-path | 0.1.1 | MIT |
| accepts | 2.0.0 | MIT |
| agent-base | 6.0.2, 7.1.4 | MIT |
| ajv | 8.18.0 | MIT |
| ajv-formats | 3.0.1 | MIT |
| ansi-regex | 5.0.1, 6.2.2 | MIT |
| ansi-styles | 4.3.0, 6.2.3 | MIT |
| argparse | 2.0.1 | Python-2.0 |
| aria-hidden | 1.2.6 | MIT |
| arr-union | 3.1.0 | MIT |
| arrify | 2.0.1 | MIT |
| assign-symbols | 1.0.0 | MIT |
| ast-types | 0.16.1 | MIT |
| async-retry | 1.3.3 | MIT |
| asynckit | 0.4.0 | MIT |
| axios | 1.15.0 | MIT |
| balanced-match | 1.0.2, 4.0.4 | MIT |
| base64-js | 0.0.8, 1.5.1 | MIT |
| baseline-browser-mapping | 2.10.8 | Apache-2.0 |
| bidi-js | 1.0.3 | MIT |
| bignumber.js | 9.3.1 | MIT |
| body-parser | 2.2.2 | MIT |
| brace-expansion | 2.0.2, 5.0.4 | MIT |
| braces | 3.0.3 | MIT |
| brotli | 1.3.3 | MIT |
| browserify-zlib | 0.2.0 | MIT |
| browserslist | 4.28.1 | MIT |
| buffer-equal-constant-time | 1.0.1 | BSD-3-Clause |
| buffer-image-size | 0.6.4 | MIT |
| bundle-name | 4.1.0 | MIT |
| bytes | 3.1.2 | MIT |
| bytewise | 1.1.0 | MIT |
| bytewise-core | 1.2.3 | MIT |
| call-bind-apply-helpers | 1.0.2 | MIT |
| call-bound | 1.0.4 | MIT |
| callsites | 3.1.0 | MIT |
| caniuse-lite | 1.0.30001779 | CC-BY-4.0 |
| chalk | 5.6.2 | MIT |
| cheap-ruler | 4.0.0 | ISC |
| class-variance-authority | 0.7.1 | Apache-2.0 |
| cli-cursor | 5.0.0 | MIT |
| cli-spinners | 2.9.2 | MIT |
| cli-width | 4.1.0 | ISC |
| client-only | 0.0.1 | MIT |
| cliui | 8.0.1 | ISC |
| clone | 2.1.2 | MIT |
| clsx | 2.1.1 | MIT |
| code-block-writer | 13.0.3 | MIT |
| color-convert | 2.0.1 | MIT |
| color-name | 1.1.4, 2.1.0 | MIT |
| color-string | 2.1.4 | MIT |
| combined-stream | 1.0.8 | MIT |
| commander | 11.1.0, 14.0.3 | MIT |
| content-disposition | 1.0.1 | MIT |
| content-type | 1.0.5 | MIT |
| convert-source-map | 2.0.0 | MIT |
| cookie | 0.7.2, 1.1.1 | MIT |
| cookie-signature | 1.2.2 | MIT |
| cors | 2.8.6 | MIT |
| cosmiconfig | 9.0.1 | MIT |
| cross-spawn | 7.0.6 | MIT |
| crypto-js | 4.2.0 | MIT |
| csscolorparser | 1.0.3 | MIT |
| cssesc | 3.0.0 | MIT |
| csstype | 3.2.3 | MIT |
| data-uri-to-buffer | 4.0.1 | MIT |
| dayjs | 1.11.20 | MIT |
| debug | 4.4.3 | MIT |
| dedent | 1.7.2 | MIT |
| deep-diff | 1.0.2 | MIT |
| deepmerge | 4.3.1 | MIT |
| default-browser | 5.5.0 | MIT |
| default-browser-id | 5.0.1 | MIT |
| define-lazy-prop | 3.0.0 | MIT |
| delayed-stream | 1.0.0 | MIT |
| depd | 2.0.0 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| detect-node-es | 1.1.0 | MIT |
| dfa | 1.2.0 | MIT |
| diff | 8.0.3 | BSD-3-Clause |
| dom-serializer | 2.0.0 | MIT |
| domelementtype | 2.3.0 | BSD-2-Clause |
| domhandler | 5.0.3 | BSD-2-Clause |
| domutils | 3.2.2 | BSD-2-Clause |
| dotenv | 17.3.1 | BSD-2-Clause |
| dunder-proto | 1.0.1 | MIT |
| duplexify | 4.1.3 | MIT |
| earcut | 3.0.2 | ISC |
| eastasianwidth | 0.2.0 | MIT |
| ecdsa-sig-formatter | 1.0.11 | Apache-2.0 |
| eciesjs | 0.4.18 | MIT |
| ee-first | 1.1.1 | MIT |
| electron-to-chromium | 1.5.313 | ISC |
| emoji-regex | 8.0.0, 9.2.2, 10.6.0 | MIT |
| emoji-regex-xs | 1.0.0 | MIT |
| encodeurl | 2.0.0 | MIT |
| encoding | 0.1.13 | MIT |
| end-of-stream | 1.4.5 | MIT |
| entities | 4.5.0, 7.0.1 | BSD-2-Clause |
| env-paths | 2.2.1 | MIT |
| error-ex | 1.3.4 | MIT |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es-object-atoms | 1.1.1 | MIT |
| es-set-tostringtag | 2.1.0 | MIT |
| escalade | 3.2.0 | MIT |
| escape-html | 1.0.3 | MIT |
| escape-string-regexp | 4.0.0 | MIT |
| esprima | 4.0.1 | BSD-2-Clause |
| etag | 1.8.1 | MIT |
| event-target-shim | 5.0.1 | MIT |
| events | 3.3.0 | MIT |
| eventsource | 3.0.7 | MIT |
| eventsource-parser | 3.0.6 | MIT |
| execa | 5.1.1, 9.6.1 | MIT |
| express | 5.2.1 | MIT |
| express-rate-limit | 8.3.1 | MIT |
| extend | 3.0.2 | MIT |
| extend-shallow | 2.0.1, 3.0.2 | MIT |
| farmhash-modern | 1.1.0 | MIT |
| fast-deep-equal | 3.1.3 | MIT |
| fast-equals | 5.2.2, 5.4.0 | MIT |
| fast-glob | 3.3.3 | MIT |
| fast-sha256 | 1.3.0 | Unlicense |
| fast-uri | 3.1.0 | BSD-3-Clause |
| fast-xml-builder | 1.1.3 | MIT |
| fast-xml-parser | 5.5.5 | MIT |
| fastq | 1.20.1 | ISC |
| faye-websocket | 0.11.4 | Apache-2.0 |
| fdir | 6.5.0 | MIT |
| fetch-blob | 3.2.0 | MIT |
| fflate | 0.8.3 | MIT |
| figures | 6.1.0 | MIT |
| fill-range | 7.1.1 | MIT |
| finalhandler | 2.1.1 | MIT |
| firebase | 12.10.0 | Apache-2.0 |
| firebase-admin | 13.7.0 | Apache-2.0 |
| flat | 5.0.2 | BSD-3-Clause |
| follow-redirects | 1.16.0 | MIT |
| fontkit | 2.0.4 | MIT |
| foreground-child | 3.3.1 | ISC |
| form-data | 2.5.5, 4.0.5 | MIT |
| formdata-polyfill | 4.0.10 | MIT |
| forwarded | 0.2.0 | MIT |
| fresh | 2.0.0 | MIT |
| fs-extra | 11.3.4 | MIT |
| function-bind | 1.1.2 | MIT |
| functional-red-black-tree | 1.0.1 | MIT |
| fuzzysort | 3.1.0 | MIT |
| gaxios | 6.7.1, 7.1.3 | Apache-2.0 |
| gcp-metadata | 6.1.1, 8.1.2 | Apache-2.0 |
| gensync | 1.0.0-beta.2 | MIT |
| geojson-vt | 4.0.3 | ISC |
| get-caller-file | 2.0.5 | ISC |
| get-east-asian-width | 1.5.0 | MIT |
| get-intrinsic | 1.3.0 | MIT |
| get-nonce | 1.0.1 | MIT |
| get-own-enumerable-keys | 1.0.0 | MIT |
| get-proto | 1.0.1 | MIT |
| get-stream | 6.0.1, 9.0.1 | MIT |
| get-value | 2.0.6 | MIT |
| gl-matrix | 3.4.4 | MIT |
| glob | 10.5.0 | ISC |
| glob-parent | 5.1.2 | ISC |
| google-auth-library | 9.15.1, 10.6.1 | Apache-2.0 |
| google-gax | 4.6.1 | Apache-2.0 |
| google-logging-utils | 0.0.2, 1.1.3 | Apache-2.0 |
| gopd | 1.2.0 | MIT |
| graceful-fs | 4.2.11 | ISC |
| graphql | 16.13.1 | MIT |
| grid-index | 1.1.0 | ISC |
| gtoken | 7.1.0 | MIT |
| happy-dom | 20.11.2 | MIT |
| has-symbols | 1.1.0 | MIT |
| has-tostringtag | 1.0.2 | MIT |
| hasown | 2.0.2 | MIT |
| headers-polyfill | 4.0.3 | MIT |
| hono | 4.12.8 | MIT |
| hsl-to-hex | 1.0.0 | MIT |
| hsl-to-rgb-for-reals | 1.1.1 | ISC |
| html-entities | 2.6.0 | MIT |
| htmlparser2 | 10.1.0 | MIT |
| http-errors | 2.0.1 | MIT |
| http-parser-js | 0.5.10 | MIT |
| http-proxy-agent | 5.0.0 | MIT |
| https-proxy-agent | 5.0.1, 7.0.6 | MIT |
| human-signals | 2.1.0, 8.0.1 | Apache-2.0 |
| hyphen | 1.14.1 | ISC |
| iconv-lite | 0.6.3, 0.7.2 | MIT |
| idb | 7.1.1 | ISC |
| ignore | 5.3.2 | MIT |
| import-fresh | 3.3.1 | MIT |
| inherits | 2.0.4 | ISC |
| ip-address | 10.1.0 | MIT |
| ipaddr.js | 1.9.1 | MIT |
| is-arrayish | 0.2.1 | MIT |
| is-docker | 3.0.0 | MIT |
| is-extendable | 0.1.1, 1.0.1 | MIT |
| is-extglob | 2.1.1 | MIT |
| is-fullwidth-code-point | 3.0.0 | MIT |
| is-glob | 4.0.3 | MIT |
| is-in-ssh | 1.0.0 | MIT |
| is-inside-container | 1.0.0 | MIT |
| is-interactive | 2.0.0 | MIT |
| is-node-process | 1.2.0 | MIT |
| is-number | 7.0.0 | MIT |
| is-obj | 3.0.0 | MIT |
| is-plain-obj | 4.1.0 | MIT |
| is-plain-object | 2.0.4, 5.0.0 | MIT |
| is-promise | 4.0.0 | MIT |
| is-regexp | 3.1.0 | MIT |
| is-stream | 2.0.1, 4.0.1 | MIT |
| is-unicode-supported | 1.3.0, 2.1.0 | MIT |
| is-url | 1.2.4 | MIT |
| is-wsl | 3.1.1 | MIT |
| isexe | 2.0.0 | ISC |
| isexe | 3.1.5 | BlueOak-1.0.0 |
| isobject | 3.0.1 | MIT |
| jackspeak | 3.4.3 | BlueOak-1.0.0 |
| jay-peg | 1.1.1 | MIT |
| jose | 4.15.9, 5.10.0, 6.2.1 | MIT |
| js-md5 | 0.8.3 | MIT |
| js-tokens | 4.0.0 | MIT |
| js-yaml | 4.1.1 | MIT |
| jsesc | 3.1.0 | MIT |
| json-bigint | 1.0.0 | MIT |
| json-parse-even-better-errors | 2.3.1 | MIT |
| json-schema-traverse | 1.0.0 | MIT |
| json-schema-typed | 8.0.2 | BSD-2-Clause |
| json-stringify-pretty-compact | 3.0.0 | MIT |
| json5 | 2.2.3 | MIT |
| jsonfile | 6.2.0 | MIT |
| jsonwebtoken | 9.0.3 | MIT |
| jwa | 2.0.1 | MIT |
| jwks-rsa | 3.2.2 | MIT |
| jws | 4.0.1 | MIT |
| kdbush | 4.0.2 | ISC |
| kleur | 3.0.3, 4.1.5 | MIT |
| launder | 1.7.1 | MIT |
| libphonenumber-js | 1.13.2 | MIT |
| limiter | 1.1.5 | MIT |
| linebreak | 1.1.0 | MIT |
| lines-and-columns | 1.2.4 | MIT |
| linkifyjs | 4.3.3 | MIT |
| lodash.camelcase | 4.3.0 | MIT |
| lodash.clonedeep | 4.5.0 | MIT |
| lodash.includes | 4.3.0 | MIT |
| lodash.isboolean | 3.0.3 | MIT |
| lodash.isinteger | 4.0.4 | MIT |
| lodash.isnumber | 3.0.3 | MIT |
| lodash.isplainobject | 4.0.6 | MIT |
| lodash.isstring | 4.0.1 | MIT |
| lodash.once | 4.1.1 | MIT |
| log-symbols | 6.0.0 | MIT |
| long | 5.3.2 | Apache-2.0 |
| loose-envify | 1.4.0 | MIT |
| lru-cache | 5.1.1, 6.0.0, 10.4.3 | ISC |
| lru-memoizer | 2.3.0 | MIT |
| lucide-react | 0.577.0 | ISC |
| mapbox-gl | 3.23.1 | BSD |
| martinez-polygon-clipping | 0.8.1 | MIT |
| math-intrinsics | 1.1.0 | MIT |
| media-engine | 1.0.3 | MIT |
| media-typer | 1.1.0 | MIT |
| merge-descriptors | 2.0.0 | MIT |
| merge-stream | 2.0.0 | MIT |
| merge2 | 1.4.1 | MIT |
| micromatch | 4.0.8 | MIT |
| mime | 3.0.0 | MIT |
| mime-db | 1.52.0, 1.54.0 | MIT |
| mime-types | 2.1.35, 3.0.2 | MIT |
| mimic-fn | 2.1.0 | MIT |
| mimic-function | 5.0.1 | MIT |
| minimatch | 9.0.9 | ISC |
| minimatch | 10.2.4 | BlueOak-1.0.0 |
| minimist | 1.2.8 | MIT |
| minipass | 7.1.3 | BlueOak-1.0.0 |
| ms | 2.1.3 | MIT |
| msw | 2.12.11 | MIT |
| murmurhash-js | 1.0.0 | MIT |
| mute-stream | 2.0.0 | ISC |
| nanoid | 3.3.11 | MIT |
| negotiator | 1.0.0 | MIT |
| neverthrow | 7.2.0 | MIT |
| next | 15.5.12 | MIT |
| next-firebase-auth-edge | 1.12.0 | MIT |
| next-themes | 0.4.6 | MIT |
| node-domexception | 1.0.0 | MIT |
| node-fetch | 2.7.0, 3.3.2 | MIT |
| node-forge | 1.3.3 | (BSD-3-Clause OR GPL-2.0) |
| node-releases | 2.0.36 | MIT |
| normalize-svg-path | 1.1.0 | MIT |
| npm-run-path | 4.0.1, 6.0.0 | MIT |
| object-assign | 4.1.1 | MIT |
| object-hash | 3.0.0 | MIT |
| object-inspect | 1.13.4 | MIT |
| object-treeify | 1.1.33 | MIT |
| on-finished | 2.4.1 | MIT |
| once | 1.4.0 | ISC |
| onetime | 5.1.2, 7.0.0 | MIT |
| open | 11.0.0 | MIT |
| ora | 8.2.0 | MIT |
| orderedmap | 2.1.1 | MIT |
| outvariant | 1.4.3 | MIT |
| p-limit | 3.1.0 | MIT |
| package-json-from-dist | 1.0.1 | BlueOak-1.0.0 |
| pako | 0.2.9 | MIT |
| pako | 1.0.11 | (MIT AND Zlib) |
| parent-module | 1.0.1 | MIT |
| parse-json | 5.2.0 | MIT |
| parse-ms | 4.0.0 | MIT |
| parse-srcset | 1.0.2 | MIT |
| parse-svg-path | 0.1.2 | MIT |
| parseurl | 1.3.3 | MIT |
| path-browserify | 1.0.1 | MIT |
| path-expression-matcher | 1.1.3 | MIT |
| path-key | 3.1.1, 4.0.0 | MIT |
| path-scurry | 1.11.1 | BlueOak-1.0.0 |
| path-to-regexp | 6.3.0, 8.3.0 | MIT |
| pbf | 4.0.1 | BSD-3-Clause |
| picocolors | 1.1.1 | ISC |
| picomatch | 2.3.1, 4.0.3 | MIT |
| pkce-challenge | 5.0.1 | MIT |
| png-js | 2.0.0 | MIT |
| postal-mime | 2.7.4 | MIT-0 |
| postcss | 8.4.31, 8.5.8 | MIT |
| postcss-selector-parser | 7.1.1 | MIT |
| postcss-value-parser | 4.2.0 | MIT |
| potpack | 2.1.0 | ISC |
| powershell-utils | 0.1.0 | MIT |
| pretty-ms | 9.3.0 | MIT |
| prompts | 2.4.2 | MIT |
| prop-types | 15.8.1 | MIT |
| prosemirror-changeset | 2.4.1 | MIT |
| prosemirror-commands | 1.7.1 | MIT |
| prosemirror-dropcursor | 1.8.2 | MIT |
| prosemirror-gapcursor | 1.4.1 | MIT |
| prosemirror-history | 1.5.0 | MIT |
| prosemirror-inputrules | 1.5.1 | MIT |
| prosemirror-keymap | 1.2.3 | MIT |
| prosemirror-model | 1.25.9 | MIT |
| prosemirror-schema-list | 1.5.1 | MIT |
| prosemirror-state | 1.4.4 | MIT |
| prosemirror-tables | 1.8.5 | MIT |
| prosemirror-transform | 1.12.0 | MIT |
| prosemirror-view | 1.41.9 | MIT |
| proto3-json-serializer | 2.0.2 | Apache-2.0 |
| protobufjs | 7.5.4 | BSD-3-Clause |
| protocol-buffers-schema | 3.6.1 | MIT |
| proxy-addr | 2.0.7 | MIT |
| proxy-from-env | 2.1.0 | MIT |
| qs | 6.15.0 | BSD-3-Clause |
| queue | 6.0.2 | MIT |
| queue-microtask | 1.2.3 | MIT |
| quickselect | 3.0.0 | ISC |
| range-parser | 1.2.1 | MIT |
| raw-body | 3.0.2 | MIT |
| react | 19.1.0 | MIT |
| react-dom | 19.1.0 | MIT |
| react-hotkeys-hook | 4.6.2 | MIT |
| react-icons | 5.6.0 | MIT |
| react-is | 16.13.1 | MIT |
| react-map-gl | 8.1.1 | MIT |
| react-remove-scroll | 2.7.2 | MIT |
| react-remove-scroll-bar | 2.3.8 | MIT |
| react-style-singleton | 2.2.3 | MIT |
| readable-stream | 3.6.2 | MIT |
| recast | 0.23.11 | MIT |
| require-directory | 2.1.1 | MIT |
| require-from-string | 2.0.2 | MIT |
| reselect | 5.1.1 | MIT |
| resend | 6.12.0 | MIT |
| resolve-from | 4.0.0 | MIT |
| resolve-protobuf-schema | 2.1.0 | MIT |
| restore-cursor | 5.1.0 | MIT |
| restructure | 3.0.2 | MIT |
| retry | 0.13.1 | MIT |
| retry-request | 7.0.2 | MIT |
| rettime | 0.10.1 | MIT |
| reusify | 1.1.0 | MIT |
| rimraf | 5.0.10 | ISC |
| robust-predicates | 2.0.4 | Unlicense |
| rope-sequence | 1.3.4 | MIT |
| router | 2.2.0 | MIT |
| run-applescript | 7.1.0 | MIT |
| run-parallel | 1.2.0 | MIT |
| rw | 1.3.3 | BSD-3-Clause |
| safe-buffer | 5.2.1 | MIT |
| safer-buffer | 2.1.2 | MIT |
| sanitize-html | 2.17.5 | MIT |
| scheduler | 0.25.0-rc-603e6108-20241029, 0.26.0 | MIT |
| scmp | 2.1.0 | BSD-3-Clause |
| semver | 6.3.1, 7.7.4 | ISC |
| send | 1.2.1 | MIT |
| serve-static | 2.2.1 | MIT |
| server-only | 0.0.1 | MIT |
| set-value | 2.0.1 | MIT |
| setprototypeof | 1.2.0 | ISC |
| shadcn | 4.0.8 | MIT |
| sharp | 0.34.5 | Apache-2.0 |
| shebang-command | 2.0.0 | MIT |
| shebang-regex | 3.0.0 | MIT |
| side-channel | 1.1.0 | MIT |
| side-channel-list | 1.0.0 | MIT |
| side-channel-map | 1.0.1 | MIT |
| side-channel-weakmap | 1.0.2 | MIT |
| signal-exit | 3.0.7, 4.1.0 | ISC |
| sisteransi | 1.0.5 | MIT |
| sonner | 2.0.7 | MIT |
| sort-asc | 0.2.0 | MIT |
| sort-desc | 0.2.0 | MIT |
| sort-object | 3.0.3 | MIT |
| source-map | 0.6.1 | BSD-3-Clause |
| source-map-js | 1.2.1 | BSD-3-Clause |
| splaytree | 0.1.4 | MIT |
| split-string | 3.1.0 | MIT |
| standardwebhooks | 1.0.0 | MIT |
| statuses | 2.0.2 | MIT |
| stdin-discarder | 0.2.2 | MIT |
| stream-events | 1.0.5 | MIT |
| stream-shift | 1.0.3 | MIT |
| strict-event-emitter | 0.5.1 | MIT |
| string_decoder | 1.3.0 | MIT |
| string-width | 4.2.3, 5.1.2, 7.2.0 | MIT |
| stringify-object | 5.0.0 | BSD-2-Clause |
| strip-ansi | 6.0.1, 7.2.0 | MIT |
| strip-bom | 3.0.0 | MIT |
| strip-final-newline | 2.0.0, 4.0.0 | MIT |
| stripe | 20.4.1 | MIT |
| strnum | 2.2.0 | MIT |
| stubs | 3.0.0 | MIT |
| styled-jsx | 5.1.6 | MIT |
| supercluster | 8.0.1 | ISC |
| svg-arc-to-cubic-bezier | 3.2.0 | ISC |
| svix | 1.90.0 | MIT |
| tabbable | 6.4.0 | MIT |
| tagged-tag | 1.0.0 | MIT |
| tailwind-merge | 3.5.0 | MIT |
| teeny-request | 9.0.0 | Apache-2.0 |
| tiny-inflate | 1.0.3 | MIT |
| tiny-invariant | 1.3.3 | MIT |
| tinyqueue | 3.0.0 | ISC |
| tldts | 7.0.26 | MIT |
| tldts-core | 7.0.26 | MIT |
| to-regex-range | 5.0.1 | MIT |
| toidentifier | 1.0.1 | MIT |
| tough-cookie | 6.0.1 | BSD-3-Clause |
| tr46 | 0.0.3 | MIT |
| ts-morph | 26.0.0 | MIT |
| tsconfig-paths | 4.2.0 | MIT |
| tslib | 2.8.1 | 0BSD |
| tw-animate-css | 1.4.0 | MIT |
| twilio | 5.13.1 | MIT |
| type-fest | 5.4.4 | (MIT OR CC0-1.0) |
| type-is | 2.0.1 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| typewise | 1.0.3 | MIT |
| typewise-core | 1.2.0 | MIT |
| undici-types | 6.21.0 | MIT |
| unicode-properties | 1.4.1 | MIT |
| unicode-trie | 2.0.0 | MIT |
| unicorn-magic | 0.3.0 | MIT |
| union-value | 1.0.1 | MIT |
| universalify | 2.0.1 | MIT |
| unpipe | 1.0.0 | MIT |
| until-async | 3.0.2 | MIT |
| update-browserslist-db | 1.2.3 | MIT |
| use-callback-ref | 1.3.3 | MIT |
| use-debounce | 9.0.4 | MIT |
| use-sidecar | 1.1.3 | MIT |
| use-sync-external-store | 1.6.0 | MIT |
| util-deprecate | 1.0.2 | MIT |
| uuid | 8.3.2, 9.0.1, 10.0.0, 11.1.0 | MIT |
| validate-npm-package-name | 7.0.2 | ISC |
| vary | 1.1.2 | MIT |
| vite-compatible-readable-stream | 3.6.1 | MIT |
| w3c-keyname | 2.2.8 | MIT |
| web-streams-polyfill | 3.3.3 | MIT |
| web-vitals | 4.2.4 | Apache-2.0 |
| webidl-conversions | 3.0.1 | BSD-2-Clause |
| websocket-driver | 0.7.4 | Apache-2.0 |
| websocket-extensions | 0.1.4 | Apache-2.0 |
| whatwg-mimetype | 3.0.0 | MIT |
| whatwg-url | 5.0.0 | MIT |
| which | 2.0.2, 4.0.0 | ISC |
| wrap-ansi | 6.2.0, 7.0.0, 8.1.0 | MIT |
| wrappy | 1.0.2 | ISC |
| ws | 8.21.3 | MIT |
| wsl-utils | 0.3.1 | MIT |
| xmlbuilder | 13.0.2 | MIT |
| y18n | 5.0.8 | ISC |
| yallist | 3.1.1, 4.0.0 | ISC |
| yargs | 17.7.2 | MIT |
| yargs-parser | 21.1.1 | ISC |
| yocto-queue | 0.1.0 | MIT |
| yoctocolors | 2.1.2 | MIT |
| yoctocolors-cjs | 2.1.3 | MIT |
| yoga-layout | 3.2.1 | MIT |
| zod | 3.25.76 | MIT |
| zod-to-json-schema | 3.25.1 | ISC |
| zustand | 5.0.15 | MIT |
