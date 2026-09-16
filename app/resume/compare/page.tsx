'use client'

import dynamic from 'next/dynamic'
const DealerComparison = dynamic(() => import('@/components/resume/dealer-comparison'), { ssr: false })
export default function ComparisonPage() { return <DealerComparison /> }
