"use client"

/**
 * Reown (WalletConnect) needs a public project id and your dev origin on the allowlist.
 * @see https://cloud.reown.com
 */
export function WalletConnectSetupNote() {
  const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? ""
  const hasId = id.length > 0

  return (
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 p-4 text-[13px] text-amber-950/95 leading-relaxed space-y-3">
      <p className="font-medium text-amber-950">WalletConnect (Reown) — local dev</p>
      {!hasId ? (
        <p>
          Set{" "}
          <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px]">
            NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
          </code>{" "}
          in <code className="font-mono text-[11px]">.env.local</code>, then restart{" "}
          <code className="font-mono text-[11px]">npm run dev</code>. Create a project at{" "}
          <a
            href="https://cloud.reown.com"
            target="_blank"
            rel="noreferrer"
            className="underline text-amber-900"
          >
            cloud.reown.com
          </a>{" "}
          and copy the Project ID.
        </p>
      ) : null}
      <p>
        In the Reown project settings, add <strong>Allowed domains</strong> for this app — for example{" "}
        <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px]">http://localhost:3000</code>{" "}
        (include scheme and port). If the origin is missing, the browser shows{" "}
        <em>Origin not found on Allowlist</em> and config requests may return <em>403</em>.
      </p>
    </div>
  )
}
