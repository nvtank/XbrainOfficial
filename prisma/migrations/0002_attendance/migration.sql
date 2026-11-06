-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "late" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_officeId_day_idx" ON "Attendance"("officeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_officeId_day_key" ON "Attendance"("userId", "officeId", "day");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "OfficeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
