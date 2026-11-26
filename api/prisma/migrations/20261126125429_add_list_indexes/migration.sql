-- CreateIndex
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_eventId_status_idx" ON "Booking"("eventId", "status");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_id_idx" ON "Event"("status", "startsAt", "id");

-- CreateIndex
CREATE INDEX "Event_organiserId_startsAt_idx" ON "Event"("organiserId", "startsAt");
