import {ValidationError} from "../util/error"
import {validate} from "../util/utils"
import {Mark} from "../model/mark"
import {Node, Plot} from "../model/node"
import type {Schema} from "../schema/schema"
import {Slice, Token} from "../model/slice"

/** Mark add/remove applied over a preserved section of a change set. */
export type Modification = {add: Mark} | {remove: Mark}

export type ModificationJSON = {add: string; value: any} | {remove: string; value: any}

export function isAdd(m: Modification): m is {add: Mark} {
    return "add" in m
}
export function isRemove(m: Modification): m is {remove: Mark} {
    return "remove" in m
}

export function applyModifications(modifications: readonly Modification[], marks: Mark.Set, _type: Node.Type) {
    for (let m of modifications) {
        if (isAdd(m)) {
            marks = m.add.addToSet(marks)
        } else {
            marks = m.remove.removeFromSet(marks)
        }
    }
    return marks
}

export function modificationToJSON(m: Modification): ModificationJSON {
    return isAdd(m) ? {add: m.add.name, value: m.add.value} : {remove: m.remove.name, value: m.remove.value}
}

export function modificationFromJSON(schema: Schema, json: ModificationJSON): Modification {
    let {add, remove} = json as {add?: string; remove?: string}
    if (typeof add == "string" || typeof remove == "string") {
        let mark = schema.getMark((add || remove)!)
        if (!mark) throw new ValidationError(`Unknown mark ${add || remove}`)
        let value = mark.of(validate(mark.spec.validate, (json as any).value))
        return add ? {add: value} : {remove: value}
    }
    throw new ValidationError("Invalid modification JSON")
}

export function compareModifications(a: readonly Modification[], b: readonly Modification[]) {
    if (a == b) return true
    if (a.length != b.length) return false
    for (let i = 0; i < a.length; i++) if (!compareModification(a[i], b[i])) return false
    return true
}

export function compareModification(a: Modification, b: Modification) {
    return isAdd(a) ? isAdd(b) && a.add.eq(b.add) : isRemove(b) && a.remove.eq(b.remove)
}

export function combineMods(
    a: null | readonly Modification[],
    b: null | readonly Modification[],
): null | readonly Modification[] {
    return !a ? b : !b ? a : a.concat(b)
}

export function filterMods(mods: null | readonly Modification[], against: null | readonly Modification[]) {
    if (!mods || !against) return mods
    return mods.filter((m) => !against!.some((a) => modCancels(a, m)))
}

export function modCancels(mod: Modification, other: Modification) {
    if (isAdd(other)) {
        return isAdd(mod) ? mod.add.type == other.add.type && !mod.add.type.set : mod.remove.eq(other.add)
    } else {
        return isAdd(mod) && mod.add.eq(other.remove)
    }
}

export function invertMods(mods: readonly Modification[], target: Node.Tag): readonly Modification[] {
    return mods.map((mod) => {
        if (isRemove(mod)) return {add: mod.remove}
        if (!mod.add.type.set) {
            let existed = mod.add.type.isInSet(target.marks)
            if (existed) return {add: existed}
        }
        return {remove: mod.add}
    })
}

export function applyModsToSlice(slice: Slice, mods: readonly Modification[] | null) {
    if (!mods) return slice
    let content: Token[] = []
    for (let tok of slice.content) {
        if (tok.tokenType == Token.Type.Open) {
            content.push((tok as Plot.Tag).withMarks(applyModifications(mods, (tok as Plot.Tag).marks, (tok as Plot.Tag).type)))
        } else if (tok.tokenType == Token.Type.Node) {
            let node = (tok as Node).withMarks(applyModifications(mods, (tok as Node).marks, (tok as Node).type))
            if (content.length && content[content.length - 1].tokenType == Token.Type.Node)
                node.pushTo(content as Plot[])
            else content.push(node)
        } else {
            content.push(tok)
        }
    }
    return Slice.of(content)
}
