'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import {
  Asset,
  MaintenanceRecord,
  User,
  LicenseAllocation,
  getTotalQuantity,
  getAllocatedQuantity,
  getAvailableQuantity,
} from '@/types';
import { isLicenseRenewalMaintenance } from '@/lib/utils/assetHelpers';
import {
  isSoftwareLikeCategory,
  ASSET_STATUS,
  MAINTENANCE_STATUS,
  ALLOCATION_STATUS_DISPLAY,
  CHART_TOOLTIP_STYLE,
  CHART_LEGEND_STYLE,
} from '@/config/constants';
import { Download, TrendingUp, Package, DollarSign, Key, AlertTriangle } from "lucide-react";
import { formatCSVDate, formatCSVDateTime } from '@/lib/utils/csvHelpers';
import { openDataView } from '@/lib/utils/dataViewHelpers';
import { generateAssetsExport, generateAllocationsExport, generateMaintenanceExport } from '@/lib/utils/exportHelpers';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import { formatDisplayDate } from '@/lib/utils/dateHelpers';
import { useIsMobile } from '@/hooks/useIsMobile';
import { AssetDrillModal } from "./Dashboard";

interface ReportsProps {
  assets: Asset[];
  maintenanceRecords: MaintenanceRecord[];
  users: User[];
  licenseAllocations: LicenseAllocation[];
  onViewAsset?: (asset: Asset) => void;
}

// ==================== STATIC DATA (Outside Component) ====================
const COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#6366F1",
  "#EC4899",
];

type PieDatum = {
  name: string;
  value: number;
};

const STATUS_CHART_ORDER: string[] = [
  ASSET_STATUS.AVAILABLE,
  ASSET_STATUS.ALLOCATED,
  ASSET_STATUS.PARTIALLY_ALLOCATED,
  ASSET_STATUS.UNDER_MAINTENANCE,
  ASSET_STATUS.LICENSE_EXPIRED,
  ASSET_STATUS.DISPOSED,
];

const sortStatusNames = (left: string, right: string) => {
  const leftIndex = STATUS_CHART_ORDER.indexOf(left);
  const rightIndex = STATUS_CHART_ORDER.indexOf(right);

  const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
  const normalizedRightIndex =
    rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

  if (normalizedLeftIndex !== normalizedRightIndex) {
    return normalizedLeftIndex - normalizedRightIndex;
  }

  return left.localeCompare(right);
};

const sortStatusPieData = (data: PieDatum[]) =>
  [...data].sort((left, right) => sortStatusNames(left.name, right.name));

const buildPieValueMap = (data: PieDatum[]) =>
  new Map(data.map((item) => [item.name, item.value] as const));

const buildZeroPieData = (data: PieDatum[]) =>
  data.map((item) => ({ name: item.name, value: 0 }));

const getRoundedPieValue = (value: unknown) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
};

const getPieDatumName = (entry: unknown) => {
  if (!entry || typeof entry !== "object") return "";

  const payloadName = (entry as { payload?: { name?: string } }).payload?.name;
  if (typeof payloadName === "string") return payloadName;

  const directName = (entry as { name?: string }).name;
  return typeof directName === "string" ? directName : "";
};

const DISPOSED_STATUS = "Disposed";

const isInactiveAssetStatus = (status: string) =>
  status === ASSET_STATUS.DISPOSED || status === DISPOSED_STATUS;


const getStatusDistribution = (sourceAssets: Asset[]) =>
  Object.entries(
    sourceAssets.reduce(
      (acc, asset) => {
        // Map Partially Allocated to its actual state (child is either allocated or available)
        if (
          asset.status === ASSET_STATUS.PARTIALLY_ALLOCATED ||
          asset.status === ASSET_STATUS.ALLOCATED
        ) {
          // Child units that are allocated (have an employee/parent/location assigned)
          if (asset.employeeId || asset.parentAssetId || asset.installationLocation) {
            acc[ASSET_STATUS.ALLOCATED] =
              (acc[ASSET_STATUS.ALLOCATED] || 0) + 1;
          } else {
            acc[ASSET_STATUS.AVAILABLE] =
              (acc[ASSET_STATUS.AVAILABLE] || 0) + 1;
          }
        } else {
          acc[asset.status] = (acc[asset.status] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).map(([name, value]) => ({ name, value }));

const ChartSection = ({
  bgVia,
  deco,
  iconBg,
  icon: Icon,
  title,
  children,
}: {
  bgVia: string;
  deco: string;
  iconBg: string;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) => (
  <div
    className={`relative bg-linear-to-br from-white ${bgVia} to-white rounded-2xl shadow-lg p-5 sm:p-7 hover:shadow-xl transition-all duration-300 overflow-hidden`}>
    <div
      className={`absolute top-0 right-0 w-40 h-40 bg-linear-to-br ${deco} rounded-full blur-3xl opacity-20 -mr-20 -mt-20`}
    />
    <div className="relative">
      <div className="flex items-center gap-3 mb-5">
        <div className={`p-2.5 bg-linear-to-br ${iconBg} rounded-xl shadow-md`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  </div>
);

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const PIE_SWEEP_START_ANGLE = 90;
const PIE_SWEEP_END_ANGLE = 450;
const STATUS_FILTER_REFORM_DURATION = 1530;

const useCountUp = (target: number, duration = 800) => {
  const [value, setValue] = useState(0);
  const previousTargetRef = useRef(0);

  useEffect(() => {
    const nextValue = Number.isFinite(target) ? target : 0;
    const startValue = previousTargetRef.current;
    previousTargetRef.current = nextValue;

    if (duration <= 0 || startValue === nextValue) {
      setValue(nextValue);
      return;
    }

    let frameId = 0;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;

      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const interpolatedValue =
        startValue + (nextValue - startValue) * easedProgress;

      setValue(interpolatedValue);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [target, duration]);

  return value;
};

const useReformedPieData = (
  targetData: PieDatum[],
  triggerValue: string,
  duration = 1100,
) => {
  const [animatedData, setAnimatedData] = useState<PieDatum[]>(() =>
    buildZeroPieData([...targetData].sort((a, b) => sortStatusNames(a.name, b.name))),
  );
  const previousDataRef = useRef<PieDatum[]>(
    buildZeroPieData([...targetData].sort((a, b) => sortStatusNames(a.name, b.name))),
  );

  useEffect(() => {
    const previousData = previousDataRef.current;
    previousDataRef.current = targetData;

    if (duration <= 0) {
      setAnimatedData(targetData);
      return;
    }

    const previousValueMap = buildPieValueMap(previousData);
    const targetValueMap = buildPieValueMap(targetData);
    const allNames = Array.from(
      new Set([...previousValueMap.keys(), ...targetValueMap.keys()]),
    ).sort(sortStatusNames);

    if (allNames.length === 0) {
      setAnimatedData([]);
      return;
    }

    let frameId = 0;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;

      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easedProgress = easeInOutCubic(progress);

      const nextData = allNames
        .map((name) => {
          const startValue = previousValueMap.get(name) ?? 0;
          const endValue = targetValueMap.get(name) ?? 0;
          return {
            name,
            value: startValue + (endValue - startValue) * easedProgress,
          };
        });

      setAnimatedData(nextData);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        setAnimatedData(targetData);
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [targetData, triggerValue, duration]);

  return animatedData;
};

export function Reports({
  assets,
  maintenanceRecords,
  users,
  licenseAllocations,
  onViewAsset,
}: ReportsProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    null,
  );
  const [drillModal, setDrillModal] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const categoryPieChartRef = useRef<HTMLDivElement>(null);
  const statusPieChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedCategory) return;

    const handleDocumentPress = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const clickedInsideCategoryPie =
        categoryPieChartRef.current?.contains(target) ?? false;
      const clickedInsideStatusPie =
        statusPieChartRef.current?.contains(target) ?? false;

      if (!clickedInsideCategoryPie && !clickedInsideStatusPie) {
        setSelectedCategory(null);
      }
    };

    document.addEventListener("mousedown", handleDocumentPress);
    document.addEventListener("touchstart", handleDocumentPress);

    return () => {
      document.removeEventListener("mousedown", handleDocumentPress);
      document.removeEventListener("touchstart", handleDocumentPress);
    };
  }, [selectedCategory]);

  // ==================== MEMOIZED DATA (Performance Optimization) ====================

  // Child-centric: exclude bulk parents, include individual children & standalone assets.
  // This ensures disposed children are properly excluded from active counts.
  const activeAssets = useMemo(() => {
    // For counting and valuation, we include:
    // 1. Standalone assets (not bulk parent, not child)
    // 2. Child units
    // 3. Bulk parents that have NO child units in the system (e.g. software licenses)
    const parentChildCounts = new Map<string, number>();
    assets.forEach((a) => {
      if (a.bulkOrderParentId) {
        const pid = String(a.bulkOrderParentId);
        parentChildCounts.set(pid, (parentChildCounts.get(pid) || 0) + 1);
      }
    });

    return assets.filter(
      (a) =>
        a.status !== ASSET_STATUS.DISPOSED &&
        (!a.isBulkOrder || (parentChildCounts.get(String(a.id)) || 0) === 0),
    );
  }, [assets]);

  // All countable assets (including disposed) for status chart — still child-centric
  const allCountableAssets = useMemo(() => {
    const parentChildCounts = new Map<string, number>();
    assets.forEach((a) => {
      if (a.bulkOrderParentId) {
        const pid = String(a.bulkOrderParentId);
        parentChildCounts.set(pid, (parentChildCounts.get(pid) || 0) + 1);
      }
    });
    return assets.filter(
      (a) => !a.isBulkOrder || (parentChildCounts.get(String(a.id)) || 0) === 0
    );
  }, [assets]);

  // Top-level assets for display tables (software licenses, vendor breakdown, exports)
  const topLevelActiveAssets = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.status !== ASSET_STATUS.DISPOSED &&
          (!a.bulkOrderParentId || a.isBulkOrder),
      ),
    [assets],
  );

  const categoryData = useMemo(
    () =>
      Object.entries(
        activeAssets.reduce(
          (acc, asset) => {
            acc[asset.category] = (acc[asset.category] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      ).map(([name, value]) => ({ name, value }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [activeAssets],
  );

  const statusData = useMemo(
    () => sortStatusPieData(getStatusDistribution(allCountableAssets)),
    [allCountableAssets],
  );

  const statusChartData = useMemo(() => {
    if (!selectedCategory) return statusData;

    const filteredAssets = allCountableAssets.filter(
      (asset) => asset.category === selectedCategory,
    );

    return sortStatusPieData(getStatusDistribution(filteredAssets));
  }, [selectedCategory, statusData, allCountableAssets]);

  const categoryPieAnimationKey = useMemo(() => "category-load", []);

  const reformedCategoryData = useReformedPieData(
    categoryData,
    categoryPieAnimationKey,
    1200,
  );

  const statusPieAnimationKey = useMemo(
    () => selectedCategory ?? "all",
    [selectedCategory],
  );

  const reformedStatusChartData = useReformedPieData(
    statusChartData,
    statusPieAnimationKey,
    STATUS_FILTER_REFORM_DURATION,
  );

  const categoryValueMap = useMemo(
    () => buildPieValueMap(categoryData),
    [categoryData],
  );

  const statusValueMap = useMemo(
    () => buildPieValueMap(statusChartData),
    [statusChartData],
  );

  const summaryScopeAssets = useMemo(() => {
    if (!selectedCategory) return activeAssets;
    return activeAssets.filter((asset) => asset.category === selectedCategory);
  }, [activeAssets, selectedCategory]);

  const selectedCategoryAssetIds = useMemo(() => {
    if (!selectedCategory) return null;
    return new Set(
      allCountableAssets
        .filter((asset) => asset.category === selectedCategory)
        .map((asset) => String(asset.id)),
    );
  }, [allCountableAssets, selectedCategory]);

  const activeAssetIdSet = useMemo(() => {
    // For RENEWAL and MAINTENANCE: include all active assets (standalone, parents, and children).
    // Renewal records are often stored against the bulk parent ID (e.g. SW001),
    // while individual maintenance might be on children. We need to look up both.
    const ids = new Set<string>();
    assets.forEach((asset) => {
      if (!isInactiveAssetStatus(asset.status)) {
        ids.add(String(asset.id));
      }
    });
    return ids;
  }, [assets]);

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [String(asset.id), asset] as const)),
    [assets],
  );

  const latestRenewalByAssetId = useMemo(() => {
    // Latest completed renewal cost per active asset
    const latestRenewalPerAsset = new Map<string, { cost: number; date: number }>();

    maintenanceRecords.forEach((record) => {
      if (record.cost === null || record.cost <= 0) return;
      if (record.status !== MAINTENANCE_STATUS.COMPLETED) return;
      if (!isLicenseRenewalMaintenance(record)) return;
      if (!record.assetId) return;

      const assetId = String(record.assetId);
      if (!activeAssetIdSet.has(assetId)) return;

      const dateSource =
        record.completionDate ||
        record.scheduledDate ||
        record.createdAt ||
        "";
      const dateValue = dateSource ? new Date(dateSource).getTime() : 0;

      const existing = latestRenewalPerAsset.get(assetId);
      if (!existing || dateValue >= existing.date) {
        latestRenewalPerAsset.set(assetId, { cost: record.cost, date: dateValue });
      }
    });

    return latestRenewalPerAsset;
  }, [maintenanceRecords, activeAssetIdSet]);

  const totalRenewalCostForSummary = useMemo(() => {
    let total = 0;
    latestRenewalByAssetId.forEach((item, assetId) => {
      if (selectedCategoryAssetIds && !selectedCategoryAssetIds.has(assetId)) return;
      total += item.cost;
    });
    return total;
  }, [latestRenewalByAssetId, selectedCategoryAssetIds]);

  // Most-recent completed renewal date across active assets (all-asset scope, not software-only)
  const summaryLatestRenewalDateLabel = useMemo(() => {
    let latestDate = 0;

    maintenanceRecords.forEach((record) => {
      if (record.cost === null || record.cost <= 0) return;
      if (record.status !== MAINTENANCE_STATUS.COMPLETED) return;
      if (!isLicenseRenewalMaintenance(record)) return;
      if (!record.assetId) return;

      const assetId = String(record.assetId);
      if (!activeAssetIdSet.has(assetId)) return;
      if (selectedCategoryAssetIds && !selectedCategoryAssetIds.has(assetId)) return;

      const dateSource =
        record.completionDate ||
        record.scheduledDate ||
        record.createdAt ||
        "";
      const dateValue = dateSource ? new Date(dateSource).getTime() : 0;

      if (dateValue >= latestDate) {
        latestDate = dateValue;
      }
    });

    return latestDate ? formatDisplayDate(new Date(latestDate)) : null;
  }, [maintenanceRecords, activeAssetIdSet, selectedCategoryAssetIds]);

  const handleCategorySliceClick = useCallback((categoryName: string) => {
    setSelectedCategory((prev) =>
      prev === categoryName ? null : categoryName,
    );
  }, []);

  const vendorData = useMemo(() => {
    const vendorTotals: Record<string, { count: number; value: number }> = {};

    activeAssets.forEach((asset) => {
      const vendorName = asset.vendorName || "Unknown";
      if (!vendorTotals[vendorName]) {
        vendorTotals[vendorName] = { count: 0, value: 0 };
      }
      const qty = asset.isBulkOrder ? getTotalQuantity(asset) : 1;
      vendorTotals[vendorName].count += 1;
      vendorTotals[vendorName].value += (asset.purchasePrice || 0) * qty;
    });

    latestRenewalByAssetId.forEach((item, assetId) => {
      if (!item.cost) return;
      const asset = assetById.get(assetId);
      if (!asset) return;

      const vendorName = asset.vendorName || "Unknown";
      if (!vendorTotals[vendorName]) {
        vendorTotals[vendorName] = { count: 0, value: 0 };
      }
      vendorTotals[vendorName].value += item.cost;
    });

    return Object.entries(vendorTotals)
      .map(([name, data]) => ({
        name,
        count: data.count,
        value: Math.round(data.value),
      }))
      .sort((a, b) => b.value - a.value);
  }, [activeAssets, latestRenewalByAssetId, assetById]);

  const categorySummaryData = useMemo(() => {
    const summary: Record<
      string,
      { available: number; allocated: number; maintenance: number; value: number }
    > = {};

    activeAssets.forEach((asset) => {
      const category = asset.category || "Uncategorized";
      if (!summary[category]) {
        summary[category] = {
          available: 0,
          allocated: 0,
          maintenance: 0,
          value: 0,
        };
      }

      const qty = asset.isBulkOrder ? getTotalQuantity(asset) : 1;
      summary[category].value += (asset.purchasePrice || 0) * qty;

      // Determine allocation status per child unit
      if (asset.employeeId || asset.parentAssetId) {
        summary[category].allocated += 1;
      } else if (asset.status !== ASSET_STATUS.UNDER_MAINTENANCE) {
        summary[category].available += 1;
      }
    });

    latestRenewalByAssetId.forEach((item, assetId) => {
      if (!item.cost) return;
      const asset = assetById.get(assetId);
      if (!asset) return;

      const category = asset.category || "Uncategorized";
      if (!summary[category]) {
        summary[category] = {
          available: 0,
          allocated: 0,
          maintenance: 0,
          value: 0,
        };
      }
      summary[category].value += item.cost;
    });

    maintenanceRecords.forEach((m) => {
      if (m.status !== MAINTENANCE_STATUS.COMPLETED) return;
      if (isLicenseRenewalMaintenance(m)) return;
      if (!m.cost) return;

      const asset = assetById.get(String(m.assetId));
      if (!asset) return;

      const category = asset.category || "Uncategorized";
      if (!summary[category]) {
        summary[category] = {
          available: 0,
          allocated: 0,
          maintenance: 0,
          value: 0,
        };
      }
      summary[category].maintenance += m.cost;
    });

    return Object.entries(summary);
  }, [activeAssets, latestRenewalByAssetId, assetById, maintenanceRecords]);

  // Consolidated summary stats — single pass over activeAssets (child-centric, each row = 1 unit)
  const { totalValue, totalAssetsCount, avgValue } = useMemo(() => {
    let value = totalRenewalCostForSummary;
    let count = 0;
    for (const a of summaryScopeAssets) {
      // For childless bulk parents (e.g. a software license pool with no individual unit rows)
      // purchasePrice is per-unit, so multiply by totalQuantity to get the full pool value.
      // For standalone assets and individual child units, totalQuantity is effectively 1.
      const qty = a.isBulkOrder ? getTotalQuantity(a) : 1;
      value += (a.purchasePrice || 0) * qty;
      count += 1;
    }
    return {
      totalValue: Math.round(value),
      totalAssetsCount: count,
      avgValue: count > 0 ? value / count : 0,
    };
  }, [summaryScopeAssets, totalRenewalCostForSummary]);

  const totalMaintenanceCost = useMemo(
    () =>
      maintenanceRecords
        .filter((m) => {
          if (m.cost === null) return false;
          if (m.status !== MAINTENANCE_STATUS.COMPLETED) return false;
          if (isLicenseRenewalMaintenance(m)) return false;
          if (!m.assetId) return false;

          const assetId = String(m.assetId);
          if (!activeAssetIdSet.has(assetId)) return false;
          if (!selectedCategoryAssetIds) return true;
          return selectedCategoryAssetIds.has(assetId);
        })
        .reduce((sum, m) => sum + (m.cost || 0), 0),
    [maintenanceRecords, selectedCategoryAssetIds, activeAssetIdSet],
  );

  const softwareAssetIdSet = useMemo(() => {
    const ids = new Set<string>();
    topLevelActiveAssets.forEach((asset) => {
      if (isInactiveAssetStatus(asset.status)) return;
      if (isSoftwareLikeCategory(asset.category || "")) {
        ids.add(String(asset.id));
      }
    });
    return ids;
  }, [topLevelActiveAssets]);

  const { totalRenewalCost, latestRenewalCost, softwareLatestRenewalDateLabel } =
    useMemo(() => {
      // For software monitoring, we also want the sum of the LATEST renewals per software asset
      const latestRenewalPerAsset = new Map<string, { cost: number; date: number }>();
      let overallLatestCost = 0;
      let overallLatestDate = 0;

      maintenanceRecords.forEach((record) => {
        if (record.cost === null || record.cost <= 0) return;
        if (record.status !== MAINTENANCE_STATUS.COMPLETED) return;
        if (!isLicenseRenewalMaintenance(record)) return;
        if (!record.assetId) return;

        const assetId = String(record.assetId);
        if (!softwareAssetIdSet.has(assetId)) return;

        const dateSource =
          record.completionDate ||
          record.scheduledDate ||
          record.createdAt ||
          "";
        const dateValue = dateSource ? new Date(dateSource).getTime() : 0;

        // For the total sum (latest per asset)
        const existing = latestRenewalPerAsset.get(assetId);
        if (!existing || dateValue >= existing.date) {
          latestRenewalPerAsset.set(assetId, { cost: record.cost, date: dateValue });
        }

        // For the single most recent transaction display
        if (dateValue >= overallLatestDate) {
          overallLatestDate = dateValue;
          overallLatestCost = record.cost;
        }
      });

      let totalSum = 0;
      latestRenewalPerAsset.forEach((item) => {
        totalSum += item.cost;
      });

      return {
        totalRenewalCost: Math.round(totalSum),
        latestRenewalCost: Math.round(overallLatestCost),
        softwareLatestRenewalDateLabel: overallLatestDate
          ? formatDisplayDate(new Date(overallLatestDate))
          : null,
      };
    }, [maintenanceRecords, softwareAssetIdSet]);

  const animatedTotalAssetsCount = useCountUp(totalAssetsCount, 700);
  const animatedTotalValue = useCountUp(totalValue, 900);
  const animatedAvgValue = useCountUp(avgValue, 900);
  const animatedTotalMaintenanceCost = useCountUp(totalMaintenanceCost, 900);
  const softwareLicenses = useMemo(
    () =>
      topLevelActiveAssets
        .filter(
          (asset) =>
            isSoftwareLikeCategory(asset.category || "") && asset.totalQuantity,
        )
        .map((asset) => {
          const totalLicenses = getTotalQuantity(asset);
          const allocatedLicenses = getAllocatedQuantity(asset);
          const availableLicenses =
            asset.status === ASSET_STATUS.LICENSE_EXPIRED
              ? 0
              : getAvailableQuantity(asset);

          return {
            id: asset.id,
            name: asset.assetName,
            assetCode: asset.assetCode,
            totalLicenses,
            allocatedLicenses,
            availableLicenses,
            utilizationRate: totalLicenses
              ? (allocatedLicenses / totalLicenses) * 100
              : 0,
            purchasePrice: asset.purchasePrice || 0,
            expiryDate: asset.licenseExpiryDate,
            licenseType: asset.licenseType,
            vendorName: asset.vendorName,
          };
        })
        .sort((a, b) => b.totalLicenses - a.totalLicenses),
    [topLevelActiveAssets],
  );

  const topLicensesChartData = useMemo(
    () =>
      softwareLicenses.slice(0, 10).map((license) => ({
        name: license.name,
        total: license.totalLicenses,
        allocated: license.allocatedLicenses,
        available: license.availableLicenses,
      })),
    [softwareLicenses],
  );

  const topLicenseNameAxisWidth = useMemo(() => {
    const maxLabelLength = topLicensesChartData.reduce(
      (longest, item) => Math.max(longest, String(item.name || "").length),
      0,
    );

    const perCharacterWidth = isMobile ? 4.9 : 6.8;
    const padding = isMobile ? 12 : 30;
    const minWidth = isMobile ? 84 : 180;
    const maxWidth = isMobile ? 180 : 320;

    return Math.min(
      maxWidth,
      Math.max(minWidth, Math.ceil(maxLabelLength * perCharacterWidth + padding)),
    );
  }, [topLicensesChartData, isMobile]);

  const topLicensesChartHeight = useMemo(() => {
    const rows = Math.max(topLicensesChartData.length, 1);
    const minHeight = isMobile ? 220 : 300;
    const maxHeight = isMobile ? 560 : 760;
    const perRowHeight = isMobile ? 72 : 88;
    const basePadding = isMobile ? 76 : 100;

    return Math.min(
      maxHeight,
      Math.max(minHeight, rows * perRowHeight + basePadding),
    );
  }, [topLicensesChartData.length, isMobile]);
  const topLicenseBarSize = useMemo(() => {
    const rows = topLicensesChartData.length;

    if (isMobile) {
      if (rows <= 2) return 44;
      if (rows <= 4) return 40;
      if (rows <= 7) return 36;
      return 32;
    }
    if (rows <= 2) return 64;
    if (rows <= 4) return 56;
    if (rows <= 7) return 52;
    return 48;
  }, [topLicensesChartData.length, isMobile]);

  const totalLicensesCount = useMemo(
    () => softwareLicenses.reduce((sum, l) => sum + l.totalLicenses, 0),
    [softwareLicenses],
  );

  const totalAllocatedLicenses = useMemo(
    () => softwareLicenses.reduce((sum, l) => sum + l.allocatedLicenses, 0),
    [softwareLicenses],
  );

  const totalAvailableLicenses = useMemo(
    () => softwareLicenses.reduce((sum, l) => sum + l.availableLicenses, 0),
    [softwareLicenses],
  );

  const bulkChildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    assets.forEach((asset) => {
      if (asset.bulkOrderParentId) {
        const pid = String(asset.bulkOrderParentId);
        counts.set(pid, (counts.get(pid) || 0) + 1);
      }
    });
    return counts;
  }, [assets]);

  const latestRenewalByAssetIdForExports = useMemo(() => {
    const latestRenewalPerAsset = new Map<string, { cost: number; date: number }>();

    maintenanceRecords.forEach((record) => {
      if (record.cost === null || record.cost <= 0) return;
      if (record.status !== MAINTENANCE_STATUS.COMPLETED) return;
      if (!isLicenseRenewalMaintenance(record)) return;
      if (!record.assetId) return;

      const assetId = String(record.assetId);
      const dateSource =
        record.completionDate ||
        record.scheduledDate ||
        record.createdAt ||
        "";
      const dateValue = dateSource ? new Date(dateSource).getTime() : 0;

      const existing = latestRenewalPerAsset.get(assetId);
      if (!existing || dateValue >= existing.date) {
        latestRenewalPerAsset.set(assetId, { cost: record.cost, date: dateValue });
      }
    });

    return latestRenewalPerAsset;
  }, [maintenanceRecords]);

  const getRenewalCostForAsset = useCallback(
    (asset: Asset) => {
      let renewalCost =
        latestRenewalByAssetIdForExports.get(String(asset.id))?.cost ?? 0;

      if (asset.bulkOrderParentId) {
        const pid = String(asset.bulkOrderParentId);
        const parentRenewal =
          latestRenewalByAssetIdForExports.get(pid)?.cost ?? 0;
        const childCount = bulkChildCounts.get(pid) || 1;
        renewalCost += parentRenewal / childCount;
      }

      return renewalCost;
    },
    [latestRenewalByAssetIdForExports, bulkChildCounts],
  );

  // ==================== CSV EXPORT HANDLERS (useCallback) ====================
  const exportDetailedAssetsToCSV = useCallback(() => {
    generateAssetsExport(
      assets, 
      assets, 
      licenseAllocations, 
      users, 
      "Admin", // Assume admin role for full report access
      false,    // Show all units
      maintenanceRecords || []
    );
  }, [assets, licenseAllocations, users, maintenanceRecords]);

  const exportAllocationsToCSV = useCallback(() => {
    generateAllocationsExport(assets, assets, licenseAllocations);
  }, [assets, licenseAllocations]);

  const exportMaintenanceToCSV = useCallback(() => {
    generateMaintenanceExport(maintenanceRecords, assets);
  }, [assets, maintenanceRecords]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Reports & Analytics
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Comprehensive insights into your inventory
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={exportDetailedAssetsToCSV}
            className="bg-green-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-sm font-medium">
            <Download className="w-5 h-5" />
            Assets Report
          </button>
          <button
            onClick={exportAllocationsToCSV}
            className="bg-orange-500 text-white px-4 py-2 text-sm rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 shadow-sm font-medium">
            <Download className="w-5 h-5" />
            Allocations Report
          </button>
          <button
            onClick={exportMaintenanceToCSV}
            className="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm font-medium">
            <Download className="w-5 h-5" />
            Maintenance Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg shadow-sm p-2 sm:p-2.5 hover:shadow-md transition-all">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900 text-sm sm:text-base truncate">
                Total Active Assets
              </span>
              <div className="p-1.5 bg-blue-50 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-[21px] sm:text-[29px] font-bold text-blue-600">
              {Math.round(animatedTotalAssetsCount)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-2 sm:p-2.5 hover:shadow-md transition-all">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900 text-sm sm:text-base truncate">
                Total Value
              </span>
              <div className="p-1.5 bg-green-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-[21px] sm:text-[29px] font-bold text-green-600 truncate">
              ₹
              {formatCurrencyValue(Math.round(animatedTotalValue))}
            </p>
            {totalRenewalCostForSummary > 0 ? (
              <p className="text-[10px] sm:text-xs text-emerald-600 font-medium truncate">
                Latest renewals total: ₹
                {formatCurrencyValue(Math.round(totalRenewalCostForSummary))}
                {summaryLatestRenewalDateLabel && (
                  <span className="text-gray-400 font-normal">
                    {" "}
                    latest on {summaryLatestRenewalDateLabel}
                  </span>
                )}
              </p>
            ) : null}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-2 sm:p-2.5 hover:shadow-md transition-all">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900 text-sm sm:text-base truncate">
                Avg. Value
              </span>
              <div className="p-1.5 bg-purple-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <p className="text-[21px] sm:text-[29px] font-bold text-purple-600 truncate">
              ₹
              {formatCurrencyValue(Math.round(animatedAvgValue))}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-2 sm:p-2.5 hover:shadow-md transition-all">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900 text-sm sm:text-base truncate">
                Maintenance Cost
              </span>
              <div className="p-1.5 bg-orange-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-orange-600" />
              </div>
            </div>
            <p className="text-[21px] sm:text-[29px] font-bold text-orange-600 truncate">
              ₹{formatCurrencyValue(Math.round(animatedTotalMaintenanceCost))}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Assets by Category - Modern Design */}
        <ChartSection
          bgVia="via-blue-50/30"
          deco="from-blue-100 to-purple-100"
          iconBg="from-blue-500 to-blue-600"
          icon={Package}
          title="Assets by Category">
          {categoryData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-gray-400">
              <Package className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm font-medium">No assets by category</p>
            </div>
          ) : (
            <div ref={categoryPieChartRef}>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <defs>
                    <linearGradient id="colorBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="colorPurple" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <Pie
                    data={reformedCategoryData}
                    cx="50%"
                    cy="50%"
                    startAngle={PIE_SWEEP_START_ANGLE}
                    endAngle={PIE_SWEEP_END_ANGLE}
                    isAnimationActive={false}
                    rootTabIndex={-1}
                    labelLine={false}
                    label={({ percent }: any) => `${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={90}
                    innerRadius={55}
                    fill="#8884d8"
                    dataKey="value"
                    paddingAngle={2}>
                    {reformedCategoryData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        onClick={() => handleCategorySliceClick(entry.name)}
                        onMouseDown={(e) => e.preventDefault()}
                        tabIndex={-1}
                        fill={COLORS[index % COLORS.length]}
                        stroke="#F8FAFC"
                        strokeWidth={selectedCategory === entry.name ? 2.5 : 1.5}
                        style={{
                          cursor: "pointer",
                          opacity:
                            selectedCategory && selectedCategory !== entry.name
                              ? 0.45
                              : 1,
                          transition:
                            "opacity 180ms ease, stroke-width 180ms ease",
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value, _name, entry) => {
                      const pieName = getPieDatumName(entry);
                      const stableValue = pieName
                        ? categoryValueMap.get(pieName)
                        : undefined;

                      return [
                        stableValue ?? getRoundedPieValue(value),
                        pieName || "Count",
                      ];
                    }}
                  />
                  <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartSection>

        {/* Assets by Status - Modern Design */}
        <ChartSection
          bgVia="via-purple-50/30"
          deco="from-purple-100 to-pink-100"
          iconBg="from-purple-500 to-purple-600"
          icon={TrendingUp}
          title="Assets by Status">
          {selectedCategory && (
            <div className="mb-2">
              <p className="text-xs sm:text-sm text-gray-600">
                Showing status for{" "}
                <span className="font-semibold text-gray-900">
                  {selectedCategory}
                </span>
              </p>
            </div>
          )}
          {statusChartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-gray-400">
              <TrendingUp className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm font-medium">No assets by status</p>
            </div>
          ) : (
            <div ref={statusPieChartRef}>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={reformedStatusChartData}
                    cx="50%"
                    cy="50%"
                    startAngle={PIE_SWEEP_START_ANGLE}
                    endAngle={PIE_SWEEP_END_ANGLE}
                    isAnimationActive={false}
                    rootTabIndex={-1}
                    labelLine={false}
                    label={({ percent }: any) => `${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={90}
                    innerRadius={55}
                    fill="#8884d8"
                    dataKey="value"
                    paddingAngle={2}>
                    {reformedStatusChartData.map((entry, index) => {
                      const statusColors: Record<string, string> = {
                        Available: "#3B82F6", // Blue
                        Allocated: "#8B5CF6", // Purple
                        "Partially Allocated": "#06B6D4", // Cyan/Teal
                        "Under Maintenance": "#F59E0B", // Amber
                        "License Expired": "#DC2626", // Red
                        Disposed: "#94A3B8", // Slate
                      };
                      return (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={
                            statusColors[entry.name] ||
                            COLORS[index % COLORS.length]
                          }
                          stroke="#F8FAFC"
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value, _name, entry) => {
                      const pieName = getPieDatumName(entry);
                      const stableValue = pieName
                        ? statusValueMap.get(pieName)
                        : undefined;

                      return [
                        stableValue ?? getRoundedPieValue(value),
                        pieName || "Count",
                      ];
                    }}
                  />
                  <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartSection>
      </div>

      {/* Vendor Analysis - Full Width Professional Design */}
      <ChartSection
        bgVia="via-green-50/20"
        deco="from-green-100 to-emerald-100"
        iconBg="from-green-500 to-emerald-600"
        icon={DollarSign}
        title="Vendor Analysis — Assets & Value">

        {vendorData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Package className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm font-medium">No vendor data available</p>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-blue-50/60 rounded-xl px-4 py-3 border border-blue-100">
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest mb-0.5">Vendors</p>
                <p className="text-xl font-bold text-blue-700">{vendorData.length}</p>
              </div>
              <div className="bg-emerald-50/60 rounded-xl px-4 py-3 border border-emerald-100">
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest mb-0.5">Total Assets</p>
                <p className="text-xl font-bold text-emerald-700">{vendorData.reduce((s, v) => s + v.count, 0)}</p>
              </div>
              <div className="bg-purple-50/60 rounded-xl px-4 py-3 border border-purple-100 col-span-2 sm:col-span-1">
                <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-widest mb-0.5">Total Value</p>
                <p className="text-lg sm:text-xl font-bold text-purple-700 leading-tight">
                  ₹{formatCurrencyValue(vendorData.reduce((s, v) => s + v.value, 0))}
                </p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={Math.max(280, Math.min(460, vendorData.length * 62 + 80))}>
              <BarChart
                data={vendorData}
                margin={{ top: 8, right: 28, left: 16, bottom: vendorData.length > 5 ? 60 : 24 }}
                barCategoryGap="30%"
                barGap={6}>
                <defs>
                  <linearGradient id="barBlue2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={1} />
                    <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.75} />
                  </linearGradient>
                  <linearGradient id="barGreen2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                    <stop offset="100%" stopColor="#34D399" stopOpacity={0.75} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} opacity={0.6} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#6B7280", fontWeight: 500 }}
                  axisLine={{ stroke: "#E5E7EB" }}
                  tickLine={false}
                  interval={0}
                  angle={vendorData.length > 4 ? -35 : 0}
                  textAnchor={vendorData.length > 4 ? "end" : "middle"}
                  height={vendorData.length > 4 ? 60 : 28}
                />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => String(v)}
                  label={{ value: "Assets", angle: -90, position: "insideLeft", offset: -4, style: { fontSize: 11, fill: "#9CA3AF" } }}
                  width={42}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 100000
                      ? `₹${(v / 100000).toFixed(1)}L`
                      : v >= 1000
                        ? `₹${(v / 1000).toFixed(0)}K`
                        : `₹${v}`
                  }
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    ...CHART_TOOLTIP_STYLE,
                    minWidth: 180,
                  }}
                  formatter={(value, name) => {
                    if (name === "Total Value (₹)") {
                      return [`₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Total Value"];
                    }
                    return [value, "Assets"];
                  }}
                  labelStyle={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}
                  cursor={{ fill: "rgba(99, 102, 241, 0.04)", radius: 6 }}
                />
                <Legend
                  wrapperStyle={{ ...CHART_LEGEND_STYLE, paddingTop: 12 }}
                  iconType="circle"
                  iconSize={9}
                />
                <Bar
                  yAxisId="left"
                  dataKey="count"
                  fill="url(#barBlue2)"
                  name="Number of Assets"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={52}
                />
                <Bar
                  yAxisId="right"
                  dataKey="value"
                  fill="url(#barGreen2)"
                  name="Total Value (₹)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={52}
                />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </ChartSection>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
          Asset Distribution Summary
        </h2>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Category
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase hidden sm:table-cell">
                    Available
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase hidden sm:table-cell">
                    Allocated
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase hidden md:table-cell">
                    Past Maintenance
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Total Value
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {categorySummaryData.map(([category, stats]) => (
                  <tr
                    key={category}
                    onClick={() => setDrillModal(category)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 font-medium text-gray-900 text-sm">
                      {category}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-green-600 text-sm hidden sm:table-cell">
                      {stats.available}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-purple-600 text-sm hidden sm:table-cell">
                      {stats.allocated}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-orange-600 text-sm hidden md:table-cell">
                      ₹{formatCurrencyValue(stats.maintenance)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-gray-900 text-sm">
                      ₹{formatCurrencyValue(stats.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Category Drill-down Modal */}
      {drillModal && (
        <AssetDrillModal
          title="Assets by Category"
          filterLabel={drillModal}
          filterValue={drillModal}
          filterType="category"
          assets={assets}
          onClose={() => setDrillModal(null)}
          onNavigateToAsset={onViewAsset ? (id) => {
            const asset = assets.find(a => String(a.id) === id);
            if (asset) onViewAsset(asset);
          } : undefined}
        />
      )}

      {/* License Monitoring Section */}
      {softwareLicenses.length > 0 && (
        <>
          <div className="bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg shadow border border-blue-200 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-blue-600 rounded-lg">
                <Key className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  License Inventory Monitoring
                </h2>
                <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">
                  Track high-quantity software licenses and utilization
                </p>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-2 sm:gap-3 mt-3">
              <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full lg:w-3/5">
                <div className="bg-white rounded-lg p-2 sm:p-3 border border-blue-200">
                  <p className="text-[9px] sm:text-xs text-gray-600 mb-1 truncate">
                    Total
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-blue-600">
                    {totalLicensesCount}
                  </p>
                  <p className="text-[8px] sm:text-xs text-gray-500 mt-0.5 truncate hidden sm:block">
                    All software
                  </p>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 border border-green-200">
                  <p className="text-[9px] sm:text-xs text-gray-600 mb-1 truncate">
                    Available
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-green-600">
                    {totalAvailableLicenses}
                  </p>
                  <p className="text-[8px] sm:text-xs text-gray-500 mt-0.5 truncate hidden sm:block">
                    Ready
                  </p>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 border border-purple-200">
                  <p className="text-[9px] sm:text-xs text-gray-600 mb-1 truncate">
                    Allocated
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-purple-600">
                    {totalAllocatedLicenses}
                  </p>
                  <p className="text-[8px] sm:text-xs text-gray-500 mt-0.5 truncate hidden sm:block">
                    In use
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full lg:w-2/5">
                <div className="bg-white rounded-lg p-2 sm:p-3 border border-indigo-200">
                  <p className="text-[9px] sm:text-xs text-gray-600 mb-1 truncate">
                    Total Renewal Cost
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-indigo-600">
                    ₹{formatCurrencyValue(totalRenewalCost)}
                  </p>
                  <p className="text-[8px] sm:text-xs text-gray-500 mt-0.5 truncate hidden sm:block">
                    Software only
                  </p>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 border border-purple-200">
                  <p className="text-[9px] sm:text-xs text-gray-600 mb-1 truncate">
                    Latest Renewal Cost
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-purple-600">
                    ₹{formatCurrencyValue(latestRenewalCost)}
                  </p>
                  <p className="text-[8px] sm:text-xs text-gray-500 mt-0.5 truncate hidden sm:block">
                    {softwareLatestRenewalDateLabel
                      ? `Last renewed: ${softwareLatestRenewalDateLabel}`
                      : "No renewal records"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <ChartSection
            bgVia="via-purple-50/20"
            deco="from-purple-100 to-pink-100"
            iconBg="from-purple-500 to-purple-600"
            icon={Key}
            title="Top Licenses by Quantity">
            {topLicensesChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={topLicensesChartHeight}>
                <BarChart
                  data={topLicensesChartData}
                  layout="vertical"
                  barGap={8}
                  barCategoryGap="12%"
                  margin={{
                    top: isMobile ? 6 : 10,
                    right: isMobile ? 16 : 36,
                    left: isMobile ? -6 : 6,
                    bottom: isMobile ? 6 : 10,
                  }}>                  <defs>
                    <linearGradient id="barPurple" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={1} />
                      <stop
                        offset="95%"
                        stopColor="#A78BFA"
                        stopOpacity={0.8}
                      />
                    </linearGradient>
                    <linearGradient
                      id="barLightGreen"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={1} />
                      <stop
                        offset="95%"
                        stopColor="#34D399"
                        stopOpacity={0.8}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#E5E7EB"
                    strokeWidth={1}
                    opacity={0.58}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    domain={[0, "dataMax"]}
                    allowDecimals={false}
                    axisLine={{ stroke: "#E5E7EB", strokeWidth: 1 }}
                    tickLine={false}
                    tickMargin={8}
                    tick={{
                      fontSize: isMobile ? 11 : 13,
                      fill: "#475569",
                      fontWeight: 700,
                    }}




                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={topLicenseNameAxisWidth}
                    axisLine={{ stroke: "#E5E7EB", strokeWidth: 1 }}
                    tickLine={false}
                    tickMargin={isMobile ? 2 : 10}
                    tick={{
                      fontSize: isMobile ? 11 : 13,
                      fill: "#1E293B",
                      fontWeight: 600,
                    }}

                  />
                  <Tooltip
                    contentStyle={{
                      ...CHART_TOOLTIP_STYLE,
                      border: "1px solid #E2E8F0",
                      borderRadius: "12px",
                      boxShadow: "0 10px 24px rgba(15, 23, 42, 0.16)",
                      padding: "10px 12px",
                    }}
                    labelFormatter={(label) => `License: ${label}`}
                    cursor={{
                      fill: "rgba(148, 163, 184, 0.12)",
                    }}
                  />
                  <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" />
                  <Bar
                    dataKey="allocated"
                    stackId="a"
                    fill="url(#barPurple)"
                    name="Allocated"
                    barSize={topLicenseBarSize}
                    radius={[10, 0, 0, 10]}
                    stroke="#7C3AED"
                    strokeOpacity={0.3}
                    strokeWidth={1.1}
                  />
                  <Bar
                    dataKey="available"
                    stackId="a"
                    fill="url(#barLightGreen)"
                    name="Available"
                    barSize={topLicenseBarSize}
                    radius={[0, 10, 10, 0]}
                    stroke="#059669"
                    strokeOpacity={0.3}
                    strokeWidth={1.1}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <Key className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No license data available</p>
              </div>
            )}
          </ChartSection>

          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
              License Inventory Details
            </h2>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                        License
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                        Total
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                        Allocated
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase hidden lg:table-cell">
                        Vendor
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                        Total Value
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                        Expiry Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {softwareLicenses.map((license) => {
                      const asset = assets.find(
                        (a) => String(a.id) === String(license.id),
                      );
                      const isPerpetual = license.licenseType === "PERPETUAL";
                      return (
                        <tr
                          key={license.id}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() =>
                            asset && onViewAsset && onViewAsset(asset)
                          }>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-900 text-sm">
                                {license.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                {license.assetCode || "-"}
                              </span>
                              {asset?.status === ASSET_STATUS.LICENSE_EXPIRED && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 uppercase tracking-tight mt-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" /> License Expired
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-gray-900 text-sm font-semibold">
                            {license.totalLicenses}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-purple-600 text-sm font-medium">
                            {license.allocatedLicenses}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-gray-600 text-sm hidden lg:table-cell">
                            {license.vendorName}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-gray-900 text-sm">
                            ₹{formatCurrencyValue((license.purchasePrice || 0) + (latestRenewalByAssetIdForExports.get(String(license.id))?.cost ?? 0))}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-gray-600 text-sm">
                            {isPerpetual
                              ? "Perpetual (Unlimited Access)"
                              : license.expiryDate
                                ? formatDisplayDate(license.expiryDate)
                                : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}