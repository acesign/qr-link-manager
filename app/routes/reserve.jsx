import { data } from "react-router";
import shopify from "../shopify.server";
import prisma from "../db.server";
import { generateUniqueQrReservation, formatQrId } from "../utils/qr.server";

export async function action({ request }) {
  try {
    const proxyContext = await shopify.authenticate.public.appProxy(request);
    const url = new URL(request.url);

    const shop =
      proxyContext?.shop ||
      url.searchParams.get("shop") ||
      url.searchParams.get("logged_in_customer_shop_domain");

    if (!shop) {
      return data({ success: false, error: "Missing shop context" }, { status: 400 });
    }

    const baseUrl = "https://explore.homes";

    const { qrId, qrPath, qrPublicUrl } =
      await generateUniqueQrReservation(baseUrl);

    const qrDisplayId = formatQrId(qrId);

    const reservation = await prisma.qrCode.create({
      data: {
        shop,
        qrCode: qrId,
        qrDisplayCode: qrDisplayId,
        qrPath,
        publicUrl: qrPublicUrl,
        status: "RESERVED",
        reservedAt: new Date(),
        targetUrl: null,
      },
    });

    return data({
      success: true,
      qrId: reservation.qrCode,
      qrDisplayId: reservation.qrDisplayCode,
      qrPath: reservation.qrPath,
      qrPublicUrl: reservation.publicUrl,
      shop,
    });
  } catch (error) {
    console.error("QR reservation error:", error);

    return data(
      {
        success: false,
        error: error?.message || "Failed to reserve QR ID.",
      },
      { status: 500 }
    );
  }
}