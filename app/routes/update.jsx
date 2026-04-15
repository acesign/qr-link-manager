import { data } from "react-router";
import shopify from "../shopify.server";
import prisma from "../db.server";

export async function action({ request }) {
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

    const formData = await request.formData();
    const qrCode = String(formData.get("qr_code") || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    const newUrl = String(formData.get("qr_target_url") || "").trim();

    if (!qrCode || !newUrl) {
      return data({ error: "Missing required fields" }, { status: 400 });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(newUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return data({ error: "Please enter a valid URL." }, { status: 400 });
    }

    const qrRecord = await prisma.qrCode.findFirst({
      where: {
        shop,
        qrCode,
        customerId: loggedInCustomerId,
	status: "ACTIVE",
      },
      select: {
        id: true,
        qrCode: true,
      },
    });

    if (!qrRecord) {
      return data({ error: "QR link not found." }, { status: 404 });
    }

    await prisma.qrCode.update({
      where: { id: qrRecord.id },
      data: {
        targetUrl: parsedUrl.toString(),
      },
    });

    return data({
      success: true,
      message: "QR link updated successfully.",
      qrCode: qrRecord.qrCode,
      targetUrl: parsedUrl.toString(),
    });
  } catch (error) {
    console.error("QR update error:", error);
    return data(
      { error: error?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}