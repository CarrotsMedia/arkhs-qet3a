export default function Footer() {
  const columns = [
    {
      title: "الأقسام الرئيسية",
      links: ["الموبايلات وهواتف ذكية", "أجهزة لابتوب كمبيوتر", "شاشات عرض وتلفزيونات", "ساعات ذكية وأجهزة لوحية"],
    },
    {
      title: "عن أرخصلي",
      links: ["من نحن", "اتصل بنا", "الشروط والأحكام", "سياسة الخصوصية"],
    },
    {
      title: "المتاجر المدعومة",
      links: ["أمازون مصر", "نون", "بي تك", "دريم 2000", "تو بي", "الشيخ ستور"],
    },
  ];

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-16 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-blue-600 flex items-center justify-center">
                <span className="text-white font-extrabold text-sm">أ</span>
              </div>
              <span className="font-extrabold text-gray-900 text-lg">أرخصلي</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm">
              موقع أرخصلي هو منصة ذكية لمقارنة أسعار الموبايلات والأجهزة الإلكترونية من مختلف المتاجر في مصر، مما يساعدك على العثور على أفضل العروض وتوفير المال.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="col-span-1">
              <h4 className="text-sm font-bold text-gray-900 mb-3">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-gray-500 hover:text-emerald-600 transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs font-semibold text-gray-500">
            © 2026 أرخصلي. جميع الأسعار بالجنيه المصري (EGP).
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              جميع الأنظمة تعمل بكفاءة
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
