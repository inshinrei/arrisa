/**
 * @arrisa/editor — view layer: DOM rendering, input, decorations, and UI chrome.
 *
 * Layering: util/browser/style-mod → dom → decoration → tile → input → editor → extensions.
 */
export {Arrisa} from "./editor"

export {KeyBinding} from "./key-map"

export {Decoration, Widget, PointSet, RangeSet} from "./decoration"
export {Panel} from "./panel"
export {menuBar, type MenuBarConfig} from "./menu-bar"
export {floatingMenu, defaultFloatingWhen, type FloatingMenuConfig} from "./floating-menu"
export {Dialog} from "./dialog"

export {Tooltip} from "./tooltip"

export {InputRule} from "./input-rule"

export {placeholder} from "./placeholder"

export {dropCursor} from "./drop-cursor"
