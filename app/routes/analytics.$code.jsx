import { data, useLoaderData } from "react-router";
import { useEffect } from "react";
import prisma from "../db.server";
import shopify from "../shopify.server";

export async function loader({ request, params }) {
  const { code } = params;

  const proxyContext = await shopify.authenticate.public.appProxy(request);
  const url = new URL(request.url);

  const shop =
    proxyContext?.shop ||
    url.searchParams.get("shop") ||
    url.searchParams.get("logged_in_customer_shop_domain");

  const customerId = String(
    url.searchParams.get("logged_in_customer_id") || ""
  ).trim();

  if (!shop || !customerId) {
    return data({ error: "Unauthorized" }, { status: 401 });
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

  // Get daily scan counts
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

  return data({
    qrCode: qr.qrCode,
    totalScans: qr.analytics?.totalScans ?? 0,
    uniqueScans: qr.analytics?.uniqueScanCount ?? 0,
    events,
  });
}


export default function AnalyticsPage() {
  const { qrCode, totalScans, uniqueScans, trend7d } = useLoaderData();

  useEffect(() => {
    if (!window.Chart) {
      console.error("Chart.js is not loaded.");
      return;
    }

    const canvas = document.getElementById("scanChart");
    if (!canvas) return;

    const existingChart = window.Chart.getChart(canvas);
    if (existingChart) {
      existingChart.destroy();
    }

    const labels = events.map((event) => event.scanDate);
    const totals = events.map((event) => event._count.scanDate);

    new window.Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Total Scans",
            data: totals,
            borderWidth: 2,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
            },
          },
        },
      },
    });
  }, [events]);

  return (
    <div style={{ marginTop: 24 }}>
  <h2>7-Day Scan Trend</h2>

  <div style={{ display: "flex", alignItems: "end", gap: 10, height: 180 }}>
    {trend7d.map((day) => {
      const height = Math.max((day.totalScans / maxScans) * 140, 4);
	 const maxScans = Math.max(...trend7d.map((day) => day.totalScans), 1);
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
              height,
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