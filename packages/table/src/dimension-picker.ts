/**
 * Insert-table dimension picker: interactive grid in the create-table submenu.
 */
import {Menu, type Arrisa} from "@arrisa/command"
import {ChangeSet, type Plot} from "@arrisa/doc"
import {Arrisa as Editor} from "@arrisa/editor"
import {tablePhrases} from "@arrisa/phrases"
import {EditorSelection} from "@arrisa/state"
import {Table, TableRow} from "@arrisa/types"
import {cellTag} from "./context"

const SVG = "http://www.w3.org/2000/svg"

const enum Grid {
    Size = 15,
    Margin = 4,
    Skip = Size + Margin,
    MaxW = 15,
    MaxH = 15,
}

/** Mouse/keyboard grid for choosing insert-table width × height. */
class DimensionPicker {
    dom: HTMLElement
    svg: SVGElement
    announce: HTMLElement
    width = 2
    height = 2
    gridWidth = 6
    gridHeight = 4
    ltr: boolean

    constructor(
        readonly editor: Arrisa,
        readonly finish: (width: number, height: number) => void,
    ) {
        this.dom = document.createElement("div")
        this.dom.className = "arrisa-dimension-picker"
        this.announce = this.dom.appendChild(document.createElement("div"))
        this.announce.className = "arrisa-dimension-announce"
        this.announce.setAttribute("aria-live", "polite")
        this.svg = this.dom.appendChild(document.createElementNS(SVG, "svg"))
        this.svg.setAttribute("aria-hidden", "true")
        this.ltr = editor.state.textLTR
        this.render()
        this.dom.addEventListener("mousemove", (e) => {
            let rect = this.svg.getBoundingClientRect()
            let xOff = this.ltr ? e.clientX - Grid.Margin - rect.left : rect.right - Grid.Margin - e.clientX
            let yOff = e.clientY - Grid.Margin - rect.top
            let x = Math.max(0, Math.floor(xOff / Grid.Skip)),
                y = Math.max(0, Math.floor(yOff / Grid.Skip))
            this.setSize(x + 1, y + 1)
        })
        this.dom.addEventListener("mousedown", (e) => {
            if (e.button == 0) {
                e.preventDefault()
                this.finish(this.width, this.height)
            }
        })
        this.dom.addEventListener("keydown", (e) => {
            if (e.key == (this.ltr ? "ArrowLeft" : "ArrowRight") && this.width > 1) {
                this.setSize(this.width - 1, this.height)
            } else if (e.key == (this.ltr ? "ArrowRight" : "ArrowLeft") && this.width < Grid.MaxW) {
                this.setSize(this.width + 1, this.height)
            } else if (e.key == "ArrowUp" && this.height > 1) {
                this.setSize(this.width, this.height - 1)
            } else if (e.key == "ArrowDown" && this.height < Grid.MaxH) {
                this.setSize(this.width, this.height + 1)
            } else if (e.key == " " || e.key == "Enter") {
                this.finish(this.width, this.height)
            } else {
                return
            }
            e.preventDefault()
        })
    }

    render() {
        this.dom.setAttribute(
            "aria-label",
            tablePhrases.get(this.editor.state, "dimensions_title", this.width, this.height),
        )
        this.announce.textContent = tablePhrases.get(this.editor.state, "dimensions_live", this.width, this.height)
        this.svg.textContent = ""
        let width = this.gridWidth * Grid.Skip + Grid.Margin
        this.svg.setAttribute("width", String(width))
        this.svg.setAttribute("height", String(this.gridHeight * Grid.Skip + Grid.Margin))
        for (let y = 0; y < this.gridHeight; y++)
            for (let x = 0; x < this.gridWidth; x++) {
                let rect = this.svg.appendChild(document.createElementNS(SVG, "rect"))
                rect.setAttribute("width", String(Grid.Size))
                rect.setAttribute("height", String(Grid.Size))
                rect.setAttribute("x", String(this.ltr ? x * Grid.Skip + Grid.Margin : width - (x + 1) * Grid.Skip))
                rect.setAttribute("y", String(y * Grid.Skip + Grid.Margin))
                rect.setAttribute(
                    "class",
                    "arrisa-dimension-cell" + (x < this.width && y < this.height ? " arrisa-dimension-cell-active" : ""),
                )
            }
    }

    setSize(width: number, height: number) {
        if (width == this.width && height == this.height) return
        this.width = Math.min(Grid.MaxW, width)
        this.height = Math.min(Grid.MaxH, height)
        if (this.gridWidth <= this.width) this.gridWidth = Math.min(Grid.MaxW, this.width + 1)
        if (this.gridHeight <= this.height) this.gridHeight = Math.min(Grid.MaxH, this.height + 1)
        this.render()
    }
}

/** Replace the current selection range with a `width` × `height` empty table. */
function insertTable(editor: Arrisa, width: number, height: number) {
    let {state} = editor,
        {schema} = state.doc
    let cellNode = schema.createAndFill(cellTag(schema)) as Plot,
        cells: Plot[] = []
    for (let i = 0; i < width; i++) cells.push(cellNode)
    let row = TableRow.create(cells),
        rows: Plot[] = []
    for (let i = 0; i < height; i++) rows.push(row)
    let table = Table.create(rows),
        {from, to} = state.selection.replacementRange
    let changes = ChangeSet.create(state.doc, {from, to, insert: [table], fit: true})
    let tablePos = changes.findInserted((tag) => tag.type == Table.type)
    editor.dispatch({
        changes,
        selection: (cx) => EditorSelection.near(cx, tablePos == null ? from : tablePos + 3, 1),
        userEvent: "insert.table",
    })
}

/** Menu custom control hosting the dimension grid. */
export const dimensionPicker = Menu.CustomControl.define({
    render(editor, done) {
        return new DimensionPicker(editor, (width, height) => {
            done()
            insertTable(editor, width, height)
            ;(editor as Editor).focus()
        })
    },
})
