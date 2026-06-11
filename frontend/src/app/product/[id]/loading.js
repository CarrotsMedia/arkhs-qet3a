export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 pt-8 pb-16 font-sans" dir="rtl">
      <div className="container mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8">
            
            {/* Image Gallery Skeleton */}
            <div className="space-y-4">
              <div className="aspect-square bg-gray-100 rounded-xl border border-gray-200 p-8 flex items-center justify-center relative animate-pulse">
                {/* Center loading placeholder */}
                <div className="w-1/4 h-1/4 bg-gray-200 rounded-lg" />
              </div>
            </div>

            {/* Product Info Skeleton */}
            <div className="flex flex-col space-y-6">
              <div className="flex items-center gap-2">
                {/* Brand Pill Skeleton */}
                <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
                {/* Rating Skeleton */}
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
              </div>

              {/* Title Skeleton */}
              <div className="space-y-2">
                <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse" />
                <div className="h-8 bg-gray-200 rounded w-1/2 animate-pulse" />
              </div>

              {/* Price Skeleton */}
              <div>
                <div className="h-4 w-16 bg-gray-250 rounded mb-2 animate-pulse" />
                <div className="h-10 w-44 bg-gray-200 rounded animate-pulse" />
              </div>

              {/* Offers Table Skeleton */}
              <div className="border border-gray-200 rounded-xl overflow-hidden mt-6 animate-pulse">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 h-12 flex items-center">
                  <div className="h-5 w-48 bg-gray-200 rounded" />
                </div>
                <div className="divide-y divide-gray-200 bg-white">
                  {[...Array(3)].map((_, idx) => (
                    <div key={idx} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4 w-full">
                        <div className="w-12 h-12 bg-gray-100 border border-gray-200 rounded-lg flex-shrink-0" />
                        <div className="space-y-2 w-1/3">
                          <div className="h-5 bg-gray-200 rounded w-3/4" />
                          <div className="h-4 bg-gray-200 rounded w-1/2" />
                        </div>
                      </div>
                      <div className="w-28 h-10 bg-gray-200 rounded-lg flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
