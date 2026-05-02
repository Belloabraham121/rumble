import "server-only"

import { isEmbeddedWalletLinkedAccount } from "@privy-io/node"
import type { User } from "@privy-io/node"

export function pickEthereumEmbeddedWallet(user: User) {
  for (const acc of user.linked_accounts) {
    if (
      isEmbeddedWalletLinkedAccount(acc) &&
      acc.chain_type === "ethereum" &&
      acc.connector_type === "embedded"
    ) {
      return acc
    }
  }
  return null
}
