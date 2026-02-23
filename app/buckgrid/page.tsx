import type { Metadata } from 'next'
import BuckGridProPage from '@/components/buckgrid/BuckGridProPage'

export const metadata: Metadata = {
  title: 'BuckGrid Pro — AI Habitat Consultant',
  description: 'Paint your property, lock the border, let Tony audit your land.',
}

export default function Page() {
  return <BuckGridProPage />
}
