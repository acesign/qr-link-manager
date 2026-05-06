import { data } from "react-router";
import prisma from "../db.server";
import shopify from "../shopify.server";

function getDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}

export async function loader({ request }) {
  try {
    const proxyContext = await shopify.authenticate.public.appProxy(request);
    const url = new URL(request.url);

    const shop =
      proxyContext?.shop ||
      url.searchParams.get("shop") ||
      url.searchParams.get("logged_in_customer_shop_domain");

    const loggedInCustomerId = String(
      url.searchParams.get("logged_in_customer_id") || ""
    ).trim();

    if (!shop) {
      return data({ error: "Missing shop context" }, { status: 400 });
    }

    if (!loggedInCustomerId) {
      return data({ error: "Missing customer context" }, { status: 401 });
    }

    const qrCodes = await prisma.qrCode.findMany({
      where: {
        shop,
        customerId: loggedInCustomerId,
      },
      select: {
        id: true,
        qrCode: true,
        qrDisplayCode: true,
        qrPath: true,
        targetUrl: true,
        orderId: true,
        orderName: true,
        createdAt: true,
        analytics: {
          select: {
            totalScans: true,
            uniqueScanCount: true,
	    firstScannedAt: true,
            lastScannedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const sevenDaysAgo = getDateDaysAgo(7);
    const thirtyDaysAgo = getDateDaysAgo(30);

    const records = await Promise.all(
      qrCodes.map(async (row) => {
       const [
  totalScans7d,
  uniqueScans7d,
  totalScans30d,
  uniqueScans30d,
  deviceGroupsRaw,
  locationGroupsRaw
] = await Promise.all([
  prisma.qrScanEvent.count({
    where: {
      qrCodeId: row.id,
      scannedAt: {
        gte: sevenDaysAgo,
      },
    },
  }),
  prisma.qrScanEvent.count({
    where: {
      qrCodeId: row.id,
      scannedAt: {
        gte: sevenDaysAgo,
      },
      isUnique: true,
    },
  }),
  prisma.qrScanEvent.count({
    where: {
      qrCodeId: row.id,
      scannedAt: {
        gte: thirtyDaysAgo,
      },
    },
  }),
  prisma.qrScanEvent.count({
    where: {
      qrCodeId: row.id,
      scannedAt: {
        gte: thirtyDaysAgo,
      },
      isUnique: true,
    },
  }),
  prisma.qrScanEvent.groupBy({
    by: ["deviceType"],
    where: {
      qrCodeId: row.id,
      deviceType: {
        not: null,
      },
    },
    _count: {
      deviceType: true,
    },
  }),
  prisma.qrScanEvent.groupBy({
    by: ["country", "region", "city"],
    where: {
      qrCodeId: row.id,
    },
    _count: {
      country: true,
    },
  }),
]);

const deviceGroups = [...deviceGroupsRaw].sort(
  (a, b) => (b._count.deviceType ?? 0) - (a._count.deviceType ?? 0)
);

const locationGroups = [...locationGroupsRaw].sort(
  (a, b) => (b._count.country ?? 0) - (a._count.country ?? 0)
);

        const topDevice = deviceGroups?.[0]
          ? {
              label: rowLabelDevice(deviceGroups[0].deviceType),
              count: deviceGroups[0]._count.deviceType ?? 0,
            }
          : null;

        const topLocation = locationGroups?.[0]
          ? {
              label: formatLocationLabel(locationGroups[0]),
              count: locationGroups[0]._count.country ?? 0,
            }
          : null;

        return {
          qrCode: row.qrCode,
          qrDisplayCode: row.qrDisplayCode || row.qrCode,
          qrPath: row.qrPath,
          targetUrl: row.targetUrl || "",
          orderId: row.orderId || null,
          orderName: row.orderName || null,
          totalScans: row.analytics?.totalScans ?? 0,
          uniqueScanCount: row.analytics?.uniqueScanCount ?? 0,
	  firstScannedAt: row.analytics?.firstScannedAt ?? null,
          lastScannedAt: row.analytics?.lastScannedAt ?? null,
          miniAnalytics: {
            	totalScans7d,
  		uniqueScans7d,
  		totalScans30d,
  		uniqueScans30d,
  		topDevice,
  		topLocation,
          },
        };
      })
    );

    return data({
      success: true,
      records,
    });
  } catch (error) {
    console.error("Dashboard loader error:", error, error?.stack);
    return data(
      { error: error?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}

function rowLabelDevice(deviceType) {
  if (!deviceType) return "Unknown";
  const value = String(deviceType).toLowerCase();
  if (value === "mobile") return "Mobile";
  if (value === "desktop") return "Desktop";
  if (value === "tablet") return "Tablet";
  return deviceType;
}

function formatLocationLabel(location) {
  const parts = [location.city, location.region, location.country]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean);

  return parts.length ? parts.join(", ") : "Unknown";
}