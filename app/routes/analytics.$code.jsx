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

import { useLoaderData } from "react-router";

export default function AnalyticsPage() {
  const { qrCode, totalScans, uniqueScans, events } = useLoaderData();

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
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "24px" }}>
      <h1>QR Analytics: {qrCode}</h1>

      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <div>Total Scans: {totalScans}</div>
        <div>Unique Scans: {uniqueScans}</div>
      </div>

      <canvas id="scanChart" height="100"></canvas>
    </div>
  );
}