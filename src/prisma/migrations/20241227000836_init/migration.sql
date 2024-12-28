/*
  Warnings:

  - A unique constraint covering the columns `[address]` on the table `Account` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Account_address_key" ON "Account"("address");
