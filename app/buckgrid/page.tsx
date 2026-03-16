import type { Metadata } from 'next'
import BuckGridProPage from '@/components/buckgrid/BuckGridProPage'

export const metadata: Metadata = {
  title: 'BuckGrid Pro | Visual Habitat Planning For Whitetail Ground',
  description: 'Paint the property, lock the acreage, and get a ranked habitat plan from Tony. BuckGrid Pro turns satellite imagery into a sellable deer-ground strategy.',
}

export default function Page() {
  return <BuckGridProPage />
}
