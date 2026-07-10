/**
 * {@link EditorState} — immutable editor snapshot: document, selection,
 * configuration (fields/facets), and derived slot values.
 *
 * Updates go through {@link EditorState.update} → {@link Transaction}; apply
 * via `tr.state` / {@link EditorState.applyTransaction}. Dynamic fields and
 * facets are stored in addressable slots and computed on demand with cycle
 * detection (see `slot.ts`).
 */
import {Plot, Pos, SchemaError, ValidationError, type Schema} from "@arrisa/doc"
import {EditorSelection} from "../selection"
import {cursorAtStart, wordAt} from "../selection/motion"
import type {Transaction} from "../transaction"
import {resolveTransaction, asArray} from "../transaction/resolve"
import {Effect} from "../transaction/effect"
import {TextblockMap} from "../textblock"
import type {Extension as Extension_} from "./extension"
import type {DocSource, ReadDocOptions} from "./doc-source"
import {readDoc} from "./doc-source"
import {Field as Field_} from "./field"
import {Facet as Facet_} from "./facet"
import {
    Configuration as Configuration_,
    Compartment as Compartment_,
    prec as prec_,
} from "./configuration"
import {
    type Slot,
    type DynamicSlot,
    SlotStatus,
    ensureAddr,
    getAddr,
} from "./slot"
import {
    schemaElement as schemaElement_,
    readOnly as readOnly_,
    textLTR as textLTR_,
    textblockLTR as textblockLTR_,
    visualCursorMotion as visualCursorMotion_,
} from "./facets"
import {addValue} from "./ids"

export class EditorState {
    /** Replace the entire extension tree (new base config). */
    static reconfigure = Effect.define<Extension_>()
    /** Append extensions to the base config. */
    static appendConfig = Effect.define<Extension_>()
    readonly status: SlotStatus[]
    computeSlot: null | ((state: EditorState, slot: DynamicSlot) => SlotStatus)
    private resolvedSel: EditorSelection.Resolved | null = null
    /** When set, field/facet/`doc` access records dependencies into this list. */
    private trackAccess: Slot[] | null = null

    private constructor(
        readonly config: Configuration_,
        private _doc: Plot.Doc,
        private _selection: EditorSelection,
        readonly values: any[],
        computeSlot: (state: EditorState, slot: DynamicSlot) => SlotStatus,
        tr: Transaction | null,
    ) {
        this.status = config.statusTemplate.slice()
        this.computeSlot = computeSlot
        // Attach this state to the transaction that produced it (lazy apply path).
        if (tr) tr._state = this
        for (let i = 0; i < this.config.dynamicSlots.length; i++) ensureAddr(this, i << 1)
        this.computeSlot = null
    }

    get doc() {
        if (this.trackAccess) addValue(this.trackAccess, "doc")
        return this._doc
    }

    get schema() {
        if (this.trackAccess) addValue(this.trackAccess, "schema")
        return this._doc.schema
    }

    get selection() {
        if (this.trackAccess) addValue(this.trackAccess, "selection")
        return this._selection
    }

    /** Selection resolved against the current document (cached). */
    get sel() {
        return this.resolvedSel || (this.resolvedSel = this.selection.resolve(this.doc))
    }

    get readOnly() {
        return this.facet(readOnly_)
    }

    get textLTR() {
        return this.config.textLTR
    }

    static create(spec: EditorState.Spec): EditorState {
        let config =
            spec.config instanceof Configuration_
                ? spec.config
                : Configuration_.resolve(spec.config || [], new Map())
        let schema: Schema | null = config.schema
        if (!schema) {
            if (spec.doc instanceof Plot.Doc) schema = spec.doc.schema
            else throw new SchemaError(`No document plot provided, unable to create schema`)
        }
        let readOpts: ReadDocOptions | undefined
        if (spec.sanitizeHTML || spec.trustedHTMLPolicy)
            readOpts = {sanitizeHTML: spec.sanitizeHTML, trustedHTMLPolicy: spec.trustedHTMLPolicy}
        let doc = readDoc(schema, spec.doc, readOpts)
        let selection = !spec.selection
            ? cursorAtStart({doc, config})
            : typeof spec.selection == "function"
              ? spec.selection({doc, config})
              : spec.selection instanceof EditorSelection
                ? spec.selection
                : EditorSelection.Text.create(spec.selection)
        return EditorState.fromConfig(config, doc, selection)
    }

    static fromJSON(
        json: any,
        extensions: Extension_,
        fields?: {[prop: string]: Field_<any>},
    ): EditorState {
        if (!json) throw new ValidationError("Invalid JSON representation for EditorState")
        let fieldInit = []
        if (fields)
            for (let prop in fields) {
                if (Object.prototype.hasOwnProperty.call(json, prop)) {
                    let field = fields[prop],
                        value = json[prop]
                    fieldInit.push(field.init((state) => field.spec.fromJSON!(value, state)))
                }
            }
        let config = Configuration_.create([extensions, fieldInit])
        let schema = config.schema
        if (!schema) throw new SchemaError("No document plot provided to EditorState.fromJSON")
        let doc = schema.docFromJSON(json.doc)
        return EditorState.fromConfig(config, doc, EditorSelection.fromJSON({config, doc}, json.selection))
    }

    static fromConfig(config: Configuration_, doc: Plot.Doc, selection: EditorSelection) {
        selection.check(config, doc)
        return new EditorState(
            config,
            doc,
            selection,
            config.dynamicSlots.map(() => null),
            (state, slot) => slot.create(state),
            null,
        )
    }

    field<T>(field: Field_<T>): T

    field<T>(field: Field_<T>, require: false): T | undefined

    field<T>(field: Field_<T>, require: boolean = true): T | undefined {
        let addr = this.config.address[field.id]
        if (addr == null) {
            if (require) throw new RangeError("Field is not present in this state")
            return undefined
        }
        let track = this.trackAccess
        if (track) {
            addValue(track, field)
            // Avoid recording nested deps of the field create/update itself.
            track = null
        }
        ensureAddr(this, addr)
        if (track) this.trackAccess = track
        return getAddr(this, addr)
    }

    facet<Output>(facet: Facet_.Reader<Output>): Output {
        if (this.trackAccess) addValue(this.trackAccess, facet)
        let addr = this.config.address[facet.id]
        if (addr == null) return facet.default
        ensureAddr(this, addr)
        return getAddr(this, addr)
    }

    /** Resolve a transaction spec against this state (does not apply it). */
    update(spec: Transaction.Spec): Transaction {
        return resolveTransaction(this, spec)
    }

    /**
     * Apply `tr`, handling reconfigure / compartment / appendConfig effects.
     * Stores the resulting state on `tr._state`.
     */
    applyTransaction(tr: Transaction) {
        let conf: Configuration_ | null = this.config,
            {base, compartments} = conf
        for (let effect of tr.effects) {
            if (effect.is(Compartment_.reconfigureCompartment)) {
                if (conf) {
                    compartments = new Map()
                    conf.compartments.forEach((val, key) => compartments!.set(key, val))
                    conf = null
                }
                compartments.set(effect.value.compartment, effect.value.extension)
            } else if (effect.is(EditorState.reconfigure)) {
                conf = null
                base = effect.value
            } else if (effect.is(EditorState.appendConfig)) {
                conf = null
                base = asArray(base).concat(effect.value)
            }
        }
        let startValues,
            doc = tr.newDoc
        if (!conf) {
            // Rebuild configuration; intermediate state reconfigures slots from `this`.
            conf = Configuration_.resolve(base, compartments, this)
            let intermediateState = new EditorState(
                conf,
                this.doc,
                this.selection,
                conf.dynamicSlots.map(() => null),
                (state, slot) => slot.reconfigure(state, this),
                null,
            )
            startValues = intermediateState.values
            if (conf.staticFacet(schemaElement_) != this.facet(schemaElement_)) {
                let schema = conf.schema
                if (schema) doc = schema.doc(doc.content)
            }
        } else {
            startValues = tr.startState.values.slice()
        }
        new EditorState(conf, doc, tr.newSelection, startValues, (state, slot) => slot.update(state, tr), tr)
    }

    /**
     * Run `f` while recording slot accesses into `slots` (for auto facet deps).
     * Restores the previous tracking list afterward.
     */
    recordAccess<T>(slots: Slot[] | null, f: (state: EditorState) => T): T {
        let prev = this.trackAccess
        this.trackAccess = slots
        let result = f(this)
        this.trackAccess = prev
        return result
    }

    textblockMap(node: Pos.Plot) {
        return TextblockMap.get(node.start, node.node, this.textblockLTR(node.node))
    }

    toJSON(fields?: {[prop: string]: Field_<any>}): any {
        let result: any = {
            doc: this.doc.toJSON(),
            selection: this.selection.toJSON(this),
        }
        if (fields)
            for (let prop in fields) {
                let value = fields[prop]
                if (value instanceof Field_ && this.config.address[value.id] != null)
                    result[prop] = value.spec.toJSON!(this.field(fields[prop]), this)
            }
        return result
    }

    textblockLTR(plot: Plot) {
        return this.config.textblockLTR(plot)
    }

    wordAt(pos: number, bias: -1 | 1 = 1) {
        return wordAt(this, pos, bias)
    }
}

export namespace EditorState {
    export interface Spec {
        doc?: DocSource
        selection?: EditorSelection | EditorSelection.Text.Spec | ((cx: EditorSelection.Context) => EditorSelection)
        config?: Extension_ | Configuration_
        /**
         * Sanitize HTML when `doc` is a string (before `innerHTML`). Plug a
         * library such as DOMPurify for untrusted sources.
         */
        sanitizeHTML?: (html: string) => string
        /**
         * Trusted Types policy for string docs. Arrisa never installs an
         * identity `createHTML` policy.
         */
        trustedHTMLPolicy?: import("./html-from-string").TrustedHTMLPolicy | null
    }

    export type Extension = Extension_
    // Class + nested namespace (Field.Spec, Facet.Reader, …)
    export import Field = Field_
    export import Facet = Facet_
    // Classes without nested namespace
    export const Configuration = Configuration_
    export type Configuration = Configuration_
    export const Compartment = Compartment_
    export type Compartment = Compartment_
    // Value members
    export const prec = prec_
    export const schemaElement = schemaElement_
    export const readOnly = readOnly_
    export const textLTR = textLTR_
    export const textblockLTR = textblockLTR_
    export const visualCursorMotion = visualCursorMotion_
}
