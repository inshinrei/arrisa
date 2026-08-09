/**
 * Install Transaction.extender / appender once Facet is fully initialized.
 * Called from the transaction barrel and the package entry (idempotent).
 */
import {Facet} from "../state/facet"
import {Transaction} from "./transaction"

let installed = false

export function installTransactionFacets() {
    if (installed) return
    installed = true
    Transaction.extender = Facet.define()
    Transaction.appender = Facet.define()
}
