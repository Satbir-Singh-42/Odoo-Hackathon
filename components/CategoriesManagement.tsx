"use client";

import { useEffect, useState } from "react";
import { Plus, Edit2, Check, X, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface AssetCategory {
  id: string;
  name: string;
  fields: string[] | null; // parsed array of custom field labels
}

export function CategoriesManagement() {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  
  // Dynamic fields lists
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  async function fetchCategories() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        // The API returns combined categories. Parse fields if they are JSON strings
        const parsed = (data.data || data).map((cat: any) => {
          let fieldsArray: string[] = [];
          if (cat.fields) {
            try {
              fieldsArray = typeof cat.fields === "string" ? JSON.parse(cat.fields) : cat.fields;
            } catch (e) {
              fieldsArray = [];
            }
          }
          return {
            id: cat.id,
            name: cat.name,
            fields: Array.isArray(fieldsArray) ? fieldsArray : [],
          };
        });
        setCategories(parsed);
      } else {
        toast.error("Failed to load asset categories.");
      }
    } catch (err) {
      toast.error("Error loading categories.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchCategories();
  }, []);

  function handleAddField() {
    if (!newFieldLabel.trim()) return;
    if (customFields.includes(newFieldLabel.trim())) {
      toast.error("Field name already exists.");
      return;
    }
    setCustomFields([...customFields, newFieldLabel.trim()]);
    setNewFieldLabel("");
  }

  function handleRemoveField(index: number) {
    setCustomFields(customFields.filter((_, i) => i !== index));
  }

  function handleEdit(cat: AssetCategory) {
    setIsEditing(true);
    setEditId(cat.id);
    setName(cat.name);
    setCustomFields(cat.fields || []);
    setNewFieldLabel("");
  }

  function handleReset() {
    setIsEditing(false);
    setEditId(null);
    setName("");
    setCustomFields([]);
    setNewFieldLabel("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Category name is required.");
      return;
    }

    const payload = {
      name: name.trim(),
      fields: customFields,
    };

    try {
      // If editId is a number string (e.g. "1"), it is in DB, we call PUT. If it's a legacy category like "Hardware", we POST.
      const isDbRecord = editId && !isNaN(parseInt(editId, 10));
      const url = isDbRecord ? `/api/categories/${editId}` : "/api/categories";
      const method = isDbRecord ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(isDbRecord ? "Category updated successfully!" : "Category created successfully!");
        handleReset();
        fetchCategories();
      } else {
        const errorData = await res.json();
        toast.error(errorData.message || "Failed to save category.");
      }
    } catch (err) {
      toast.error("Error saving category.");
    }
  }

  async function handleDelete(id: string) {
    const isDbRecord = !isNaN(parseInt(id, 10));
    if (!isDbRecord) {
      toast.error("Cannot delete system-defined categories.");
      return;
    }

    if (!confirm("Are you sure you want to delete this category?")) return;

    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Category deleted successfully!");
        fetchCategories();
      } else {
        toast.error("Failed to delete category.");
      }
    } catch (err) {
      toast.error("Error deleting category.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Tags className="w-5.5 h-5.5 text-blue-600" />
            Asset Categories
          </h2>
          <p className="text-sm text-gray-500">
            Define categories and dynamic, category-specific fields (e.g., Warranty, Storage specs)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form panel */}
        <div className="xl:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-150 h-fit">
          <h3 className="text-sm font-semibold text-gray-950 mb-4 flex items-center gap-1.5">
            {isEditing ? <Edit2 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-blue-600" />}
            {isEditing ? "Edit Category" : "Add New Category"}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Category Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="e.g. Electronics, Servers"
              />
            </div>

            {/* Custom Specifications Builder */}
            <div className="border-t border-gray-100 pt-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Custom Fields (Specifications)
              </label>
              
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  placeholder="e.g. Warranty Period"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddField();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddField}
                  className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-all"
                >
                  Add
                </button>
              </div>

              {customFields.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">No custom fields defined yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  {customFields.map((f, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 bg-white border border-gray-200 text-xs font-medium text-gray-800 px-2 py-0.5 rounded-md shadow-2xs"
                    >
                      {f}
                      <button
                        type="button"
                        onClick={() => handleRemoveField(index)}
                        className="text-gray-400 hover:text-red-500 focus:outline-none transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg text-xs font-medium hover:bg-blue-700 transition-all flex items-center justify-center gap-1 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                {isEditing ? "Save Changes" : "Create"}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="bg-gray-100 text-gray-700 py-2 px-3 rounded-lg text-xs font-medium hover:bg-gray-200 transition-all flex items-center justify-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* List panel */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-150 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Categories List</h3>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              {categories.length} Total
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              Loading categories...
            </div>
          ) : categories.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              No categories found. Use the form to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 bg-gray-50/50">
                    <th className="px-5 py-3">Category Name</th>
                    <th className="px-5 py-3">Custom Field Specifications</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {categories.map((cat) => {
                    const isDb = !isNaN(parseInt(cat.id, 10));
                    return (
                      <tr key={cat.id} className="hover:bg-gray-50/40 transition-colors">
                        <td className="px-5 py-4 font-semibold text-gray-900">{cat.name}</td>
                        <td className="px-5 py-4 text-gray-700">
                          {cat.fields && cat.fields.length > 0 ? (
                            <div className="flex flex-wrap gap-1 text-[11px]">
                              {cat.fields.map((f, i) => (
                                <span key={i} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                                  {f}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs italic">No custom fields defined</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs">
                          {isDb ? (
                            <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-semibold">Custom</span>
                          ) : (
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">System Default</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleEdit(cat)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(cat.id)}
                              disabled={!isDb}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isDb
                                  ? "text-gray-500 hover:text-red-600 hover:bg-red-50"
                                  : "text-gray-300 cursor-not-allowed"
                              }`}
                              title={isDb ? "Delete" : "Cannot delete system default"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
