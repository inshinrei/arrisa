/**
 * Typed metadata tags attached to a {@link Transaction}.
 *
 * Annotations never affect document content; they label intent for history,
 * remote sync, user-event routing, etc. Identity is by {@link Annotation.Type}
 * instance (define once, reuse).
 */
export class Annotation<T> {
    declare private _isAnnotation: true

    constructor(
        readonly type: Annotation.Type<T>,
        readonly value: T,
    ) {}

    /** Narrow by annotation type (mirrors {@link Effect.is}). */
    is<T>(type: Annotation.Type<T>): this is Annotation<T> {
        return this.type == (type as any)
    }

    /** Define a new annotation type (unique object identity). */
    static define<T>() {
        return new Annotation.Type<T>()
    }
}

export namespace Annotation {
    export class Type<T> {
        of(value: T): Annotation<T> {
            return new Annotation(this, value)
        }
    }
}

/** Wall-clock ms when the transaction was created (auto-added if missing). */
export const time = Annotation.define<number>()
/** Dotted user-event name, e.g. `"input.type"` or `"delete.backward"`. */
export const userEvent = Annotation.define<string>()
/** When false, history plugins should not record this transaction. */
export const addToHistory = Annotation.define<boolean>()
/** Remote/collaborative origin — local correctors often skip these. */
export const remote = Annotation.define<boolean>()
/** Marked on transactions produced by {@link Transaction.append}. */
export const appended = Annotation.define<boolean>()
