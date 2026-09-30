import { useCallback, useEffect, useState } from 'react';
import { buildCategoryTree, fetchCategories } from '@/services/categoriesService';
import type { Category, CategoryTree } from '@/types';

interface UseCategoriesResult {
  categories: Category[];
  tree: CategoryTree[];
  byId: Map<string, Category>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useCategories(): UseCategoriesResult {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await fetchCategories());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar categorias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    categories,
    tree: buildCategoryTree(categories),
    byId: new Map(categories.map((category) => [category.id, category])),
    loading,
    error,
    reload,
  };
}
