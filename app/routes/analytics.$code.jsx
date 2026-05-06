import { data, useLoaderData } from "react-router";
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

    return data({
      qrCode: qr.qrCode,
      totalScans: qr.analytics?.totalScans ?? 0,
      uniqueScans: qr.analytics?.uniqueScanCount ?? 0,
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

export default function AnalyticsPage() {
  const { qrCode, totalScans, uniqueScans, trend7d } = useLoaderData();

  const maxScans = Math.max(...trend7d.map((day) => day.totalScans), 1);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 24 }}>
      <h1>QR Analytics: {qrCode}</h1>

      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <div>Total Scans: {totalScans}</div>
        <div>Unique Scans: {uniqueScans}</div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>7-Day Scan Trend</h2>

        <div
          style={{
            display: "flex",
            alignItems: "end",
            gap: 10,
            height: 180,
          }}
        >
          {trend7d.map((day) => {
            const barHeight = Math.max(
              (day.totalScans / maxScans) * 140,
              4
            );

            return (
              <div
                key={day.scanDate}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 13 }}>{day.totalScans}</div>

                <div
                  title={`${day.scanDate}: ${day.totalScans} scans`}
                  style={{
                    width: "100%",
                    maxWidth: 42,
                    height: barHeight,
                    background: "#111",
                    borderRadius: 8,
                  }}
                />

                <div style={{ fontSize: 12, color: "#666" }}>
                  {new Date(day.scanDate).toLocaleDateString(undefined, {
                    weekday: "short",
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}