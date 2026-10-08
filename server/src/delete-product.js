// Remove catalog data without erasing historical order/enquiry snapshots.
export async function deleteCatalogProduct({ sequelize, Product, Lead, businessId, productId }) {
  return sequelize.transaction(async transaction => {
    const product = await Product.findOne({ where: { id: productId, businessId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!product) return false;
    await Lead.update({ productId: null }, { where: { productId, businessId }, transaction });
    await product.destroy({ transaction });
    return true;
  });
}
