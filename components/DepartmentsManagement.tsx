"use client";
import { useEffect, useState } from "react";
import { Building, Shield } from "lucide-react";
import { toast } from "sonner";

interface Department {
  id: number;
  name: string;
  status: string;
}

export function DepartmentsManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchData() {
    setIsLoading(true);
    try {
      const deptRes = await fetch("/api/departments");
      if (deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(deptData.data || deptData);
      } else {
        toast.error("Failed to load departments.");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Departments</h2>
          <p className="text-sm text-gray-400 mt-1">
            Dynamic list of departments active in the system. To add a department, assign it to a user.
          </p>
        </div>
      </div>

      <div className="bg-[#12121A] border border-white/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="py-4 px-6 text-sm font-medium text-gray-400">Department Name</th>
                <th className="py-4 px-6 text-sm font-medium text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={2} className="py-8 text-center text-gray-500">Loading...</td></tr>
              ) : departments.length === 0 ? (
                <tr><td colSpan={2} className="py-8 text-center text-gray-500">No departments found</td></tr>
              ) : (
                departments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                          <Building className="w-4 h-4 text-indigo-400" />
                        </div>
                        <span className="font-medium text-white">{dept.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Shield className="w-3 h-3" /> Active
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
