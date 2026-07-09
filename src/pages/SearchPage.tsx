import { PageHeader } from '@/components/layout/PageHeader'
import { SearchPanel } from '@/components/search/SearchPanel'

export function SearchPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Search" />
      <div className="min-h-0 flex-1 p-3 sm:p-4">
        <SearchPanel />
      </div>
    </div>
  )
}
