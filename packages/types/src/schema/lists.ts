/**
 * List items and list containers (ordered / bullet).
 */
import {Plot, Node} from "@arrisa/doc"

const G = Node.Group

/** Block list item (`li`) holding block content. Defining boundary for list structure. */
export const ListItem = Plot.define("ListItem", {
    blockContent: G.Content,
    shape: {element: "li"},
    defining: true,
})

/**
 * Inline list item (`li`) holding only inline content.
 * Same type name as {@link ListItem}; choose based on desired item body shape.
 */
export const InlineListItem = Plot.define("ListItem", {
    inlineContent: true,
    shape: {element: "li"},
    defining: true,
})

/**
 * Ordered list (`ol`). Param is the start index (default `1`);
 * serialized as `start` only when not 1. Auto-joins when the next list starts at 1.
 */
export const OrderedList = Plot.Type.define("OrderedList", {
    defaultParam: 1,
    validate: "number",
    blockContent: [ListItem, InlineListItem],
    group: G.Content,
    role: Node.Role.List,
    defining: true,
    shape: {
        element: "ol",
        attributes: (start) => (start == 1 ? ({} as Record<string, string>) : {start: String(start)}),
        readElement: (elt) => Number(elt.getAttribute("start") || "1"),
    },
    autoJoin: (_a, b) => b.param == 1,
})

/** Bullet list (`ul`). Role {@link Node.Role.List}; adjacent lists auto-join. */
export const BulletList = Plot.define("BulletList", {
    blockContent: [ListItem, InlineListItem],
    group: G.Content,
    role: Node.Role.List,
    defining: true,
    shape: {element: "ul"},
    autoJoin: true,
})
