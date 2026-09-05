/**
 * Editor theming: CSS class facets, light/dark base IDs, and the base
 * stylesheet for scroller/content/cursor/panels/dialogs.
 *
 * Theme modules are built with {@link buildTheme}, which rewrites `&` and
 * scoped selectors (`&light` / `&dark`) against unique class names from
 * {@link StyleModule.newName}.
 */
import {EditorState} from "@arrisa/state"
import {StyleModule, type StyleSpec} from "../style-mod"

/** Extra theme class names joined onto the editor root (combine: space-join). */
export const theme = EditorState.Facet.define<string, string>({combine: (strs) => strs.join(" ")})

/** Preferred color scheme (combine: first value, default `"light"`). */
export const colorScheme = EditorState.Facet.define<"dark" | "light" | "auto", "dark" | "light" | "auto">({
    combine: (values) => (values.length ? values[0] : "light"),
})

/** Unique class IDs for the base theme and light/dark scheme scopes. */
export const styleID = StyleModule.newName(),
    baseLightID = StyleModule.newName(),
    baseDarkID = StyleModule.newName()

/** Selector scopes passed to {@link buildTheme} for `&light` / `&dark`. */
export const lightDarkIDs = {"&light": "." + baseLightID, "&dark": "." + baseDarkID}

/**
 * Compile a style spec into a {@link StyleModule} scoped under `main`.
 * Selectors containing `&` expand `&` to `main` and named scopes via `scopes`;
 * other selectors are prefixed with `main `.
 */
export function buildTheme(main: string, spec: {[name: string]: StyleSpec}, scopes?: {[name: string]: string}) {
    return new StyleModule(spec, {
        finish(sel) {
            return /&/.test(sel)
                ? sel.replace(/&\w*/, (m) => {
                      if (m == "&") return main
                      if (!scopes || !scopes[m]) throw new RangeError(`Unsupported selector: ${m}`)
                      return scopes[m]
                  })
                : main + " " + sel
        },
    })
}

/** Default editor chrome styles (scroller, content, cursor, panels, dialogs). */
export const baseStyles = buildTheme(
    "." + styleID,
    {
        "&": {
            "--arrisa-highlight-color": "#6af",
            "--arrisa-dialog-font": "90% sans-serif",
            position: "relative",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            border: "1px solid var(--arrisa-border-color)",
        },

        "&:has(arrisa-content:focus)": {
            outline: "1px solid var(--arrisa-highlight-color)",

            "& > arrisa-scroller > arrisa-cursor-layer": {
                animation: "steps(1) arrisa-blink 1.2s infinite",
            },

            "& > arrisa-scroller > arrisa-cursor-layer arrisa-cursor": {
                display: "block",
            },
        },

        "&light": {
            "--arrisa-panel-color": "white",
            "--arrisa-border-color": "#cacacb",
        },
        "&dark": {
            "--arrisa-panel-color": "#030303",
            "--arrisa-border-color": "#444",
        },

        "arrisa-scroller": {
            display: "block",
            height: "100%",
            overflowX: "auto",
            position: "relative",
            zIndex: 0,
        },

        "arrisa-content": {
            display: "block",
            margin: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            boxSizing: "border-box",
            minHeight: "100%",
            padding: "4px 12px",
            outline: "none",
            caretColor: "transparent",
        },

        "arrisa-cursor-layer": {
            display: "block",
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            contain: "style",
            "& > *": {
                position: "absolute",
            },
            pointerEvents: "none",
            zIndex: 150,
        },

        "@keyframes arrisa-blink": {"0%": {}, "50%": {opacity: 0}, "100%": {}},
        "@keyframes arrisa-blink2": {"0%": {}, "50%": {opacity: 0}, "100%": {}},

        "arrisa-cursor": {
            pointerEvents: "none",
            display: "none",
        },
        ".arrisa-cursor-v": {
            borderLeft: "1.8px solid currentColor",
            marginLeft: "-0.9px",
        },
        ".arrisa-cursor-h": {
            borderTop: "1.8px solid currentColor",
            marginTop: "-0.9px",
        },
        ".arrisa-selected-node": {
            outline: "2px solid #68f",
            "&::selection, & *::selection": {
                backgroundColor: "transparent",
            },
        },

        "arrisa-placeholder": {
            opacity: "0.6",
            // Zero layout width so the caret sits on top of the hint text
            // (typed characters replace the visual placeholder instead of
            // appearing to the left of it).
            display: "inline-block",
            width: "0",
            overflow: "visible",
            whiteSpace: "nowrap",
            verticalAlign: "top",
            userSelect: "none",
            // Clicks should target the empty textblock, not the widget.
            pointerEvents: "none",
        },

        "arrisa-dropcursor": {
            pointerEvents: "none",
            position: "absolute",
            "&.arrisa-vertical": {
                borderLeft: "1.2px solid black",
                marginLeft: "-0.6px",
            },
            "&.arrisa-horizontal": {
                borderTop: "1.2px solid black",
                marginTop: "-0.6px",
            },
        },

        "arrisa-announced": {
            position: "fixed",
            top: "-10000px",
        },
        "@media print": {
            "arrisa-announced": {display: "none"},
        },

        "arrisa-panels": {
            display: "block",
            boxSizing: "border-box",
            position: "sticky",
            left: 0,
            right: 0,
            zIndex: 300,
            backgroundColor: "var(--arrisa-panel-color)",
            font: "var(--arrisa-dialog-font)",
        },
        ".arrisa-panels-top": {top: "0"},
        ".arrisa-panels-bottom": {bottom: "0"},

        "arrisa-dialog": {
            display: "block",
            padding: "5px 19px 5px 6px",
            position: "relative",
            "& label, & .arrisa-label": {
                fontSize: "90%",
            },
            borderBottom: "1px solid var(--arrisa-border-color)",
        },
        ".arrisa-dialog-close": {
            position: "absolute",
            top: "3px",
            right: "4px",
            backgroundColor: "inherit",
            border: "none",
            font: "inherit",
            fontSize: "14px",
            padding: "0",
        },
        ".arrisa-dialog-button": {
            color: "inherit",
            padding: "3px 9px",
            border: "none",
            borderRadius: "3px",
        },
        "&light .arrisa-dialog-button": {
            backgroundColor: "#eaeaea",
            "&:active": {
                backgroundColor: "#ddd",
            },
        },
        "&dark .arrisa-dialog-button": {
            backgroundColor: "#333",
            "&:active": {
                backgroundColor: "#222",
            },
        },
    },
    lightDarkIDs,
)
