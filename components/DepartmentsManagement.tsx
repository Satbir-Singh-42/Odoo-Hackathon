"use client";
import { useEffect, useState, useMemo } from "react";
import { Building, Shield, ChevronDown, ChevronUp, MoreVertical, Users, Mail, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { formatDisplayDate } from "@/lib/utils/dateHelpers";

interface Department {
  id: number;
  name: string;
  status: string;
}

interface User {
  id: string;
  fullName: string;
  department: string;
  email: string;
  role: string;
}

export function DepartmentsManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDeptId, setExpandedDeptId] = useState<number | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [deptRes, usersRes] = await Promise.all([
        fetch("/api/departments"),
        fetch("/api/users"),
      ]);

      if (deptRes.ok && usersRes.ok) {
        const deptData = await deptRes.json();
        const usersData = await usersRes.json();
        
        const deptList = deptData.data || deptData;
        const usersList = usersData.data?.users || usersData.users || usersData.data || [];
        
        setDepartments(Array.isArray(deptList) ? deptList : []);
        setUsers(Array.isArray(usersList) ? usersList : []);
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

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuId(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  const toggleExpand = (deptId: number) => {
    setExpandedDeptId(expandedDeptId === deptId ? null : deptId);
  };

  // Group users by department name
  const departmentMembers = useMemo(() => {
    const map = new Map<string, User[]>();
    (users || []).forEach((user) => {
      if (!user.department) return;
      const deptName = user.department.trim();
      if (!map.has(deptName)) {
        map.set(deptName, []);
      }
      map.get(deptName)!.push(user);
    });
    return map;
  }, [users]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Departments</h2>
          <p className="text-sm text-gray-500 mt-1">
            Dynamic list of departments active in the system. To add a department, assign it to a user.
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-10 py-3 px-4"></th>
                <th className="py-3 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">Department Name</th>
                <th className="py-3 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">Members Count</th>
                <th className="py-3 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="w-16 py-3 px-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    Loading departments...
                  </td>
                </tr>
              ) : departments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    No departments found
                  </td>
                </tr>
              ) : (
                departments.map((dept) => {
                  const members = departmentMembers.get(dept.name.trim()) || [];
                  const isExpanded = expandedDeptId === dept.id;

                  return (
                    <>
                      <tr key={dept.id} className="hover:bg-gray-50/40 transition-colors">
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => toggleExpand(dept.id)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
                              <Building className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="font-semibold text-gray-900">{dept.name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-gray-400" />
                            <span>
                              {members.length} {members.length === 1 ? "member" : "members"}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                            <Shield className="w-3 h-3" /> Active
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === dept.id ? null : dept.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {activeMenuId === dept.id && (
                            <div className="absolute right-6 top-12 w-44 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10 text-left">
                              <button
                                onClick={() => {
                                  toggleExpand(dept.id);
                                  setActiveMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Users className="w-3.5 h-3.5" />
                                {isExpanded ? "Hide Members" : "Show Members"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Section showing Members list */}
                      {isExpanded && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={5} className="py-3 px-8">
                            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden shadow-2xs">
                              {members.length === 0 ? (
                                <div className="p-4 text-center text-xs text-gray-400">
                                  No members currently assigned to this department.
                                </div>
                              ) : (
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-gray-50 border-b border-gray-150">
                                      <th className="py-2.5 px-4 font-semibold text-gray-500">Employee ID</th>
                                      <th className="py-2.5 px-4 font-semibold text-gray-500">Name</th>
                                      <th className="py-2.5 px-4 font-semibold text-gray-500">Email</th>
                                      <th className="py-2.5 px-4 font-semibold text-gray-500">Role</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {members.map((member) => (
                                      <tr key={member.id} className="hover:bg-gray-50/40">
                                        <td className="py-2.5 px-4 font-mono font-medium text-gray-700">
                                          {member.id}
                                        </td>
                                        <td className="py-2.5 px-4 font-semibold text-gray-900">
                                          {member.fullName}
                                        </td>
                                        <td className="py-2.5 px-4 text-gray-600 flex items-center gap-1.5">
                                          <Mail className="w-3.5 h-3.5 text-gray-400" />
                                          {member.email}
                                        </td>
                                        <td className="py-2.5 px-4 text-gray-700">
                                          <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-medium">
                                            {member.role}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
