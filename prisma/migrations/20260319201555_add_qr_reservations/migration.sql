-- CreateTable
CREATE TABLE "QrReservation" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "qrPath" TEXT NOT NULL,
    "qrPublicUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "customerId" TEXT,
    "customerEmail" TEXT,
    "sessionId" TEXT,
    "cartToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QrReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QrReservation_qrId_key" ON "QrReservation"("qrId");

-- CreateIndex
CREATE UNIQUE INDEX "QrReservation_qrPath_key" ON "QrReservation"("qrPath");

-- CreateIndex
CREATE UNIQUE INDEX "QrReservation_qrPublicUrl_key" ON "QrReservation"("qrPublicUrl");
