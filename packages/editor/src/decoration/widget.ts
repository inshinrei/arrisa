/**
 * Inline DOM widgets embedded in the editor (non-editable by default).
 * Types own render/eq/lifecycle; instances pair a type with a parameter value.
 */
import type {Arrisa} from "../editor"

export class Widget<Param = unknown> {
    readonly type: Widget.Type<unknown extends Param ? any : Param>

    private constructor(
        type: Widget.Type<Param>,

        readonly value: Param,
    ) {
        this.type = type as any
    }

    get hasContent() {
        return false
    }

    static new<Param>(type: Widget.Type<Param>, value: Param) {
        return new Widget(type, value)
    }

    static define<Param>(spec: Widget.Spec<Param>) {
        return Widget.Type.new(spec)
    }

    static create(spec: Widget.Spec<null>) {
        return Widget.Type.new<null>(spec).of(null)
    }

    eq(other: any) {
        return other instanceof Widget && other.type == this.type && this.type.eq(this.value as any, other.value)
    }
}

export namespace Widget {
    export type Spec<Param> = {
        render: (value: Param) => Element | Text

        eq?: (a: Param, b: Param) => boolean

        connect?: (value: Param, dom: Element | Text) => void

        disconnect?: (value: Param, dom: Element | Text) => void

        handleEvent?: (event: Event, editor: Arrisa) => boolean
    }

    export class Type<Param> {
        private constructor(
            readonly render: (value: Param) => Element | Text,

            readonly eq: (a: Param, b: Param) => boolean,

            readonly handleEvent: (event: Event, editor: Arrisa) => boolean,

            readonly connect: ((value: Param, dom: Element | Text) => void) | null,

            readonly disconnect: ((value: Param, dom: Element | Text) => void) | null,
        ) {}

        static new<Param>(spec: Widget.Spec<Param>) {
            return new Type(
                spec.render,
                spec.eq || ((a, b) => a === b),
                spec.handleEvent || (() => false),
                spec.connect ?? null,
                spec.disconnect ?? null,
            )
        }

        of(value: Param) {
            return Widget.new(this, value)
        }
    }

    export const Text = Widget.define<string>({
        render: (s) => document.createTextNode(s),
    })

    export const EditableText = Widget.define<string>({
        render: (s) => document.createTextNode(s),
    })
}
