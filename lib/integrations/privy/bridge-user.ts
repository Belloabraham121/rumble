import "server-only"

import { NotFoundError } from "@privy-io/node"
import type { User } from "@privy-io/node"
import { updateUserPrivyBridge } from "@/lib/db/users.repo"
import { pickEthereumEmbeddedWallet } from "@/lib/integrations/privy/embedded-wallet"
import { getPrivyServerClient } from "@/lib/integrations/privy/server-client"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

function buildWalletCreationInputs(): Array<{ chain_type: "ethereum"; policy_ids?: string[] }> {
  const ids = getRomboServerEnv().privyDefaultPolicyIds
  const policyId = ids[0]
  return [{ chain_type: "ethereum", ...(policyId ? { policy_ids: [policyId] } : {}) }]
}

/** Ensures a Privy user exists for this login email, embedded ETH wallet, and stores ids in Mongo when configured. */
export async function syncPrivyUserAfterLogin(input: {
  email: string
  romboUserIdHex?: string
}): Promise<void> {
  const client = getPrivyServerClient()
  if (!client) return

  const email = input.email.trim().toLowerCase()
  let privyUser: User

  try {
    privyUser = await client.users().getByEmailAddress({ address: email })
  } catch (e) {
    if (e instanceof NotFoundError) {
      privyUser = await client.users().create({
        linked_accounts: [{ type: "email", address: email }],
        custom_metadata: input.romboUserIdHex ? { rombo_user_id: input.romboUserIdHex } : undefined,
        wallets: buildWalletCreationInputs(),
      })
    } else {
      console.error("[privy] getByEmailAddress failed:", e)
      return
    }
  }

  let refreshed = privyUser

  if (!pickEthereumEmbeddedWallet(refreshed)) {
    try {
      refreshed = await client.users().pregenerateWallets(refreshed.id, {
        wallets: buildWalletCreationInputs(),
      })
    } catch (e) {
      console.error("[privy] pregenerateWallets failed:", e)
    }
  }

  const embedded = pickEthereumEmbeddedWallet(refreshed)
  const embeddedWalletId = embedded?.id ?? undefined
  const embeddedAddress = embedded?.address

  if (input.romboUserIdHex) {
    try {
      await client.users().setCustomMetadata(refreshed.id, {
        custom_metadata: { rombo_user_id: input.romboUserIdHex },
      })
    } catch (e) {
      console.error("[privy] setCustomMetadata failed:", e)
    }
  }

  await updateUserPrivyBridge(email, {
    privyUserId: refreshed.id,
    privyEmbeddedWalletId: embeddedWalletId ?? undefined,
    privyEmbeddedWalletAddress: embeddedAddress,
  })
}
