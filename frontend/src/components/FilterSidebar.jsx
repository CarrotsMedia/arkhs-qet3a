"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { 
  X, 
  ChevronDown, 
  ChevronUp, 
  RotateCcw, 
  SlidersHorizontal, 
  Store, 
  Check, 
  PackageCheck, 
  ArrowLeftRight 
} from "lucide-react";

export default function FilterSidebar({ facets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [isOpen, setIsOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({
    subcategories: true,
    brands: true,
    price: true,
    status: true,
  });

  // Price inputs local state
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");

  // Sync price inputs with URL search params
  useEffect(() => {
    setMinPriceInput(searchParams.get("min_price") || "");
    setMaxPriceInput(searchParams.get("max_price") || "");
  }, [searchParams]);

  if (!facets) return null;

  // Toggle group expansion
  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  // Helper to check if a brand or attribute option is active
  const isOptionActive = (key, value) => {
    const paramVal = searchParams.get(key);
    if (!paramVal) return false;
    return paramVal.split(",").includes(value);
  };

  // Generic toggle handler for multi-select (brands, attributes)
  const handleToggleFilter = (key, value) => {
    const params = new URLSearchParams(searchParams.toString());
    let currentVal = params.get(key) || "";
    let values = currentVal ? currentVal.split(",") : [];

    if (values.includes(value)) {
      values = values.filter(v => v !== value);
    } else {
      values.push(value);
    }

    if (values.length === 0) {
      params.delete(key);
    } else {
      params.set(key, values.join(","));
    }

    // Reset page on filter change
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Handle subcategory selection
  const handleSubcategorySelect = (slug) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (slug) {
      params.set("subcategory", slug);
      // Clear subcategory attributes when switching subcategories
      if (facets.attributes) {
        facets.attributes.forEach(attr => {
          params.delete(attr.slug);
        });
      }
    } else {
      params.delete("subcategory");
    }

    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Handle single toggles like in_stock or min_stores
  const handleToggleSingle = (key, activeValue, inactiveValue = null) => {
    const params = new URLSearchParams(searchParams.toString());
    const currentVal = params.get(key);

    if (currentVal === activeValue) {
      if (inactiveValue) {
        params.set(key, inactiveValue);
      } else {
        params.delete(key);
      }
    } else {
      params.set(key, activeValue);
    }

    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Handle manual price apply
  const handlePriceApply = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    
    if (minPriceInput) {
      params.set("min_price", minPriceInput);
    } else {
      params.delete("min_price");
    }
    
    if (maxPriceInput) {
      params.set("max_price", maxPriceInput);
    } else {
      params.delete("max_price");
    }

    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Reset all filters
  const handleResetAll = () => {
    const params = new URLSearchParams();
    // Keep category or search query if they exist
    const category = searchParams.get("category");
    const q = searchParams.get("q");
    const subcategory = searchParams.get("subcategory");

    if (category) params.set("category", category);
    if (subcategory) params.set("subcategory", subcategory);
    if (q) params.set("q", q);
    
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setIsOpen(false);
  };

  const hasActiveFilters = () => {
    // Check if there are active filters other than category, subcategory, q, page, sort
    const systemParams = ["category", "subcategory", "q", "page", "sort", "limit"];
    for (const key of searchParams.keys()) {
      if (!systemParams.includes(key)) return true;
    }
    return false;
  };

  const activeSubcategorySlug = searchParams.get("subcategory");

  // Reusable Sidebar Content
  const SidebarContent = () => (
    <div className="flex flex-col gap-6 select-none">
      {/* Header with Clear All */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-emerald-600" />
          فلاتر التصفية
        </h2>
        {hasActiveFilters() && (
          <button 
            onClick={handleResetAll}
            className="inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-600 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            إعادة تعيين
          </button>
        )}
      </div>

      {/* Subcategories (Device Types) - only visible if facets has subcategories */}
      {facets.subcategories && facets.subcategories.length > 0 && (
        <div className="border-b border-gray-100 pb-5">
          <button 
            onClick={() => toggleGroup("subcategories")}
            className="flex items-center justify-between w-full text-sm font-bold text-gray-800 hover:text-emerald-600 transition-colors"
          >
            <span>نوع الجهاز (القسم)</span>
            {expandedGroups.subcategories ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {expandedGroups.subcategories && (
            <div className="mt-3.5 flex flex-col gap-2 animate-fade-in">
              <button
                onClick={() => handleSubcategorySelect(null)}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 text-right ${
                  !activeSubcategorySlug 
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                    : "bg-white text-gray-600 border border-gray-100 hover:bg-gray-50"
                }`}
              >
                <span>الكل</span>
              </button>
              {facets.subcategories.map((subcat) => (
                <button
                  key={subcat.id}
                  onClick={() => handleSubcategorySelect(subcat.slug)}
                  disabled={subcat.count === 0 && !subcat.selected}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 text-right ${
                    activeSubcategorySlug === subcat.slug 
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm shadow-emerald-50/50" 
                      : subcat.count === 0 
                        ? "bg-gray-50/50 text-gray-300 border border-dashed border-gray-100 cursor-not-allowed" 
                        : "bg-white text-gray-600 border border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">{subcat.icon || "📦"}</span>
                    {subcat.name}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    activeSubcategorySlug === subcat.slug 
                      ? "bg-emerald-100/80 text-emerald-700" 
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {subcat.count.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Brands Filter */}
      {facets.brands && facets.brands.length > 0 && (
        <div className="border-b border-gray-100 pb-5">
          <button 
            onClick={() => toggleGroup("brands")}
            className="flex items-center justify-between w-full text-sm font-bold text-gray-800 hover:text-emerald-600 transition-colors"
          >
            <span>العلامة التجارية (البراند)</span>
            {expandedGroups.brands ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {expandedGroups.brands && (
            <div className="mt-3.5 max-h-48 overflow-y-auto pr-1 flex flex-col gap-2.5 custom-scrollbar">
              {facets.brands.map((brand) => {
                const brandSlug = brand.name_en.toLowerCase();
                const isChecked = isOptionActive("brand", brandSlug);
                return (
                  <label 
                    key={brand.name_en} 
                    className={`flex items-center justify-between text-xs font-semibold select-none transition-all cursor-pointer ${
                      brand.disabled ? "opacity-45 cursor-not-allowed" : "hover:text-emerald-600"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={brand.disabled}
                          onChange={() => handleToggleFilter("brand", brandSlug)}
                          className="peer appearance-none w-4 h-4 rounded border border-gray-300 checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer disabled:cursor-not-allowed"
                        />
                        <Check className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
                      </div>
                      <span className="text-gray-700 peer-checked:text-emerald-700">
                        {brand.name_ar || brand.name_en}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">
                      ({brand.count.toLocaleString()})
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Price Range Filter */}
      {facets.price_range && (
        <div className="border-b border-gray-100 pb-5">
          <button 
            onClick={() => toggleGroup("price")}
            className="flex items-center justify-between w-full text-sm font-bold text-gray-800 hover:text-emerald-600 transition-colors"
          >
            <span>السعر (ج.م)</span>
            {expandedGroups.price ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {expandedGroups.price && (
            <form onSubmit={handlePriceApply} className="mt-3.5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400">من</span>
                  <input
                    type="number"
                    placeholder={facets.price_range.min_price?.toLocaleString() || "0"}
                    value={minPriceInput}
                    onChange={(e) => setMinPriceInput(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400">إلى</span>
                  <input
                    type="number"
                    placeholder={facets.price_range.max_price?.toLocaleString() || "100,000"}
                    value={maxPriceInput}
                    onChange={(e) => setMaxPriceInput(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-gray-900 hover:bg-emerald-600 text-white font-bold py-2 rounded-xl text-xs transition-colors duration-200 shadow-sm"
              >
                تطبيق السعر
              </button>
            </form>
          )}
        </div>
      )}

      {/* Comparison & Availability Toggles */}
      <div className="border-b border-gray-100 pb-5">
        <button 
          onClick={() => toggleGroup("status")}
          className="flex items-center justify-between w-full text-sm font-bold text-gray-800 hover:text-emerald-600 transition-colors"
        >
          <span>خيارات البحث والمقارنة</span>
          {expandedGroups.status ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {expandedGroups.status && (
          <div className="mt-3.5 flex flex-col gap-3">
            {/* Store Count comparison filter (min_stores=2) */}
            <label className="flex items-center gap-2.5 text-xs font-semibold text-gray-700 cursor-pointer select-none">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={searchParams.get("min_stores") === "2"}
                  onChange={(e) => handleToggleSingle("min_stores", "2")}
                  className="peer appearance-none w-4 h-4 rounded border border-gray-300 checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer"
                />
                <Check className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
              </div>
              <span className="flex items-center gap-1.5 text-gray-600 peer-checked:text-emerald-700">
                <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400" />
                مقارنة بين متجرين أو أكثر
              </span>
            </label>

            {/* In Stock Only filter */}
            <label className="flex items-center gap-2.5 text-xs font-semibold text-gray-700 cursor-pointer select-none">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={searchParams.get("in_stock") === "true"}
                  onChange={(e) => handleToggleSingle("in_stock", "true")}
                  className="peer appearance-none w-4 h-4 rounded border border-gray-300 checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer"
                />
                <Check className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
              </div>
              <span className="flex items-center gap-1.5 text-gray-600 peer-checked:text-emerald-700">
                <PackageCheck className="w-3.5 h-3.5 text-gray-400" />
                المتوفر في المخزن فقط
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Dynamic Attributes Accordion (e.g. Storage, RAM, Display Style) */}
      {facets.attributes && facets.attributes.map((attr) => {
        const isExpanded = expandedGroups[attr.slug] ?? true;
        const toggleAttrAccordion = () => {
          setExpandedGroups(prev => ({
            ...prev,
            [attr.slug]: !isExpanded
          }));
        };

        return (
          <div key={attr.slug} className="border-b border-gray-100 pb-5">
            <button 
              onClick={toggleAttrAccordion}
              className="flex items-center justify-between w-full text-sm font-bold text-gray-800 hover:text-emerald-600 transition-colors"
            >
              <span>{attr.name_ar || attr.name_en}</span>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {isExpanded && (
              <div className="mt-3.5 max-h-48 overflow-y-auto pr-1 flex flex-col gap-2.5 custom-scrollbar">
                {attr.options.map((opt) => {
                  const isChecked = isOptionActive(attr.slug, opt.value);
                  return (
                    <label 
                      key={opt.value} 
                      className={`flex items-center justify-between text-xs font-semibold select-none transition-all cursor-pointer ${
                        opt.disabled ? "opacity-45 cursor-not-allowed" : "hover:text-emerald-600"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={opt.disabled}
                            onChange={() => handleToggleFilter(attr.slug, opt.value)}
                            className="peer appearance-none w-4 h-4 rounded border border-gray-300 checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer disabled:cursor-not-allowed"
                          />
                          <Check className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
                        </div>
                        <span className="text-gray-700 peer-checked:text-emerald-700">
                          {opt.value} {attr.unit ? attr.unit : ""}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">
                        ({opt.count.toLocaleString()})
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Trigger Button (inline in page) */}
      <div className="lg:hidden w-full">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all shadow-sm"
        >
          <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
          <span>تصفية وتحديد المنتجات</span>
          {hasActiveFilters() && (
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* Desktop Sidebar (Permanent) */}
      <aside className="hidden lg:block w-72 shrink-0 bg-white border border-gray-100 rounded-2xl shadow-sm p-6 sticky top-24 self-start max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Drawer Body */}
          <div className="relative w-80 max-w-[85vw] h-full bg-white shadow-2xl flex flex-col p-6 overflow-y-auto animate-slide-left" dir="rtl">
            {/* Close Button */}
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-5 left-5 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* Sidebar content inside drawer */}
            <div className="mt-8">
              <SidebarContent />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
