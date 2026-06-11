import Link from "next/link";
import { Home, ChevronLeft } from "lucide-react";

export default function Breadcrumbs({ items = [] }) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="مسار التنقل" className="mb-6 animate-fade-in">
      <ol className="flex items-center gap-1.5 text-sm flex-wrap">
        {/* Home link */}
        <li className="flex items-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-gray-400 hover:text-emerald-600 transition-colors font-medium"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">الرئيسية</span>
          </Link>
        </li>

        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1.5">
              <ChevronLeft className="w-3 h-3 text-gray-300" />
              {isLast || !item.href ? (
                <span className="font-bold text-gray-900 truncate max-w-[200px]">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-gray-400 hover:text-emerald-600 transition-colors font-medium truncate max-w-[200px]"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
