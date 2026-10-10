function baseDraft(product, categories) {
  return product?.id
    ? { name: product.name, description: product.description || '', price: product.price, category: product.category?.id || product.categoryId, imageUrl: product.imageUrl || '', imageUrls: product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [], stock: product.stock ?? '', featured: Boolean(product.featured), active: product.active, kind: product.kind || 'product', duration: product.duration || '' }
    : { name: '', description: '', price: '', category: categories[0]?.id || '', imageUrl: '', imageUrls: [], stock: '', featured: false, active: true, kind: 'product', duration: '' };
}

export const productDraft = (product, categories) => ({ ...baseDraft(product, categories), customFields: Array.isArray(product?.customFields) ? product.customFields : [], variants: Array.isArray(product?.variants) ? product.variants.map(v => ({ ...v })) : [], addonGroups: Array.isArray(product?.addonGroups) ? product.addonGroups.map(g => ({ ...g, options: (g.options || []).map(o => ({ ...o })) })) : [], veg: product?.veg || '', tags: Array.isArray(product?.tags) ? product.tags : [] });
