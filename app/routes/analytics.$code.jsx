import { data } from "react-router";
import prisma from "../db.server";
import shopify from "../shopify.server";

function buildLastNDays(days) {
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    result.push(date.toISOString().slice(0, 10));
  }

  return result;
}

export async function loader({ request, params }) {
  try {
    const proxyContext = await shopify.authenticate.public.appProxy(request);
    const url = new URL(request.url);

    const shop =
      proxyContext?.shop ||
      url.searchParams.get("shop") ||
      url.searchParams.get("logged_in_customer_shop_domain");

    const customerId = String(
      url.searchParams.get("logged_in_customer_id") || ""
    ).trim();

    const code = String(params.code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    if (!shop || !customerId) {
      return data({ error: "Unauthorized" }, { status: 401 });
    }

    if (!code) {
      return data({ error: "Missing QR code" }, { status: 400 });
    }

    const qr = await prisma.qrCode.findFirst({
      where: {
        shop,
        customerId,
        qrCode: code,
      },
      include: {
        analytics: true,
      },
    });

    if (!qr) {
      return data({ error: "QR not found" }, { status: 404 });
    }

    const events = await prisma.qrScanEvent.groupBy({
      by: ["scanDate"],
      where: {
        qrCodeId: qr.id,
      },
      _count: {
        scanDate: true,
      },
      orderBy: {
        scanDate: "asc",
      },
    });

    const last7Days = buildLastNDays(7);

    const eventMap = Object.fromEntries(
      events.map((event) => [event.scanDate, event._count.scanDate])
    );

    const trend7d = last7Days.map((date) => ({
      scanDate: date,
      totalScans: eventMap[date] || 0,
    }));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalScans7d,
      uniqueScans7d,
      totalScans30d,
      uniqueScans30d,
    ] = await Promise.all([
      prisma.qrScanEvent.count({
        where: {
          qrCodeId: qr.id,
          scannedAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.qrScanEvent.count({
        where: {
          qrCodeId: qr.id,
          scannedAt: { gte: sevenDaysAgo },
          isUnique: true,
        },
      }),
      prisma.qrScanEvent.count({
        where: {
          qrCodeId: qr.id,
          scannedAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.qrScanEvent.count({
        where: {
          qrCodeId: qr.id,
          scannedAt: { gte: thirtyDaysAgo },
          isUnique: true,
        },
      }),
    ]);

    return data({
      success: true,
      qrCode: qr.qrCode,
      qrDisplayCode: qr.qrDisplayCode || qr.qrCode,
      targetUrl: qr.targetUrl || "",
      totalScans: qr.analytics?.totalScans ?? 0,
      uniqueScans: qr.analytics?.uniqueScanCount ?? 0,
      firstScannedAt: qr.analytics?.firstScannedAt ?? null,
      lastScannedAt: qr.analytics?.lastScannedAt ?? null,
      totalScans7d,
      uniqueScans7d,
      totalScans30d,
      uniqueScans30d,
      trend7d,
    });
  } catch (error) {
    console.error("Analytics detail loader error:", error);
    return data(
      { error: error?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}