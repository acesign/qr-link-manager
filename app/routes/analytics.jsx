import { data } from "react-router";
import prisma from "../db.server";
import shopify from "../shopify.server";

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
        qrCode: true,
        qrDisplayCode: true,
        analytics: {
          select: {
            totalScans: true,
            uniqueScanCount: true,
            lastScannedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return data({
      success: true,
      analytics: qrCodes.map((row) => ({
        qrCode: row.qrCode,
        qrDisplayCode: row.qrDisplayCode,
        totalScans: row.analytics?.totalScans ?? 0,
        uniqueScanCount: row.analytics?.uniqueScanCount ?? 0,
        lastScannedAt: row.analytics?.lastScannedAt ?? null,
      })),
    });
  } catch (error) {
    console.error("Analytics loader error:", error);
    return data(
      { error: error?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}