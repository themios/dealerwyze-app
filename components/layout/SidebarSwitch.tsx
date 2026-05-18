'use client'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

// Both sidebars stay in the DOM so React never needs to remount RSC subtrees
// on client-side navigation. CSS display toggling is instant and reliable.
export default function SidebarSwitch({
  appSidebar,
  settingsSidebar,
}: {
  appSidebar: ReactNode
  settingsSidebar: ReactNode
}) {
  const pathname = usePathname()
  const inSettings = pathname.startsWith('/settings')

  return (
    <>
      <div className={inSettings ? 'hidden' : 'contents'}>{appSidebar}</div>
      <div className={inSettings ? 'contents' : 'hidden'}>{settingsSidebar}</div>
    </>
  )
}
