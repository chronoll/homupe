
import { getClient, setJson, getJson, del } from '../redis';
import { Category } from '../types';
import { v4 as uuidv4 } from 'uuid';

const CATEGORY_KEY_PREFIX = 'category:';
const ALL_CATEGORIES_KEY = 'categories';

// --- Category Repository ---

export const createCategory = async (categoryData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<Category> => {
  const client = getClient();
  const categoryId = uuidv4();
  const now = Date.now();

  const newCategory: Category = {
    ...categoryData,
    id: categoryId,
    createdAt: now,
    updatedAt: now,
  };

  const pipeline = client.pipeline();
  await setJson(`${CATEGORY_KEY_PREFIX}${categoryId}`, newCategory, pipeline);
  pipeline.sadd(ALL_CATEGORIES_KEY, categoryId);
  await pipeline.exec();

  return newCategory;
};

export const getCategory = async (categoryId: string): Promise<Category | null> => {
  return await getJson<Category>(`${CATEGORY_KEY_PREFIX}${categoryId}`);
};

export const updateCategory = async (categoryId: string, categoryData: Partial<Category>): Promise<Category | null> => {
  const existingCategory = await getCategory(categoryId);
  if (!existingCategory) {
    return null;
  }

  const updatedCategory: Category = {
    ...existingCategory,
    ...categoryData,
    updatedAt: Date.now(),
  };

  await setJson(`${CATEGORY_KEY_PREFIX}${categoryId}`, updatedCategory);
  return updatedCategory;
};

export const deleteCategory = async (categoryId: string): Promise<void> => {
  const client = getClient();
  const pipeline = client.pipeline();
  await del(`${CATEGORY_KEY_PREFIX}${categoryId}`, pipeline);
  pipeline.srem(ALL_CATEGORIES_KEY, categoryId);
  // Note: This does not yet handle moving tasks to "uncategorized"
  await pipeline.exec();
};

export const getAllCategories = async (): Promise<Category[]> => {
  const client = getClient();
  const categoryIds = await client.smembers(ALL_CATEGORIES_KEY);
  if (categoryIds.length === 0) {
    return [];
  }

  const categories = await Promise.all(
    categoryIds.map(categoryId => getCategory(categoryId))
  );

  return categories.filter(category => category !== null) as Category[];
};
