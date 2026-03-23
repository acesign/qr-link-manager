import prisma from "../db.server";

const QR_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function formatQrId(qrId) {
  if (!qrId || qrId.length !== 6) return qrId;
  return `${qrId.slice(0, 3)}-${qrId.slice(3)}`;
}

function generateQrId(length = 6) {
  let result = "";

  for (let i = 0; i < length; i++) {
    result += QR_CHARS.charAt(Math.floor(Math.random() * QR_CHARS.length));
  }

  return result;
}

export async function generateUniqueQrReservation(baseUrl) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const qrId = generateQrId();
    const qrPath = `/qr/${qrId}`;
    const qrPublicUrl = `${baseUrl}${qrPath}`;

    const existing = await prisma.qrCode.findUnique({
      where: { qrCode: qrId },
    });

    if (!existing) {
      return {
        qrId,
        qrPath,
        qrPublicUrl,
      };
    }
  }

  throw new Error("Unable to generate a unique QR ID.");
}