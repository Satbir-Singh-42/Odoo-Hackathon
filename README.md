# 📦 AssetFlow Next

AssetFlow Next is a state-of-the-art Enterprise Asset Management System built with **Next.js 16**, **React 19**, **Prisma**, and **Tailwind CSS**. It provides a premium, responsive interface for tracking hardware assets, software licenses, maintenance schedules, allocation lifecycles, and automated anomaly detection.

---

## ✨ Features

- **🌐 Consolidated Dashboard**: High-level telemetry of total assets, active allocations, maintenance costs, and pending anomalies.
- **🏷️ Smart Asset Inventory**:
  - Detailed tracking of hardware specifications (CPU, RAM, MAC address, ports).
  - **Individual Child Units**: Automatically spawns serialized units (`Unit 1`, `Unit 2`, etc.) when parent assets are created with quantities > 1 or marked as bulk orders.
  - Interactive "Showing All Units / Grouped Parents" filter toggle to easily manage individual items.
- **🔄 Lifecycle & Allotments**:
  - Multi-employee allocations with custom parameters (IP address, operating system, condition).
  - Comprehensive state machine handling status transitions (`Active`, `Returned`, `Revoked`, `Expired`).
  - Dynamic allocation details page with live status and active assignments updates.
- **🔧 Maintenance Scheduler**:
  - Track scheduled repairs, technician logs, frequency (one-off, monthly, yearly), and maintenance costs.
- **🛡️ Automated Anomaly Detection**:
  - Checks for resource waste, abuse, or hardware failures:
    - **Hoarder**: Detects users holding 3+ active assets of the same type.
    - **Lemon Hardware**: Highlights assets requiring repair within 14 days of their last maintenance.
    - **Ghost Asset**: Identifies available assets lying idle with zero activity for over a year.
    - **Software Duplicate**: Flags users holding multiple licenses of the same software.
  - Dedicated **Anomaly Approval Center** to approve/suppress alerts before notifications digest emails are fired.
- **🔔 Real-Time Notification Center**:
  - Integrated notification bell that ticks in lockstep with app updates.
  - soft session refreshes on profile or role changes.
- **📊 Reports & Standalone Data Viewer**:
  - Category and status distribution pie/bar charts with smooth SVG animations.
  - **Interactive Standalone Data Viewer (`/dataview`)**: Opens detailed reports in a dedicated tab with categorical quick-filters, pagination, JSON detail inspector, and CSV exports.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16.2 (Turbopack enabled)
- **Frontend**: React 19, Framer Motion (for premium micro-animations), Lucide React (icons), Recharts (data visualizations)
- **Database ORM**: Prisma (PostgreSQL / Neon serverless adapter)
- **Authentication**: NextAuth.js (Auth.js v5)
- **Styling**: Tailwind CSS 4, Vanilla CSS variables

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database instance (or a Neon database connection string)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Satbir-Singh-42/Odoo-Hackathon.git
   cd assetflow-next
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory (refer to `.env.local.example`):
   ```env
   DATABASE_URL="postgresql://..."
   AUTH_SECRET="your-next-auth-secret"
   ```

4. Run database migrations and seed default values:
   ```bash
   npx prisma db push
   npx prisma db seed
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔐 Role-Based Access Control (RBAC)

The application enforces server-side and client-side filters based on user roles:
- **Admin**: Full read/write access to settings, users, categories, vendors, allocations, reports, and anomaly configurations.
- **Manager**: Access to assets, allocations, maintenance scheduling, and viewing/resolving anomalies.
- **Viewer**: Read-only access to assigned assets, personal notifications, and self-service bookings. Can toggle "Viewer Mode" to see how pages look for restricted roles.
