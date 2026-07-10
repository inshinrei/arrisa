# Security

Arrisa is an editor toolkit. It validates **document structure** and applies
**default policies** on URLs, colors, attributes, and collab effects — but it is
**not** a full HTML sanitizer. Apps that accept untrusted content must configure
the controls below.

## Threat model

### Trusted

- Local user typing and caret movement
- App-owned extensions, facets, and schema configuration
- Document JSON the app already validated as first-party

### Untrusted

- Clipboard HTML / plain text from the browser (web paste, drag-and-drop)
- Collaborator documents and collab wire updates (`CollabUpdate`)
- Document HTML or JSON loaded from the network or query-string seeds
- Attribute maps and dialog input bags supplied from untrusted config

Treat these as attacker-controlled unless your app has already sanitized them.

## What Arrisa guarantees (and does not)

| Control | What it does | What it does **not** do |
|---------|----------------|-------------------------|
| Schema / `ignoreTags` | Shapes the document model after parse | XSS safety; event-handler gadgets can run during `innerHTML` **before** schema filter |
| `Arrisa.htmlSanitize` / `sanitizeHTML` | App hook **before** HTML → DOM | Built-in DOMPurify; default is **no** sanitizer |
| Link / image URL helpers | Block `javascript:`, dangerous `data:`, etc. on default marks/nodes | Custom marks you ship without the same checks |
| CSS color validation | Blocks style-injection payloads in color marks | Full CSS sanitizer for arbitrary `style` strings |
| Attribute name filter | Blocks `on*`, `srcdoc`, etc. on facet/dialog/serialize paths | Value sanitization for every attribute |
| Collab remote effects | **Default: drop** effects from other clients | Authority-side filtering unless you call `filterUpdateEffects` |

**Do not** treat schema structure validation as an XSS boundary.

## Required app controls

### 1. Sanitize untrusted HTML

Paste and string docs assign HTML via `innerHTML` after an optional hook. For
untrusted sources, **always** provide a sanitizer:

```ts
import {Arrisa} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"
import {collab} from "@arrisa/collab"
// import DOMPurify from "dompurify" — app dependency

let sanitize = (html: string) => DOMPurify.sanitize(html)

let state = EditorState.create({
    doc: sanitize(userHtml), // or plain Node; prefer sanitize first for string HTML
    sanitizeHTML: sanitize, // string doc path
    config: [
        // fullSchema() or your schema extensions…
        Arrisa.htmlSanitize.of(sanitize), // clipboard / paste path
        collab({
            clientID,
            // Default drops all remote effects. Allowlist only what peers may apply:
            // filterRemoteEffects: (effects) => effects.filter(isSharedCursorEffect),
        }),
    ],
})
```

Without `Arrisa.htmlSanitize` / `sanitizeHTML`, untrusted HTML is **not** safe to
paste or load as a string document.

### 2. Trusted Types

Arrisa **never** creates an identity Trusted Types policy (`createHTML: s => s`).
If your CSP enforces Trusted Types:

- Pass a real policy via `Arrisa.trustedHTMLPolicy` and/or
  `EditorState.create({ trustedHTMLPolicy })`, typically after sanitization, or
- Assign only values already produced as `TrustedHTML` by your app policy.

### 3. Link and image URLs

Default schema marks/nodes use:

- `sanitizeLinkHref` / `isSafeLinkHref` — schemes `http:`, `https:`, `mailto:`,
  `xmpp:`; relative URLs allowed by default; **`data:` and `javascript:` rejected**
- `sanitizeImageSrc` / `isSafeImageSrc` — schemes `http:`, `https:`, `blob:`;
  `data:image/*` only if you pass `{ allowDataImage: true }`

Dialogs, paste-as-link, and tooltip rendering follow the same helpers.

### 4. Colors

`Color` / `BackgroundColor` and `setColor` accept only values that pass
`isSafeCssColor` (no `;`, `url(`, expressions, etc.).

### 5. Collaboration effects

- **Client default:** remote `CollabUpdate.effects` are **dropped** on receive.
- Allow shared effects with `filterRemoteEffects`.
- **Authority:** strip privileged effects before broadcast with
  `filterUpdateEffects` (do not rebroadcast admin/UI-only effects).

### 6. DOM attribute names

Facet-driven `contentAttributes` / `editorAttributes`, dialog `input` maps, and
`toHTML` / `createOuterDOM` skip unsafe attribute names (`on*`, `srcdoc`,
`formaction`, `xlink:href`, invalid syntax). Prefer fixed allowlists in app code
for untrusted maps.

## CSP recommendations

- Prefer **no** `script-src 'unsafe-inline'` (reduces inline-handler impact).
- Lock down `img-src` and `connect-src` to origins you trust for media and collab.
- If using Trusted Types, register a policy that sanitizes; **do not** install an
  identity passthrough policy “to make Arrisa work.”

## Safe initialization (checklist)

1. Sanitize any HTML string before editor load and on paste (`htmlSanitize` /
   `sanitizeHTML`).
2. Use the default schema URL/color policies (or equivalent on custom types).
3. Configure collab `filterRemoteEffects` only for effects that are safe to apply
   from peers; filter on the authority too.
4. Do not feed untrusted keys into attribute facets or dialog `input` maps.
5. Deploy a restrictive CSP.

## Security hardening (pre-1.0)

Notable defaults / breaking behavior from the security review:

- **HTML:** sanitize is an **opt-in hook**; no identity Trusted Types policy.
- **Links:** `javascript:` and `data:` rejected by default (including paste-as-link).
- **Images:** non-image `data:` and script schemes rejected by default.
- **Colors:** injection-style values rejected on parse, JSON, and `setColor`.
- **Collab:** remote effects dropped by default (was pass-through).
- **Attributes:** unsafe names filtered on facet, dialog, and HTML serialize paths.

## Reporting vulnerabilities

Please open a private security report or GitHub issue against this repository
with a minimal reproduction. Do not file public issues with full exploit details
until a fix is available if the issue is high severity.

## Review plans

Implementation plans and residual tracking live under
[docs/security/](./docs/security/README.md).
