import prisma from "../db.server";

const QR_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateQrId(length = 6) {
  let result = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * QR_ID_CHARS.length);
    result += QR_ID_CHARS[randomIndex];
  }
  return result;
}

export function formatQrId(qrId) {
  return `${qrId.slice(0, 3)}-${qrId.slice(3)}`;
}

export async function generateUniqueQrReservation(baseUrl) {
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const qrId = generateQrId(6);
    const qrPath = `/qr/${qrId}`;
    const qrPublicUrl = `${baseUrl}${qrPath}`;

    const existing = await prisma.qrCode.findUnique({
      where: { qrCode: qrId }
      },
    });

    if (!existing) {
      return { qrId, qrPath, qrPublicUrl };
    }
  }

  throw new Error("Unable to generate a unique QR ID.");
}