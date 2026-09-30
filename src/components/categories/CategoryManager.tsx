import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Check, ChevronRight, Loader2, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories } from '@/hooks/useCategories';
import { DeleteCategoryDialog } from './DeleteCategoryDialog';
import {
  createCategory,
  deleteCategory,
  reassignAndDeleteCategory,
  renameCategory,
} from '@/services/categoriesService';
import type { Category, CategoryTree } from '@/types';

export function describeError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes('duplicate')) return 'Já existe um registro com esse nome.';
  return message;
}

/**
 * Cadastro de categorias e subcategorias: criar, renomear e apagar.
 * Categorias do sistema (se ainda existirem) aparecem com cadeado e só
 * aceitam subcategorias novas.
 */
export function CategoryManager() {
  const { user } = useAuth();
  const { tree, loading, error, reload } = useCategories();

  const [newName, setNewName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Regra: precisa sobrar pelo menos 1 categoria (o banco também garante).
  const ownCategoryCount = tree.filter((category) => category.user_id !== null).length;
  const [deleting, setDeleting] = useState<Category | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      await reload();
      return true;
    } catch (cause) {
      setFeedback(describeError(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCategory(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || !user) return;
    if (await run(() => createCategory({ userId: user.id, name }))) setNewName('');
  }

  async function handleConfirmDelete(
    category: Category,
    destination: { categoryId: string; subcategoryId: string | null } | null,
  ) {
    // Erros sobem para o diálogo, que os mostra sem fechar.
    if (destination) {
      await reassignAndDeleteCategory({
        targetId: category.id,
        newCategoryId: destination.categoryId,
        newSubcategoryId: destination.subcategoryId,
      });
    } else {
      await deleteCategory(category.id);
    }
    setDeleting(null);
    await reload();
  }

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-ink">Categorias e subcategorias</h2>
      <p className="mt-1 text-sm text-ink-2">
        Clique numa categoria para ver, criar e editar as subcategorias.
      </p>

      <form className="mt-4 flex gap-2" onSubmit={(event) => void handleCreateCategory(event)}>
        <label className="sr-only" htmlFor="new-category">
          Nova categoria
        </label>
        <input
          id="new-category"
          className="field flex-1"
          placeholder="Nova categoria"
          maxLength={60}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          disabled={busy}
        />
        <button type="submit" className="btn-primary" disabled={busy || !newName.trim()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          Criar
        </button>
      </form>

      {(feedback || error) && (
        <p className="mt-3 text-sm text-danger-ink" role="alert">
          {feedback ?? error}
        </p>
      )}

      {loading && tree.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">Carregando categorias…</p>
      ) : tree.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">Nenhuma categoria cadastrada ainda.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {tree.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              expanded={expanded === category.id}
              busy={busy}
              onToggle={() => setExpanded(expanded === category.id ? null : category.id)}
              onRename={(target, name) => run(() => renameCategory(target.id, name))}
              onCreateChild={(name) =>
                user
                  ? run(() =>
                      createCategory({ userId: user.id, name, parentCategoryId: category.id }),
                    )
                  : Promise.resolve(false)
              }
              isLastCategory={ownCategoryCount <= 1}
              onDelete={(target) => setDeleting(target)}
            />
          ))}
        </ul>
      )}

      {deleting && (
        <DeleteCategoryDialog
          category={deleting}
          tree={tree}
          onCancel={() => setDeleting(null)}
          onConfirm={(destination) => handleConfirmDelete(deleting, destination)}
        />
      )}
    </section>
  );
}

interface CategoryRowProps {
  category: CategoryTree;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onRename: (category: Category, name: string) => Promise<boolean>;
  onCreateChild: (name: string) => Promise<boolean>;
  isLastCategory: boolean;
  onDelete: (category: Category, childCount: number) => void;
}

function CategoryRow({
  category,
  expanded,
  busy,
  onToggle,
  onRename,
  onCreateChild,
  isLastCategory,
  onDelete,
}: CategoryRowProps) {
  const [childName, setChildName] = useState('');
  const [editing, setEditing] = useState(false);
  const isSystem = category.user_id === null;
  const inputId = `new-sub-${category.id}`;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const name = childName.trim();
    if (!name) return;
    if (await onCreateChild(name)) setChildName('');
  }

  return (
    <li>
      <div className="flex items-center gap-1 px-3 py-2">
        {editing ? (
          <InlineRename
            initial={category.name}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSave={async (name) => {
              if (await onRename(category, name)) setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-ink-3 transition ${expanded ? 'rotate-90' : ''}`}
              aria-hidden
            />
            {category.color && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
                aria-hidden
              />
            )}
            <span className="truncate text-sm font-medium text-ink">{category.name}</span>
            <span className="shrink-0 text-xs text-ink-3">{category.children.length} sub</span>
            {isSystem && (
              <Lock className="h-3 w-3 shrink-0 text-ink-3" aria-label="Categoria do sistema" />
            )}
          </button>
        )}

        {!isSystem && !editing && (
          <>
            <IconButton label={`Renomear ${category.name}`} onClick={() => setEditing(true)} disabled={busy}>
              <Pencil className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton
              label={
                isLastCategory
                  ? 'É preciso manter pelo menos 1 categoria'
                  : `Apagar categoria ${category.name}`
              }
              onClick={() => onDelete(category, category.children.length)}
              disabled={busy || isLastCategory}
              danger
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </IconButton>
          </>
        )}
      </div>

      {expanded && (
        <div className="border-t border-line bg-surface-2 px-3 py-3 pl-9">
          {category.children.length > 0 && (
            <ul className="mb-3 space-y-1">
              {category.children.map((child) => (
                <SubcategoryRow
                  key={child.id}
                  subcategory={child}
                  busy={busy}
                  onRename={(name) => onRename(child, name)}
                  onDelete={() => onDelete(child, 0)}
                />
              ))}
            </ul>
          )}

          <form className="flex gap-2" onSubmit={(event) => void handleSubmit(event)}>
            <label className="sr-only" htmlFor={inputId}>
              Nova subcategoria em {category.name}
            </label>
            <input
              id={inputId}
              className="field flex-1"
              placeholder={`Nova subcategoria em ${category.name}`}
              maxLength={60}
              value={childName}
              onChange={(event) => setChildName(event.target.value)}
              disabled={busy}
            />
            <button type="submit" className="btn-secondary" disabled={busy || !childName.trim()}>
              <Plus className="h-4 w-4" aria-hidden />
              Adicionar
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

function SubcategoryRow({
  subcategory,
  busy,
  onRename,
  onDelete,
}: {
  subcategory: Category;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const isSystem = subcategory.user_id === null;

  return (
    <li className="flex items-center gap-1 text-sm text-ink-2">
      {editing ? (
        <InlineRename
          initial={subcategory.name}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (name) => {
            if (await onRename(name)) setEditing(false);
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{subcategory.name}</span>
      )}
      {isSystem ? (
        <Lock className="h-3 w-3 shrink-0 text-ink-3" aria-label="Subcategoria do sistema" />
      ) : (
        !editing && (
          <>
            <IconButton label={`Renomear ${subcategory.name}`} onClick={() => setEditing(true)} disabled={busy}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
            <IconButton label={`Apagar subcategoria ${subcategory.name}`} onClick={onDelete} disabled={busy} danger>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
          </>
        )
      )}
    </li>
  );
}

/** Campo de renomear no próprio lugar: Enter salva, Esc cancela. */
export function InlineRename({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: string;
  busy: boolean;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== initial;

  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) void onSave(trimmed);
      }}
    >
      <input
        className="field flex-1 py-1"
        value={value}
        maxLength={60}
        autoFocus
        disabled={busy}
        aria-label="Novo nome"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      />
      <IconButton label="Salvar" type="submit" disabled={busy || !canSave}>
        <Check className="h-4 w-4" aria-hidden />
      </IconButton>
      <IconButton label="Cancelar" onClick={onCancel} disabled={busy}>
        <X className="h-4 w-4" aria-hidden />
      </IconButton>
    </form>
  );
}

export function IconButton({
  label,
  children,
  onClick,
  disabled,
  danger = false,
  type = 'button',
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`shrink-0 rounded p-1.5 text-ink-3 disabled:opacity-40 ${
        danger ? 'hover:text-danger-ink' : 'hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
