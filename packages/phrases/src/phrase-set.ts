/**
 * Typed UI phrase catalogs with locale overrides via an {@link EditorState} facet.
 *
 * A {@link PhraseSet} holds default English (or base) strings keyed by tag.
 * Callers resolve phrases with {@link PhraseSet.get} / {@link PhraseSet.ref},
 * optionally substituting `$1`, `$2`, … placeholders. Locale packs register
 * overrides through {@link PhraseSet.translate} / {@link PhraseSet.translatePartial}.
 *
 * **Override merge order:** facet providers are ordered high-precedence first
 * (see state configuration flatten). Combine walks reverse and spreads so
 * higher-precedence / earlier-in-list keys win. Put locale overrides first or
 * wrap them with `EditorState.prec.high`.
 *
 * **Interpolation:** `$1` inserts the first extra argument, `$2` the second, and
 * so on. A bare `$` is treated as `$1`. `$$` emits a literal `$`. Markers with
 * no matching argument are left unchanged.
 */
import {EditorState} from "@arrisa/state"

type OverrideRecord = {set: PhraseSet<any>; phrases: Record<string, string>}

/**
 * Combined map of per-set phrase overrides. Static: all providers are
 * `.of(...)` values and do not depend on document or selection.
 */
const phraseOverride = EditorState.Facet.define<OverrideRecord, Map<PhraseSet<any>, Record<string, string>>>({
    static: true,
    combine(records) {
        let map = new Map<PhraseSet<any>, Record<string, string>>()
        // Reverse: last (lowest precedence) as base, earlier/higher overwrites.
        for (let i = records.length - 1; i >= 0; i--) {
            let {set, phrases} = records[i]
            let known = map.get(set)
            map.set(set, known ? {...known, ...phrases} : phrases)
        }
        return map
    },
})

/** Replace `$n` / `$` / `$$` markers in `template` with `insert` values. */
function formatPhrase(template: string, insert: readonly unknown[]): string {
    if (!insert.length) return template
    return template.replace(/\$(\$|\d*)/g, (m, i) => {
        if (i == "$") return "$"
        let n = +(i || 1)
        return !n || n > insert.length ? m : String(insert[n - 1])
    })
}

/**
 * A frozen catalog of tagged UI strings, resolvable against editor state so
 * locale extensions can override defaults without touching call sites.
 */
export class PhraseSet<Tags extends string> {
    private constructor(readonly phrases: Readonly<{[tag in Tags]: string}>) {}

    /** Define a new phrase set from a complete tag → default string map. */
    static define<Tags extends string>(phrases: {[tag in Tags]: string}) {
        return new PhraseSet<Tags>(Object.freeze({...phrases}))
    }

    /**
     * Whether the phrase-override facet differs between two states.
     * Useful for UI that should re-render labels when locale config changes.
     */
    static didChange(a: EditorState, b: EditorState) {
        return a.facet(phraseOverride) != b.facet(phraseOverride)
    }

    /**
     * Resolve `tag` for `state`, applying overrides and optional `$n` inserts.
     */
    get<Tag extends Tags>(state: EditorState, tag: Tag, ...insert: unknown[]) {
        let override = state.facet(phraseOverride).get(this)
        let phrase = (override && override[tag]) ?? this.phrases[tag]
        return formatPhrase(phrase, insert)
    }

    /**
     * Bind a single tag to a `(state, ...insert) => string` callback for
     * use as a stable label provider without repeating the tag at each call.
     */
    ref<Tag extends Tags>(tag: Tag): PhraseSet.Ref {
        return (state, ...insert) => this.get(state, tag, ...insert)
    }

    /** Extension that replaces every phrase in this set (all tags required). */
    translate(phrases: {[tag in Tags]: string}): EditorState.Extension {
        return phraseOverride.of({set: this, phrases})
    }

    /** Extension that overrides only the provided tags; others keep defaults. */
    translatePartial(phrases: {[tag in Tags]?: string}): EditorState.Extension {
        return phraseOverride.of({set: this, phrases: phrases as Record<string, string>})
    }
}

export namespace PhraseSet {
    /** Bound phrase getter: `(state, ...insert) => string`. */
    export type Ref = (state: EditorState, ...insert: unknown[]) => string

    /** Union of tag names for a given phrase set. */
    export type Tag<Set extends PhraseSet<any>> = Set extends PhraseSet<infer T> ? T : never
}
