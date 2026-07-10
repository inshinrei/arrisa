/**
 * Plugin definition API (define / fromClass / event bindings).
 * Runtime instances live in {@link ./plugin}.
 */
import {EditorState} from "@arrisa/state"
import {eventHandler, eventObserver} from "../input"
import type {Arrisa} from "./arrisa"
import type {Update} from "./update"

/** Facet that collects {@link Plugin} extensions into the editor. */
export const editorPlugin = EditorState.Facet.define<Plugin<Plugin.Value>>()

/// Plugins associate stateful values with an editor. They can be
/// useful for displaying interface elements, or keeping ephemeral
/// interface state.
export class Plugin<V extends Plugin.Value> {
    /// Instances of this class act as extensions.
    extension: EditorState.Extension

    private constructor(
        /// @internal
        readonly create: (editor: Arrisa) => V,
        buildExtensions: (plugin: Plugin<V>) => EditorState.Extension,
    ) {
        this.extension = buildExtensions(this)
    }

    /// Define a plugin from a constructor function that creates the
    /// plugin's value, given an editor.
    static define<V extends Plugin.Value>(
        create: (editor: Arrisa) => V,
        provide?: (plugin: Plugin<V>) => EditorState.Extension,
    ) {
        return new Plugin<V>(create, (plugin) => {
            let ext: EditorState.Extension[] = [editorPlugin.of(plugin)]
            if (provide) ext.push(provide(plugin))
            return ext
        })
    }

    /// Create a plugin for a class whose constructor takes an editor
    /// as only argument.
    static fromClass<V extends Plugin.Value>(
        cls: {new (editor: Arrisa): V},
        provide?: (plugin: Plugin<V>) => EditorState.Extension,
    ) {
        return Plugin.define((editor) => new cls(editor), provide)
    }

    /// Create an {@link Arrisa.domEventHandler event handler} for this
    /// plugin. Usually called from the plugin's `provide` function.
    eventHandler<Event extends keyof HTMLElementEventMap>(
        event: Event,
        handler: (event: HTMLElementEventMap[Event], editor: Arrisa, value: V) => boolean | void,
    ): EditorState.Extension {
        return eventHandler.of({
            event,
            handler: (event, editor) => {
                let value = editor.plugin(this)
                return value ? handler(event as HTMLElementEventMap[Event], editor, value) : false
            },
        })
    }

    /// Create an {@link Arrisa.domEventObserver event observer} for this
    /// plugin.
    eventObserver<Event extends keyof HTMLElementEventMap>(
        event: Event,
        observer: (event: HTMLElementEventMap[Event], editor: Arrisa, value: V) => void,
    ): EditorState.Extension {
        return eventObserver.of({
            event,
            observer: (event, editor) => {
                let value = editor.plugin(this)
                if (value) observer(event as HTMLElementEventMap[Event], editor, value)
            },
        })
    }
}

export namespace Plugin {
    /// This is the interface plugin objects must expose.
    export interface Value {
        /// Notifies the plugin of an update that happened in the
        /// editor. This is called _before_ the editor updates its own
        /// DOM. It is responsible for updating the plugin's internal
        /// state (including any state that may be read by plugin
        /// fields) and _writing_ to the DOM for the changes in the
        /// update. To avoid unnecessary layout recomputations, it
        /// should _not_ read the DOM layout—use {@link
        /// Arrisa.scheduleDOMRead} to schedule your
        /// code in a DOM reading phase if you need to.
        update?(update: Update): void

        /// When present, this will be called when an update causes any
        /// changes in the DOM representation of the document.
        docUpdate?(editor: Arrisa): void

        /// Called when the editor is attached to the DOM. If the plugin
        /// needs to allocate any resource that must be released, or modify
        /// something outside the editor, it should do it in this method,
        /// and make sure to release/undo it in its `disconnect` method.
        connect?(editor: Arrisa): void

        /// Called when the editor is removed from the DOM, or the
        /// plugin is removed from the editor.
        disconnect?(editor: Arrisa): void

        /// Called when the plugin is removed from an editor. This
        /// should clean up any changes it made to the editor itself. If
        /// the editor was connected to a document, {@link
        /// Arrisa.Plugin.Value.disconnect `disconnect`} will be called
        /// before this.
        remove?(editor: Arrisa): void
    }
}
