import crypto from "crypto";
import { redirect } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getScanDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDeviceType(userAgent = "") {
  const ua = userAgent.toLowerCase();

  if (/ipad|tablet|playbook|silk/.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod/.test(ua)) return "mobile";
  return "desktop";
}

export async function loader({ request, params }) {
  await authenticate.public.appProxy(request);

  const code = params.code?.toUpperCase();

  if (!code) {
    throw new Response("Missing QR code", { status: 400 });
  }

  const now = new Date();
  const scanDate = getScanDate();

  const qrRecord = await prisma.qrCode.findUnique({
    where: { qrCode: code },
  });

  if (!qrRecord) {
    throw new Response("QR code not found", { status: 404 });
  }

  const fallbackUrl = "https://explore.homes/pages/livelink-qr-setup-1";
  const destinationUrl = qrRecord.targetUrl || fallbackUrl;

  const userAgent = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer") || "";
  const ip = getClientIp(request);
  const ipHash = hashValue(ip);
  const deviceType = getDeviceType(userAgent);

  const visitorKey = hashValue(`${ipHash}|${userAgent}`);
  const uniqueKey = `${qrRecord.qrCode}:${visitorKey}:${scanDate}`;

  let analytics = null;
  let isUnique = false;

  try {
    analytics = await prisma.qrAnalytics.upsert({
      where: { qrCodeId: qrRecord.id },
      update: {
        totalScans: { increment: 1 },
        lastScannedAt: now,
        qrPath: qrRecord.qrPath,
        qrCodeValue: qrRecord.qrCode,
      },
      create: {
        qrCodeId: qrRecord.id,
        qrCodeValue: qrRecord.qrCode,
        qrPath: qrRecord.qrPath,
        totalScans: 1,
        uniqueScanCount: 0,
        firstScannedAt: now,
        lastScannedAt: now,
      },
    });

    console.log("QrAnalytics upsert result:", analytics);
  } catch (err) {
    console.error("Analytics upsert failed:", err);
  }

  if (analytics) {
    try {
      await prisma.qrScanEvent.create({
        data: {
          qrAnalyticsId: analytics.id,
          qrCodeId: qrRecord.id,
          qrCodeValue: qrRecord.qrCode,
          qrPath: qrRecord.qrPath,
          scannedAt: now,
          scanDate,
          visitorKey,
          uniqueKey,
          isUnique: true,
          userAgent,
          referer,
          ipHash,
          deviceType,
        },
      });

      console.log("QrScanEvent unique row created");
      isUnique = true;
    } catch (error) {
      if (error.code === "P2002") {
        try {
          await prisma.qrScanEvent.create({
            data: {
              qrAnalyticsId: analytics.id,
              qrCodeId: qrRecord.id,
              qrCodeValue: qrRecord.qrCode,
              qrPath: qrRecord.qrPath,
              scannedAt: now,
              scanDate,
              visitorKey,
              uniqueKey: null,
              isUnique: false,
              userAgent,
              referer,
              ipHash,
              deviceType,
            },
          });

          console.log("QrScanEvent repeat row created");
        } catch (repeatError) {
          console.error("Repeat scan event create failed:", repeatError);
        }
      } else {
        console.error("Unique scan event create failed:", error);
      }
    }

    try {
      await prisma.qrAnalytics.update({
        where: { id: analytics.id },
        data: {
          lastScannedAt: now,
          ...(isUnique
            ? {
                uniqueScanCount: {
                  increment: 1,
                },
              }
            : {}),
        },
      });

      const finalAnalytics = await prisma.qrAnalytics.findUnique({
        where: { qrCodeId: qrRecord.id },
      });
      console.log("Final analytics row:", finalAnalytics);
    } catch (updateError) {
      console.error("QrAnalytics summary update failed:", updateError);
    }
  }

 try {
  const qrCodeUpdateData = {
    scanCount: { increment: 1 },
    lastScannedAt: now,
  };

  if (qrRecord.status === "PENDING") {
    qrCodeUpdateData.status = "ACTIVE";
    qrCodeUpdateData.activatedAt = now;
  }

  await prisma.qrCode.update({
    where: { id: qrRecord.id },
    data: qrCodeUpdateData,
  });

  const finalQrCode = await prisma.qrCode.findUnique({
    where: { id: qrRecord.id },
  });
  console.log("Final QrCode row:", finalQrCode);
} catch (qrCodeUpdateError) {
  console.error("QrCode update failed:", qrCodeUpdateError);
} 

  return redirect(destinationUrl, 302);
}