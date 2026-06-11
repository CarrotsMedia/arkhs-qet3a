"use client";

import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";

export default function Pagination({ currentPage, totalPages, totalItems, basePath, queryParams = {} }) {
  if (totalPages <= 1) return null;

  // Build URL with all query params
  const buildUrl = (page) => {
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params.set(key, value);
      }
    });
    params.set('page', page);
    return `${basePath}?${params.toString()}`;
  };

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      
      if (currentPage > 3) pages.push('...');
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) pages.push(i);
      
      if (currentPage < totalPages - 2) pages.push('...');
      
      pages.push(totalPages);
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex flex-col items-center gap-4 mt-10 animate-fade-in">
      {/* Page info */}
      <p className="text-sm text-gray-500 font-medium">
        صفحة <span className="font-bold text-gray-900">{currentPage}</span> من{" "}
        <span className="font-bold text-gray-900">{totalPages}</span>
        {totalItems > 0 && (
          <span className="text-gray-400 mr-2">
            ({totalItems.toLocaleString()} منتج)
          </span>
        )}
      </p>

      {/* Navigation buttons */}
      <nav className="flex items-center gap-1.5" aria-label="التنقل بين الصفحات">
        {/* Previous */}
        {currentPage > 1 ? (
          <Link
            href={buildUrl(currentPage - 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all duration-200 focus-ring"
            aria-label="الصفحة السابقة"
          >
            <ChevronRight className="w-4 h-4" />
            السابق
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-gray-300 bg-gray-50 border border-gray-100 rounded-xl cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
            السابق
          </span>
        )}

        {/* Page numbers */}
        <div className="flex items-center gap-1 mx-1">
          {pageNumbers.map((page, idx) =>
            page === '...' ? (
              <span key={`ellipsis-${idx}`} className="w-10 h-10 flex items-center justify-center text-gray-400 text-sm font-medium">
                ⋯
              </span>
            ) : page === currentPage ? (
              <span
                key={page}
                className="w-10 h-10 flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-emerald-600 to-blue-600 rounded-xl shadow-md shadow-emerald-100"
                aria-current="page"
              >
                {page}
              </span>
            ) : (
              <Link
                key={page}
                href={buildUrl(page)}
                className="w-10 h-10 flex items-center justify-center text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all duration-200 focus-ring"
              >
                {page}
              </Link>
            )
          )}
        </div>

        {/* Next */}
        {currentPage < totalPages ? (
          <Link
            href={buildUrl(currentPage + 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all duration-200 focus-ring"
            aria-label="الصفحة التالية"
          >
            التالي
            <ChevronLeft className="w-4 h-4" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-gray-300 bg-gray-50 border border-gray-100 rounded-xl cursor-not-allowed">
            التالي
            <ChevronLeft className="w-4 h-4" />
          </span>
        )}
      </nav>

      {/* Quick jump - first/last */}
      {totalPages > 5 && (
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {currentPage > 2 && (
            <Link href={buildUrl(1)} className="hover:text-emerald-600 transition-colors font-medium">
              ← الصفحة الأولى
            </Link>
          )}
          {currentPage < totalPages - 1 && (
            <Link href={buildUrl(totalPages)} className="hover:text-emerald-600 transition-colors font-medium">
              الصفحة الأخيرة →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
