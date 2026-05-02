"use client"

import { Suspense } from "react"
import { SignInForm } from "./sign-in-form"

function FormFallback() {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-10 max-w-md w-full min-h-[420px] animate-pulse" />
  )
}

export function SignInFormWithSuspense() {
  return (
    <Suspense fallback={<FormFallback />}>
      <SignInForm />
    </Suspense>
  )
}
