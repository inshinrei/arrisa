import {describe, expect, it} from "vitest"
import {PluginInstance} from "./plugin"
import type {Arrisa} from "./arrisa"

/** Minimal Arrisa stub — PluginInstance only needs state + connected. */
function fakeEditor(connected = true): Arrisa {
    // Provide an exception sink so logException does not touch `window` in Node.
    return {
        state: {
            facet: () => [(_e: unknown) => {}],
        },
        connected,
    } as any
}

describe("PluginInstance", () => {
    it("creates the value on first update", () => {
        let created = 0
        let plugin = {
            create: () => {
                created++
                return {id: "v"}
            },
        } as unknown as Arrisa.Plugin<any>
        let inst = new PluginInstance(plugin)
        expect(inst.value).toBeNull()
        inst.update(fakeEditor())
        expect(created).toBe(1)
        expect(inst.value).toEqual({id: "v"})
        inst.update(fakeEditor())
        expect(created).toBe(1)
    })

    it("runs update when mustUpdate is set", () => {
        let updates = 0
        let plugin = {
            create: () => ({
                update() {
                    updates++
                },
            }),
        } as unknown as Arrisa.Plugin<any>
        let inst = new PluginInstance(plugin)
        let editor = fakeEditor()
        inst.update(editor)
        inst.mustUpdate = {state: editor.state} as Arrisa.Update
        inst.update(editor)
        expect(updates).toBe(1)
        expect(inst.mustUpdate).toBeNull()
    })

    it("deactivates on create crash", () => {
        let plugin = {
            create: () => {
                throw new Error("boom")
            },
        } as unknown as Arrisa.Plugin<any>
        let inst = new PluginInstance(plugin)
        let editor = fakeEditor()
        expect(() => inst.update(editor)).not.toThrow()
        expect(inst.deactivated).toBe(true)
        expect(inst.value).toBeNull()
        // further updates are no-ops
        inst.update(editor)
        expect(inst.value).toBeNull()
    })

    it("deactivates on update crash and calls disconnect when connected", () => {
        let disconnected = 0
        let plugin = {
            create: () => ({
                update() {
                    throw new Error("update fail")
                },
                disconnect() {
                    disconnected++
                },
            }),
        } as unknown as Arrisa.Plugin<any>
        let inst = new PluginInstance(plugin)
        let editor = fakeEditor(true)
        inst.update(editor)
        inst.mustUpdate = {state: editor.state} as Arrisa.Update
        inst.update(editor)
        expect(inst.deactivated).toBe(true)
        expect(disconnected).toBe(1)
        expect(inst.value).toBeNull()
    })

    it("connect / disconnect / remove call value hooks", () => {
        let log: string[] = []
        let plugin = {
            create: () => ({
                connect() {
                    log.push("connect")
                },
                disconnect() {
                    log.push("disconnect")
                },
                remove() {
                    log.push("remove")
                },
            }),
        } as unknown as Arrisa.Plugin<any>
        let inst = new PluginInstance(plugin)
        let editor = fakeEditor(true)
        inst.update(editor)
        inst.connect(editor)
        inst.disconnect(editor)
        inst.remove(editor)
        // remove also disconnects when connected
        expect(log).toEqual(["connect", "disconnect", "disconnect", "remove"])
    })
})
