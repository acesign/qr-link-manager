import { data } from "react-router";
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

  return (
    <div style={{ maxWidth: 900, margin: "40px auto" }}>
      <h1>QR Analytics: {qrCode}</h1>

      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <div>Total Scans: {totalScans}</div>
        <div>Unique Scans: {uniqueScans}</div>
      </div>

      <canvas id="scanChart" height="100"></canvas>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            const ctx = document.getElementById('scanChart').getContext('2d');
            new Chart(ctx, {
              type: 'line',
              data: {
                labels: ${JSON.stringify(events.map(e => e.scanDate))},
                datasets: [{
                  label: 'Scans',
                  data: ${JSON.stringify(events.map(e => e._count.scanDate))},
                  borderWidth: 2
                }]
              }
            });
          `,
        }}
      />
    </div>
  );
}