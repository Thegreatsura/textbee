import { redirect } from 'next/navigation'

// Account is a settings section with subroutes; Billing is the default view.
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) params.append(key, item)
    }
  }
  const query = params.toString()
  redirect(`/dashboard/account/billing${query ? `?${query}` : ''}`)
}
