/**
 * Plugin facet and runtime instances. Plugins that throw are deactivated so
 * a single bad extension cannot take down the editor loop.
 */
import type {Arrisa} from "./arrisa"
import {editorPlugin, type Plugin} from "./plugin-api"
import type {Update} from "./update"
import {logException} from "../util"

export {editorPlugin}

export class PluginInstance {
    /**
     * When starting an update, all plugins have this set to the update
     * object. When finished updating, it is set to `null`. Retrieving a
     * plugin via `editor.plugin` forces an eager update if still pending.
     */
    mustUpdate: Update | null = null
    /** Null until the first successful {@link update} creates the value. */
    value: Plugin.Value | null = null
    /** Set after a crash; the plugin no longer runs. */
    deactivated = false

    constructor(public spec: Plugin<any>) {}

    update(editor: Arrisa) {
        if (!this.value) {
            if (!this.deactivated) {
                try {
                    this.value = this.spec.create(editor)
                } catch (e) {
                    logException(editor.state, e, "Arrisa plugin crashed")
                    this.deactivate(null)
                }
            }
        } else if (this.mustUpdate) {
            let update = this.mustUpdate
            this.mustUpdate = null
            if (this.value.update) {
                try {
                    this.value.update(update)
                } catch (e) {
                    logException(update.state, e, "Arrisa plugin crashed")
                    if (editor.connected && this.value.disconnect)
                        try {
                            this.value.disconnect(editor)
                        } catch {}
                    this.deactivate(editor)
                }
            }
        }
        return this
    }

    docUpdate(editor: Arrisa) {
        if (this.value?.docUpdate) {
            try {
                this.value.docUpdate(editor)
            } catch (e) {
                logException(editor.state, e, "doc update listener")
            }
        }
    }

    connect(editor: Arrisa) {
        if (this.value?.connect) {
            try {
                this.value.connect(editor)
            } catch (e) {
                logException(editor.state, e, "Arrisa plugin crashed")
                this.deactivate(editor)
            }
        }
    }

    disconnect(editor: Arrisa) {
        if (!this.value?.disconnect) return
        try {
            this.value.disconnect(editor)
        } catch (e) {
            logException(editor.state, e, "Arrisa plugin crashed")
            this.deactivate(editor)
        }
    }

    remove(editor: Arrisa) {
        if (editor.connected) this.disconnect(editor)
        if (this.value?.remove)
            try {
                this.value.remove(editor)
            } catch (e) {
                logException(editor.state, e, "Arrisa plugin crashed")
            }
    }

    deactivate(remove: Arrisa | null) {
        if (remove && this.value?.remove)
            try {
                this.value.remove(remove)
            } catch {}
        this.deactivated = true
        this.value = null
    }
}
