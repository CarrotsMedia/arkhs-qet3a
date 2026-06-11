function ProductCardSkeleton() {
  return (
    <div className="flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
      {/* Image Skeleton */}
      <div className="relative aspect-square bg-gradient-to-b from-gray-100 to-gray-50 border-b border-gray-100" />
      {/* Content Skeleton */}
      <div className="flex-1 flex flex-col p-3.5 gap-2.5">
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-14 bg-gray-100 rounded-md" />
          <div className="h-4 w-10 bg-gray-100 rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
        </div>
        <div className="mt-auto pt-2.5 border-t border-gray-100 flex justify-between items-center">
          <div className="space-y-1 w-2/3">
            <div className="h-3 bg-gray-50 rounded w-1/2" />
            <div className="h-5 bg-gray-100 rounded w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50/50 pb-16 font-sans" dir="rtl">
      {/* Header skeleton */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl animate-pulse" />
              <div className="space-y-2">
                <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
            <div className="h-9 w-16 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-9 w-28 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-9 w-32 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>

      {/* Product grid skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
