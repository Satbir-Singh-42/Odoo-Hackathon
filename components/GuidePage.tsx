'use client';

import React from 'react';
import { BookOpen, ShieldCheck, Database, CalendarCheck, Settings, Users, Laptop } from 'lucide-react';
import { AppContainer } from './AppContainer';

export function GuidePage() {
  return (
    <AppContainer
      title="User Guide & Documentation"
      description="Learn how to navigate and utilize the Asset Management System effectively."
    >
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Laptop className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Dashboard & Assets</h2>
          </div>
          <p className="text-gray-600 mb-4">
            The Dashboard gives you a bird's-eye view of your entire organization's assets. From here, you can see recent activities, quickly jump to low-stock hardware, or track expiring software licenses.
          </p>
          <ul className="list-disc pl-5 text-gray-600 space-y-2">
            <li><strong>Adding Assets:</strong> Use the "Add Asset" button to input new items. You can create bulk orders or single units.</li>
            <li><strong>Allocations:</strong> Assign assets to employees or physical locations securely. You can also revoke allocations once a device is returned.</li>
            <li><strong>Asset Details:</strong> Click on any asset to view its lifecycle history, related maintenance logs, and attached documents.</li>
          </ul>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Audits & Compliance</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Routine audits ensure your database matches physical reality, preventing loss and maintaining compliance.
          </p>
          <ul className="list-disc pl-5 text-gray-600 space-y-2">
            <li><strong>Creating an Audit Cycle:</strong> Start a new audit, select the categories or departments to focus on.</li>
            <li><strong>Scanning & Verifying:</strong> Scan assets via Barcode/QR code to mark them as "Found".</li>
            <li><strong>Resolving Discrepancies:</strong> Assets that remain "Missing" after the cycle can be formally marked as lost or retired.</li>
          </ul>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <CalendarCheck className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Maintenance & Bookings</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Ensure devices remain in working order and shared resources are easily accessible.
          </p>
          <ul className="list-disc pl-5 text-gray-600 space-y-2">
            <li><strong>Maintenance Logs:</strong> Schedule repairs, track costs, and document technician notes for all hardware items.</li>
            <li><strong>Bookings (Shared Assets):</strong> Users can reserve shared assets (e.g., projectors, pool cars) for specific time slots.</li>
          </ul>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-slate-50 text-slate-600 rounded-xl">
              <Settings className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Admin Controls</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Administrators have full access to configure system behavior and permissions.
          </p>
          <ul className="list-disc pl-5 text-gray-600 space-y-2">
            <li><strong>SMTP Configuration:</strong> Configure email servers to send automated alerts for low stock, maintenance reminders, and license expiries.</li>
            <li><strong>User Management:</strong> Add new users, assign roles (Admin, Manager, Viewer), and restrict access based on departments or categories.</li>
            <li><strong>Customizations:</strong> Tailor categories, vendors, and notification schedules to suit your organization's workflow.</li>
          </ul>
        </section>

      </div>
    </AppContainer>
  );
}
