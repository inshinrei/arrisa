/// Options passed to {@link Arrisa.scrollIntoView}.
export type ScrollSpec = {
    /// By default (`"nearest"`) the position will be vertically
    /// scrolled only the minimal amount required to move the given
    /// position into view. You can set this to `"start"` to move it
    /// to the top of the editor, `"end"` to move it to the bottom, or
    /// `"center"` to move it to the center.
    y?: "nearest" | "start" | "end" | "center"
    /// Effect similar to `y`, but for the horizontal scroll position.
    x?: "nearest" | "start" | "end" | "center"
    /// Extra vertical distance to add when moving something into
    /// view. Not used with the `"center"` strategy. Defaults to 5.
    /// Must be less than the height of the editor.
    yMargin?: number
    /// Extra horizontal distance to add. Not used with the `"center"`
    /// strategy. Defaults to 5. Must be less than the width of the
    /// editor.
    xMargin?: number
}
