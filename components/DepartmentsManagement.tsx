"use client";

import { useEffect, useState } from "react";
import { Plus, Edit2, Check, X, Shield, ToggleLeft, ToggleRight, Building, User } from "lucide-react";
import { toast } from "sonner";

interface UserSummary {
  id: string;
  fullName: string;
  email: string;
}

interface Department {
  id: number;
  name: string;
  departmentHeadId: string | null;
  parentDepartmentId: number | null;
  status: string;
  head?: UserSummary | null;
  parent?: { id: number; name: string } | null;
}

export function DepartmentsManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [departmentHeadId, setDepartmentHeadId] = useState("");
  const [parentDepartmentId, setParentDepartmentId] = useState("");
  const [status, setStatus] = useState("Active");

  async function fetchData() {
    setIsLoading(true);
    try {
      const [deptRes, usersRes] = await Promise.all([
        fetch("/api/departments"),
        fetch("/api/users?pageSize=200"),
      ]);

      if (deptRes.ok && usersRes.ok) {
        const deptData = await deptRes.json();
        const usersData = await usersRes.json();
        setDepartments(deptData.data || deptData);
        setUsers(usersData.data?.users || usersData.users || []);
      } else {
        toast.error("Failed to load departments or users.");
      }
    } catch (err) {
      toast.error("Error loading data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  function handleEdit(dept: Department) {
    setIsEditing(true);
    setEditId(dept.id);
    setName(dept.name);
    setDepartmentHeadId(dept.departmentHeadId || "");
    setParentDepartmentId(dept.parentDepartmentId ? String(dept.parentDepartmentId) : "");
    setStatus(dept.status);
  }

  function handleReset() {
    setIsEditing(false);
    setEditId(null);
    setName("");
    setDepartmentHeadId("");
    setParentDepartmentId("");
    setStatus("Active");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Department name is required.");
      return;
    }

    const payload = {
      name,
      departmentHeadId: departmentHeadId || null,
      parentDepartmentId: parentDepartmentId ? parseInt(parentDepartmentId, 10) : null,
      status,
    };

    try {
      const url = isEditing ? `/api/departments/${editId}` : "/api/departments";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(isEditing ? "Department updated successfully!" : "Department created successfully!");
        handleReset();
        fetchData();
      } else {
        const errorData = await res.json();
        toast.error(errorData.message || "Failed to save department.");
      }
    } catch (err) {
      toast.error("Failed to save department.");
    }
  }

  async function toggleStatus(dept: Department) {
    const nextStatus = dept.status === "Active" ? "Inactive" : "Active";
    try {
      const res = await fetch(`/api/departments/${dept.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        toast.success(`Department set to ${nextStatus}`);
        fetchData();
      } else {
        toast.error("Failed to toggle department status.");
      }
    } catch (err) {
      toast.error("Error toggling department status.");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this department?")) return;
    try {
      const res = await fetch(`/api/departments/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Department deleted successfully!");
        fetchData();
      } else {
        toast.error("Failed to delete department.");
      }
    } catch (err) {
      toast.error("Error deleting department.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building className="w-5.5 h-5.5 text-blue-600" />
            Departments
          </h2>
          <p className="text-sm text-gray-500">
            Define organizational hierarchy, departments, and heads
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form panel */}
        <div className="xl:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-150 h-fit">
          <h3 className="text-sm font-semibold text-gray-950 mb-4 flex items-center gap-1.5">
            {isEditing ? <Edit2 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-blue-600" />}
            {isEditing ? "Edit Department" : "Add New Department"}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Department Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="e.g. Engineering"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Department Head (Manager)
              </label>
              <select
                value={departmentHeadId}
                onChange={(e) => setDepartmentHeadId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              >
                <option value="">-- No Department Head --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Parent Department (Optional)
              </label>
              <select
                value={parentDepartmentId}
                onChange={(e) => setParentDepartmentId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              >
                <option value="">-- None (Top Level) --</option>
                {departments
                  .filter((d) => d.id !== editId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
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
            <h3 className="text-sm font-semibold text-gray-900">Registered Departments</h3>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              {departments.length} Total
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              Loading departments...
            </div>
          ) : departments.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              No departments registered yet. Use the form to add one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 bg-gray-50/50">
                    <th className="px-5 py-3">Department Name</th>
                    <th className="px-5 py-3">Head / Lead</th>
                    <th className="px-5 py-3">Hierarchy</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {departments.map((dept) => (
                    <tr key={dept.id} className="hover:bg-gray-50/40 transition-colors">
                      <td className="px-5 py-4 font-semibold text-gray-900">{dept.name}</td>
                      <td className="px-5 py-4 text-gray-700">
                        {dept.head ? (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-blue-500" />
                            <span>{dept.head.fullName}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-600 text-xs">
                        {dept.parent ? (
                          <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                            Child of {dept.parent.name}
                          </span>
                        ) : (
                          <span className="text-gray-400">Top Level</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => toggleStatus(dept)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                            dept.status === "Active"
                              ? "bg-green-100 text-green-800 hover:bg-green-200"
                              : "bg-red-100 text-red-800 hover:bg-red-200"
                          }`}
                        >
                          {dept.status === "Active" ? (
                            <>
                              <Check className="w-3 h-3" /> Active
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3" /> Inactive
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(dept)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(dept.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
