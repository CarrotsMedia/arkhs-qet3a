const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default async function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';

  let categories = [];
  try {
    const res = await fetch(`${API_URL}/api/categories`);
    if (res.ok) categories = await res.json();
  } catch (err) {}

  let deals = [];
  try {
    const res = await fetch(`${API_URL}/api/deals`);
    if (res.ok) deals = await res.json();
  } catch (err) {}

  const categoryUrls = categories.map((cat) => ({
    url: `${baseUrl}/products?category=${encodeURIComponent(cat.slug)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const productUrls = deals.map((product) => ({
    url: `${baseUrl}/product/${product.id || product.product_id}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.9,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...categoryUrls,
    ...productUrls,
  ];
}
