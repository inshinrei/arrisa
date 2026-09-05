/**
 * Clear-formatting toolbar button (chrome only).
 *
 * The command lives in `@arrisa/command`. This module registers a
 * {@link Menu.Button} under the inline group so hosts can install it without
 * the full {@link composeSchema} preset.
 */
import {clearFormatting, Menu} from "@arrisa/command"
import {phrases} from "@arrisa/phrases"

/** Strip stored or ranged marks. Parent {@link Menu.Group.inline}, rank 90. */
export const clearFormattingButton = Menu.Button.define({
    run: clearFormatting,
    label: {
        icon: "M22 70 70 22a8 8 0 0 1 12 0l8 8a8 8 0 0 1 0 12L42 90H22zM40 80l40-40",
    },
    description: phrases.ref("clear_formatting"),
    parent: Menu.Group.inline,
    rank: 90,
})
